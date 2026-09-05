/**
 * Config da taxa de serviço do tenant (fastbar_integrations, key "taxa_servico").
 *
 * Módulo próprio, e não dentro de settings.functions.ts, porque quem mais lê isso é o fechamento
 * da comanda (register.functions.ts) — e aquele arquivo não deve depender da camada de tela de
 * Configurações só pra saber quantos por cento cobrar.
 *
 * Padrão: 10% desligado. Ligado por padrão seria cobrar do cliente algo que o bar nunca configurou.
 */
export type ServiceFeeSettings = { percent: number; onByDefault: boolean };

export const DEFAULT_SERVICE_FEE: ServiceFeeSettings = { percent: 10, onByDefault: false };

export async function loadServiceFeeConfig(): Promise<ServiceFeeSettings> {
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_integrations")
    .select("config")
    .eq("key", "taxa_servico")
    .maybeSingle();

  const config = (data?.config ?? {}) as Record<string, unknown>;
  const percent = Number(config["percent"]);
  return {
    percent:
      Number.isFinite(percent) && percent >= 0 && percent <= 100
        ? percent
        : DEFAULT_SERVICE_FEE.percent,
    onByDefault: config["onByDefault"] === true,
  };
}
