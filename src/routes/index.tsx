import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FastBar | Home" },
      {
        name: "description",
        content: "FastBar — comanda digital. Abra sua comanda e acompanhe o consumo pelo celular.",
      },
      { property: "og:title", content: "FastBar | Home" },
    ],
  }),
  component: ClientHome,
});

function ClientHome() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <Link
        to="/equipe"
        aria-label="Acesso da equipe"
        className="absolute right-5 top-5 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
      >
        <Lock className="h-4 w-4" />
      </Link>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">FastBar</p>
      <h1 className="mt-2 text-4xl font-bold">Sua comanda digital</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Informe seus dados e acompanhe seu consumo pelo celular. O lançamento dos
        itens é feito pelo caixa.
      </p>

      <div className="mt-8">
        <Link
          to="/abrir"
          className="inline-block w-full rounded-xl bg-primary px-6 py-3 text-center text-base font-semibold text-primary-foreground shadow-soft"
        >
          Abrir comanda
        </Link>
      </div>
    </main>
  );
}
