import { createFileRoute, redirect } from "@tanstack/react-router";

/** Conexões passou a morar dentro do módulo Empresa. Mesmo motivo do redirecionamento de Configurações. */
export const Route = createFileRoute("/caixa/conexoes")({
  beforeLoad: () => {
    throw redirect({ to: "/caixa/empresa/conexoes" });
  },
});
