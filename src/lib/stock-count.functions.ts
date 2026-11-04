import { createServerFn } from "@tanstack/react-start";

/**
 * Camada createServerFn da conferência de estoque — mesmo padrão de operations.functions.ts:
 * só expõe os server functions; a lógica de verdade mora em stock-count.server.ts (admin() direto,
 * nunca importável no topo de um arquivo que o bundler do client também processa).
 */

export const getStockCountCandidates = createServerFn({ method: "GET" }).handler(async () => {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { listCountableProducts, STOCK_COUNT_MOTIVOS } = await import("./stock-count.server");
  const products = await listCountableProducts();
  return { products, motivos: STOCK_COUNT_MOTIVOS };
});

type StockCountItemPayload = {
  productId: string;
  contada: number;
  motivo?: string | undefined;
  observacao?: string | undefined;
};

/**
 * Caminho normal: grava a contagem de cada item (com motivo+observação nas diferenças) e abre a
 * operação. "items" só precisa conter os produtos que a tela mostrou — nenhum campo é obrigatório
 * em si, a validação de "faltou motivo" acontece por item dentro de stock-count.server.ts.
 */
export const openOperationWithStockCount = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string; items: StockCountItemPayload[] }) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!(await teamPasswordMatches(data.password))) {
      return { ok: false as const, message: "Senha incorreta." };
    }

    const { recordStockCountAndOpenOperation, isStockCountMotivo } =
      await import("./stock-count.server");
    const items = data.items.map((item) => ({
      productId: item.productId,
      contada: item.contada,
      motivo: isStockCountMotivo(item.motivo) ? item.motivo : undefined,
      observacao: item.observacao,
    }));
    return recordStockCountAndOpenOperation({ items, realizadoPor: "equipe" });
  });

/**
 * "Pular conferência": só com senha (checada aqui) + motivo (validado em
 * skipStockCountAndOpenOperation) — a trilha de auditoria exigida pelo CLAUDE.md.
 */
export const skipStockCountAndOpen = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string; motivo: string }) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!(await teamPasswordMatches(data.password))) {
      return { ok: false as const, message: "Senha incorreta." };
    }

    const { skipStockCountAndOpenOperation } = await import("./stock-count.server");
    return skipStockCountAndOpenOperation({ motivo: data.motivo, realizadoPor: "equipe" });
  });
