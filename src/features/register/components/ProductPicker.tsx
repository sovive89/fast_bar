import { useMemo, useState } from "react";
import { brl } from "@/lib/format";
import type { BarProduct } from "@/types/fastbar";

export function ProductPicker({
  products,
  disabled,
  onPick,
}: {
  products: BarProduct[];
  disabled?: boolean;
  onPick: (product: BarProduct) => void;
}) {
  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))),
    [products],
  );
  const [active, setActive] = useState<string | null>(null);
  const current = active ?? categories[0] ?? null;
  const visible = products.filter((product) => product.category === current);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActive(category)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
              category === current
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {visible.map((product) => (
          <button
            key={product.id}
            disabled={disabled}
            onClick={() => onPick(product)}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-ring disabled:opacity-50"
          >
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-lg bg-muted" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-snug">{product.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{brl(Number(product.price))}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
