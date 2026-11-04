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

type Destino = "arquivo" | "cortesia" | "inadimplencia" | "conta_pedida" | "mantida_aberta";

/** Dá um destino a uma comanda. Senha sempre exigida (P1.3 do CLAUDE.md: "senha de
 * gestor/permissão... fechar comanda aberta"). */
export const resolveClosure = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      password: string;
      sessionId: string;
      destino: Destino;
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

/** O mesmo destino para várias comandas selecionadas: uma senha e um motivo valem para o lote, e
 * cada comanda é gravada e auditada por conta própria (operation-closure.server.ts). */
export const resolveClosureBulk = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      password: string;
      sessionIds: string[];
      destino: Destino;
      motivo?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!(await teamPasswordMatches(data.password))) {
      return { ok: false as const, message: "Senha incorreta.", done: 0, failures: [] };
    }
    if (!Array.isArray(data.sessionIds) || data.sessionIds.length === 0) {
      return {
        ok: false as const,
        message: "Selecione ao menos uma comanda.",
        done: 0,
        failures: [],
      };
    }
    const { resolveClosureCandidates } = await import("./operation-closure.server");
    const result = await resolveClosureCandidates({
      sessionIds: data.sessionIds,
      destino: data.destino,
      motivo: data.motivo,
      realizadoPor: "equipe",
    });
    return {
      ...result,
      message:
        result.failures.length === 0
          ? undefined
          : `${result.failures.length} comanda${result.failures.length === 1 ? "" : "s"} não ${
              result.failures.length === 1 ? "recebeu" : "receberam"
            } o destino.`,
    };
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
