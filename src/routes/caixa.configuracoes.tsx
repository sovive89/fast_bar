import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Configurações passou a morar dentro do módulo Empresa. A rota antiga fica de pé redirecionando:
 * o endereço pode estar salvo no navegador do balcão ou no app instalado, e um 404 num endereço que
 * funcionava ontem parece app quebrado.
 */
export const Route = createFileRoute("/caixa/configuracoes")({
  beforeLoad: () => {
    throw redirect({ to: "/caixa/empresa/configuracoes" });
  },
});
