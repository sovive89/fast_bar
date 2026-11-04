import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({ admin: () => holder.db }));

const { listClosureCandidates, resolveClosureCandidate, closeOperationWithReview } =
  await import("../src/lib/operation-closure.server");

const OP = "op-atual";

/**
 * Uma operação aberta com: uma comanda aberta (R$ 30), uma fechada aguardando pagamento (R$ 12),
 * uma já paga, uma de outra operação e uma pendente de confirmação — só as duas primeiras precisam
 * de destino.
 */
function seed(db: FakeSupabase) {
  db.seed("fastbar_operations", [
    { id: "op-antiga", status: "FECHADA", data_operacional: "2026-11-03" },
    { id: OP, status: "ABERTA", data_operacional: "2026-11-04" },
  ]);
  db.seed("fastbar_sessions", [
    { id: "ana", customer_name: "Ana", status: "open", operacao_id: OP },
    { id: "bruno", customer_name: "Bruno", status: "closed", operacao_id: OP },
    { id: "carla", customer_name: "Carla", status: "paid", operacao_id: OP },
    { id: "davi", customer_name: "Davi", status: "open", operacao_id: "op-antiga" },
    { id: "eva", customer_name: "Eva", status: "pending", operacao_id: OP },
  ]);
  db.seed("fastbar_tab_items", [
    { session_id: "ana", unit_price: 10, quantity: 3 },
    { session_id: "bruno", unit_price: 6, quantity: 2 },
    { session_id: "carla", unit_price: 50, quantity: 1 },
  ]);
}

beforeEach(() => {
  holder.db = new FakeSupabase();
  seed(holder.db);
});

function session(id: string) {
  return holder.db.table("fastbar_sessions").find((row) => row.id === id);
}

describe("comandas que precisam de destino", () => {
  it("lista só abertas/fechadas da operação atual, com o saldo de cada uma", async () => {
    const { operationId, candidates } = await listClosureCandidates();
    expect(operationId).toBe(OP);
    expect(candidates).toEqual([
      { sessionId: "ana", customerName: "Ana", status: "open", total: 30 },
      { sessionId: "bruno", customerName: "Bruno", status: "closed", total: 12 },
    ]);
  });
});

describe("dar destino a uma comanda", () => {
  it("exige motivo para cortesia e inadimplência", async () => {
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
    expect(holder.db.table("fastbar_operation_closures")).toHaveLength(0);
  });

  it("cortesia fecha a comanda sem cobrança e registra o valor perdoado", async () => {
    const result = await resolveClosureCandidate({
      sessionId: "ana",
      destino: "cortesia",
      motivo: "Aniversário do dono",
      realizadoPor: "equipe",
    });
    expect(result).toEqual({ ok: true });
    expect(session("ana")?.status).toBe("cortesia");
    expect(holder.db.table("fastbar_operation_closures")).toEqual([
      expect.objectContaining({
        operacao_id: OP,
        session_id: "ana",
        destino: "cortesia",
        motivo: "Aniversário do dono",
        valor: 30,
      }),
    ]);
  });

  it("inadimplência fecha a comanda e guarda o saldo pendente", async () => {
    await resolveClosureCandidate({
      sessionId: "bruno",
      destino: "inadimplencia",
      motivo: "Saiu sem pagar, volta amanhã",
      realizadoPor: "equipe",
    });
    expect(session("bruno")?.status).toBe("inadimplente");
    const [closure] = holder.db.table("fastbar_operation_closures");
    expect(closure).toMatchObject({ destino: "inadimplencia", valor: 12 });
  });

  it("manter aberta não mexe na comanda, mas tira ela da lista de pendentes", async () => {
    const result = await resolveClosureCandidate({
      sessionId: "ana",
      destino: "mantida_aberta",
      motivo: undefined,
      realizadoPor: "equipe",
    });
    expect(result).toEqual({ ok: true });
    expect(session("ana")?.status).toBe("open");
    const [closure] = holder.db.table("fastbar_operation_closures");
    expect(closure).toMatchObject({ destino: "mantida_aberta", motivo: null, valor: null });

    const { candidates } = await listClosureCandidates();
    expect(candidates.map((candidate) => candidate.sessionId)).toEqual(["bruno"]);
  });

  it("recusa comanda de outra operação ou que não precisa de destino", async () => {
    for (const sessionId of ["davi", "carla", "eva", "nao-existe"]) {
      const result = await resolveClosureCandidate({
        sessionId,
        destino: "mantida_aberta",
        motivo: undefined,
        realizadoPor: "equipe",
      });
      expect(result).toEqual({ ok: false, message: "Comanda inválida para esta operação." });
    }
  });

  it("não deixa dar dois destinos à mesma comanda", async () => {
    await resolveClosureCandidate({
      sessionId: "ana",
      destino: "mantida_aberta",
      motivo: undefined,
      realizadoPor: "equipe",
    });
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

describe("encerrar a operação", () => {
  it("recusa enquanto houver comanda sem destino", async () => {
    const result = await closeOperationWithReview();
    expect(result).toEqual({ ok: false, message: "Ainda há 2 comandas sem destino definido." });
    const operation = holder.db.table("fastbar_operations").find((row) => row.id === OP);
    expect(operation?.status).toBe("ABERTA");
  });

  it("encerra depois que todas receberam destino", async () => {
    await resolveClosureCandidate({
      sessionId: "ana",
      destino: "mantida_aberta",
      motivo: undefined,
      realizadoPor: "equipe",
    });
    await resolveClosureCandidate({
      sessionId: "bruno",
      destino: "inadimplencia",
      motivo: "Saiu sem pagar",
      realizadoPor: "equipe",
    });
    const result = await closeOperationWithReview();
    expect(result).toEqual({ ok: true });
    const operation = holder.db.table("fastbar_operations").find((row) => row.id === OP);
    expect(operation?.status).toBe("FECHADA");
  });
});
