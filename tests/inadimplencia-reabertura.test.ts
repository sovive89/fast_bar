import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({ admin: () => holder.db }));

const { reopenDebtSession } = await import("../src/lib/debt-reopen.server");

const OP = "op-hoje";

beforeEach(() => {
  holder.db = new FakeSupabase();
  holder.db.seed("fastbar_operations", [
    { id: "op-antiga", status: "FECHADA", data_operacional: "2026-10-30" },
    { id: OP, status: "ABERTA", data_operacional: "2026-11-04" },
  ]);
  holder.db.seed("fastbar_sessions", [
    {
      id: "divida-velha",
      customer_name: "Ana",
      phone: "61999990000",
      status: "inadimplente",
      operacao_id: "op-antiga",
      closed_at: "2026-10-30T23:00:00Z",
      created_at: "2026-10-01",
    },
    {
      id: "divida-nova",
      customer_name: "Ana",
      phone: "61999990000",
      status: "inadimplente",
      operacao_id: "op-antiga",
      closed_at: "2026-10-30T23:00:00Z",
      created_at: "2026-10-30",
    },
    {
      id: "doc",
      customer_name: "Bruno",
      phone: null,
      document: "12345678909",
      status: "inadimplente",
      operacao_id: "op-antiga",
    },
    { id: "paga", customer_name: "Carla", phone: "61988880000", status: "paid" },
  ]);
  // Ana consumiu R$ 50 na comanda que reabre e pagou R$ 20: deve R$ 30.
  holder.db.seed("fastbar_tab_items", [{ session_id: "divida-nova", unit_price: 25, quantity: 2 }]);
  holder.db.seed("fastbar_session_payments", [
    { session_id: "divida-nova", amount: 20, method: "pix", saldo_apos: 30, created_at: "1" },
  ]);
});

function session(id: string) {
  return holder.db.table("fastbar_sessions").find((row) => row.id === id);
}

describe("reabrir comanda inadimplente quando o cliente volta", () => {
  it("reabre a mais recente, na operação de hoje, sem apagar itens nem pagamentos", async () => {
    // O fake ignora order(); a mais recente vem primeiro quando a lista já está ordenada.
    holder.db.table("fastbar_sessions").reverse();
    const result = await reopenDebtSession({
      phone: "61999990000",
      document: null,
      toStatus: "pending",
      realizadoPor: "cliente",
    });
    expect(result).toEqual({ sessionId: "divida-nova", saldo: 30 });
    expect(session("divida-nova")).toMatchObject({
      status: "pending",
      operacao_id: OP,
      closed_at: null,
      paid_at: null,
    });
    // A outra dívida do mesmo cliente continua na aba Inadimplentes.
    expect(session("divida-velha")?.status).toBe("inadimplente");
    expect(holder.db.table("fastbar_tab_items")).toHaveLength(1);
    expect(holder.db.table("fastbar_session_payments")).toHaveLength(1);
  });

  it("registra a reabertura para auditoria", async () => {
    holder.db.table("fastbar_sessions").reverse();
    await reopenDebtSession({
      phone: "61999990000",
      document: null,
      toStatus: "unverified",
      realizadoPor: "cliente",
    });
    expect(holder.db.table("fastbar_session_reopenings")).toEqual([
      expect.objectContaining({
        session_id: "divida-nova",
        operacao_id: OP,
        status_anterior: "inadimplente",
        saldo: 30,
        realizado_por: "cliente",
      }),
    ]);
  });

  it("pela equipe, acha pelo documento e já abre a comanda", async () => {
    const result = await reopenDebtSession({
      phone: null,
      document: "12345678909",
      toStatus: "open",
      realizadoPor: "equipe",
    });
    expect(result?.sessionId).toBe("doc");
    expect(session("doc")?.status).toBe("open");
    expect(session("doc")?.started_at).toBeTruthy();
  });

  it("não faz nada para quem não deve", async () => {
    const result = await reopenDebtSession({
      phone: "61988880000",
      document: null,
      toStatus: "pending",
      realizadoPor: "cliente",
    });
    expect(result).toBeNull();
    expect(session("paga")?.status).toBe("paid");
    expect(holder.db.table("fastbar_session_reopenings")).toHaveLength(0);
  });

  it("não reabre sem operação aberta", async () => {
    holder.db.table("fastbar_operations").find((row) => row.id === OP)!.status = "FECHADA";
    const result = await reopenDebtSession({
      phone: "61999990000",
      document: null,
      toStatus: "pending",
      realizadoPor: "cliente",
    });
    expect(result).toBeNull();
    expect(session("divida-nova")?.status).toBe("inadimplente");
  });
});
