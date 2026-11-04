import { useBranding } from "@/lib/branding";

/**
 * Imagem decorativa só nas telas públicas da marca. O wrapper da página precisa de
 * `relative isolate`: assim a camada negativa fica acima do fundo do body, atrás do
 * conteúdo e fora da pilha dos diálogos/controles de apoio.
 */
export function BrandBackground() {
  const { branding } = useBranding();
  if (!branding.backgroundUrl) return null;

  return (
    <div
      aria-hidden="true"
      data-brand-background
      className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${JSON.stringify(branding.backgroundUrl)})` }}
    >
      <div className="absolute inset-0 bg-background/60" />
    </div>
  );
}
