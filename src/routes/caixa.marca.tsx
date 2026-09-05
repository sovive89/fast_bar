import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * A Marca virou a aba "Perfil" de Configurações, junto dos dados cadastrais do estabelecimento —
 * identidade visual e cadastro do negócio respondem à mesma pergunta ("quem é esse bar?") e não
 * faziam sentido em dois módulos separados na barra lateral.
 *
 * A rota antiga fica de pé redirecionando: o link pode estar salvo no navegador do balcão, e um
 * 404 num endereço que funcionava ontem parece app quebrado.
 */
export const Route = createFileRoute("/caixa/marca")({
  beforeLoad: () => {
    throw redirect({ to: "/caixa/configuracoes" });
  },
});
