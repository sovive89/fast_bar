/**
 * Operação comercial (o "turno" do bar) — implementa o conceito descrito em
 * PROMPT_DATA_OPERACIONAL_ABERTURA_FECHAMENTO: bares que atravessam a meia-noite precisam separar
 * a data civil (quando o evento realmente aconteceu, created_at) da data operacional (a qual
 * expediente comercial o evento pertence). Uma comanda aberta sexta 23h e fechada sábado 2h é
 * faturamento de sexta, não de sábado — sem isso, relatórios agrupados por DATE(created_at) cortam
 * o movimento da madrugada ao meio, e ninguém sabe se aquilo já foi "o dia seguinte" ou ainda é o
 * fechamento da noite anterior.
 *
 * Config (início do expediente, horário de virada, timezone) fica em fastbar_integrations
 * (key "operacao"), mesmo padrão de branding/roleta/twilio: por tenant, com defaults de código
 * quando a config ainda não foi definida — não é constante fixa no código, mas também não é uma
 * tabela estrutural nova por cliente.
 *
 * Identidade: este app não tem login individual (só a senha única da equipe que libera o painel),
 * então "aberto_por"/"fechado_por" ficam com o valor genérico "equipe" — a auditoria registra
 * quando e o quê, não quem especificamente. Se um dia existir login por pessoa, é só passar o nome
 * real em vez da constante.
 */

export interface OperationConfig {
  /** Horário (HH:mm) em que o expediente normalmente abre — informativo, não entra na conta de
   * qual operação um evento pertence (só o horário de virada entra nessa conta). */
  inicio: string;
  /** Horário (HH:mm) em que a data operacional vira — tudo antes disso ainda é "ontem". */
  virada: string;
  timezone: string;
}

export const DEFAULT_OPERATION_CONFIG: OperationConfig = {
  inicio: "08:00",
  virada: "04:00",
  timezone: "America/Sao_Paulo",
};

function parseHHmm(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  return fallback;
}

export async function loadOperationConfig(): Promise<OperationConfig> {
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_integrations")
    .select("config")
    .eq("key", "operacao")
    .maybeSingle();
  const config = (data?.config ?? {}) as Record<string, unknown>;
  return {
    inicio: parseHHmm(config["inicio"], DEFAULT_OPERATION_CONFIG.inicio),
    virada: parseHHmm(config["virada"], DEFAULT_OPERATION_CONFIG.virada),
    timezone:
      typeof config["timezone"] === "string" && config["timezone"].trim()
        ? config["timezone"].trim()
        : DEFAULT_OPERATION_CONFIG.timezone,
  };
}

/**
 * A qual data operacional um instante pertence, dado o horário de virada configurado.
 *
 * Regra (item 1 do prompt): tudo a partir da virada já é a nova data; tudo antes ainda é a data
 * anterior. Ex.: virada "04:00" → sábado 03:59 pertence à data operacional de sexta; sábado 04:00
 * já pertence à de sábado.
 */
export function computeDataOperacional(when: Date, config: OperationConfig): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(when);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const localDate = `${get("year")}-${get("month")}-${get("day")}`; // YYYY-MM-DD no fuso do tenant
  const localHHmm = `${get("hour")}:${get("minute")}`;

  if (localHHmm >= config.virada) return localDate;

  // Ainda não bateu a virada: pertence ao dia civil anterior.
  const [y, m, d] = localDate.split("-").map(Number);
  const prev = new Date(Date.UTC(y!, m! - 1, d!));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

export interface OperationRow {
  id: string;
  data_operacional: string;
  status: "ABERTA" | "FECHADA";
  aberto_em: string;
  aberto_por: string;
  fechado_em: string | null;
  fechado_por: string | null;
}

/** A operação ABERTA agora, se existir — não cria nada, só lê. */
export async function getOpenOperation(): Promise<OperationRow | null> {
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_operations")
    .select("id, data_operacional, status, aberto_em, aberto_por, fechado_em, fechado_por")
    .eq("status", "ABERTA")
    .maybeSingle();
  return (data as OperationRow | null) ?? null;
}

/**
 * Campos operacionais pra anexar em toda comanda nova (fastbar_sessions): operacao_id da operação
 * aberta agora (ou null, se a equipe ainda não abriu o expediente) + a data_operacional calculada
 * — essa sempre é preenchida, mesmo sem operação aberta, porque relatório e regra de virada não
 * podem depender de a equipe ter lembrado de clicar em "Abrir operação".
 */
export async function operationalFieldsForNewSession(): Promise<{
  operacao_id: string | null;
  data_operacional: string;
}> {
  const [config, open] = await Promise.all([loadOperationConfig(), getOpenOperation()]);
  const dataOperacional = computeDataOperacional(new Date(), config);
  // Só vincula à operação aberta se ela realmente for a mesma data operacional de agora — evita
  // grudar numa operação de ontem que ficou esquecida aberta.
  const operacaoId = open && open.data_operacional === dataOperacional ? open.id : null;
  return { operacao_id: operacaoId, data_operacional: dataOperacional };
}

// Os três server functions (getOperationStatus, openOperation, closeOperation) moraram aqui antes
// e agora ficam em operations.functions.ts — mesma separação já usada em
// integrations.functions.ts/verification/service.server.ts: este arquivo chama admin() direto
// (service role) fora de qualquer createServerFn, então nunca pode ser importado no topo de um
// arquivo que o bundler do client também processa (como uma rota) — só via `await import(...)`
// dentro de um handler, ou de outro módulo ".server.ts"/".functions.ts" da mesma forma.
