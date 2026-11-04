import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
const registerCustomerSpend = vi.fn(async () => undefined);
vi.mock("../src/lib/fastbar.server", () => ({
  admin: () => holder.db,
  registerCustomerSpend,
}));

const {
  listClosureCandidates,
  resolveClosureCandidate,
  resolveClosureCandidates,
  closeOperationWithReview,
  allowedDestinos,
} = await import("../src/lib/operation-closure.server");

const OP = "op-atual";

/**
 * Operação aberta com:
 *   ana    aberta nesta operação, deve R$ 30
 *   bruno  conta pedida nesta operação, deve R$ 12
 *   fabio  aberta nesta operação, sem consumo (R$ 0)
 *   gabi   conta pedida nesta operação, já quitada (pagou R$ 20 de R$ 20)
 *   davi   aberta numa operação anterior, deve R$ 40
 *   helena aberta sem operação nenhuma, sem consumo
 *   carla  paga (não precisa de destino)
 *   eva    pendente de confirmação (não precisa de destino)
 */
function seed(db: FakeSupabase) {
  db.seed("fastbar_operations", [
    { id: "op-antiga", status: "FECHADA", data_operacional: "2026-11-03" },
    { id: OP, status: "ABERTA", data_operacional: "2026-11-04" },
  ]);
  db.seed("fastbar_sessions", [
    { id: "ana", customer_name: "Ana", status: "open", operacao_id: OP },
    { id: "bruno", customer_name: "Bruno", status: "closed", operacao_id: OP },
    { id: "fabio", customer_name: "Fábio", status: "open", operacao_id: OP },
    { id: "gabi", customer_name: "Gabi", status: "closed", operacao_id: OP, closed_at: null },
    {
      id: "davi",
      customer_name: "Davi",
      status: "open",
      operacao_id: "op-antiga",
      data_operacional: "2026-11-03",
    },
    { id: "helena", customer_name: "Helena", status: "open", operacao_id: null },
    { id: "carla", customer_name: "Carla", status: "paid", operacao_id: OP },
    { id: "eva", customer_name: "Eva", status: "pending", operacao_id: OP },
  ]);
  db.seed("fastbar_tab_items", [
    { session_id: "ana", unit_price: 10, quantity: 3 },
    { session_id: "bruno", unit_price: 6, quantity: 2 },
    { session_id: "gabi", unit_price: 20, quantity: 1 },
    { session_id: "davi", unit_price: 20, quantity: 2 },
    { session_id: "carla", unit_price: 50, quantity: 1 },
  ]);
  db.seed("fastbar_session_payments", [
    { session_id: "gabi", amount: 20, method: "pix", motivo: null, saldo_apos: 0, created_at: "1" },
  ]);
}

beforeEach(() => {
  holder.db = new FakeSupabase();
  registerCustomerSpend.mockClear();
  seed(holder.db);
});

function session(id: string) {
  return holder.db.table("fastbar_sessions").find((row) => row.id === id);
}

function closures() {
  return holder.db.table("fastbar_operation_closures");
}

const base = { motivo: undefined, realizadoPor: "equipe" } as const;

describe("quais destinos cada comanda aceita", () => {
  it("desta operação, com saldo: cortesia, inadimplência, fechar conta e manter", () => {
    expect(
      allowedDestinos({ status: "open", balance: 30, creditLeft: 0, fromCurrentOperation: true }),
    ).toEqual(["cortesia", "inadimplencia", "conta_pedida", "mantida_aberta"]);
  });

  it("desta operação, quitada: arquivo em vez de cortesia/inadimplência", () => {
    expect(
      allowedDestinos({ status: "closed", balance: 0, creditLeft: 0, fromCurrentOperation: true }),
    ).toEqual(["arquivo", "mantida_aberta"]);
  });

  it("operação anterior: só arquivo (quitada) ou inadimplência (com saldo)", () => {
    expect(
      allowedDestinos({ status: "open", balance: 40, creditLeft: 0, fromCurrentOperation: false }),
    ).toEqual(["inadimplencia"]);
    expect(
      allowedDestinos({ status: "open", balance: 0, creditLeft: 0, fromCurrentOperation: false }),
    ).toEqual(["arquivo"]);
  });

  it("operação anterior com crédito sobrando e nada devido não trava o fechamento", () => {
    expect(
      allowedDestinos({ status: "open", balance: 0, creditLeft: 15, fromCurrentOperation: false }),
    ).toEqual(["mantida_aberta"]);
  });
});

describe("comandas que precisam de destino", () => {
  it("lista as desta operação e também as esquecidas de antes, com saldo e destinos", async () => {
    const { operationId, candidates } = await listClosureCandidates();
    expect(operationId).toBe(OP);
    expect(candidates.map((c) => [c.sessionId, c.total, c.fromCurrentOperation])).toEqual([
      ["ana", 30, true],
      ["bruno", 12, true],
      ["fabio", 0, true],
      ["gabi", 0, true],
      ["davi", 40, false],
      ["helena", 0, false],
    ]);
    const davi = candidates.find((c) => c.sessionId === "davi");
    expect(davi).toMatchObject({ dataOperacional: "2026-11-03", allowed: ["inadimplencia"] });
  });
});

