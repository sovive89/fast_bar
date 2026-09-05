import { createHash, timingSafeEqual } from "node:crypto";

export type GateSession = { unlocked?: boolean };

export function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "bar-gate",
    // 30 days in seconds
    maxAge: 60 * 60 * 24 * 30,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Senha da equipe deste tenant, guardada como hash SHA-256 em fastbar_integrations (key "acesso") —
 * mesmo padrão do Twilio e da roleta: multi-tenant, cada bar com a sua, sem variável de ambiente
 * compartilhada entre todos os deploys.
 *
 * Guardamos só o hash, nunca a senha em texto: quem tiver acesso de leitura ao banco (backup,
 * dashboard do Supabase, um dump vazado) não fica com a senha do caixa na mão.
 *
 * BAR_PANEL_PASSWORD continua valendo como fallback pra quem ainda não definiu senha própria, então
 * nenhum bar já em operação é trancado do lado de fora por essa mudança.
 */
export async function loadTeamPasswordHash(): Promise<string | null> {
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_integrations")
    .select("config")
    .eq("key", "acesso")
    .maybeSingle();
  const config = (data?.config ?? {}) as Record<string, unknown>;
  const hash = typeof config["passwordHash"] === "string" ? config["passwordHash"].trim() : "";
  return hash.length === 64 ? hash : null;
}

/** Grava a senha da equipe deste tenant (só o hash). Upsert, não update: o tenant que nunca trocou
 * a senha não tem linha "acesso" nenhuma, e um update solto ali não gravaria nada — e ainda
 * responderia "sucesso", deixando a pessoa achando que trocou a senha quando não trocou. */
export async function saveTeamPassword(password: string): Promise<boolean> {
  const { admin } = await import("./fastbar.server");
  const { error } = await admin()
    .from("fastbar_integrations")
    .upsert(
      {
        key: "acesso",
        enabled: true,
        config: { passwordHash: sha256Hex(password) },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  return !error;
}

/**
 * Confere a senha da equipe (a mesma do login do caixa e das ações destrutivas, não uma senha de
 * admin à parte). Toda ação que apaga lançamento, cancela comanda, tira produto do cardápio ou
 * abre/encerra operação passa por aqui — se uma delas esquecer, vira porta dos fundos para todas
 * as outras.
 *
 * Lê a senha do tenant a cada chamada, sem cache: senha trocada no painel vale no clique seguinte,
 * e não só depois de um novo deploy.
 */
export async function teamPasswordMatches(input: unknown): Promise<boolean> {
  if (typeof input !== "string" || input.length === 0) return false;

  const tenantHash = await loadTeamPasswordHash();
  if (tenantHash) {
    const a = Buffer.from(sha256Hex(input), "hex");
    const b = Buffer.from(tenantHash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  const expected = process.env["BAR_PANEL_PASSWORD"];
  if (!expected) return false;
  return passwordMatches(input, expected);
}
