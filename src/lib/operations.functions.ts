import { createServerFn } from "@tanstack/react-start";

/**
 * Camada createServerFn da Operação — mesmo padrão de integrations.functions.ts/service.server.ts:
 * este arquivo é o único ponto seguro pra importar direto em rota/componente client (caixa.tsx).
 * Só expõe getOperationStatus (leitura); abrir e fechar a operação moraram aqui antes e agora
 * vivem em stock-count.functions.ts e operation-closure.functions.ts — os dois são o único jeito
 * de abrir/fechar, porque cada um garante a revisão que o outro não faz. A lógica de verdade
 * (admin(), cálculo de data operacional) mora em operations.server.ts, que faz chamadas diretas
 * com a service role — nunca pode ser importado no topo de um arquivo que o bundler client
 * também processa, senão a service role vaza pro bundle do navegador.
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

// Encerrar a operação direto (sem revisar as comandas em aberto) saiu daqui pelo mesmo motivo que
// abrir direto: viraria porta dos fundos pra "não é possível terminar o fluxo sem revisar as
// comandas abertas" (P1.5 do CLAUDE.md). Quem encerra a operação agora é sempre
// operation-closure.functions.ts (closeOperationAfterReview), que só deixa fechar depois que
// toda comanda aberta/fechada da operação recebeu um destino (operation-closure.server.ts).
