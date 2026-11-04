import { normalizeMark, type MarkInput, type SessionMark } from "./session-marks";

/**
 * Identificação da comanda pela equipe (etiqueta, cor, observação). Tabela só do servidor
 * (fastbar_session_marks): a tela do cliente nunca lê nada daqui. Não mexe em pedido, pagamento
 * nem estoque, então não pede senha — mas guarda quem e quando mexeu por último.
 */

type MarkRow = {
  session_id: string;
  label: string | null;
  color: string | null;
  note: string | null;
};

function toMark(row: MarkRow): SessionMark {
  const normalized = normalizeMark({ label: row.label, color: row.color, note: row.note });
  // Linha com valor fora das regras (alterada à mão no banco): mostra o que for válido.
  return normalized.ok && normalized.mark
    ? normalized.mark
    : { label: null, color: null, note: null };
}

/** Marcas de todas as comandas, por id da comanda. A tabela é pequena (só quem foi marcado). */
export async function loadMarks(): Promise<Record<string, SessionMark>> {
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_session_marks")
    .select("session_id, label, color, note")
    .limit(2000);
  const result: Record<string, SessionMark> = {};
  for (const row of (data ?? []) as MarkRow[]) result[row.session_id] = toMark(row);
  return result;
}

export async function loadMark(sessionId: string): Promise<SessionMark | null> {
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_session_marks")
    .select("session_id, label, color, note")
    .eq("session_id", sessionId)
    .maybeSingle();
  return data ? toMark(data as MarkRow) : null;
}

export type SaveMarkResult = { ok: true; mark: SessionMark | null } | { ok: false; message: string };

/** Grava a marca da comanda. Tudo vazio apaga a linha. Gravar de novo substitui (não soma). */
export async function saveSessionMark(args: {
  sessionId: string;
  input: MarkInput;
  realizadoPor: string;
}): Promise<SaveMarkResult> {
  const normalized = normalizeMark(args.input);
  if (!normalized.ok) return { ok: false, message: normalized.message };

  const { admin } = await import("./fastbar.server");
  const { data: session } = await admin()
    .from("fastbar_sessions")
    .select("id, tenant_id")
    .eq("id", args.sessionId)
    .maybeSingle();
  if (!session) return { ok: false, message: "Comanda não encontrada." };

  if (!normalized.mark) {
    const { error } = await admin().from("fastbar_session_marks").delete().eq("session_id", args.sessionId);
    if (error) return { ok: false, message: "Não foi possível limpar a identificação." };
    return { ok: true, mark: null };
  }

  // upsert: se duas pessoas salvarem ao mesmo tempo, a última vence, sem erro de duplicidade.
  const { error } = await admin()
    .from("fastbar_session_marks")
    .upsert(
      {
        session_id: args.sessionId,
        tenant_id: session.tenant_id ?? null,
        label: normalized.mark.label,
        color: normalized.mark.color,
        note: normalized.mark.note,
        updated_at: new Date().toISOString(),
        updated_by: args.realizadoPor,
      },
      { onConflict: "session_id" },
    );
  if (error) return { ok: false, message: "Não foi possível salvar a identificação." };
  return { ok: true, mark: normalized.mark };
}
