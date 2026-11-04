import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useLiveTab } from "@/hooks/use-live-tab";
import { requestMyBill } from "@/lib/bill-requests.functions";
import CustomerTabView from "@/features/client/components/CustomerTabView";

export const Route = createFileRoute("/c/$sessionId")({
  head: () => ({
    meta: [
      { title: "Minha comanda" },
      {
        name: "description",
        content: "Acompanhe os itens lançados pelo caixa, o total e o tempo no bar.",
      },
      { property: "og:title", content: "Minha comanda" },
      {
        property: "og:description",
        content: "Itens, total e tempo de permanência da sua comanda, em tempo real.",
      },
    ],
  }),
  component: CustomerTab,
});

function CustomerTab() {
  const { sessionId } = Route.useParams();
  const { session, items, billRequest, loading, loadFailed, now, reload } = useLiveTab(sessionId);
  const requestBill = useServerFn(requestMyBill);

  async function onRequestBill() {
    const result = await requestBill({ data: { sessionId } });
    // Recarrega para o botão virar "A equipe foi avisada" na hora, sem esperar o ciclo de 10 s.
    await reload();
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  }

  return (
    <CustomerTabView
      loading={loading}
      loadFailed={loadFailed}
      session={session}
      items={items}
      now={now}
      billRequest={billRequest}
      onRequestBill={onRequestBill}
    />
  );
}
