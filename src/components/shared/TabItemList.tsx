import { brl, hhmm } from "@/lib/format";
import type { BarTabItem } from "@/types/fastbar";

export function TabItemList({
  items,
  onRemove,
}: {
  items: BarTabItem[];
  onRemove?: (itemId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Nenhum item lançado ainda.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {item.quantity}× {item.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {hhmm(item.added_at)} · {brl(Number(item.unit_price))} un.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">
              {brl(Number(item.unit_price) * item.quantity)}
            </span>
            {onRemove && (
              <button
                onClick={() => onRemove(item.id)}
                aria-label={`Remover ${item.name}`}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-destructive"
              >
                remover
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
