import { isSupportPreset, sanitizeSupportPlaces, STEP_ANSWERS } from "./support-presets";
/** Private support records. Never use the anon client, CRM or console logs for these data. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  ActiveSupportRequest,
  PublicSupportRequest,
  RequestSupportResult,
  SupportMessage,
  SupportResult,
  SupportRequestStatus,
  SupportOccurrence,
} from "./support-requests.types";

type RequestRow = {
  id: string;
  tenant_id: string;
  session_id: string;
  status: SupportRequestStatus;
  escalated: boolean;
  created_at: string;
  attended_at: string | null;
  attended_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_note: string | null;
};
type MessageRow = {
  id: string;
  tenant_id: string;
  request_id: string;
  sender: "customer" | "staff";
  body: string;
  staff_name: string | null;
  created_at: string;
};
// Keep the new table types local until generated types are refreshed after migration deployment.
type SupportDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      fastbar_support_requests: {
        Row: RequestRow;
        Insert: Partial<RequestRow>;
        Update: Partial<RequestRow>;
        Relationships: [];
      };
      fastbar_support_messages: {
        Row: MessageRow;
        Insert: Partial<MessageRow>;
        Update: Partial<MessageRow>;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      fastbar_request_support: {
        Args: { p_tenant_id: string; p_session_id: string; p_opted_in: boolean };
        Returns: unknown;
      };
      fastbar_send_support_message: {
        Args: {
          p_tenant_id: string;
          p_request_id: string;
          p_session_id: string | null;
          p_sender: string;
          p_body: string;
          p_staff_name: string | null;
        };
        Returns: unknown;
      };
    };
  };
};
async function context() {
  const { admin, getDefaultTenantId } = await import("./fastbar.server");
  return {
    db: admin() as unknown as SupabaseClient<SupportDatabase>,
    tenantId: await getDefaultTenantId(),
  };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const publicRequest = (
  row: Pick<RequestRow, "id" | "status" | "escalated">,
): PublicSupportRequest => ({ id: row.id, status: row.status, escalated: row.escalated });
const failure = (): SupportResult & { ok: false } => ({
  ok: false,
  message: "Não foi possível registrar agora. Tente novamente ou procure a equipe pessoalmente.",
});

export async function requestSupport(
  sessionId: string,
  optedIn: boolean,
): Promise<RequestSupportResult> {
  if (!validId(sessionId) || optedIn !== true)
    return { ok: false, message: "Ative o recurso de apoio em uma comanda confirmada." };
  const { db, tenantId } = await context();
  const { data, error } = await db.rpc("fastbar_request_support", {
    p_tenant_id: tenantId,
    p_session_id: sessionId,
    p_opted_in: true,
  });
  if (error || !data || typeof data !== "object") return failure();
  const result = data as {
    ok: boolean;
    message?: string;
    id?: string;
    status?: SupportRequestStatus;
    escalated?: boolean;
    alreadyRequested?: boolean;
  };
  if (!result.ok) return { ok: false, message: result.message || failure().message };
  if (!result.id || !result.status) return failure();
  const request: PublicSupportRequest = {
    id: result.id,
    status: result.status,
    escalated: result.escalated === true,
  };
  if (!result.alreadyRequested) {
    try {
      const { notifyStaff } = await import("./push.server");
      await notifyStaff({
        kind: "apoio",
        title: "Atenção da equipe",
        body: "Há um atendimento prioritário no painel.",
        url: "/caixa",
        tag: `apoio-${request.id}`,
      });
    } catch {
      /* The saved record remains visible in the staff panel; no sensitive logs. */
    }
  }
  return { ok: true, request, alreadyRequested: result.alreadyRequested === true };
}

