import { createServerFn } from "@tanstack/react-start";
import {
  PRIZES,
  WHEELS,
  WHEEL_SLICES,
  type PrizeKey,
  type RouletteLevel,
} from "./prizes";

/**
 * Configuração da roleta por estabelecimento.
 *
 * Multi-tenant: isto é config DO CLIENTE, não estrutura da aplicação. Por isso mora na mesma
 * tabela `fastbar_integrations` que branding e as demais integrações — uma linha por tenant
 * (`tenant_id` + `key = 'roleta'`), com tudo dentro do `config` jsonb. Nenhuma coluna nova, nenhum
 * schema novo: um bar que quiser outra premiação só grava outro jsonb, e o schema do produto
 * continua igual pra todo mundo.
 *
 * Quem não configurou nada roda no **padrão** definido em prizes.ts. O bar só passa a ter roleta
 * própria quando salva a dele — até lá, standard.
 */

export interface RouletteConfig {
  /** Fatias por nível. Sempre 12 por nível; chaves de prêmio conhecidas. */
  wheels: Record<RouletteLevel, PrizeKey[]>;
  /** Rótulo da cerveja escolhida pelo bar (cada casa define qual comporta ser cortesia). */
  cervejaLabel: string;
  /** Se o bar desligou a roleta sem apagar a configuração. */
  enabled: boolean;
}

export const DEFAULT_ROULETTE_CONFIG: RouletteConfig = {
  wheels: WHEELS,
  cervejaLabel: PRIZES.cerveja.label,
  enabled: true,
};

const PRIZE_KEYS = new Set(Object.keys(PRIZES));

/**
 * Valida uma roleta vinda do jsonb do tenant. Config salva por outra versão do app, editada à mão
 * no banco ou simplesmente incompleta não pode derrubar a tela do cliente nem gerar prêmio
 * inexistente — qualquer nível inválido cai no padrão daquele nível, sozinho, sem invalidar os
 * outros.
 */
function parseWheel(value: unknown, level: RouletteLevel): PrizeKey[] {
  if (!Array.isArray(value) || value.length !== WHEEL_SLICES) return WHEELS[level];
  const isValid = value.every((slice) => typeof slice === "string" && PRIZE_KEYS.has(slice));
  return isValid ? (value as PrizeKey[]) : WHEELS[level];
}

export function parseRouletteConfig(raw: unknown): RouletteConfig {
  const config = (raw ?? {}) as Record<string, unknown>;
  const wheels = (config["wheels"] ?? {}) as Record<string, unknown>;
  return {
    wheels: {
      1: parseWheel(wheels["1"], 1),
      2: parseWheel(wheels["2"], 2),
      3: parseWheel(wheels["3"], 3),
    },
    cervejaLabel:
      typeof config["cervejaLabel"] === "string" && config["cervejaLabel"].trim()
        ? config["cervejaLabel"].trim()
        : DEFAULT_ROULETTE_CONFIG.cervejaLabel,
    // Só desliga se estiver explicitamente false — ausente significa "nunca mexeram", e o padrão
    // é a roleta ligada.
    enabled: config["enabled"] !== false,
  };
}

/** Lê a config da roleta do tenant. Rota do cliente (sem gate de senha), igual ao branding. */
export const getRouletteConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<RouletteConfig> => {
    const { admin } = await import("../fastbar.server");
    const { data } = await admin()
      .from("fastbar_integrations")
      .select("config")
      .eq("key", "roleta")
      .maybeSingle();
    return parseRouletteConfig(data?.config);
  },
);
