export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const digits = (value: string) => value.replace(/\D/g, "");

/**
 * Lê um número digitado no formato pt-BR ("1.234,56", "12,50", "1234"). Retorna null se o texto
 * não bater com um formato válido — nunca tenta "salvar" algo malformado, porque isso já causou
 * custo errado sendo gravado sem aviso (ex.: "1.234.56" virando um número qualquer).
 * Regra: ponto como separador de milhar só conta em grupos de 3 dígitos (ex.: 1.234); um único
 * ponto seguido de 1-2 dígitos é decimal (o que sai do teclado numérico do celular).
 */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (/^\d+,\d+$/.test(trimmed)) return Number(trimmed.replace(",", "."));
  if (/^\d+\.\d{1,2}$/.test(trimmed)) return Number(trimmed);
  if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) return Number(trimmed.replace(/\./g, ""));
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(trimmed)) {
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }
  return null;
}

export function formatPhone(value: string) {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatCpf(value: string) {
  const d = digits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Mostra o identificador que a comanda de fato tem — celular formatado, ou CPF/RG marcado. */
export function formatIdentifier(
  phone: string | null | undefined,
  document?: string | null,
  documentType?: "cpf" | "rg" | null,
) {
  if (phone) return formatPhone(phone);
  if (document && documentType === "cpf") return `CPF ${formatCpf(document)}`;
  if (document && documentType === "rg") return `RG ${document}`;
  return "—";
}

export function elapsed(startedAt: string | null, endAt?: string | null, now?: number) {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : (now ?? Date.now());
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}min` : `${minutes}min`;
}
