import { useEffect, useId, useMemo, useState, type RefCallback } from "react";
import { getCardapioCliente } from "@/lib/menu-cliente.functions";
import { useBranding } from "@/lib/branding";
import { CompanyFooter } from "./CompanyFooter";
import { brl } from "@/lib/format";
import { sanitizeCardShape, sanitizeCategoryShape } from "@/lib/branding/background";
import { loadWithFallback } from "@/lib/async-result";
import type { ItemCardapioCliente } from "@/lib/menu-cliente.functions";

// Só raio de borda e respiro lateral: a grade e a altura mínima de toque (44px) não mudam.
const CARD_CLASS = {
  rounded: "rounded-xl px-4",
  square: "rounded-md px-4",
  pill: "rounded-3xl px-5",
  oval: "rounded-[2rem] px-6",
} as const;
const CATEGORY_CLASS = {
  pill: "rounded-full border-border",
  square: "rounded-none border-border",
  rounded: "rounded-xl border-border",
  outline: "rounded-lg border-2 border-primary bg-transparent",
} as const;

const POLL_MS = 15000;

export function MenuList({
  supportSlotRef,
}: { supportSlotRef?: RefCallback<HTMLDivElement> | undefined } = {}) {
  const { branding } = useBranding();
  const cardShape = sanitizeCardShape(branding.cardShape);
  const categoryShape = sanitizeCategoryShape(branding.categoryShape);
  const menuId = useId();
  const [products, setProducts] = useState<ItemCardapioCliente[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function load() {
      if (inFlight) return;
      inFlight = true;

      try {
        // Disponibilidade vem calculada do servidor (ver menu-cliente.functions): produto com ficha
        // técnica não tem saldo próprio, então decidir "esgotado" aqui pelo estoque do produto
        // marcava todo drink como esgotado. O saldo em si não trafega até o aparelho do cliente.
        const result = await loadWithFallback(getCardapioCliente, null);
        if (cancelled) return;

        if (result.error || !result.value) {
          setLoadError(true);
          return;
        }

        setProducts(result.value.itens);
        setHasLoaded(true);
        setLoadError(false);
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [retryKey]);

  const grouped = useMemo(() => {
    const map = new Map<string, ItemCardapioCliente[]>();
    for (const product of products) {
      const list = map.get(product.category) ?? [];
      list.push(product);
      map.set(product.category, list);
    }
    return Array.from(map.entries());
  }, [products]);

  function retry() {
    setLoading(true);
    setRetryKey((current) => current + 1);
  }

  const footer = <CompanyFooter supportSlotRef={supportSlotRef} />;

  if (!hasLoaded && loading) {
    return (
      <>
        <p role="status" className="mt-8 text-sm text-muted-foreground">
          Carregando cardápio…
        </p>
        {footer}
      </>
    );
  }

  if (!hasLoaded && loadError) {
    return (
      <>
        <section aria-label="Cardápio" className="mt-8 space-y-3">
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar o cardápio. Verifique a conexão e tente novamente.
          </p>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Tentar novamente
          </button>
        </section>
        {footer}
      </>
    );
  }

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
          {grouped.length > 0 && (
            <nav
              aria-label="Categorias do cardápio"
              className="flex min-w-0 gap-2 overflow-x-auto pb-2"
            >
              {grouped.map(([category], index) => (
                <a
                  key={category}
                  href={`#${menuId}-categoria-${index}`}
                  className={`flex min-h-11 shrink-0 items-center border px-4 text-sm font-medium hover:bg-muted ${CATEGORY_CLASS[categoryShape]}`}
                >
                  {category}
                </a>
              ))}
            </nav>
          )}
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          Só consulta — o lançamento na comanda é feito pelo caixa.
        </p>

        {loading && hasLoaded && (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            Atualizando cardápio…
          </p>
        )}
        {loadError && (
          <div
            role="status"
            className="mt-3 flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400"
          >
            <span>
              Não foi possível atualizar. {hasLoaded ? "Exibindo os últimos dados carregados." : ""}
            </span>
            <button
              type="button"
              onClick={retry}
              className="min-h-11 rounded-lg px-2 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {grouped.length === 0 ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"
          >
            Ainda não há itens disponíveis no cardápio.
          </p>
        ) : (
          <>
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
                          className={`flex items-center gap-3 border border-border bg-card py-3 ${CARD_CLASS[cardShape]} ${
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
                            <span className="shrink-0 text-sm font-semibold">
                              {brl(product.price)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      {footer}
    </>
  );
}

export default MenuList;
