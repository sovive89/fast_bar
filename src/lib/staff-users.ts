/**
 * Equipe com usuário próprio. Regras puras (sem banco), usadas pelo servidor e pelos testes.
 * Dados sensíveis (CPF, e-mail, telefone) ficam só no servidor e só o admin lê.
 */
import { isValidCpf } from "./cpf";

export const STAFF_ROLES = ["admin", "atendimento", "cozinha", "freelancer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrador",
  atendimento: "Atendimento",
  cozinha: "Cozinha",
  freelancer: "Freelancer",
};
/** Quem se cadastra sozinho nunca vira admin: admin só é criado por outro admin. */
export const SELF_REGISTER_ROLES: readonly StaffRole[] = ["atendimento", "cozinha", "freelancer"];
export const STAFF_STATUSES = ["pendente", "ativo", "inativo"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

/** Vínculo: funcionário fixo tem regras trabalhistas e documentos; freelancer não. */
export const STAFF_EMPLOYMENTS = ["fixo", "freelancer"] as const;
export type StaffEmployment = (typeof STAFF_EMPLOYMENTS)[number];
export const STAFF_EMPLOYMENT_LABELS: Record<StaffEmployment, string> = {
  fixo: "Funcionário fixo",
  freelancer: "Freelancer",
};

/** Mínimo de 6 caracteres, com 1 letra maiúscula e 1 caractere especial. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
    return `A senha precisa ter de ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`;
  if (!/\p{Lu}/u.test(password)) return "A senha precisa de pelo menos 1 letra maiúscula.";
  if (!/[^\p{L}\p{N}\s]/u.test(password))
    return "A senha precisa de pelo menos 1 caractere especial (por exemplo ! @ # $ %).";
  return null;
}

export type StaffInput = {
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
  password: string;
  role: StaffRole;
  employment: StaffEmployment;
};
export type StaffValidation = { ok: true; value: StaffInput } | { ok: false; message: string };

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function normalizeEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

export function validateStaffRegistration(raw: Record<string, unknown>): StaffValidation {
  const fullName =
    typeof raw["fullName"] === "string" ? raw["fullName"].trim().replace(/\s+/g, " ") : "";
  if (fullName.length < 5 || fullName.length > 80 || /\d/.test(fullName) || !fullName.includes(" "))
    return { ok: false, message: "Informe o nome completo (nome e sobrenome)." };
  const cpf = typeof raw["cpf"] === "string" ? raw["cpf"].replace(/\D/g, "") : "";
  if (!isValidCpf(cpf)) return { ok: false, message: "CPF inválido." };
  const email = normalizeEmail(raw["email"]);
  if (!email) return { ok: false, message: "E-mail inválido." };
  const phone = typeof raw["phone"] === "string" ? raw["phone"].replace(/\D/g, "") : "";
  if (phone.length < 10 || phone.length > 11 || /^(\d)\1+$/.test(phone))
    return { ok: false, message: "Telefone inválido (DDD + número)." };
  const password = typeof raw["password"] === "string" ? raw["password"] : "";
  const passwordError = passwordProblem(password);
  if (passwordError) return { ok: false, message: passwordError };
  if (!isStaffRole(raw["role"])) return { ok: false, message: "Escolha o perfil." };
  // Perfil freelancer é sempre vínculo freelancer; os demais podem ser fixos ou freelancers.
  const employment: StaffEmployment =
    raw["role"] === "freelancer" || raw["employment"] === "freelancer" ? "freelancer" : "fixo";
  return {
    ok: true,
    value: { fullName, cpf, email, phone, password, role: raw["role"], employment },
  };
}

/** O que cada perfil pode fazer na gestão da equipe. */
export function canManageStaff(role: StaffRole | "legado" | null): boolean {
  return role === "admin" || role === "legado";
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
