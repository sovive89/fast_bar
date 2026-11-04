import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({ admin: () => holder.db }));

const {
  requestBill,
  getActiveBillRequest,
  listActiveBillRequests,
  advanceBillRequest,
  completeBillRequestsForSession,
} = await import("../src/lib/bill-requests.server");

beforeEach(() => {
  holder.db = new FakeSupabase();
  holder.db.seed("fastbar_sessions", [
    { id: "ana", customer_name: "Ana", status: "open" },
    { id: "bruno", customer_name: "Bruno", status: "open" },
    { id: "fechada", customer_name: "Fe", status: "closed" },
    { id: "paga", customer_name: "Paga", status: "paid" },
    { id: "pendente", customer_name: "Pe", status: "pending" },
  ]);
});

const requests = () => holder.db.table("fastbar_bill_requests");

describe("cliente pede a conta", () => {
  it("cria um pedido 'pedida' e NÃO mexe na comanda", async () => {
    const result = await requestBill("ana");
    expect(result).toEqual({ ok: true, status: "pedida", alreadyRequested: false });
    expect(requests()).toHaveLength(1);
    expect(requests()[0]).toMatchObject({ session_id: "ana", status: "pedida" });
    const ana = holder.db.table("fastbar_sessions").find((s) => s.id === "ana");
    expect(ana?.status).toBe("open");
  });

  it("pedir de novo não gera outro alerta", async () => {
    await requestBill("ana");
    const again = await requestBill("ana");
    expect(again).toEqual({ ok: true, status: "pedida", alreadyRequested: true });
    expect(requests()).toHaveLength(1);
  });

  it("se a equipe já assumiu, devolve o estado atual", async () => {
    await requestBill("ana");
    requests()[0]!.status = "em_atendimento";
    expect(await requestBill("ana")).toMatchObject({ ok: true, status: "em_atendimento" });
    expect(requests()).toHaveLength(1);
  });

  it("recusa comanda inexistente, fechada, paga ou ainda não confirmada", async () => {
    for (const id of ["nao-existe", "fechada", "paga", "pendente"]) {
      const result = await requestBill(id);
      expect(result.ok).toBe(false);
    }
    expect(requests()).toHaveLength(0);
  });

  it("um pedido concluído não bloqueia pedir de novo depois", async () => {
    await requestBill("ana");
    await completeBillRequestsForSession("ana", "equipe");
    const second = await requestBill("ana");
    expect(second).toEqual({ ok: true, status: "pedida", alreadyRequested: false });
    expect(requests()).toHaveLength(2);
  });
});

describe("equipe vê e atende", () => {
  it("lista só os ativos, mais antigos primeiro, com o nome do cliente", async () => {
    await requestBill("ana");
    await requestBill("bruno");
    requests()[0]!.created_at = "2026-11-04T10:00:00Z";
    requests()[1]!.created_at = "2026-11-04T09:00:00Z";
    await completeBillRequestsForSession("ana", "equipe");
    const list = await listActiveBillRequests();
    expect(list.map((r) => [r.customerName, r.status])).toEqual([["Bruno", "pedida"]]);
  });

  it("atender muda para em_atendimento e registra quem e quando", async () => {
    await requestBill("ana");
    const id = requests()[0]!.id as string;
    expect(
      await advanceBillRequest({ requestId: id, action: "atender", realizadoPor: "equipe" }),
    ).toEqual({
      ok: true,
    });
    expect(requests()[0]).toMatchObject({ status: "em_atendimento", attended_by: "equipe" });
    expect(requests()[0]?.attended_at).toBeTruthy();
  });

  it("dois caixas atendendo o mesmo pedido: só o primeiro vale", async () => {
    await requestBill("ana");
    const id = requests()[0]!.id as string;
    const first = await advanceBillRequest({
      requestId: id,
      action: "atender",
      realizadoPor: "equipe",
    });
    const second = await advanceBillRequest({
      requestId: id,
      action: "atender",
      realizadoPor: "equipe",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("concluir funciona direto de 'pedida' e de 'em_atendimento', e some da lista", async () => {
    await requestBill("ana");
    await requestBill("bruno");
    const [a, b] = [requests()[0]!.id as string, requests()[1]!.id as string];
    await advanceBillRequest({ requestId: b, action: "atender", realizadoPor: "equipe" });
    expect(
      (await advanceBillRequest({ requestId: a, action: "concluir", realizadoPor: "equipe" })).ok,
    ).toBe(true);
    expect(
      (await advanceBillRequest({ requestId: b, action: "concluir", realizadoPor: "equipe" })).ok,
    ).toBe(true);
    expect(await listActiveBillRequests()).toEqual([]);
    expect(requests().every((r) => r.status === "concluida" && r.completed_by === "equipe")).toBe(
      true,
    );
  });

  it("concluir um pedido já concluído é recusado", async () => {
    await requestBill("ana");
    const id = requests()[0]!.id as string;
    await advanceBillRequest({ requestId: id, action: "concluir", realizadoPor: "equipe" });
    expect(
      (await advanceBillRequest({ requestId: id, action: "concluir", realizadoPor: "equipe" })).ok,
    ).toBe(false);
  });

  it("fechar a comanda conclui o pedido ativo dela, sem tocar nos de outras", async () => {
    await requestBill("ana");
    await requestBill("bruno");
    await completeBillRequestsForSession("ana", "equipe");
    expect(await getActiveBillRequest("ana")).toBeNull();
    expect(await getActiveBillRequest("bruno")).toMatchObject({ status: "pedida" });
  });
});
