/**
 * Utilidades de contraste (WCAG 2.x) — escolhem o texto legível em cima da cor da marca e avisam
 * o gestor na Interface do cliente quando a cor escolhida não vai ficar legível. Não bloqueia o
 * salvamento: a cor é do estabelecimento, só o card mostra o aviso.
 */

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1]!;
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminância relativa (0 a 1), fórmula oficial do WCAG 2.x. Cor inválida cai pra 0 (preto). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Razão de contraste entre duas cores (1 a 21), fórmula oficial do WCAG 2.x. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA) + 0.05;
  const lumB = relativeLuminance(hexB) + 0.05;
  return lumA > lumB ? lumA / lumB : lumB / lumA;
}

/** Preto ou branco, o que der mais contraste em cima da cor — vira o texto/ícone dos botões e
 * elementos que usam a cor da marca como fundo. */
export function pickForeground(hex: string): string {
  const withWhite = contrastRatio(hex, "#ffffff");
  const withBlack = contrastRatio(hex, "#000000");
  return withWhite >= withBlack ? "#ffffff" : "#0a0a0a";
}

/** AA (texto normal) do WCAG 2.x exige 4.5:1. */
export const WCAG_AA_TEXT_RATIO = 4.5;

/** true se a cor escolhida + o texto que o app vai colocar em cima dela (pickForeground) atingem
 * o mínimo de legibilidade AA. */
export function hasReadableContrast(hex: string): boolean {
  return contrastRatio(hex, pickForeground(hex)) >= WCAG_AA_TEXT_RATIO;
}
