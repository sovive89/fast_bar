import { m } from "motion/react";

/**
 * Indicador de "carregando" leve: três pontos que sobem e descem em sequência, com o texto ao lado
 * (o texto continua lá para leitores de tela e para quem desliga animações).
 */
export function Loading({
  label = "Carregando...",
  size = "md",
  className = "",
}: {
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const dot = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  const text = size === "sm" ? "text-xs" : "text-sm";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 text-muted-foreground ${text} ${className}`}
    >
      <span className="flex items-end gap-1" aria-hidden>
        {[0, 1, 2].map((index) => (
          <m.span
            key={index}
            className={`${dot} rounded-full bg-primary`}
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: index * 0.15 }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}
