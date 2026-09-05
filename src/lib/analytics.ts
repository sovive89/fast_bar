/**
 * Primitivas compartilhadas por toda análise do Pop9Bar (CRM, Relatórios, Estoque) — bucketing de
 * mês, diferença entre meses, agrupamento e soma. Puro e sem dependência de servidor, do mesmo
 * jeito que crm.ts: a regra de "que mês é esse timestamp" precisa ser a mesma em toda tela, senão
 * duas análises que deveriam bater dão número diferente por causa de fuso horário.
 *
 * Isso é consolidação, não uma camada nova de métricas — extrai o que já estava duplicado em
 * getRetentionCohorts, getCrmDashboard, getCrmAlerts e getStockReport, sem mudar nenhum resultado.
 */

const BAR_TIMEZONE = "America/Sao_Paulo";

/** "YYYY-MM" no fuso do bar, a partir de um timestamp UTC. */
export function monthKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BAR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).format(new Date(iso));
}

/** "YYYY-MM" do mês atual, no fuso do bar. */
export function currentMonthKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BAR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

/** Diferença em meses entre duas chaves "YYYY-MM" (b - a). */
export function monthsBetween(a: string, b: string): number {
  const [ay = 0, am = 0] = a.split("-").map(Number);
  const [by = 0, bm = 0] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** Dia e mês de hoje no fuso do bar — pra comparar com aniversário, por exemplo. */
export function todayDayMonth(): { day: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BAR_TIMEZONE })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return { day: Number(parts["day"]), month: Number(parts["month"]) };
}

/** Quantidade × custo, com null/undefined tratados como zero — custo médio nem sempre existe. */
export function valueOf(quantity: number, cost: number | null | undefined): number {
  return Number(quantity) * (Number(cost) || 0);
}

/** Agrupa uma lista pela chave calculada, preservando ordem de primeira aparição. */
export function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/** Soma de um valor numérico derivado de cada item da lista. */
export function sumBy<T>(items: T[], valueFn: (item: T) => number): number {
  return items.reduce((sum, item) => sum + valueFn(item), 0);
}
