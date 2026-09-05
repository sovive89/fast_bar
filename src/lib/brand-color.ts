import type { CSSProperties } from "react";

/**
 * Aplica a cor de destaque do estabelecimento (config "primaryColor" da Interface do cliente) só
 * na árvore de componentes onde é usada — sobrescreve as variáveis CSS de cor primária via inline
 * style, sem tocar no --primary global (que continua sendo o laranja do Pop9Bar nas telas da
 * equipe). Sem cor configurada, a árvore herda o --primary padrão normalmente.
 */
export function brandColorStyle(primaryColor: string | null | undefined): CSSProperties {
  if (!primaryColor) return {};
  const foreground = readableForeground(primaryColor);
  return {
    "--primary": primaryColor,
    "--primary-foreground": foreground,
    "--ring": primaryColor,
  } as CSSProperties;
}

/** Preto ou branco, o que der mais contraste em cima da cor — cálculo simples de luminância. */
function readableForeground(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#ffffff";
  const value = match[1]!;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0a0a0a" : "#ffffff";
}
