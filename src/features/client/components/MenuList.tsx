import { useEffect, useMemo, useState } from "react";
import { fetchProducts } from "@/services/supabase/products";
import { brl } from "@/lib/format";
import type { BarProduct } from "@/types/fastbar";

const POLL_MS = 15000;

export function MenuList() {
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchProducts();
      if (!cancelled) {
        setProducts(result);
        setLoading(false);
      }
    }
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, BarProduct[]>();
    for (const product of products) {
      const list = map.get(product.category) ?? [];
      list.push(product);
      map.set(product.category, list);
    }
    return Array.from(map.entries());
  }, [products]);

  if (loading) return null;
  if (grouped.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Cardápio</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Só consulta — o lançamento na comanda é feito pelo caixa.
      </p>

      <div className="mt-4 space-y-5">
        {grouped.map(([category, items]) => (
          <div key={category}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              {category}
            </p>
            <ul className="space-y-2">
              {items.map((product) => {
                const soldOut = product.stock_quantity <= 0;
                return (
                  <li
                    key={product.id}
                    className={`flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 ${
                      soldOut ? "opacity-50" : ""
                    }`}
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-11 w-11 shrink-0 rounded-lg bg-muted" />
                    )}
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{product.name}</p>
                    {soldOut ? (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Esgotado
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm font-semibold">{brl(product.price)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default MenuList;
