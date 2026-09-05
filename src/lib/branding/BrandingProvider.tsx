import { createContext, useContext, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicBranding } from "./functions";
import { brandingStyle } from "./theme";
import { DEFAULT_BRANDING } from "./constants";
import type { TenantBranding } from "./types";

interface BrandingContextValue {
  branding: TenantBranding;
  isLoading: boolean;
  /** Pronto pra jogar em style={...} do wrapper da tela — já embute a cor da marca. */
  style: CSSProperties;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

/**
 * Resolve e disponibiliza a identidade visual do tenant pra árvore do cliente inteira (QR code →
 * abertura → comanda → cadastro → política de privacidade). Envolve cada tela do cliente
 * individualmente (não existe um layout compartilhado só pra rotas de cliente na árvore de rotas
 * hoje) — usar <BrandingProvider> na raiz do componente da rota e const { branding, style } =
 * useBranding() em quem precisa.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState(true);
  const loadBranding = useServerFn(getPublicBranding);

  useEffect(() => {
    let active = true;
    void loadBranding().then((result) => {
      if (!active) return;
      setBranding(result);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: BrandingContextValue = {
    branding,
    isLoading,
    style: brandingStyle(branding),
  };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error("useBranding precisa ser usado dentro de um <BrandingProvider>.");
  }
  return ctx;
}
