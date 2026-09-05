import { createFileRoute } from "@tanstack/react-router";
import { OpenTabForm } from "@/features/client/components/OpenTabForm";
import { BrandingProvider, useBranding } from "@/lib/branding";

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
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        {branding.logoUrl && (
          <img
            src={branding.logoUrl}
            alt={branding.brandName}
            className="h-16 w-16 rounded-2xl object-cover shadow-soft"
          />
        )}
        <h1 className="text-xl font-bold">{branding.brandName}</h1>
      </div>
      <OpenTabForm />
    </main>
  );
}
