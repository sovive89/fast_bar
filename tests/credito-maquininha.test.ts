import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
const state: { order: { status: string; external_reference: string } } = {
  order: { status: "processed", external_reference: "ana" },
};

vi.mock("../src/lib/fastbar.server", () => ({
  admin: () => holder.db,
  registerCustomerSpend: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/mercadopago/client.server", () => ({
  cancelPointOrder: vi.fn(async () => undefined),
  createPointOrder: vi.fn(async () => ({ ok: true, order: { id: "ord-1" } })),
  getPointOrder: vi.fn(async () => state.order),
  listPointTerminals: vi.fn(async () => []),
  refundPointOrder: vi.fn(async () => ({ ok: true })),
}));

const { startPointCharge, reconcilePointOrder, cancelPointCharge } =
  await import("../src/lib/mercadopago/service.server");

beforeEach(() => {
  holder.db = new FakeSupabase();
  state.order = { status: "processed", external_reference: "ana" };
  holder.db.seed("fastbar_integrations", [
    {
      key: "mercado_pago",
      enabled: true,
      config: { accessToken: "tok", deviceId: "term" },
    },
  ]);
  holder.db.seed("fastbar_sessions", [
    { id: "ana", customer_name: "Ana", status: "open", operacao_id: "op" },
  ]);
});

const session = () => holder.db.table("fastbar_sessions").find((r) => r.id === "ana")!;
const credits = () => holder.db.table("fastbar_session_credits");
const payments = () => holder.db.table("fastbar_session_payments");

describe("crédito pela maquininha", () => {
  it("a cobrança guarda o propósito 'credito'", async () => {
    const result = await startPointCharge("ana", 100, "credito");
    expect(result.ok).toBe(true);
    expect(session()).toMatchObject({
      pos_order_id: "ord-1",
      pos_amount: 100,
      pos_purpose: "credito",
    });
  });

  it("pagamento aprovado vira entrada de crédito e NÃO fecha a comanda", async () => {
    await startPointCharge("ana", 100, "credito");
    await reconcilePointOrder("ord-1");
    expect(credits()).toHaveLength(1);
    expect(credits()[0]).toMatchObject({
      session_id: "ana",
      amount: 100,
      method: "maquininha",
      pos_order_id: "ord-1",
    });
    expect(session().status).toBe("open");
    expect(session().pos_order_id).toBeNull();
    expect(session().pos_purpose).toBeNull();
    expect(payments()).toHaveLength(0);
  });

  it("webhook repetido não credita duas vezes", async () => {
    await startPointCharge("ana", 100, "credito");
    await reconcilePointOrder("ord-1");
    // Simula o segundo aviso chegando antes de a comanda ser limpa: recoloca a cobrança pendente.
    Object.assign(session(), { pos_order_id: "ord-1", pos_amount: 100, pos_purpose: "credito" });
    await reconcilePointOrder("ord-1");
    expect(credits()).toHaveLength(1);
  });

  it("cobrança ainda em andamento não credita nada", async () => {
    await startPointCharge("ana", 100, "credito");
    state.order.status = "at_terminal";
    await reconcilePointOrder("ord-1");
    expect(credits()).toHaveLength(0);
    expect(session().pos_order_id).toBe("ord-1");
  });

  it("recusada no terminal libera a comanda sem creditar", async () => {
    await startPointCharge("ana", 100, "credito");
    state.order.status = "failed";
    await reconcilePointOrder("ord-1");
    expect(credits()).toHaveLength(0);
    expect(session().pos_order_id).toBeNull();
    expect(session().pos_purpose).toBeNull();
  });

  it("cancelar a cobrança limpa o propósito", async () => {
    await startPointCharge("ana", 100, "credito");
    await cancelPointCharge("ana");
    expect(session().pos_order_id).toBeNull();
    expect(session().pos_purpose).toBeNull();
  });

  it("pagamento normal pela maquininha continua quitando a comanda", async () => {
    await startPointCharge("ana", 30);
    await reconcilePointOrder("ord-1");
    expect(session().status).toBe("paid");
    expect(credits()).toHaveLength(0);
    expect(payments()).toHaveLength(1);
  });
});
