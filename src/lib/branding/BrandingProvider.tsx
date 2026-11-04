import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicBranding } from "./functions";
import { brandingStyle } from "./theme";
import { DEFAULT_BRANDING } from "./constants";
import { loadWithFallback } from "../async-result";
import type { TenantBranding } from "./types";

interface BrandingContextValue {
  branding: TenantBranding;
  isLoading: boolean;
  brandingError: boolean;
  retryBranding: () => void;
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
 *
 * Branding é uma melhoria visual, não um requisito para usar a tela: em falha inicial fica
 * DEFAULT_BRANDING; em falha posterior a última identidade que carregou permanece disponível.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState(true);
  const [brandingError, setBrandingError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const loadBranding = useServerFn(getPublicBranding);
  const loadBrandingRef = useRef(loadBranding);
  const brandingRef = useRef(branding);

  // Keep the latest server function/value without making the request effect restart on render.
  loadBrandingRef.current = loadBranding;
  brandingRef.current = branding;

  const retryBranding = useCallback(() => {
    setIsLoading(true);
    setRetryKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      const result = await loadWithFallback(() => loadBrandingRef.current(), brandingRef.current);
      if (!active) return;

      brandingRef.current = result.value;
      if (!result.error) setBranding(result.value);
      setBrandingError(result.error);
      setIsLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [retryKey]);

  useEffect(() => {
    if (!brandingError) return;

    const retryWhenOnline = () => retryBranding();
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [brandingError, retryBranding]);

  const value: BrandingContextValue = {
    branding,
    isLoading,
    brandingError,
    retryBranding,
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
