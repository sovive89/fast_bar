/** Valores padrão compartilhados. Cores só com tokens neutros; o app injeta as suas. */
export const DEFAULT_PRIMARY = "#f97316";
export const DEFAULT_SECONDARY = "#a3a3a3";
export const DEFAULT_DURATION = 1; // segundos de um ciclo
export const DEFAULT_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
export const EASINGS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "standard"] as const;

export function easingToCss(name: string): string {
  return name === "standard" ? DEFAULT_EASING : name;
}
