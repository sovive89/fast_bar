import { createServerFn } from "@tanstack/react-start";

/**
 * Camada createServerFn do pedido de conta — só expõe os server functions; a lógica mora em
 * bill-requests.server.ts (mesmo padrão de operation-closure.functions.ts).
 */

/** Cliente pede a conta. Autorizado pelo link único da comanda (o UUID), como o resto da tela do
 * cliente: quem tem o link já vê a comanda inteira. Não fecha nada, só avisa a equipe. */
export const requestMyBill = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { requestBill } = await import("./bill-requests.server");
    return requestBill(data.sessionId);
  });

/** Caixa: pedidos de conta ainda sem conclusão. */
export const getBillRequests = createServerFn({ method: "GET" }).handler(async () => {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { listActiveBillRequests } = await import("./bill-requests.server");
  return listActiveBillRequests();
});

/** Caixa: assumir ("atender") ou concluir um pedido de conta. */
export const updateBillRequest = createServerFn({ method: "POST" })
  .inputValidator((data: { requestId: string; action: "atender" | "concluir" }) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { advanceBillRequest } = await import("./bill-requests.server");
    return advanceBillRequest({
      requestId: data.requestId,
      action: data.action === "atender" ? "atender" : "concluir",
      realizadoPor: "equipe",
    });
  });
