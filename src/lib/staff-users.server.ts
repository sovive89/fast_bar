import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { useSession } from "@tanstack/react-start/server";
import { sessionConfig, type GateSession } from "./bar-gate.server";
import {
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  SELF_REGISTER_ROLES,
  canManageStaff,
  isStaffRole,
  normalizeEmail,
  validateStaffRegistration,
  type StaffRole,
  type StaffStatus,
} from "./staff-users";

export type StaffSummary = {
  id: string;
  fullName: string;
  role: StaffRole;
  status: StaffStatus;
  createdAt: string;
  lastLoginAt: string | null;
};
export type StaffDetail = StaffSummary & { cpf: string; email: string; phone: string };
export type StaffResult = { ok: true } | { ok: false; message: string };

const MAX_PENDING = 50;
const GENERIC_LOGIN_ERROR = "E-mail ou senha incorretos, ou cadastro ainda não aprovado.";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function ctx() {
  const { admin, getDefaultTenantId } = await import("./fastbar.server");
  return { db: admin(), tenantId: await getDefaultTenantId() };
}

/** Quem está logado: "legado" é a senha única da equipe (acesso total na transição). */
export async function currentActor(): Promise<{
  role: StaffRole | "legado" | null;
  staffId: string | null;
}> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const session = await useSession<GateSession>(sessionConfig());
  if (session.data.unlocked !== true) return { role: null, staffId: null };
  if (session.data.staffId && isStaffRole(session.data.role))
    return { role: session.data.role, staffId: session.data.staffId };
  return { role: "legado", staffId: null };
}

export async function assertRole(...allowed: StaffRole[]) {
  const actor = await currentActor();
  if (actor.role === "legado" || (actor.role && allowed.includes(actor.role))) return actor;
  throw new Error("Seu perfil não tem permissão para esta ação.");
}

async function audit(
  actor: string,
  action: "cadastro" | "aprovacao" | "desativacao" | "reativacao" | "login_bloqueado",
  targetId: string | null,
) {
  const { db, tenantId } = await ctx();
  await db
    .from("fastbar_staff_audit")
    .insert({ tenant_id: tenantId, actor, action, target_id: targetId });
}

/**
 * Cadastro de funcionário. Sem sessão de admin é um pedido público: nasce "pendente" e nunca como
 * admin. Feito por um admin, já nasce ativo (é assim que se cria o primeiro admin).
 */
export async function registerStaff(raw: Record<string, unknown>): Promise<StaffResult> {
  const parsed = validateStaffRegistration(raw);
  if (!parsed.ok) return parsed;
  const actor = await currentActor();
  const byAdmin = canManageStaff(actor.role);
  const input = parsed.value;
  if (!byAdmin && !SELF_REGISTER_ROLES.includes(input.role))
    return { ok: false, message: "Esse perfil só pode ser criado por um administrador." };

  const { db, tenantId } = await ctx();
  if (!byAdmin) {
    const { data: pending } = await db
      .from("fastbar_staff_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "pendente")
      .limit(MAX_PENDING + 1);
    if ((pending?.length ?? 0) > MAX_PENDING)
      return { ok: false, message: "Há cadastros demais aguardando. Fale com o administrador." };
  }
  const [byCpf, byEmail] = await Promise.all([
    db
      .from("fastbar_staff_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("cpf", input.cpf)
      .limit(1),
    db
      .from("fastbar_staff_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", input.email)
      .limit(1),
  ]);
  const clash = [...(byCpf.data ?? []), ...(byEmail.data ?? [])];
  if (clash.length) return { ok: false, message: "Já existe cadastro com este CPF ou e-mail." };

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("fastbar_staff_users")
    .insert({
      tenant_id: tenantId,
      role: input.role,
      employment: input.employment,
      status: byAdmin ? "ativo" : "pendente",
      full_name: input.fullName,
      cpf: input.cpf,
      email: input.email,
      phone: input.phone,
      password_hash: hashPassword(input.password),
      approved_at: byAdmin ? now : null,
      approved_by: byAdmin ? actor.staffId : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505")
      return { ok: false, message: "Já existe cadastro com este CPF ou e-mail." };
    return { ok: false, message: "Não foi possível cadastrar agora. Tente novamente." };
  }
  await audit(byAdmin ? (actor.staffId ?? "legado") : "autocadastro", "cadastro", data.id);
  return { ok: true };
}

export async function loginStaff(emailRaw: unknown, password: unknown): Promise<StaffResult> {
  const email = normalizeEmail(emailRaw);
  if (!email || typeof password !== "string" || !password)
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  const { db, tenantId } = await ctx();
  const { data: user } = await db
    .from("fastbar_staff_users")
    .select("id,role,status,password_hash,failed_logins,locked_until")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();
  if (!user) return { ok: false, message: GENERIC_LOGIN_ERROR };
  if (user.locked_until && Date.parse(user.locked_until) > Date.now())
    return { ok: false, message: "Acesso bloqueado por tentativas erradas. Tente mais tarde." };
  if (!verifyPassword(password, user.password_hash)) {
    const failed = (Number(user.failed_logins) || 0) + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db
      .from("fastbar_staff_users")
      .update({
        failed_logins: lock ? 0 : failed,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", user.id);
    if (lock) await audit("sistema", "login_bloqueado", user.id);
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }
  if (user.status !== "ativo" || !isStaffRole(user.role))
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  await db
    .from("fastbar_staff_users")
    .update({ failed_logins: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq("id", user.id);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const session = await useSession<GateSession>(sessionConfig());
  await session.update({ unlocked: true, staffId: user.id, role: user.role });
  return { ok: true };
}

/** Lista da equipe: CPF, e-mail e telefone só chegam ao admin. */
export async function listStaff(): Promise<StaffDetail[]> {
  await assertRole("admin");
  const { db, tenantId } = await ctx();
  const { data, error } = await db
    .from("fastbar_staff_users")
    .select("id,full_name,role,status,cpf,email,phone,created_at,last_login_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error("Não foi possível consultar a equipe.");
  return (data ?? []).flatMap((row) =>
    isStaffRole(row.role)
      ? [
          {
            id: row.id,
            fullName: row.full_name,
            role: row.role,
            status: row.status as StaffStatus,
            cpf: row.cpf,
            email: row.email,
            phone: row.phone,
            createdAt: row.created_at,
            lastLoginAt: row.last_login_at,
          },
        ]
      : [],
  );
}

export async function setStaffStatus(
  staffId: string,
  action: "aprovar" | "desativar" | "reativar",
): Promise<StaffResult> {
  const actor = await assertRole("admin");
  const { db, tenantId } = await ctx();
  if (action === "desativar" && actor.staffId === staffId)
    return { ok: false, message: "Você não pode desativar o próprio acesso." };
  const now = new Date().toISOString();
  const patch =
    action === "desativar"
      ? { status: "inativo" }
      : { status: "ativo", approved_at: now, approved_by: actor.staffId };
  const from = action === "aprovar" ? "pendente" : action === "reativar" ? "inativo" : "ativo";
  const { data, error } = await db
    .from("fastbar_staff_users")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", staffId)
    .eq("status", from)
    .select("id");
  if (error) return { ok: false, message: "Não foi possível atualizar o cadastro." };
  if (!data?.length) return { ok: false, message: "O cadastro mudou. Atualize a tela." };
  await audit(
    actor.staffId ?? "legado",
    action === "aprovar" ? "aprovacao" : action === "desativar" ? "desativacao" : "reativacao",
    staffId,
  );
  return { ok: true };
}
