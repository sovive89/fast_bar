import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({
  admin: () => holder.db,
  registerCustomerSpend: vi.fn(async () => undefined),
}));

const { addSessionCredit, recordSessionPayment, loadSessionBalance } =
  await import("../src/lib/session-payments.server");

const yes = async () => true;

beforeEach(() => {
  holder.db = new FakeSupabase();
  holder.db.seed("fastbar_sessions", [
    { id: "ana", customer_name: "Ana", status: "open", operacao_id: "op", closed_at: null },
    { id: "fechada", customer_name: "Fe", status: "closed", operacao_id: "op" },
  ]);
});

const session = (id: string) => holder.db.table("fastbar_sessions").find((r) => r.id === id);
const items = () => holder.db.table("fastbar_tab_items");
const credits = () => holder.db.table("fastbar_session_credits");
const ledger = () => holder.db.table("fastbar_session_payments");
const balance = async () => (await loadSessionBalance("ana"))!.balance;

async function topUp(amount: number) {
  return addSessionCredit({ sessionId: "ana", amount, method: "dinheiro", realizadoPor: "equipe" });
}

describe("adicionar crédito", () => {
  it("grava a entrada e o saldo de crédito aparece", async () => {
    expect(await topUp(100)).toEqual({ ok: true, creditLeft: 100 });
    expect(credits()).toHaveLength(1);
    expect(await balance()).toMatchObject({ creditTotal: 100, creditUsed: 0, creditLeft: 100 });
  });

  it("recusa valor inválido e comanda que não está aberta", async () => {
    for (const amount of [0, -10, Number.NaN]) expect((await topUp(amount)).ok).toBe(false);
    const closed = await addSessionCredit({
      sessionId: "fechada",
      amount: 50,
      method: "pix",
      realizadoPor: "equipe",
    });
    expect(closed.ok).toBe(false);
    expect(credits()).toHaveLength(0);
  });
});

describe("consumo item a item", () => {
  it("cada item lançado gasta crédito; remover devolve", async () => {
    await topUp(100);
    items().push({ session_id: "ana", unit_price: 10, quantity: 3 });
    expect(await balance()).toMatchObject({ creditUsed: 30, creditLeft: 70, balance: 0 });
    items().push({ session_id: "ana", unit_price: 25, quantity: 1 });
    expect(await balance()).toMatchObject({ creditUsed: 55, creditLeft: 45, balance: 0 });
    items().pop(); // remover o último lançamento
    expect(await balance()).toMatchObject({ creditUsed: 30, creditLeft: 70 });
  });

  it("consumo acima do crédito vira saldo a pagar", async () => {
    await topUp(100);
    items().push({ session_id: "ana", unit_price: 10, quantity: 13 });
    expect(await balance()).toMatchObject({ creditUsed: 100, creditLeft: 0, balance: 30 });
  });
});

describe("fechar a conta com crédito", () => {
  it("crédito cobre tudo: fecha sem dinheiro novo, canal 'credito', sobra fica na comanda", async () => {
    await topUp(100);
    items().push({ session_id: "ana", unit_price: 10, quantity: 3 });
    const result = await recordSessionPayment({
      sessionId: "ana",
      method: "pix",
      realizadoPor: "equipe",
      authorize: yes,
    });
    expect(result).toMatchObject({ ok: true, settled: true });
    expect(session("ana")?.status).toBe("paid");
    expect(session("ana")?.payment_method).toBe("credito");
    expect(ledger()).toHaveLength(0);
    expect(await balance()).toMatchObject({ creditLeft: 70 });
  });

  it("reabrir a comanda recupera o crédito que sobrou", async () => {
    await topUp(100);
    items().push({ session_id: "ana", unit_price: 10, quantity: 3 });
    await recordSessionPayment({
      sessionId: "ana",
      method: "pix",
      realizadoPor: "equipe",
      authorize: yes,
    });
    session("ana")!.status = "open"; // o que reopenSession faz
    expect(await balance()).toMatchObject({ creditLeft: 70 });
    items().push({ session_id: "ana", unit_price: 20, quantity: 1 });
    expect(await balance()).toMatchObject({ creditUsed: 50, creditLeft: 50, balance: 0 });
  });

  it("crédito não cobre tudo: só o resto é cobrado, e o canal é o escolhido", async () => {
    await topUp(100);
    items().push({ session_id: "ana", unit_price: 10, quantity: 13 });
    const result = await recordSessionPayment({
      sessionId: "ana",
      method: "pix",
      realizadoPor: "equipe",
      authorize: yes,
    });
    expect(result).toMatchObject({ ok: true, settled: true });
    expect(ledger()[0]).toMatchObject({ amount: 30, saldo_apos: 0 });
    expect(session("ana")?.payment_method).toBe("pix");
  });

  it("pagamento parcial depois do crédito deixa só o resto como dívida", async () => {
    await topUp(100);
    items().push({ session_id: "ana", unit_price: 10, quantity: 13 });
    const result = await recordSessionPayment({
      sessionId: "ana",
      method: "dinheiro",
      amount: 10,
      motivo: "cliente sem troco",
      realizadoPor: "equipe",
      authorize: yes,
    });
    expect(result).toEqual({ ok: true, settled: false, balanceAfter: 20 });
    expect(session("ana")?.status).toBe("inadimplente");
  });

  it("não aceita receber mais do que falta depois de descontar o crédito", async () => {
    await topUp(100);
    items().push({ session_id: "ana", unit_price: 10, quantity: 13 });
    const result = await recordSessionPayment({
      sessionId: "ana",
      method: "pix",
      amount: 31,
      realizadoPor: "equipe",
      authorize: yes,
    });
    expect(result.ok).toBe(false);
  });
});
