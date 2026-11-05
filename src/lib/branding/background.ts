/** Public brand background must be an HTTPS image URL, never executable or a CSS expression. */
export function sanitizeBrandBackground(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
export function sanitizeCardOpacity(value: unknown): number {
  if (value === "" || value === null || value === undefined) return 0.82;
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0.6, opacity)) : 0.82;
}

export const CARD_SHAPES = ["rounded", "square", "pill", "oval"] as const;
export type CardShape = (typeof CARD_SHAPES)[number];
export const CATEGORY_SHAPES = ["pill", "square", "rounded", "outline"] as const;
export type CategoryShape = (typeof CATEGORY_SHAPES)[number];
export const CARD_SHAPE_LABELS: Record<CardShape, string> = {
  rounded: "Arredondado",
  square: "Quadrado (pontas leves)",
  pill: "Retangular (pontas bem redondas)",
  oval: "Oval",
};
export const CATEGORY_SHAPE_LABELS: Record<CategoryShape, string> = {
  pill: "Cápsula",
  square: "Quadrado",
  rounded: "Retangular (pontas arredondadas)",
  outline: "Só contorno",
};
export function sanitizeCardShape(value: unknown): CardShape {
  return CARD_SHAPES.find((shape) => shape === value) ?? "rounded";
}
export function sanitizeCategoryShape(value: unknown): CategoryShape {
  return CATEGORY_SHAPES.find((shape) => shape === value) ?? "pill";
}
