import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/comanda/$sessionId")({
  head: () => ({
    meta: [
      { title: "Minha comanda | Pop9Bar" },
      {
        name: "description",
        content: "Acompanhe os itens lançados pelo caixa, o total e o tempo no bar.",
      },
    ],
  }),
  beforeLoad: ({ params }) => {
    const { sessionId } = params;
    // Redirect to the new client route preserving sessionId
    throw redirect({ to: "/c/$sessionId", params: { sessionId } });
  },
  component: function ComandaRedirect() {
    return null;
  },
});
