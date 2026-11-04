import { useEffect, useId, useMemo, useState } from "react";
import { getCardapioCliente } from "@/lib/menu-cliente.functions";
import { Instagram, MapPin, MessageCircle, Share2 } from "lucide-react";
import { useBranding, instagramLink, whatsappLink } from "@/lib/branding";
import { brl } from "@/lib/format";
import type { ItemCardapioCliente } from "@/lib/menu-cliente.functions";

const POLL_MS = 15000;

export function MenuList() {
  const { branding } = useBranding();
  const menuId = useId();
  const [shareMessage, setShareMessage] = useState("");
  const locationUrl = branding.publicAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branding.publicAddress)}`
    : null;
  async function shareLocation() {
    if (!locationUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: branding.brandName,
          text: branding.publicAddress ?? "",
          url: locationUrl,
        });
      } else {
        await navigator.clipboard.writeText(locationUrl);
        setShareMessage("Link da localização copiado.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setShareMessage("Não foi possível compartilhar. Abra o mapa e copie o endereço.");
      }
    }
  }
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

  if (loading) return null;
  if (grouped.length === 0) return null;

  return (
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
          {locationUrl && (
            <a
              href={locationUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir localização no mapa"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
            >
              <MapPin aria-hidden="true" className="h-5 w-5" />
            </a>
          )}
          {branding.whatsappNumber && (
            <a
              href={whatsappLink(branding.whatsappNumber)}
              target="_blank"
              rel="noreferrer"
              aria-label="Contato pelo WhatsApp"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
            >
              <MessageCircle aria-hidden="true" className="h-5 w-5" />
            </a>
          )}
          {branding.instagramUser && (
            <a
              href={instagramLink(branding.instagramUser)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Instagram @${branding.instagramUser}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
            >
              <Instagram aria-hidden="true" className="h-5 w-5" />
            </a>
          )}
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

      {locationUrl && (
        <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <p className="min-w-0 flex-1 break-words">{branding.publicAddress}</p>
          <button
            type="button"
            onClick={() => void shareLocation()}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-primary"
          >
            <Share2 aria-hidden="true" className="h-4 w-4" /> Compartilhar
          </button>
        </div>
      )}
      <p role="status" className="text-xs text-muted-foreground">
        {shareMessage}
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
                    <p className="min-w-0 flex-1 break-words text-sm font-medium">{product.name}</p>
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
