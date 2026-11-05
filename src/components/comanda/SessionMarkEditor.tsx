import { useState } from "react";
import { Pencil } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { saveSessionMarkFn } from "@/lib/session-marks.functions";
import {
  MARK_COLORS,
  MARK_COLOR_KEYS,
  MARK_LABEL_MAX,
  MARK_NOTE_MAX,
  type MarkColor,
  type SessionMark,
} from "@/lib/session-marks";

/**
 * Identificar a comanda: etiqueta curta, cor e observação. Fica só para a equipe (o cliente nunca
 * vê). Botão de lápis + folha inferior, com alvos de toque de 44px na paleta.
 */
export function SessionMarkEditor({
  sessionId,
  mark,
  onSaved,
  className = "",
  buttonClassName = "",
}: {
  sessionId: string;
  mark: SessionMark | null;
  onSaved: (mark: SessionMark | null) => void;
  className?: string;
  buttonClassName?: string;
}) {
  const save = useServerFn(saveSessionMarkFn);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<MarkColor | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openEditor() {
    setLabel(mark?.label ?? "");
    setColor(mark?.color ?? null);
    setNote(mark?.note ?? "");
    setError("");
    setOpen(true);
  }

  async function submit(clear: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await save({
        data: clear
          ? { sessionId, label: null, color: null, note: null }
          : { sessionId, label, color, note },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSaved(result.mark ?? null);
      setOpen(false);
    } catch {
      setError("Não foi possível salvar agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        aria-label="Editar identificação da comanda"
        title="Cor, etiqueta e observação"
        className={`flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground ${className} ${buttonClassName}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Identificar comanda</SheetTitle>
            <SheetDescription>
              Só a equipe vê. Serve para diferenciar uma comanda da outra e deixar um recado.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <p id="mark-color-label" className="text-sm font-medium">
                Cor
              </p>
              <div
                role="radiogroup"
                aria-labelledby="mark-color-label"
                className="mt-2 flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={color === null}
                  onClick={() => setColor(null)}
                  className={`min-h-11 rounded-xl border px-3 text-sm ${color === null ? "border-primary font-semibold" : "border-border text-muted-foreground"}`}
                >
                  Sem cor
                </button>
                {MARK_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={color === key}
                    aria-label={MARK_COLORS[key].name}
                    onClick={() => setColor(key)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${color === key ? "border-foreground" : "border-transparent"}`}
                  >
                    <span className={`h-7 w-7 rounded-full ${MARK_COLORS[key].dot}`} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="mark-label" className="text-sm font-medium">
                Etiqueta
              </label>
              <input
                id="mark-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={MARK_LABEL_MAX}
                placeholder="Ex.: aniversário, mesa da sinuca"
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-ring"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {label.length}/{MARK_LABEL_MAX}
              </p>
            </div>
            <div>
              <label htmlFor="mark-note" className="text-sm font-medium">
                Observação
              </label>
              <textarea
                id="mark-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={MARK_NOTE_MAX}
                rows={3}
                placeholder="Ex.: alérgico a amendoim; paga só o dele"
                className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus:border-ring"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {note.length}/{MARK_NOTE_MAX}
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit(false)}
                className="min-h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                disabled={busy || !mark}
                onClick={() => void submit(true)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
              >
                Limpar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
