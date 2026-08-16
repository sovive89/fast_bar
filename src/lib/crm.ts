/**
 * Classificação de leads (RFM: recência, frequência, valor).
 *
 * Fica aqui, puro e sem dependência de servidor, porque a mesma regra precisa valer na lista de
 * clientes, na ficha de um cliente e na contagem por segmento dos relatórios — três telas que, se
 * cada uma classificasse do seu jeito, mostrariam números diferentes pro mesmo cliente.
 */

export type LeadSegment = "vip" | "fiel" | "recorrente" | "novo" | "risco" | "perdido";

export const SEGMENT_LABEL: Record<LeadSegment, string> = {
  vip: "VIP",
  fiel: "Fiel",
  recorrente: "Recorrente",
  novo: "Novo",
  risco: "Em risco",
  perdido: "Perdido",
};

/** Cor por segmento. Só os que pedem ação (risco/perdido) puxam pro vermelho. */
export const SEGMENT_STYLE: Record<LeadSegment, string> = {
  vip: "bg-primary/15 text-primary",
  fiel: "bg-emerald-500/15 text-emerald-500",
  recorrente: "bg-sky-500/15 text-sky-500",
  novo: "bg-secondary text-secondary-foreground",
  risco: "bg-amber-500/15 text-amber-500",
  perdido: "bg-destructive/15 text-destructive",
};

/** Preenchimento sólido — usado na barra proporcional, onde o tom translúcido de SEGMENT_STYLE
 * fica claro demais pra ler numa faixa de 8px. */
export const SEGMENT_BAR_FILL: Record<LeadSegment, string> = {
  vip: "bg-primary",
  fiel: "bg-emerald-500",
  recorrente: "bg-sky-500",
  novo: "bg-muted-foreground/40",
  risco: "bg-amber-500",
  perdido: "bg-destructive",
};

/** Mesmas cores de SEGMENT_BAR_FILL, mas como valor de cor de verdade — recharts pinta via `fill`,
 * não aceita classe Tailwind. Mesma ordem fixa de SEGMENT_ORDER em toda tela que mostra segmento,
 * pra identidade nunca trocar de cor entre um gráfico e outro. */
export const SEGMENT_CHART_COLOR: Record<LeadSegment, string> = {
  vip: "var(--primary)",
  fiel: "#10b981",
  recorrente: "#0ea5e9",
  novo: "var(--muted-foreground)",
  risco: "#f59e0b",
  perdido: "var(--destructive)",
};

export const SEGMENT_HINT: Record<LeadSegment, string> = {
  vip: "Gasta muito e continua vindo. Trate como prioridade.",
  fiel: "Vem sempre. Base do faturamento recorrente.",
  recorrente: "Já voltou pelo menos uma vez. Dá pra fidelizar.",
  novo: "Veio só uma vez, ainda recente. A segunda visita é a que decide.",
  risco: "Sumiu há mais de 30 dias. Ainda dá pra trazer de volta.",
  perdido: "Sem vir há mais de 60 dias. Precisa de um motivo forte pra voltar.",
};

/** Dias sem aparecer a partir dos quais o cliente é considerado em risco / perdido. */
export const AT_RISK_DAYS = 30;
export const LOST_DAYS = 60;

export type CustomerFacts = {
  total_visits: number;
  total_spent: number;
  last_seen_at: string;
};

export function daysSince(iso: string, now: number = Date.now()) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now - then) / 86400000));
}

/**
 * Corte de VIP: 80º percentil do quanto os clientes gastaram. Relativo à base, não um valor fixo
 * em reais — o que é "gasta muito" num boteco não é o mesmo que num bar de drinks, e um número
 * cravado no código estaria errado num dos dois.
 */
export function vipSpendThreshold(customers: Array<{ total_spent: number }>) {
  const spends = customers
    .map((customer) => Number(customer.total_spent))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (spends.length === 0) return Infinity;
  const index = Math.floor(spends.length * 0.8);
  return spends[Math.min(index, spends.length - 1)]!;
}

/**
 * Recência vem antes de valor de propósito: um VIP que sumiu precisa aparecer como "em risco",
 * que é a informação acionável. Marcá-lo como VIP esconderia justo o cliente que está indo embora.
 */
export function classifyLead(
  customer: CustomerFacts,
  vipThreshold: number,
  now: number = Date.now(),
): LeadSegment {
  const idle = daysSince(customer.last_seen_at, now);
  const visits = Number(customer.total_visits) || 0;
  const spent = Number(customer.total_spent) || 0;

  if (idle > LOST_DAYS) return "perdido";
  if (idle > AT_RISK_DAYS) return "risco";
  if (spent >= vipThreshold && visits >= 2) return "vip";
  if (visits >= 5) return "fiel";
  if (visits >= 2) return "recorrente";
  return "novo";
}

/** Quanto o cliente gasta por visita. Base pra saber quem sobe o ticket e quem só enche a casa. */
export function averageTicket(customer: CustomerFacts) {
  const visits = Number(customer.total_visits) || 0;
  if (visits <= 0) return 0;
  return Number(customer.total_spent) / visits;
}
