import { createFileRoute } from "@tanstack/react-router";
import { OpenTabForm } from "@/features/client/components/OpenTabForm";

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
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <OpenTabForm />
    </main>
  );
}