async function confirmedSession(
  db: SupabaseClient<SupportDatabase>,
  tenantId: string,
  sessionId: string,
) {
  const { data, error } = await db
    .from("fastbar_sessions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .in("status", ["open", "closed", "paid", "cancelled", "cortesia", "inadimplente"])
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar o atendimento.");
  return !!data;
}
export async function getSupportStatus(sessionId: string): Promise<PublicSupportRequest | null> {
  if (!validId(sessionId)) return null;
  const { db, tenantId } = await context();
  if (!(await confirmedSession(db, tenantId, sessionId))) return null;
  const { data, error } = await db
    .from("fastbar_support_requests")
    .select("id,status,escalated")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar o atendimento.");
  return data ? publicRequest(data) : null;
}

export async function listSupportRequests(): Promise<ActiveSupportRequest[]> {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { db, tenantId } = await context();
  // Operational retention: completed support records/chat removed after 90 days; active requests stay.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error: cleanupError } = await db
    .from("fastbar_support_requests")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .lt("completed_at", cutoff);
  // Retention maintenance must never hide urgent active requests if deletion fails.
  void cleanupError;
  const { data, error } = await db
    .from("fastbar_support_requests")
    .select("id,session_id,status,escalated,created_at,attended_by")
    .eq("tenant_id", tenantId)
    .in("status", ["requested", "attending"])
    .order("created_at");
  if (error) throw new Error("Não foi possível consultar os atendimentos.");
  if (!data?.length) return [];
  const { data: sessions, error: sessionError } = await db
    .from("fastbar_sessions")
    .select("id,customer_name")
    .eq("tenant_id", tenantId)
    .in(
      "id",
      data.map((x) => x.session_id),
    );
  if (sessionError) throw new Error("Não foi possível consultar os atendimentos.");
  const names = new Map((sessions ?? []).map((s) => [s.id, s.customer_name]));
  return data.map((r) => ({
    ...publicRequest(r),
    sessionId: r.session_id,
    customerName: names.get(r.session_id) ?? "Cliente",
    createdAt: r.created_at,
    attendedBy: r.attended_by,
  }));
}

export async function advanceSupportRequest(input: {
  requestId: string;
  action: "attend" | "complete";
  staffName: string;
  note?: string | undefined;
}): Promise<SupportResult> {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const staffName = typeof input.staffName === "string" ? input.staffName.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!validId(input.requestId) || !["attend", "complete"].includes(input.action))
    return { ok: false, message: "Atendimento inválido." };
  if (staffName.length < 2 || staffName.length > 80)
    return { ok: false, message: "Informe seu nome (2 a 80 caracteres)." };
  if (input.action === "complete" && (note.length < 6 || note.length > 2000))
    return { ok: false, message: "Descreva o atendimento (6 a 2000 caracteres)." };
  const { db, tenantId } = await context();
  const now = new Date().toISOString();
  const patch =
    input.action === "attend"
      ? { status: "attending" as const, attended_at: now, attended_by: staffName }
      : {
          status: "completed" as const,
          completed_at: now,
          completed_by: staffName,
          completion_note: note,
        };
  const { data, error } = await db
    .from("fastbar_support_requests")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", input.requestId)
    .eq("status", input.action === "attend" ? "requested" : "attending")
    .select("id");
  if (error) return { ok: false, message: "Não foi possível atualizar o atendimento." };
  if (!data?.length)
    return { ok: false, message: "O atendimento mudou. Atualize a tela e tente novamente." };
  return { ok: true };
}

async function ownedRequest(
  db: SupabaseClient<SupportDatabase>,
  tenantId: string,
  sessionId: string,
  requestId: string,
) {
  if (
    !validId(sessionId) ||
    !validId(requestId) ||
    !(await confirmedSession(db, tenantId, sessionId))
  )
    return false;
  const { data, error } = await db
    .from("fastbar_support_requests")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar as mensagens.");
  return !!data;
}
async function messages(
  db: SupabaseClient<SupportDatabase>,
  tenantId: string,
  requestId: string,
): Promise<SupportMessage[]> {
  const { data, error } = await db
    .from("fastbar_support_messages")
    .select("id,sender,body,created_at")
    .eq("tenant_id", tenantId)
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Não foi possível consultar as mensagens.");
  // Re-sort rather than reverse: stable chronological order even for identical timestamps.
  return (data ?? [])
    .map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.created_at }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function getCustomerSupportMessages(
  sessionId: string,
  requestId: string,
): Promise<SupportMessage[]> {
  const { db, tenantId } = await context();
  if (!(await ownedRequest(db, tenantId, sessionId, requestId))) return [];
  return messages(db, tenantId, requestId);
}
export async function getStaffSupportMessages(requestId: string): Promise<SupportMessage[]> {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  if (!validId(requestId)) return [];
  const { db, tenantId } = await context();
  return messages(db, tenantId, requestId);
}
async function supportPlaces(): Promise<string[]> {
  const { db } = await context();
  const { data } = await db
    .from("fastbar_integrations")
    .select("config")
    .eq("key", "branding")
    .maybeSingle();
  const config = (data?.config ?? {}) as Record<string, unknown>;
  return sanitizeSupportPlaces(config["supportPlaces"]);
}

