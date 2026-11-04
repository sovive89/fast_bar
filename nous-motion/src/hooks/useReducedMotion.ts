import { useEffect, useState } from "react";
import { resolveReduced, systemPrefersReducedMotion, type ReducedMotionMode } from "../core/accessibility";

/** true quando efeitos decorativos devem ser desligados. Reage a mudanças do sistema. */
export function useReducedMotion(mode: ReducedMotionMode = "system"): boolean {
  const [system, setSystem] = useState(systemPrefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setSystem(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return resolveReduced(mode, system);
}