describe("arquivo", () => {
  it("recusa comanda que ainda deve", async () => {
    const result = await resolveClosureCandidate({ ...base, sessionId: "ana", destino: "arquivo" });
    expect(result).toEqual({ ok: false, message: "Só dá para arquivar comanda sem saldo devido." });
    expect(session("ana")?.status).toBe("open");
    expect(closures()).toHaveLength(0);
  });

  it("comanda quitada vira paga, soma no CRM e vai para o Histórico", async () => {
    const result = await resolveClosureCandidate({
      ...base,
      sessionId: "gabi",
      destino: "arquivo",
    });
    expect(result).toEqual({ ok: true });
    expect(session("gabi")).toMatchObject({ status: "paid", payment_method: "pix" });
    expect(session("gabi")?.archived_at).toBeTruthy();
    expect(registerCustomerSpend).toHaveBeenCalledWith("gabi");
    expect(closures()).toEqual([
      expect.objectContaining({ session_id: "gabi", destino: "arquivo", valor: 0, motivo: null }),
    ]);
  });

  it("comanda sem consumo vira cancelada e vai para o Histórico, sem somar no CRM", async () => {
    await resolveClosureCandidate({ ...base, sessionId: "fabio", destino: "arquivo" });
    expect(session("fabio")?.status).toBe("cancelled");
    expect(session("fabio")?.archived_at).toBeTruthy();
    expect(registerCustomerSpend).not.toHaveBeenCalled();
  });

  it("comanda antiga sem consumo também pode ser arquivada", async () => {
    const result = await resolveClosureCandidate({
      ...base,
      sessionId: "helena",
      destino: "arquivo",
    });
    expect(result).toEqual({ ok: true });
    expect(closures()[0]).toMatchObject({ operacao_id: OP, session_id: "helena" });
  });
});

describe("cortesia e inadimplência", () => {
  it("exigem motivo", async () => {
    for (const destino of ["cortesia", "inadimplencia"] as const) {
      const result = await resolveClosureCandidate({
        sessionId: "ana",
        destino,
        motivo: "ok",
        realizadoPor: "equipe",
      });
      expect(result).toEqual({ ok: false, message: "Descreva o motivo." });
    }
    expect(session("ana")?.status).toBe("open");
    expect(closures()).toHaveLength(0);
  });

  it("cortesia fecha sem cobrança e registra o valor perdoado", async () => {
    const result = await resolveClosureCandidate({
      sessionId: "ana",
      destino: "cortesia",
      motivo: "Aniversário do dono",
      realizadoPor: "equipe",
    });
    expect(result).toEqual({ ok: true });
    expect(session("ana")?.status).toBe("cortesia");
    expect(closures()).toEqual([
      expect.objectContaining({
        operacao_id: OP,
        session_id: "ana",
        destino: "cortesia",
        motivo: "Aniversário do dono",
        valor: 30,
      }),
    ]);
  });

  it("inadimplência guarda o saldo pendente", async () => {
    await resolveClosureCandidate({
      sessionId: "bruno",
      destino: "inadimplencia",
      motivo: "Saiu sem pagar, volta amanhã",
      realizadoPor: "equipe",
    });
    expect(session("bruno")?.status).toBe("inadimplente");
    expect(closures()[0]).toMatchObject({ destino: "inadimplencia", valor: 12 });
  });

  it("comanda antiga com saldo pode ir para inadimplência, mas não para cortesia", async () => {
    const cortesia = await resolveClosureCandidate({
      sessionId: "davi",
      destino: "cortesia",
      motivo: "Esquecida faz tempo",
      realizadoPor: "equipe",
    });
    expect(cortesia).toEqual({
      ok: false,
      message: "Comanda de operação anterior: só arquivo ou inadimplência.",
    });
    const inad = await resolveClosureCandidate({
      sessionId: "davi",
      destino: "inadimplencia",
      motivo: "Esquecida faz tempo",
      realizadoPor: "equipe",
    });
    expect(inad).toEqual({ ok: true });
    expect(session("davi")?.status).toBe("inadimplente");
  });

  it("recusa cortesia em comanda sem saldo", async () => {
    const result = await resolveClosureCandidate({
      sessionId: "fabio",
      destino: "cortesia",
      motivo: "Não tem o que perdoar",
      realizadoPor: "equipe",
    });
    expect(result).toEqual({ ok: false, message: "Esta comanda não tem saldo devido." });
  });
});

