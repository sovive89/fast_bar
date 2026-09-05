import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { OpenTabForm } from "@/features/client/components/OpenTabForm";
import { getPublicBranding, type PublicBranding } from "@/lib/integrations.functions";

export const Route = createFileRoute("/abrir")({
  head: () => ({
    meta: [
      { title: "Abrir comanda | FastBar" },
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
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const loadBranding = useServerFn(getPublicBranding);

  useEffect(() => {
    void loadBranding().then(setBranding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        {branding?.logoUrl && (
          <img
            src={branding.logoUrl}
            alt={branding.brandName}
            className="h-16 w-16 rounded-2xl object-cover shadow-soft"
          />
        )}
        <h1 className="text-xl font-bold">{branding?.brandName ?? "FastBar"}</h1>
      </div>
      <OpenTabForm />
    </main>
  );
}
