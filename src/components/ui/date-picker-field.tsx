import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { ptBR } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Campo de data com calendário (em vez de digitar). O valor entra e sai como "AAAA-MM-DD", o mesmo
 * formato do <input type="date"> que ele substitui. Assim quem usa o campo não muda nada no envio
 * para o servidor.
 *
 * As datas são montadas em hora local, nunca com `new Date("AAAA-MM-DD")`. Esse construtor lê a
 * string como meia-noite UTC, e no fuso de Brasília (UTC−3) a data voltaria um dia.
 */

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromIso(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Atalhos para o caso mais comum: validade contada a partir de hoje. */
const SHORTCUTS = [
  { label: "+7 dias", days: 7 },
  { label: "+30 dias", days: 30 },
  { label: "+90 dias", days: 90 },
  { label: "+1 ano", days: 365 },
];

export function DatePickerField({
  value,
  onChange,
  placeholder = "Escolher data",
  className,
  fromToday = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Bloqueia dias passados (ex.: validade de um lote que está entrando agora). */
  fromToday?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromIso(value);
  const today = addDays(new Date(), 0);

  const pick = (date: Date | undefined) => {
    onChange(date ? toIso(date) : "");
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-left text-sm outline-none focus:border-ring"
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={selected ? "text-foreground" : "text-muted-foreground"}>
              {selected ? selected.toLocaleDateString("pt-BR") : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-wrap gap-1 border-b border-border p-2">
            {SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut.days}
                type="button"
                onClick={() => pick(addDays(today, shortcut.days))}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                {shortcut.label}
              </button>
            ))}
          </div>
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selected}
            defaultMonth={selected ?? today}
            onSelect={pick}
            captionLayout="dropdown"
            startMonth={fromToday ? today : undefined}
            endMonth={addDays(today, 365 * 5)}
            disabled={fromToday ? { before: today } : undefined}
          />
        </PopoverContent>
      </Popover>
      {selected && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar data"
          title="Limpar data"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
