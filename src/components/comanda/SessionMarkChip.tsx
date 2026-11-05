import { StickyNote } from "lucide-react";
import { MARK_COLORS, type SessionMark } from "@/lib/session-marks";

/** Etiqueta colorida da comanda e ícone de observação (a nota aparece no tooltip e para leitores de tela). */
export function SessionMarkChip({
  mark,
  compact = false,
}: {
  mark: SessionMark | null | undefined;
  compact?: boolean;
}) {
  if (!mark) return null;
  const color = mark.color ? MARK_COLORS[mark.color] : null;
  const text = mark.label ?? (color ? color.name : null);
  return (
    <span className="flex max-w-full items-center justify-center gap-1">
      {text && (
        <span
          className={`flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 ${compact ? "text-[10px]" : "text-xs"} font-medium ${color ? `${color.border} ${color.soft}` : "border-border"}`}
        >
          {color && (
            <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} aria-hidden="true" />
          )}
          <span className="truncate">{text}</span>
        </span>
      )}
      {mark.note && (
        <span
          title={mark.note}
          aria-label={`Observação: ${mark.note}`}
          role="img"
          className="shrink-0"
        >
          <StickyNote className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
