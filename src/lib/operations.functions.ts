import { createServerFn } from "@tanstack/react-start";

/**
 * Camada createServerFn da Operação — mesmo padrão de integrations.functions.ts/service.server.ts:
 * este arquivo é o único ponto seguro pra importar direto em rota/componente client (caixa.tsx),
 * porque só expõe os três server functions. A lógica de verdade (admin(), cálculo de data
 * operacional) mora em operations.server.ts, que faz chamadas diretas com a service role — nunca
 * pode ser importado no topo de um arquivo que o bundler client also processa, senão a service
 * role vaza pro bundle do navegador.
 */

export const getOperationStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { loadOperationConfig, getOpenOperation, computeDataOperacional } = await import(
    "./operations.server"
  );
  const [config, open] = await Promise.all([loadOperationConfig(), getOpenOperation()]);
  const dataOperacionalAgora = computeDataOperacional(new Date(), config);
  return { operation: open, dataOperacionalAgora, config };
});

// Abrir a operação direto (sem conferência de estoque) saiu daqui de propósito — viraria uma
// porta dos fundos pra "conferência de estoque obrigatória antes de abrir comandas" (P1 do
// CLAUDE.md). Quem abre a operação agora é sempre stock-count.functions.ts
// (openOperationWithStockCount ou skipStockCountAndOpenOperation), os dois passando por
// operations.server.ts > createOperationRow().

/**
 * Encerra a operação aberta. O frontend já exige uma confirmação explícita antes de chamar isto
 * (item 5 do prompt) — aqui só valida que existe operação aberta e fecha.
 */
export const closeOperation = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!(await teamPasswordMatches(data.password))) {
      return { ok: false as const, message: "Senha incorreta." };
    }

    const { getOpenOperation } = await import("./operations.server");
    const open = await getOpenOperation();
    if (!open) {
      return { ok: false as const, message: "Não há operação aberta." };
    }

    const now = new Date();
    const { error } = await admin()
      .from("fastbar_operations")
      .update({ status: "FECHADA", fechado_em: now.toISOString(), fechado_por: "equipe" })
      .eq("id", open.id)
      .eq("status", "ABERTA"); // dupla proteção contra fechamento duplicado em corrida

    if (error) {
      return { ok: false as const, message: "Não foi possível encerrar a operação." };
    }
    return { ok: true as const };
  });
