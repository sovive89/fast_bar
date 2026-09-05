import { createFileRoute } from "@tanstack/react-router";
import { useLiveTab } from "@/hooks/use-live-tab";
import CustomerTabView from "@/features/client/components/CustomerTabView";

export const Route = createFileRoute("/c/$sessionId")({
  head: () => ({
    meta: [
      { title: "Minha comanda | Pop9Bar" },
      {
        name: "description",
        content: "Acompanhe os itens lançados pelo caixa, o total e o tempo no bar.",
      },
      { property: "og:title", content: "Minha comanda | Pop9Bar" },
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
  const { session, items, loading, now } = useLiveTab(sessionId);

  return <CustomerTabView loading={loading} session={session} items={items} now={now} />;
}
