import { useMemo, type CSSProperties } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import type { ReducedMotionMode } from "../../core/accessibility";
import type { LoaderState, LoaderTemplate } from "../../core/types";
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY } from "../../core/tokens";
import "../../styles/variables.css";
import "./loader.css";

export interface NousLoaderProps {
  template?: LoaderTemplate;
  primaryColor?: string;
  secondaryColor?: string;
  size?: number;
  speed?: number;
  /** Duração de um ciclo em segundos (dividida por `speed`). */
  duration?: number;
  intensity?: number;
  direction?: "normal" | "reverse";
  /** Número de ciclos; 0 = infinito. */
  repeat?: number;
  logo?: string;
  label?: string;
  /** Progresso REAL (0–100). Só é exibido no estado "progress"; nada é simulado. */
  progress?: number;
  state?: LoaderState;
  reducedMotion?: ReducedMotionMode;
  className?: string;
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function StateIcon({ kind }: { kind: "success" | "error" }) {
  // Formas diferentes (✓ / ✕), então o estado não depende só da cor.
  return (
    <svg className="nm-loader__icon" viewBox="0 0 24 24" aria-hidden="true">
      {kind === "success" ? (
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function NousLoader({
  template = "orbit",
  primaryColor = DEFAULT_PRIMARY,
  secondaryColor = DEFAULT_SECONDARY,
  size = 48,
  speed = 1,
  duration = 1.2,
  intensity = 1,
  direction = "normal",
  repeat = 0,
  logo = "",
  label,
  progress,
  state = "loading",
  reducedMotion = "system",
  className,
}: NousLoaderProps) {
  const reduced = useReducedMotion(reducedMotion);
  const cycle = Math.max(0.05, duration / Math.max(0.1, speed));
  const style = useMemo(
    () =>
      ({
        "--nm-primary": primaryColor,
        "--nm-secondary": secondaryColor,
        "--nm-size": `${size}px`,
        "--nm-cycle": `${cycle}s`,
        "--nm-intensity": clamp(intensity, 0.2, 2),
        "--nm-dir": direction,
        "--nm-repeat": repeat <= 0 ? "infinite" : String(repeat),
      }) as CSSProperties,
    [primaryColor, secondaryColor, size, cycle, intensity, direction, repeat],
  );

  const hasProgress = state === "progress" && typeof progress === "number" && Number.isFinite(progress);
  const pct = hasProgress ? clamp(progress as number, 0, 100) : 0;
  const text =
    label ?? (state === "success" ? "Concluído" : state === "error" ? "Erro" : state === "idle" ? "" : "Carregando");
  const showAnim = state === "loading" || state === "progress";

  // Estados finais viram ícone; o rótulo textual continua para leitores de tela e para quem não vê cor.
  let visual;
  if (state === "success" || state === "error") {
    visual = <StateIcon kind={state} />;
  } else if (template === "progress" || state === "progress") {
    visual = (
      <div className="nm-loader__bar">
        <div
          className="nm-loader__fill"
          data-indeterminate={hasProgress ? undefined : "true"}
          style={hasProgress ? { transform: `scaleX(${pct / 100})` } : undefined}
        />
      </div>
    );
  } else if (template === "dots") {
    visual = <>{[0, 1, 2].map((i) => <span key={i} className="nm-loader__dot" style={{ animationDelay: `${i * 0.15}s` }} />)}</>;
  } else if (template === "wave") {
    visual = <>{[0, 1, 2, 3, 4].map((i) => <span key={i} className="nm-loader__bar-v" style={{ animationDelay: `${i * 0.1}s` }} />)}</>;
  } else if (template === "logo" && logo) {
    visual = <img className="nm-loader__logo" src={logo} alt="" draggable={false} />;
  } else if (template === "pulse" || template === "logo") {
    visual = <span className="nm-loader__pulse" />;
  } else {
    visual = <>{[0, 1, 2].map((i) => <span key={i} className="nm-loader__orb" style={{ transform: `rotate(${i * 120}deg) translateX(calc(var(--nm-size) * 0.38))` }} />)}</>;
  }

  const isBar = (template === "progress" || state === "progress") && state !== "success" && state !== "error";
  const role = isBar ? "progressbar" : "status";
  const aria =
    role === "progressbar"
      ? { "aria-valuemin": 0, "aria-valuemax": 100, ...(hasProgress ? { "aria-valuenow": Math.round(pct) } : {}), "aria-label": text || "Progresso" }
      : { "aria-live": "polite" as const };

  return (
    <div
      className={["nm-loader", className].filter(Boolean).join(" ")}
      data-template={template}
      data-state={state}
      data-anim={showAnim ? "on" : "off"}
      data-reduced={reduced ? "true" : "false"}
      data-rm={reducedMotion}
      style={style}
      role={role}
      {...aria}
    >
      <div className="nm-loader__visual">{visual}</div>
      {text ? <span className="nm-loader__label">{text}{hasProgress ? ` ${Math.round(pct)}%` : ""}</span> : null}
    </div>
  );
}
