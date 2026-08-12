export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const digits = (value: string) => value.replace(/\D/g, "");

/**
 * Lê um número digitado no formato pt-BR ("1.234,56", "12,50", "1234"). Retorna null se não der
 * pra ler um número — quem chama decide o que fazer, em vez de virar NaN silenciosamente.
 * Com os dois separadores, o ponto é milhar e a vírgula é decimal. Sozinho, o ponto é decimal
 * (é o que sai do teclado numérico do celular).
 */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized =
    trimmed.includes(",") && trimmed.includes(".")
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPhone(value: string) {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function elapsed(startedAt: string | null, endAt?: string | null, now?: number) {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : (now ?? Date.now());
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}min` : `${minutes}min`;
}
