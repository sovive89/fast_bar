import type { BarSession } from "@/types/fastbar";

export type ListView = "open" | "fechadas" | "historico" | "inadimplente";

export const VIEW_TABS: { id: ListView; label: string }[] = [
  { id: "open", label: "Em aberto" },
  { id: "fechadas", label: "Fechadas nesta operação" },
  { id: "historico", label: "Histórico" },
  { id: "inadimplente", label: "Inadimplentes" },
];

/**
 * Em qual aba a comanda aparece (P1.6 do CLAUDE.md): "Fechadas nesta operação" guarda os desfechos
 * da operação em andamento, e na operação seguinte eles passam para "Histórico"; inadimplência tem
 * área própria e nunca se mistura com as outras.
 *
 * Comanda "closed" (conta pedida, ainda sem pagamento) de uma operação anterior — uma "mantida
 * aberta" no fechamento — NÃO vai para o Histórico: é dinheiro a receber, então volta para "Em
 * aberto", onde a equipe vê e resolve.
 */
export function bucketOf(
  session: Pick<BarSession, "status" | "archived_at" | "operacao_id">,
  currentOperationId: string | null,
): ListView {
  if (session.status === "inadimplente") return "inadimplente";
  if (session.archived_at) return "historico";
  const fromCurrentOperation =
    currentOperationId !== null && session.operacao_id === currentOperationId;
  if (session.status === "closed") return fromCurrentOperation ? "fechadas" : "open";
  if (["paid", "cancelled", "cortesia"].includes(session.status)) {
    return fromCurrentOperation ? "fechadas" : "historico";
  }
  return "open";
}
