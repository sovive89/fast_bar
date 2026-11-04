import { createServerFn } from "@tanstack/react-start";

/**
 * Camada createServerFn da Produção — só expõe os server functions; a lógica mora em
 * production.server.ts (mesmo padrão de operation-closure.functions.ts).
 */

export const getProductionOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { loadProductionOverview, listComponentOptions } = await import("./production.server");
  const [overview, options] = await Promise.all([loadProductionOverview(), listComponentOptions()]);
  return { ...overview, options };
});

export const createProductionRecipe = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      unit: string;
      yieldQuantity: number;
      lossPercent: number;
      components: { kind: "base_drink" | "ingredient"; id: string; quantity: number }[];
    }) => data,
  )
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { createProducedItemWithRecipe } = await import("./production.server");
    return createProducedItemWithRecipe(data);
  });

/** Registra uma ordem de produção: baixa os ingredientes e soma o saldo do item produzido. */
export const runProductionOrder = createServerFn({ method: "POST" })
  .inputValidator((data: { recipeId: string; batches: number }) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { registerProductionOrder } = await import("./production.server");
    return registerProductionOrder({
      recipeId: data.recipeId,
      batches: data.batches,
      realizadoPor: "equipe",
    });
  });
