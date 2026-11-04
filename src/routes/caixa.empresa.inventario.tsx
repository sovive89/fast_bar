import { createFileRoute } from "@tanstack/react-router";
import { PreparedArea } from "@/components/empresa/PreparedArea";

export const Route = createFileRoute("/caixa/empresa/inventario")({
  head: () => ({ meta: [{ title: "Inventário | Empresa | FastBar" }] }),
  component: () => (
    <PreparedArea
      title="Inventário"
      intro="Cadastro de tudo o que a empresa tem e que dura: o patrimônio. É diferente do estoque, que é o que se consome e se repõe."
      willHave={[
        {
          title: "Bens duráveis",
          text: "Geladeiras, freezers, máquinas, mesas, cadeiras, decoração, mesa de sinuca, equipamentos de som e cozinha.",
        },
        {
          title: "Dados de cada bem",
          text: "Custo de compra, estado de conservação, data de aquisição, depreciação quando fizer sentido e valor de reposição.",
        },
        {
          title: "Valor da empresa",
          text: "Uma estimativa por cenários e premissas, nunca uma soma apresentada como o valor objetivo da empresa.",
        },
      ]}
      rules={[
        "Inventário fica separado do Estoque: bem durável não entra em contagem de abertura nem em ficha técnica.",
        "Dano a um bem não baixa nem cobra nada sozinho: fica aguardando avaliação do gestor.",
      ]}
      alreadyElsewhere="Copos, taças, talheres, itens de limpeza e consumo durável (gás, material de cozinha) ficam no módulo Estoque, na subdivisão de utensílios e insumos."
    />
  ),
});