const IDLE_BEFORE_PRESUME_MS = 5 * 60 * 1000;

/**
 * Pedido sem resposta da pessoa: depois de várias perguntas sem retorno (ou se ela disse que foi
 * engano), o sistema presume resolvido. Fica registrado como "Sistema", nunca como equipe, e só
 * vale enquanto ninguém da equipe assumiu o atendimento.
 */
export async function presumeSupportResolved(input: {
  sessionId: string;
  requestId: string;
  reason: "no_answer" | "false_alarm";
}): Promise<SupportResult> {
  if (!validId(input.sessionId) || !validId(input.requestId))
    return { ok: false, message: "Atendimento inválido." };
  const { db, tenantId } = await context();
  if (!(await ownedRequest(db, tenantId, input.sessionId, input.requestId)))
    return { ok: false, message: "Atendimento não encontrado." };
  const { data: request } = await db
    .from("fastbar_support_requests")
    .select("id,status,created_at")
    .eq("tenant_id", tenantId)
    .eq("id", input.requestId)
    .maybeSingle();
  if (!request || request.status !== "requested")
    return { ok: false, message: "Esse atendimento não está aguardando resposta." };
  const { data: rows } = await db
    .from("fastbar_support_messages")
    .select("sender,body,created_at")
    .eq("tenant_id", tenantId)
    .eq("request_id", input.requestId)
    .limit(200);
  const mine = (rows ?? []).filter((row) => row.sender === "customer");
  let note: string;
  if (input.reason === "false_alarm") {
    if (!mine.some((row) => row.body === STEP_ANSWERS.falseAlarm))
      return { ok: false, message: "Não foi possível confirmar o engano." };
    note = "Pessoa informou que foi engano. Encerrado pelo sistema.";
  } else {
    const last = Math.max(
      Date.parse(request.created_at),
      ...mine.map((row) => Date.parse(row.created_at)),
    );
    if (Date.now() - last < IDLE_BEFORE_PRESUME_MS)
      return { ok: false, message: "Ainda aguardando a resposta." };
    note =
      "Sem resposta da pessoa após as perguntas automáticas; presumido resolvido pelo sistema.";
  }
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("fastbar_support_requests")
    .update({
      status: "completed",
      attended_at: now,
      attended_by: "Sistema",
      completed_at: now,
      completed_by: "Sistema",
      completion_note: note,
    })
    .eq("tenant_id", tenantId)
    .eq("id", input.requestId)
    .eq("status", "requested")
    .select("id");
  if (error) return failure();
  if (!data?.length) return { ok: false, message: "O atendimento mudou." };
  return { ok: true };
}

export async function sendSupportChat(
  input: { requestId: string; sessionId?: string; body: string; staffName?: string },
  sender: "customer" | "staff",
): Promise<SupportResult> {
  if (sender === "staff") {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
  }
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const staffName = typeof input.staffName === "string" ? input.staffName.trim() : null;
  if (!validId(input.requestId) || (sender === "customer" && !validId(input.sessionId)))
    return { ok: false, message: "Atendimento inválido." };
  if (!isSupportPreset(sender, body, sender === "customer" ? await supportPlaces() : []))
    return { ok: false, message: "Escolha uma das mensagens prontas." };
  if (sender === "staff" && (!staffName || staffName.length < 2 || staffName.length > 80))
    return { ok: false, message: "Informe seu nome (2 a 80 caracteres)." };
  const { db, tenantId } = await context();
  const { data, error } = await db.rpc("fastbar_send_support_message", {
    p_tenant_id: tenantId,
    p_request_id: input.requestId,
    p_session_id: sender === "customer" ? input.sessionId! : null,
    p_sender: sender,
    p_body: body,
    p_staff_name: sender === "staff" ? staffName : null,
  });
  if (error || !data || typeof data !== "object") return failure();
  const result = data as { ok: boolean; message?: string };
  return result.ok ? { ok: true } : { ok: false, message: result.message || failure().message };
}

