/** "system" segue o sistema; "always" desliga efeitos decorativos; "never" ignora o sistema. */
export type ReducedMotionMode = "system" | "always" | "never";

export function systemPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function resolveReduced(mode: ReducedMotionMode, system: boolean): boolean {
  return mode === "always" ? true : mode === "never" ? false : system;
}

/** Hover só existe com ponteiro fino: no toque, efeitos de hover não devem rodar. */
export function canHover(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
}
