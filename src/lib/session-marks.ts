/**
 * Identificação da comanda (etiqueta, cor e observação). Regras puras, sem acesso a banco, para a
 * tela e o servidor usarem as MESMAS: o que a tela deixa digitar é o que o servidor aceita.
 */

export const MARK_COLOR_KEYS = [
  "vermelho",
  "laranja",
  "amarelo",
  "verde",
  "azul",
  "roxo",
  "rosa",
  "cinza",
] as const;
export type MarkColor = (typeof MARK_COLOR_KEYS)[number];

export const MARK_LABEL_MAX = 24;
export const MARK_NOTE_MAX = 500;

/**
 * Classes escritas por extenso (e não montadas por texto) porque o Tailwind só gera o CSS das
 * classes que aparecem inteiras no código.
 */
export const MARK_COLORS: Record<
  MarkColor,
  { name: string; dot: string; border: string; soft: string }
> = {
  vermelho: { name: "Vermelho", dot: "bg-red-500", border: "border-red-500", soft: "bg-red-500/10" },
  laranja: { name: "Laranja", dot: "bg-orange-500", border: "border-orange-500", soft: "bg-orange-500/10" },
  amarelo: { name: "Amarelo", dot: "bg-yellow-400", border: "border-yellow-400", soft: "bg-yellow-400/10" },
  verde: { name: "Verde", dot: "bg-green-500", border: "border-green-500", soft: "bg-green-500/10" },
  azul: { name: "Azul", dot: "bg-blue-500", border: "border-blue-500", soft: "bg-blue-500/10" },
  roxo: { name: "Roxo", dot: "bg-purple-500", border: "border-purple-500", soft: "bg-purple-500/10" },
  rosa: { name: "Rosa", dot: "bg-pink-500", border: "border-pink-500", soft: "bg-pink-500/10" },
  cinza: { name: "Cinza", dot: "bg-gray-500", border: "border-gray-500", soft: "bg-gray-500/10" },
};

export type SessionMark = {
  label: string | null;
  color: MarkColor | null;
  note: string | null;
};

export type MarkInput = { label?: unknown; color?: unknown; note?: unknown };

export type MarkResult =
  | { ok: true; mark: SessionMark | null }
  | { ok: false; message: string };

export function isMarkColor(value: unknown): value is MarkColor {
  return typeof value === "string" && (MARK_COLOR_KEYS as readonly string[]).includes(value);
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  // Colapsa espaços e quebras de linha repetidas; o que sobra vazio vira "sem valor".
  const text = value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text === "" ? null : text;
}

/**
 * Valida e limpa a entrada. `mark: null` significa "tudo vazio": o servidor apaga a linha.
 * Texto grande demais é RECUSADO (e não cortado em silêncio): cortar uma observação pela metade
 * pode mudar o sentido, e quem digitou precisa saber.
 */
export function normalizeMark(input: MarkInput): MarkResult {
  if (input.label !== undefined && input.label !== null && typeof input.label !== "string") {
    return { ok: false, message: "Etiqueta inválida." };
  }
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") {
    return { ok: false, message: "Observação inválida." };
  }
  const label = cleanText(input.label)?.replace(/\n/g, " ") ?? null;
  const note = cleanText(input.note);
  if (input.color !== undefined && input.color !== null && input.color !== "" && !isMarkColor(input.color)) {
    return { ok: false, message: "Cor fora da lista." };
  }
  const color = isMarkColor(input.color) ? input.color : null;

  if (label && label.length > MARK_LABEL_MAX) {
    return { ok: false, message: `A etiqueta aceita até ${MARK_LABEL_MAX} caracteres.` };
  }
  if (note && note.length > MARK_NOTE_MAX) {
    return { ok: false, message: `A observação aceita até ${MARK_NOTE_MAX} caracteres.` };
  }
  if (!label && !color && !note) return { ok: true, mark: null };
  return { ok: true, mark: { label, color, note } };
}