/** Staff-only assistance history. No automatic classification as a formal occurrence. */
export async function listSupportOccurrences(): Promise<SupportOccurrence[]> {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { db, tenantId } = await context();
  const { data, error } = await db
    .from("fastbar_support_requests")
    .select(
      "id,session_id,status,escalated,created_at,attended_at,attended_by,completed_at,completed_by,completion_note",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Não foi possível consultar os atendimentos.");
  if (!data?.length) return [];
  const { data: sessions, error: sessionError } = await db
    .from("fastbar_sessions")
    .select("id,customer_name")
    .eq("tenant_id", tenantId)
    .in(
      "id",
      data.map((r) => r.session_id),
    );
  if (sessionError) throw new Error("Não foi possível consultar os atendimentos.");
  const names = new Map((sessions ?? []).map((s) => [s.id, s.customer_name]));
  return data.map((r) => ({
    ...publicRequest(r),
    sessionId: r.session_id,
    customerName: names.get(r.session_id) ?? "Cliente",
    createdAt: r.created_at,
    attendedBy: r.attended_by,
    attendedAt: r.attended_at,
    completedAt: r.completed_at,
    completedBy: r.completed_by,
    completionNote: r.completion_note,
  }));
}
export async function getSupportOccurrence(
  requestId: string,
): Promise<{ request: SupportOccurrence; messages: SupportMessage[] } | null> {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  if (!validId(requestId)) return null;
  const { db, tenantId } = await context();
  const { data: r, error } = await db
    .from("fastbar_support_requests")
    .select(
      "id,session_id,status,escalated,created_at,attended_at,attended_by,completed_at,completed_by,completion_note",
    )
    .eq("tenant_id", tenantId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar o atendimento.");
  if (!r) return null;
  const { data: session, error: sessionError } = await db
    .from("fastbar_sessions")
    .select("customer_name")
    .eq("tenant_id", tenantId)
    .eq("id", r.session_id)
    .maybeSingle();
  if (sessionError) throw new Error("Não foi possível consultar o atendimento.");
  return {
    request: {
      ...publicRequest(r),
      sessionId: r.session_id,
      customerName: session?.customer_name ?? "Cliente",
      createdAt: r.created_at,
      attendedBy: r.attended_by,
      attendedAt: r.attended_at,
      completedAt: r.completed_at,
      completedBy: r.completed_by,
      completionNote: r.completion_note,
    },
    messages: await messages(db, tenantId, requestId),
  };
}

/**
 * Apaga um atendimento de apoio e as mensagens dele (cascata). Só administrador, mediante senha. Deixa uma linha
 * de auditoria SEM dados da pessoa (quem apagou, quando, id do registro); se a auditoria falhar,
 * a exclusão vale mesmo assim, para um registro de teste nunca ficar preso.
 */
export async function deleteSupportRequest(
  requestId: string,
  password: unknown,
): Promise<SupportResult> {
  const { assertRole } = await import("./staff-users.server");
  const actor = await assertRole("admin");
  if (!validId(requestId)) return { ok: false, message: "Atendimento inválido." };
  // Apagar é irreversível: exige a senha, como as outras ações destrutivas do caixa.
  const { teamPasswordMatches } = await import("./bar-gate.server");
  if (!(await teamPasswordMatches(password))) return { ok: false, message: "Senha incorreta." };
  const { db, tenantId } = await context();
  const { data, error } = await db
    .from("fastbar_support_requests")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", requestId)
    .select("id");
  if (error) return { ok: false, message: "Não foi possível apagar o atendimento." };
  if (!data?.length) return { ok: false, message: "Esse atendimento já não existe." };
  try {
    await db.from("fastbar_staff_audit").insert({
      tenant_id: tenantId,
      actor: actor.staffId ?? "legado",
      action: "apoio_apagado",
      target_id: requestId,
    });
  } catch {
    /* A exclusão já foi feita. */
  }
  return { ok: true };
}
