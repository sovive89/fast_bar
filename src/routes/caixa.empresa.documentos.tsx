import { createFileRoute } from "@tanstack/react-router";
import { PreparedArea } from "@/components/empresa/PreparedArea";

export const Route = createFileRoute("/caixa/empresa/documentos")({
  head: () => ({ meta: [{ title: "Documentos | Empresa | FastBar" }] }),
  component: () => (
    <PreparedArea
      title="Documentos"
      intro="Os papéis da empresa num lugar só, com histórico e acesso controlado."
      willHave={[
        {
          title: "Societários e jurídicos",
          text: "Contrato social, sócios e cotas, natureza jurídica, contratos com fornecedores e com a equipe.",
        },
        {
          title: "Fiscais",
          text: "CNPJ, regime tributário e documentos que o contador pede. Exportação para o contador com histórico.",
        },
        {
          title: "Licenças e alvarás",
          text: "Alvarás, licenças e registro das visitas da vigilância sanitária, com data de validade e aviso antes de vencer.",
        },
      ]}
      rules={[
        "Arquivos sensíveis: só perfis autorizados abrem, e cada abertura fica registrada.",
        "O sistema prepara os dados para o contador, mas não substitui a emissão fiscal.",
      ]}
      alreadyElsewhere="Os dados cadastrais já existem hoje em Configurações → Perfil: razão social, nome fantasia, CNPJ, telefone e endereço."
    />
  ),
});
