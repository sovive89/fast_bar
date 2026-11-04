import { forwardRef, useCallback, useRef, type ButtonHTMLAttributes, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { canHover, type ReducedMotionMode } from "../../core/accessibility";
import { DEFAULT_PRIMARY } from "../../core/tokens";
import type { ButtonState, ButtonTemplate } from "../../core/types";
import "../../styles/variables.css";
import "./button.css";

export interface NousButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  template?: ButtonTemplate;
  variant?: "solid" | "outline" | "ghost";
  primaryColor?: string;
  secondaryColor?: string;
  size?: "sm" | "md" | "lg";
  radius?: number;
  speed?: number;
  intensity?: number;
  shadow?: boolean;
  loading?: boolean;
  state?: ButtonState;
  /** Conteúdo do selo do template "notification" (ex.: contagem). */
  badge?: ReactNode;
  reducedMotion?: ReducedMotionMode;
}

const ICON: Record<"success" | "error", string> = { success: "✓", error: "✕" };
const STATE_TEXT: Record<string, string> = { loading: "Carregando", success: "Concluído", error: "Erro" };

export const NousButton = forwardRef<HTMLButtonElement, NousButtonProps>(function NousButton(
  {
    template = "scale",
    variant = "solid",
    primaryColor = DEFAULT_PRIMARY,
    secondaryColor = "#ffffff",
    size = "md",
    radius = 10,
    speed = 1,
    intensity = 1,
    shadow = false,
    loading = false,
    state = "idle",
    badge,
    reducedMotion = "system",
    disabled,
    className,
    style,
    children,
    onClick,
    onPointerMove,
    onPointerLeave,
    ...rest
  },
  ref,
) {
  const reduced = useReducedMotion(reducedMotion);
  const inner = useRef<HTMLButtonElement | null>(null);
  const eff: ButtonState = loading ? "loading" : state;
  const busy = eff === "loading";

  const setRefs = useCallback(
    (el: HTMLButtonElement | null) => {
      inner.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Em "loading" o botão fica inerte, mas mantém o foco (não usa `disabled` nativo).
    if (busy) { e.preventDefault(); return; }
    if (template === "ripple" && !reduced && inner.current) {
      const r = inner.current.getBoundingClientRect();
      inner.current.style.setProperty("--nm-x", `${e.clientX - r.left}px`);
      inner.current.style.setProperty("--nm-y", `${e.clientY - r.top}px`);
      inner.current.removeAttribute("data-ripple");
      void inner.current.offsetWidth; // reinicia a animação CSS
      inner.current.setAttribute("data-ripple", "on");
    }
    onClick?.(e);
  };

  const handleMove = (e: PointerEvent<HTMLButtonElement>) => {
    onPointerMove?.(e);
    if (template !== "magnetic" || reduced || disabled || !inner.current || !canHover()) return;
    const r = inner.current.getBoundingClientRect();
    const k = 0.25 * intensity;
    const dx = (e.clientX - (r.left + r.width / 2)) * k;
    const dy = (e.clientY - (r.top + r.height / 2)) * k;
    inner.current.style.setProperty("--nm-mx", `${dx.toFixed(1)}px`);
    inner.current.style.setProperty("--nm-my", `${dy.toFixed(1)}px`);
  };
  const handleLeave = (e: PointerEvent<HTMLButtonElement>) => {
    onPointerLeave?.(e);
    inner.current?.style.setProperty("--nm-mx", "0px");
    inner.current?.style.setProperty("--nm-my", "0px");
  };

  const css = {
    "--nm-primary": primaryColor,
    "--nm-on": secondaryColor,
    "--nm-radius": `${radius}px`,
    "--nm-speed": `${1 / Math.max(0.1, speed)}`,
    "--nm-intensity": Math.min(2, Math.max(0.2, intensity)),
    ...style,
  } as CSSProperties;

  return (
    <button
      ref={setRefs}
      type="button"
      {...rest}
      className={["nm-btn", className].filter(Boolean).join(" ")}
      data-template={template}
      data-variant={variant}
      data-size={size}
      data-state={eff}
      data-shadow={shadow ? "true" : undefined}
      data-reduced={reduced ? "true" : "false"}
      data-rm={reducedMotion}
      style={css}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={handleClick}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {template === "slide" ? <span className="nm-btn__fill" aria-hidden="true" /> : null}
      {busy ? <span className="nm-btn__spinner" aria-hidden="true" /> : null}
      {eff === "success" || eff === "error" ? <span className="nm-btn__icon" aria-hidden="true">{ICON[eff]}</span> : null}
      <span className="nm-btn__label">{children}</span>
      {template === "notification" && badge != null ? <span className="nm-btn__badge">{badge}</span> : null}
      {eff !== "idle" ? <span className="nm-btn__sr">{STATE_TEXT[eff]}</span> : null}
    </button>
  );
});
