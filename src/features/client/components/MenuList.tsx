import { useEffect, useId, useMemo, useState, type RefCallback } from "react";
import { getCardapioCliente } from "@/lib/menu-cliente.functions";
import { useBranding } from "@/lib/branding";
import { CompanyFooter } from "./CompanyFooter";
import { brl } from "@/lib/format";
import type { ItemCardapioCliente } from "@/lib/menu-cliente.functions";

const POLL_MS = 15000;

export function MenuList({
  supportSlotRef,
}: { supportSlotRef?: RefCallback<HTMLDivElement> | undefined } = {}) {
  const { branding } = useBranding();
  const menuId = useId();
  const [products, setProducts] = useState<ItemCardapioCliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Disponibilidade vem calculada do servidor (ver menu-cliente.functions): produto com ficha
      // técnica não tem saldo próprio, então decidir "esgotado" aqui pelo estoque do produto
      // marcava todo drink como esgotado. O saldo em si não trafega até o aparelho do cliente.
      let result;
      try {
        result = await getCardapioCliente();
      } catch {
        return;
      }
      if (!cancelled) {
        setProducts(result.itens);
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
    const map = new Map<string, ItemCardapioCliente[]>();
    for (const product of products) {
      const list = map.get(product.category) ?? [];
      list.push(product);
      map.set(product.category, list);
    }
    return Array.from(map.entries());
  }, [products]);

  if (loading || grouped.length === 0) return <CompanyFooter supportSlotRef={supportSlotRef} />;

  return (
    <>
      <section className="mt-8">
        <div className="sticky top-0 z-20 -mx-5 border-b border-border bg-background/95 px-4 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
          <div className="flex min-h-12 items-center gap-2">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.brandName}
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="max-w-24 truncate text-xs font-semibold">{branding.brandName}</span>
            )}
            <h2 className="min-w-0 flex-1 text-sm font-semibold">Cardápio</h2>
          </div>
          <nav
            aria-label="Categorias do cardápio"
            className="flex min-w-0 gap-2 overflow-x-auto pb-2"
          >
            {grouped.map(([category], index) => (
              <a
                key={category}
                href={`#${menuId}-categoria-${index}`}
                className="flex min-h-11 shrink-0 items-center rounded-full border border-border px-4 text-sm font-medium hover:bg-muted"
              >
                {category}
              </a>
            ))}
          </nav>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Só consulta — o lançamento na comanda é feito pelo caixa.
        </p>

        <div className="mt-4 space-y-5">
          {grouped.map(([category, items], index) => (
            <div
              key={category}
              id={`${menuId}-categoria-${index}`}
              className="scroll-mt-[calc(env(safe-area-inset-top)+120px)]"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {category}
              </p>
              <ul className="space-y-2">
                {items.map((product) => {
                  const soldOut = !product.disponivel;
                  return (
                    <li
                      key={product.id}
                      style={{
                        background: `color-mix(in srgb, var(--card) ${Math.round((branding.cardOpacity ?? 0.82) * 100)}%, transparent)`,
                      }}
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
                      <p className="min-w-0 flex-1 break-words text-sm font-medium">
                        {product.name}
                      </p>
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
      <CompanyFooter supportSlotRef={supportSlotRef} />
    </>
  );
}

export default MenuList;