describe("fechar conta (ação parcial)", () => {
  it("fecha a conta sem encerrar a comanda e conclui o pedido de conta", async () => {
    holder.db.seed("fastbar_bill_requests", [{ session_id: "ana", status: "pedida" }]);
    const result = await resolveClosureCandidate({
      ...base,
      sessionId: "ana",
      destino: "conta_pedida",
    });
    expect(result).toEqual({ ok: true });
    expect(session("ana")?.status).toBe("closed");
    expect(holder.db.table("fastbar_bill_requests")[0]?.status).toBe("concluida");
    expect(closures()[0]).toMatchObject({ destino: "conta_pedida", valor: 30, motivo: null });

    // Revisada nesta operação: sai da lista agora...
    const { candidates } = await listClosureCandidates();
    expect(candidates.map((c) => c.sessionId)).not.toContain("ana");
  });

  it("volta a aparecer no fechamento da operação seguinte, como comanda antiga", async () => {
    await resolveClosureCandidate({ ...base, sessionId: "ana", destino: "conta_pedida" });
    const ops = holder.db.table("fastbar_operations");
    ops.find((row) => row.id === OP)!.status = "FECHADA";
    ops.push({ id: "op-nova", status: "ABERTA", data_operacional: "2026-11-05" });

    const { candidates } = await listClosureCandidates();
    const ana = candidates.find((c) => c.sessionId === "ana");
    expect(ana).toMatchObject({ fromCurrentOperation: false, allowed: ["inadimplencia"] });
  });

  it("não vale para comanda cuja conta já foi pedida", async () => {
    const result = await resolveClosureCandidate({
      ...base,
      sessionId: "bruno",
      destino: "conta_pedida",
    });
    expect(result).toEqual({ ok: false, message: "A conta desta comanda já foi pedida." });
  });
});

describe("manter aberta e regras gerais", () => {
  it("manter aberta não mexe na comanda, mas tira ela da lista de pendentes", async () => {
    const result = await resolveClosureCandidate({
      ...base,
      sessionId: "ana",
      destino: "mantida_aberta",
    });
    expect(result).toEqual({ ok: true });
    expect(session("ana")?.status).toBe("open");
    expect(closures()[0]).toMatchObject({ destino: "mantida_aberta", motivo: null, valor: null });
  });

  it("recusa comanda que não precisa de destino", async () => {
    for (const sessionId of ["carla", "eva", "nao-existe"]) {
      const result = await resolveClosureCandidate({
        ...base,
        sessionId,
        destino: "mantida_aberta",
      });
      expect(result).toEqual({ ok: false, message: "Comanda inválida para o fechamento." });
    }
  });

  it("não deixa dar dois destinos à mesma comanda", async () => {
    await resolveClosureCandidate({ ...base, sessionId: "ana", destino: "mantida_aberta" });
    const second = await resolveClosureCandidate({
      sessionId: "ana",
      destino: "cortesia",
      motivo: "Mudei de ideia",
      realizadoPor: "equipe",
    });
    expect(second).toEqual({ ok: false, message: "Esta comanda já recebeu um destino." });
    expect(session("ana")?.status).toBe("open");
  });
});

describe("destino em massa", () => {
  it("aplica o mesmo destino a várias e diz quais falharam", async () => {
    const result = await resolveClosureCandidates({
      sessionIds: ["ana", "bruno", "fabio", "ana"],
      destino: "inadimplencia",
      motivo: "Fim de noite, cobrar na próxima",
      realizadoPor: "equipe",
    });
    expect(result.done).toBe(2);
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      { sessionId: "fabio", message: "Esta comanda não tem saldo devido." },
    ]);
    expect(session("ana")?.status).toBe("inadimplente");
    expect(session("bruno")?.status).toBe("inadimplente");
    expect(session("fabio")?.status).toBe("open");
    // "ana" repetida na seleção conta uma vez só.
    expect(closures()).toHaveLength(2);
  });

  it("tudo certo quando todas aceitam o destino", async () => {
    const result = await resolveClosureCandidates({
      sessionIds: ["fabio", "gabi", "helena"],
      destino: "arquivo",
      motivo: undefined,
      realizadoPor: "equipe",
    });
    expect(result).toEqual({ ok: true, done: 3, failures: [] });
  });
});

describe("encerrar a operação", () => {
  it("recusa enquanto houver comanda sem destino, inclusive as antigas", async () => {
    const result = await closeOperationWithReview();
    expect(result).toEqual({ ok: false, message: "Ainda há 6 comandas sem destino definido." });
    expect(holder.db.table("fastbar_operations").find((row) => row.id === OP)?.status).toBe(
      "ABERTA",
    );
  });

  it("encerra depois que todas receberam destino", async () => {
    await resolveClosureCandidates({
      ...base,
      sessionIds: ["ana", "bruno", "davi"],
      destino: "inadimplencia",
      motivo: "Saiu sem pagar",
    });
    await resolveClosureCandidates({
      ...base,
      sessionIds: ["fabio", "gabi", "helena"],
      destino: "arquivo",
    });
    const result = await closeOperationWithReview();
    expect(result).toEqual({ ok: true });
    expect(holder.db.table("fastbar_operations").find((row) => row.id === OP)?.status).toBe(
      "FECHADA",
    );
  });
});
