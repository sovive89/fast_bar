import { createFileRoute } from "@tanstack/react-router";
import { PreparedArea } from "@/components/empresa/PreparedArea";

export const Route = createFileRoute("/caixa/empresa/gestao")({
  head: () => ({ meta: [{ title: "Gestão | Empresa | FastBar" }] }),
  component: () => (
    <PreparedArea
      title="Gestão"
      intro="A parte administrativa da empresa: quem trabalha, quanto custa manter o bar aberto e o que a lei exige."
      willHave={[
        {
          title: "Freelancers",
          text: "Controle de quem trabalhou, em quais dias, quanto combinou (diária ou hora) e o que já foi pago.",
        },
        {
          title: "Custos fixos",
          text: "Luz, água, aluguel, internet, gás e qualquer outro custo que se repete, com valor, vencimento e comprovante. Entram na análise de margem quando houver dados suficientes.",
        },
        {
          title: "Equipe fixa e férias",
          text: "Organização das férias dos empregados fixos, para não faltar gente e não vencer período sem aviso.",
        },
        {
          title: "Legislação",
          text: "Referência das regras trabalhistas e do funcionamento do bar, com lembretes de prazo. É apoio de consulta, não aconselhamento jurídico.",
        },
      ]}
      rules={[
        "Dados de pessoas (contratos, jornada, pagamentos) são sensíveis: acesso por perfil, nunca na tela pública.",
        "Insights só sugerem, nunca ajustam preço nem pagamento sozinhos.",
      ]}
    />
  ),
});
