import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import type { ReducedMotionMode } from "../../core/accessibility";
import { easingToCss } from "../../core/tokens";
import type { TransitionTemplate } from "../../core/types";
import "./transition.css";

export interface NousTransitionProps {
  /** Controla entrada/saída. */
  show?: boolean;
  template?: TransitionTemplate;
  /** Segundos. */
  duration?: number;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  intensity?: number;
  easing?: string;
  /** Remove do DOM depois da saída (padrão). Com false, só esconde. */
  unmountOnExit?: boolean;
  reducedMotion?: ReducedMotionMode;
  className?: string;
  children?: ReactNode;
}

type Phase = "exited" | "entering" | "entered" | "exiting";

export function NousTransition({
  show = true,
  template = "fade",
  duration = 0.3,
  delay = 0,
  direction = "up",
  intensity = 1,
  easing = "standard",
  unmountOnExit = true,
  reducedMotion = "system",
  className,
  children,
}: NousTransitionProps) {
  const reduced = useReducedMotion(reducedMotion);
  const dur = reduced ? 0 : Math.max(0, duration);
  const dly = reduced ? 0 : Math.max(0, delay);
  const [phase, setPhase] = useState<Phase>(show ? "entered" : "exited");

  useEffect(() => {
    if (show) {
      setPhase((p) => (p === "entered" ? p : "entering"));
      // Dois quadros: garante que o estado "inicial" foi pintado antes de ir para o final.
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setPhase("entered")); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setPhase((p) => (p === "exited" ? p : "exiting"));
    const t = setTimeout(() => setPhase("exited"), (dur + dly) * 1000);
    return () => clearTimeout(t);
  }, [show, dur, dly]);

  if (phase === "exited" && unmountOnExit) return null;

  const style = {
    "--nm-t-dur": `${dur}s`,
    "--nm-t-delay": `${dly}s`,
    "--nm-t-ease": easingToCss(easing),
    "--nm-t-k": Math.min(2, Math.max(0.2, intensity)),
  } as CSSProperties;

  const visible = phase === "entered";
  return (
    <div
      className={["nm-t", className].filter(Boolean).join(" ")}
      data-template={template}
      data-direction={direction}
      data-visible={visible ? "true" : "false"}
      data-rm={reducedMotion}
      style={style}
      hidden={phase === "exited" ? true : undefined}
    >
      {template === "collapse" ? <div className="nm-t__inner">{children}</div> : children}
    </div>
  );
}
