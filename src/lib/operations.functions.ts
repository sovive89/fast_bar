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

/**
 * Abre a operação do dia. Recusa se já existir uma ABERTA (item 6 do prompt: nunca duas operações
 * simultâneas — reforçado também pelo índice único parcial no banco, então mesmo uma corrida de
 * cliques concorrentes não passa disso).
 */
export const openOperation = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }

    const { loadOperationConfig, getOpenOperation, computeDataOperacional } = await import(
      "./operations.server"
    );
    const existing = await getOpenOperation();
    if (existing) {
      return { ok: false as const, message: "Já existe uma operação aberta." };
    }

    const config = await loadOperationConfig();
    const now = new Date();
    const dataOperacional = computeDataOperacional(now, config);

    const { data: inserted, error } = await admin()
      .from("fastbar_operations")
      .insert({
        data_operacional: dataOperacional,
        inicio_operacional: now.toISOString(),
        status: "ABERTA",
        aberto_em: now.toISOString(),
        aberto_por: "equipe",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      // Corrida com outro clique quase simultâneo — o índice único do banco barrou; não é bug.
      return { ok: false as const, message: "Já existe uma operação aberta." };
    }
    return { ok: true as const, operationId: inserted.id, dataOperacional };
  });

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
    if (!teamPasswordMatches(data.password)) {
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
