import { createFileRoute } from "@tanstack/react-router";
import { PreparedArea } from "@/components/empresa/PreparedArea";

export const Route = createFileRoute("/caixa/fiscal")({
  head: () => ({ meta: [{ title: "Fiscal | FastBar" }] }),
  component: () => (
    <PreparedArea
      title="Fiscal"
      intro="Módulo separado de propósito: a parte fiscal tem regras próprias (estado, município, certificado) e não deve se misturar com o resto da empresa."
      willHave={[
        {
          title: "Emissão de nota",
          text: "NFC-e e NFS-e, depois do credenciamento, do certificado digital e da escolha de um provedor adequado ao estado e ao município.",
        },
        {
          title: "Preparação para o contador",
          text: "Resumo das vendas e dos custos por período, em formato que o contador consiga usar.",
        },
        {
          title: "Conferência",
          text: "Cruzamento entre o que foi vendido no caixa e o que foi emitido, para achar diferença antes do fechamento do mês.",
        },
      ]}
      rules={[
        "Hoje o sistema NÃO emite nota fiscal. Nada aqui substitui o contador nem a emissão oficial.",
        "Pagamento por PIX só é confirmado automaticamente com integração real e homologada; sem ela, a equipe confirma na mão.",
      ]}
    />
  ),
});
