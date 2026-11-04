import { createServerFn } from "@tanstack/react-start";

/**
 * Camada createServerFn do fechamento de operação — mesmo padrão de operations.functions.ts e
 * stock-count.functions.ts: só expõe os server functions, a lógica de verdade mora em
 * operation-closure.server.ts.
 */

export const getClosureCandidates = createServerFn({ method: "GET" }).handler(async () => {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { listClosureCandidates } = await import("./operation-closure.server");
  return listClosureCandidates();
});

/** Dá um destino a uma comanda: cortesia, inadimplência, ou manter aberta. Senha sempre exigida
 * (P1.3 do CLAUDE.md: "senha de gestor/permissão... fechar comanda aberta"). */
export const resolveClosure = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      password: string;
      sessionId: string;
      destino: "cortesia" | "inadimplencia" | "mantida_aberta";
      motivo?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!(await teamPasswordMatches(data.password))) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { resolveClosureCandidate } = await import("./operation-closure.server");
    return resolveClosureCandidate({
      sessionId: data.sessionId,
      destino: data.destino,
      motivo: data.motivo,
      realizadoPor: "equipe",
    });
  });

/** Encerra a operação — recusa se sobrar alguma comanda sem destino definido. */
export const closeOperationAfterReview = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!(await teamPasswordMatches(data.password))) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { closeOperationWithReview } = await import("./operation-closure.server");
    return closeOperationWithReview();
  });
