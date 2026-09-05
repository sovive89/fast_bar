import { createFileRoute } from "@tanstack/react-router";
import { Instagram, MessageCircle } from "lucide-react";
import { OpenTabForm } from "@/features/client/components/OpenTabForm";
import {
  BrandingProvider,
  instagramLink,
  useBranding,
  whatsappLink,
} from "@/lib/branding";

export const Route = createFileRoute("/abrir")({
  head: () => ({
    meta: [
      { title: "Abrir comanda" },
      {
        name: "description",
        content:
          "Abra sua comanda informando nome e celular e acompanhe seu consumo em tempo real.",
      },
    ],
  }),
  component: AbrirPage,
});

function AbrirPage() {
  return (
    <BrandingProvider>
      <AbrirPageContent />
    </BrandingProvider>
  );
}

function AbrirPageContent() {
  const { branding, style } = useBranding();

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10"
      style={style}
    >
      {/* Primeira tela que o cliente vê depois de escanear o QR — a marca do bar é o assunto
          principal dela, não um cabeçalho discreto em cima do formulário. */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        {branding.logoUrl && (
          <img
            src={branding.logoUrl}
            alt={branding.brandName}
            className="h-28 w-28 rounded-3xl object-cover shadow-soft"
          />
        )}
        <h1 className="text-3xl font-bold leading-tight">{branding.brandName}</h1>
      </div>
      <OpenTabForm />
      <BrandSocialLinks />
    </main>
  );
}

/** Instagram e WhatsApp da casa, quando configurados em Marca. Some inteiro se não houver nenhum
 * — rodapé vazio só ocuparia espaço na tela do celular. */
function BrandSocialLinks() {
  const { branding } = useBranding();
  if (!branding.instagramUser && !branding.whatsappNumber) return null;

  return (
    <div className="mt-8 flex items-center justify-center gap-5">
      {branding.instagramUser && (
        <a
          href={instagramLink(branding.instagramUser)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Instagram @${branding.instagramUser}`}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <Instagram className="h-5 w-5" />@{branding.instagramUser}
        </a>
      )}
      {branding.whatsappNumber && (
        <a
          href={whatsappLink(branding.whatsappNumber)}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <MessageCircle className="h-5 w-5" />
          WhatsApp
        </a>
      )}
    </div>
  );
}
