import { createServerFn } from "@tanstack/react-start";

/**
 * Módulo Configurações — o que é do sistema, não da operação do dia a dia: perfil do
 * estabelecimento, senha da equipe, horário do expediente e taxa de serviço.
 *
 * Tudo aqui é config por tenant em fastbar_integrations, mesmo padrão de branding/twilio/roleta:
 * nada de variável de ambiente, que é única por deploy e não serve pra multi-tenant.
 */

export type EstablishmentConfig = {
  legalName: string;
  tradeName: string;
  document: string;
  address: string;
  phone: string;
  managerName: string;
};

export type OperationConfigInput = {
  inicio: string;
  virada: string;
  timezone: string;
};

export type ServiceFeeConfig = {
  /** Percentual cobrado (ex.: 10). 0 desliga a taxa. */
  percent: number;
  /** Se já vem marcada no fechamento — a equipe ainda pode tirar comanda a comanda. */
  onByDefault: boolean;
};

export const DEFAULT_SERVICE_FEE: ServiceFeeConfig = { percent: 10, onByDefault: false };

/**
 * Estado do módulo inteiro numa chamada só. Nunca inclui a linha "acesso": o config dela é o hash
 * da senha da equipe, e esta resposta vai inteira pro navegador — hash de senha curta se quebra em
 * segundos. A tela só precisa saber que existe uma senha, não qual é.
 */
export const getSettings = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();

  const { data } = await admin()
    .from("fastbar_integrations")
    .select("key, enabled, config, updated_at")
    .in("key", ["branding", "estabelecimento", "operacao", "taxa_servico"]);

  const rows = data ?? [];
  const configOf = (key: string) =>
    ((rows.find((row) => row.key === key)?.config ?? {}) as Record<string, unknown>);

  const { loadOperationConfig } = await import("./operations.server");
  const operacao = await loadOperationConfig();

  const estabelecimentoRaw = configOf("estabelecimento");
  const text = (value: unknown) => (typeof value === "string" ? value : "");

  const taxaRaw = configOf("taxa_servico");
  const percent = Number(taxaRaw["percent"]);

  return {
    branding: rows.find((row) => row.key === "branding") ?? null,
    estabelecimento: {
      legalName: text(estabelecimentoRaw["legalName"]),
      tradeName: text(estabelecimentoRaw["tradeName"]),
      document: text(estabelecimentoRaw["document"]),
      address: text(estabelecimentoRaw["address"]),
      phone: text(estabelecimentoRaw["phone"]),
      managerName: text(estabelecimentoRaw["managerName"]),
    } satisfies EstablishmentConfig,
    operacao,
    taxaServico: {
      percent: Number.isFinite(percent) && percent >= 0 ? percent : DEFAULT_SERVICE_FEE.percent,
      onByDefault: taxaRaw["onByDefault"] === true,
    } satisfies ServiceFeeConfig,
  };
});

/** Upsert de uma linha de config — as chaves novas ("estabelecimento", "taxa_servico") podem não
 * existir ainda no banco de um tenant, então update sozinho não bastaria. */
async function upsertConfig(
  key: string,
  config: Record<string, string | number | boolean>,
): Promise<boolean> {
  const { admin } = await import("./fastbar.server");
  const { error } = await admin()
    .from("fastbar_integrations")
    .upsert(
      { key, enabled: true, config, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  return !error;
}

export const saveEstablishment = createServerFn({ method: "POST" })
  .inputValidator((data: EstablishmentConfig) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const trim = (value: string) => (typeof value === "string" ? value.trim() : "");
    const ok = await upsertConfig("estabelecimento", {
      legalName: trim(data.legalName),
      tradeName: trim(data.tradeName),
      document: trim(data.document),
      address: trim(data.address),
      phone: trim(data.phone),
      managerName: trim(data.managerName),
    });
    return ok ? { ok: true as const } : { ok: false as const, message: "Não foi possível salvar." };
  });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const saveOperationConfig = createServerFn({ method: "POST" })
  .inputValidator((data: OperationConfigInput) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    if (!HHMM.test(data.inicio) || !HHMM.test(data.virada)) {
      return { ok: false as const, message: "Horários precisam estar no formato HH:mm." };
    }
    // Fuso inválido derrubaria o cálculo da data operacional em TODA venda, então confere aqui —
    // é a única chance de barrar antes de virar erro no meio do movimento.
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone });
    } catch {
      return { ok: false as const, message: "Fuso horário inválido." };
    }

    const ok = await upsertConfig("operacao", {
      inicio: data.inicio,
      virada: data.virada,
      timezone: data.timezone,
    });
    return ok ? { ok: true as const } : { ok: false as const, message: "Não foi possível salvar." };
  });

export const saveServiceFeeConfig = createServerFn({ method: "POST" })
  .inputValidator((data: ServiceFeeConfig) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const percent = Number(data.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { ok: false as const, message: "Percentual precisa estar entre 0 e 100." };
    }
    const ok = await upsertConfig("taxa_servico", {
      percent,
      onByDefault: data.onByDefault === true,
    });
    return ok ? { ok: true as const } : { ok: false as const, message: "Não foi possível salvar." };
  });

/**
 * Troca a senha da equipe. Exige a senha atual mesmo com o painel já destravado: o caixa fica
 * aberto no balcão durante o expediente, então "estar na tela" não prova ser quem pode trocar a
 * senha de todo mundo — sem isso, qualquer um que passasse pelo balcão trancaria a equipe pra fora.
 */
export const changeTeamPassword = createServerFn({ method: "POST" })
  .inputValidator((data: { currentPassword: string; newPassword: string }) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches, saveTeamPassword } = await import("./bar-gate.server");
    await assertRegisterAccess();

    if (!(await teamPasswordMatches(data.currentPassword))) {
      return { ok: false as const, message: "Senha atual incorreta." };
    }
    const next = typeof data.newPassword === "string" ? data.newPassword.trim() : "";
    if (next.length < 4) {
      return { ok: false as const, message: "A nova senha precisa ter pelo menos 4 caracteres." };
    }
    if (await teamPasswordMatches(next)) {
      return { ok: false as const, message: "A nova senha é igual à atual." };
    }

    const ok = await saveTeamPassword(next);
    return ok
      ? { ok: true as const }
      : { ok: false as const, message: "Não foi possível salvar a nova senha." };
  });
