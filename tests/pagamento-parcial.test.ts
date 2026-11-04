import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({
  admin: () => holder.db,
  registerCustomerSpend: vi.fn(async () => undefined),
}));

const { recordSessionPayment, loadSessionBalance, round2 } =
  await import("../src/lib/session-payments.server");

const yes = async () => true;
const no = async () => false;

beforeEach(() => {
  holder.db = new FakeSupabase();
  holder.db.seed("fastbar_sessions", [
    { id: "ana", customer_name: "Ana", status: "closed", operacao_id: "op", closed_at: null },
    { id: "zero", customer_name: "Zero", status: "open", operacao_id: "op", closed_at: null },
    { id: "cancelada", customer_name: "Cac", status: "cancelled", operacao_id: "op" },
    { id: "paga", customer_name: "Paga", status: "paid", operacao_id: "op" },
  ]);
  // Ana deve R$ 30 (3 x 10).
  holder.db.seed("fastbar_tab_items", [
    { session_id: "ana", unit_price: 10, quantity: 3 },
    { session_id: "cancelada", unit_price: 10, quantity: 1 },
  ]);
});

const session = (id: string) => holder.db.table("fastbar_sessions").find((r) => r.id === id);
const ledger = () => holder.db.table("fastbar_session_payments");

describe("pagamento total", () => {
  it("sem valor informado quita o saldo, grava o livro e marca paga — sem pedir senha", async () => {
    const authorize = vi.fn(yes);
    const result = await recordSessionPayment({
      sessionId: "ana",
      method: "pix",
      realizadoPor: "equipe",
      authorize,
    });
    expect(result).toEqual({ ok: true, settled: true, balanceAfter: 0 });
    expect(authorize).not.toHaveBeenCalled();
    expect(ledger()).toHaveLength(1);
    expect(ledger()[0]).toMatchObject({
      session_id: "ana",
      amount: 30,
      saldo_apos: 0,
      motivo: null,
    });
    expect(session("ana")?.status).toBe("paid");
  });
});

describe("pagamento parcial", () => {
  it("exige motivo", async () => {
    const result = await recordSessionPayment({
      sessionId: "ana",
      method: "dinheiro",
      amount: 10,
      motivo: "ok",
      realizadoPor: "equipe",
      authorize: yes,
    });
    expect(result.ok).toBe(false);
    expect(ledger()).toHaveLength(0);
    expect(session("ana")?.status).toBe("closed");
  });

  it("exige senha correta", async () => {
    const result = await recordSessionPayment({
      sessionId: "ana",
      method: "dinheiro",
      amount: 10,
      motivo: "cliente sem dinheiro",
      realizadoPor: "equipe",
      authorize: no,
    });
    expect(result).toEqual({ ok: false, message: "Senha incorreta." });
    expect(ledger()).toHaveLength(0);
    expect(session("ana")?.status).toBe("closed");
  });

  it("registra o recebido e manda o resto para inadimplência, sem virar desconto", async () => {
    const result = await recordSessionPayment({
      sessionId: "ana",
      method: "dinheiro",
      amount: 10,
      motivo: "cliente sem dinheiro",
      realizadoPor: "equipe",
      authorize: yes,
    });
    expect(result).toEqual({ ok: true, settled: false, balanceAfter: 20 });
    expect(ledger()[0]).toMatchObject({
      amount: 10,
      saldo_apos: 20,
      motivo: "cliente sem dinheiro",
    });
    expect(session("ana")?.status).toBe("inadimplente");
    expect(session("ana")?.paid_at).toBeNull();
    // A dívida continua calculável: total 30 − recebido 10.
    expect((await loadSessionBalance("ana"))?.balance).toMatchObject({
      total: 30,
      paid: 10,
      balance: 20,
    });
  });

  it("depois do parcial, pagar o resto quita a comanda", async () => {
    await recordSessionPayment({
      sessionId: "ana",
      method: "dinheiro",
      amount: 10,
      motivo: "cliente sem dinheiro",
      realizadoPor: "equipe",
      authorize: yes,
    });
    const result = await recordSessionPayment({
      sessionId: "ana",
      method: "pix",
      realizadoPor: "equipe",
      authorize: no,
    });
    expect(result).toEqual({ ok: true, settled: true, balanceAfter: 0 });
    expect(ledger()).toHaveLength(2);
    expect(ledger()[1]).toMatchObject({ amount: 20, saldo_apos: 0 });
    expect(session("ana")?.status).toBe("paid");
  });

  it("reabrir a comanda não apaga a dívida", async () => {
    await recordSessionPayment({
      sessionId: "ana",
      method: "dinheiro",
      amount: 10,
      motivo: "cliente sem dinheiro",
      realizadoPor: "equipe",
      authorize: yes,
    });
    session("ana")!.status = "open"; // o que reopenSession faz
    expect((await loadSessionBalance("ana"))?.balance.balance).toBe(20);
  });
});

describe("recusas", () => {
  it("não aceita receber mais que o saldo, zero ou valor inválido", async () => {
    for (const amount of [31, 0, -5, Number.NaN]) {
      const result = await recordSessionPayment({
        sessionId: "ana",
        method: "pix",
        amount,
        motivo: "qualquer motivo",
        realizadoPor: "equipe",
        authorize: yes,
      });
      expect(result.ok).toBe(false);
    }
    expect(ledger()).toHaveLength(0);
  });

  it("cancelada e já paga não recebem pagamento", async () => {
    for (const id of ["cancelada", "paga"]) {
      const result = await recordSessionPayment({
        sessionId: id,
        method: "pix",
        realizadoPor: "equipe",
        authorize: yes,
      });
      expect(result.ok).toBe(false);
    }
    expect(ledger()).toHaveLength(0);
    expect(session("cancelada")?.status).toBe("cancelled");
  });

  it("comanda de valor zero ainda pode ser encerrada (sem linha no livro)", async () => {
    const result = await recordSessionPayment({
      sessionId: "zero",
      method: "dinheiro",
      realizadoPor: "equipe",
      authorize: no,
    });
    expect(result).toMatchObject({ ok: true, settled: true });
    expect(ledger()).toHaveLength(0);
    expect(session("zero")?.status).toBe("paid");
  });
});

describe("arredondamento", () => {
  it("round2 elimina resíduo de ponto flutuante", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
