import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { useSession } from "@tanstack/react-start/server";
import { sessionConfig, type GateSession } from "./bar-gate.server";

export const CODE_TTL_MINUTES = 10;

export const generateCode = () => String(Math.floor(100000 + Math.random() * 900000));

export const admin = () => supabaseAdmin;

export async function assertRegisterAccess() {
  const session = await useSession<GateSession>(sessionConfig());
  if (session.data.unlocked !== true) throw new Error("Acesso do caixa não autorizado.");
}

export function sanitizeName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 3 || name.length > 80) return null;
  if (/\d/.test(name)) return null; // nomes não têm dígitos
  const letters = name.toLowerCase().replace(/[^a-zà-ú]/g, "");
  if (letters.length < 2 || new Set(letters).size < 2) return null; // ex.: "aaaa", "xx"
  return name;
}

export function sanitizePhone(value: unknown) {
  const phone = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (phone.length < 10 || phone.length > 11) return null;
  if (/^(\d)\1+$/.test(phone)) return null; // ex.: 11111111111
  return phone;
}

/** Dígito verificador do CPF (módulo 11) — pega tanto erro de digitação quanto número inventado. */
function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/**
 * Identificador alternativo pro cliente sem celular: CPF (com dígito verificador validado) ou RG
 * (sem padrão nacional de dígito — cada estado emite do seu jeito — então só confere um tamanho
 * plausível). Guarda só os dígitos, igual ao celular.
 */
export function sanitizeDocument(type: unknown, value: unknown): string | null {
  const raw = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (type === "cpf") return isValidCpf(raw) ? raw : null;
  if (type === "rg") return raw.length >= 5 && raw.length <= 12 ? raw : null;
  return null;
}

// As operações de estoque (baixa por venda, estorno, drenagem de comanda) vivem em funções no
// Postgres — ver a migration atomic_stock_operations. Elas ficaram lá porque só dentro do banco é
// possível somar o saldo sem intervalo entre ler e gravar, e agrupar os vários passos numa
// transação única. As versões que existiam aqui perdiam atualizações concorrentes e podiam parar
// no meio deixando o estoque incoerente.


export type CustomerIdentifier =
  | { phone: string; document?: undefined; documentType?: undefined }
  | { phone?: undefined; document: string; documentType: "cpf" | "rg" };

/**
 * Cria o cliente na primeira visita, ou atualiza nome/última visita/contagem numa nova visita.
 * Aceita celular OU documento (CPF/RG) como identificador — o que faltar fica null, nunca "".
 */
export async function upsertCustomer(name: string, identifier: CustomerIdentifier): Promise<string> {
  const nowIso = new Date().toISOString();
  const base = supabaseAdmin.from("fastbar_customers").select("id, total_visits");
  const { data: existing } =
    identifier.phone !== undefined
      ? await base.eq("phone", identifier.phone).maybeSingle()
      : await base.eq("document", identifier.document).maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("fastbar_customers")
      .update({ name, last_seen_at: nowIso, total_visits: existing.total_visits + 1 })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: inserted } = await supabaseAdmin
    .from("fastbar_customers")
    .insert({
      name,
      phone: identifier.phone ?? null,
      document: identifier.document ?? null,
      document_type: identifier.documentType ?? null,
      total_visits: 1,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    })
    .select("id")
    .single();

  return inserted!.id;
}

/**
 * Confere se já existe cliente com esse CPF/RG pra preencher o nome sozinho — a equipe só confirma
 * em vez de digitar de novo. Não expõe mais nada do cadastro (sem celular, sem histórico): é só
 * pra poupar digitação, não uma consulta de CRM.
 */
export async function findCustomerNameByDocument(document: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("fastbar_customers")
    .select("name")
    .eq("document", document)
    .maybeSingle();
  return data?.name ?? null;
}

/** Soma o consumo da comanda paga no total histórico do cliente. */
export async function registerCustomerSpend(sessionId: string) {
  const { data: session } = await supabaseAdmin
    .from("fastbar_sessions")
    .select("customer_id, discount_percent")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.customer_id) return;

  const { data: items } = await supabaseAdmin
    .from("fastbar_tab_items")
    .select("unit_price, quantity")
    .eq("session_id", sessionId);

  const subtotal = (items ?? []).reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  // Credita o que foi de fato cobrado, não o preço de tabela — senão o CRM e o faturamento
  // ficariam maiores do que o dinheiro que realmente entrou no caixa.
  const discountPercent = Number(session.discount_percent ?? 0);
  const total = discountPercent > 0 ? subtotal * (1 - discountPercent / 100) : subtotal;
  if (total <= 0) return;

  const { data: customer } = await supabaseAdmin
    .from("fastbar_customers")
    .select("total_spent")
    .eq("id", session.customer_id)
    .maybeSingle();
  if (!customer) return;

  await supabaseAdmin
    .from("fastbar_customers")
    .update({ total_spent: Number(customer.total_spent) + total })
    .eq("id", session.customer_id);
}
