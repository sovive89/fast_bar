import { useEffect, useRef, useState, type RefCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Instagram, MapPin, MessageCircle, Phone, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { instagramLink, useBranding, whatsappLink } from "@/lib/branding";
import { getPublicCompany } from "@/lib/public-company.functions";
import type { PublicCompany } from "@/lib/public-company";

const linkClass =
  "flex h-14 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

/** Company details come from Dados da empresa, never from a second address field in Marca. */
export function CompanyFooter({
  supportSlotRef,
}: {
  supportSlotRef?: RefCallback<HTMLDivElement> | undefined;
}) {
  const { branding, style } = useBranding();
  const load = useServerFn(getPublicCompany);
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const footerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const value = await load();
        if (active) setCompany(value);
      } catch {
        /* No invented contacts or private settings fallback on a failed read. */
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [load]);

  const locationUrl = company?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(company.address)}`
    : null;
  const hasCompany = !!(company?.tradeName || company?.address || company?.phone || company?.cnpj);
  const visible =
    !!supportSlotRef || hasCompany || !!branding.whatsappNumber || !!branding.instagramUser;

  useEffect(() => {
    if (!visible || !footerRef.current) return;
    const element = footerRef.current;
    const measure = () =>
      document.documentElement.style.setProperty(
        "--client-footer-height",
        `${element.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty("--client-footer-height");
    };
  }, [visible]);

  async function shareLocation() {
    if (!locationUrl) return;
    setShareMessage("");
    try {
      if (navigator.share) {
        await navigator.share({
          title: company?.tradeName || branding.brandName,
          text: company?.address || "",
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

  if (!visible) return null;
  return (
    <>
      <div
        aria-hidden="true"
        style={{ height: "var(--client-footer-height, calc(64px + env(safe-area-inset-bottom)))" }}
      />
      <footer
        ref={footerRef}
        style={style}
        className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-border bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-background/85"
      >
        {shareMessage && (
          <p role="status" className="px-2 pb-1 text-xs">
            {shareMessage}
          </p>
        )}
        <nav
          aria-label="Contato e informações do estabelecimento"
          className="flex min-h-15 items-center gap-0.5"
        >
          {locationUrl && (
            <button
              type="button"
              onClick={() => void shareLocation()}
              className={linkClass}
              aria-label="Compartilhar localização"
            >
              <Share2 className="h-5 w-5" aria-hidden="true" />
              <span>Localização</span>
            </button>
          )}
          {branding.whatsappNumber && (
            <a
              href={whatsappLink(branding.whatsappNumber)}
              target="_blank"
              rel="noreferrer"
              className={linkClass}
              aria-label="Contato pelo WhatsApp"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              <span>WhatsApp</span>
            </a>
          )}
          {branding.instagramUser && (
            <a
              href={instagramLink(branding.instagramUser)}
              target="_blank"
              rel="noreferrer"
              className={linkClass}
              aria-label={`Instagram @${branding.instagramUser}`}
            >
              <Instagram className="h-5 w-5" aria-hidden="true" />
              <span>Instagram</span>
            </a>
          )}
          {hasCompany && (
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className={linkClass}
              aria-label="Contato e dados da empresa"
            >
              <Building2 className="h-5 w-5" aria-hidden="true" />
              <span>Empresa</span>
            </button>
          )}
          {supportSlotRef && (
            <div ref={supportSlotRef} className="flex shrink-0 items-center justify-center pl-1" />
          )}
        </nav>
      </footer>
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent
          style={style}
          className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl"
        >
          <DialogTitle>{company?.tradeName || branding.brandName}</DialogTitle>
          <DialogDescription>Informações públicas do estabelecimento.</DialogDescription>
          <dl className="space-y-4 text-sm">
            {company?.address && (
              <div>
                <dt className="font-semibold">Endereço</dt>
                <dd className="mt-1 break-words">
                  {company.address}
                  {locationUrl && (
                    <a
                      href={locationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex min-h-11 items-center gap-2 underline"
                    >
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                      Abrir no mapa
                    </a>
                  )}
                </dd>
              </div>
            )}
            {company?.phone && (
              <div>
                <dt className="font-semibold">Telefone</dt>
                <dd className="mt-1">
                  <a
                    href={`tel:${company.phone}`}
                    className="inline-flex min-h-11 items-center underline"
                  >
                    <Phone className="mr-2 h-4 w-4" aria-hidden="true" />
                    {company.phone}
                  </a>
                </dd>
              </div>
            )}
            {company?.cnpj && (
              <div>
                <dt className="font-semibold">CNPJ</dt>
                <dd className="mt-1">{company.cnpj}</dd>
              </div>
            )}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
