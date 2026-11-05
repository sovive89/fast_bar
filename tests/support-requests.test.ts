import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";
const TENANT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const SESSION = "00000000-0000-4000-8000-000000000003";
const REQUEST = "00000000-0000-4000-8000-000000000004";
const holder = { db: new FakeSupabase() };
const gate = vi.fn(async () => {});
const notify = vi.fn(async () => ({ sent: 1, removed: 0, failed: 0 }));
vi.mock("../src/lib/fastbar.server", () => ({
  admin: () => holder.db,
  getDefaultTenantId: async () => TENANT,
  assertRegisterAccess: () => gate(),
}));
vi.mock("../src/lib/push.server", () => ({ notifyStaff: (p: unknown) => notify(p) }));
const {
  requestSupport,
  getSupportStatus,
  listSupportRequests,
  advanceSupportRequest,
  getCustomerSupportMessages,
  getStaffSupportMessages,
  sendSupportChat,
  presumeSupportResolved,
  listSupportOccurrences,
  getSupportOccurrence,
} = await import("../src/lib/support-requests.server");
const row = () => ({
  id: REQUEST,
  tenant_id: TENANT,
  session_id: SESSION,
  status: "requested",
  escalated: false,
  created_at: "2026-11-04T18:00:00Z",
  attended_by: null,
  completion_note: "PRIVATE NOTE",
});
beforeEach(() => {
  holder.db = new FakeSupabase();
  gate.mockReset();
  gate.mockResolvedValue();
  notify.mockReset();
  notify.mockResolvedValue({ sent: 1, removed: 0, failed: 0 });
  holder.db.seed("fastbar_sessions", [
    { id: SESSION, tenant_id: TENANT, status: "open", customer_name: "Nome privado" },
  ]);
});

describe("apoio: registro confirmado e push discreto", () => {
  it("não permite envio sem adesão ou com link inválido", async () => {
    expect((await requestSupport(SESSION, false)).ok).toBe(false);
    expect((await requestSupport("bad", true)).ok).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
  it("confirma somente após persistência e limita resposta pública", async () => {
    holder.db.rpcHandlers.set("fastbar_request_support", (args) => {
      expect(args).toEqual({ p_tenant_id: TENANT, p_session_id: SESSION, p_opted_in: true });
      return {
        ok: true,
        id: REQUEST,
        status: "requested",
        escalated: false,
        alreadyRequested: false,
        completion_note: "PRIVATE",
      };
    });
    expect(await requestSupport(SESSION, true)).toEqual({
      ok: true,
      request: { id: REQUEST, status: "requested", escalated: false },
      alreadyRequested: false,
    });
    expect(notify).toHaveBeenCalledWith({
      kind: "apoio",
      title: "Atenção da equipe",
      body: "Há um atendimento prioritário no painel.",
      url: "/caixa",
      tag: `apoio-${REQUEST}`,
    });
    expect(JSON.stringify(notify.mock.calls)).not.toContain("Nome privado");
  });
  it("erro no banco não produz sucesso nem push", async () => {
    expect((await requestSupport(SESSION, true)).ok).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
  it("pedido ativo não dispara push duplicado", async () => {
    holder.db.rpcHandlers.set("fastbar_request_support", () => ({
      ok: true,
      id: REQUEST,
      status: "attending",
      escalated: true,
      alreadyRequested: true,
    }));
    expect(await requestSupport(SESSION, true)).toMatchObject({ ok: true, alreadyRequested: true });
    expect(notify).not.toHaveBeenCalled();
  });
  it("falha de push não perde o pedido persistido", async () => {
    holder.db.rpcHandlers.set("fastbar_request_support", () => ({
      ok: true,
      id: REQUEST,
      status: "requested",
      alreadyRequested: false,
    }));
    notify.mockRejectedValueOnce(new Error("offline"));
    expect((await requestSupport(SESSION, true)).ok).toBe(true);
  });
});
describe("apoio: isolamento público e gate da equipe", () => {
  it("status público não entrega nome, narrativa ou autoria", async () => {
    holder.db.seed("fastbar_support_requests", [row()]);
    expect(await getSupportStatus(SESSION)).toEqual({
      id: REQUEST,
      status: "requested",
      escalated: false,
    });
  });
  it("não retorna status de sessão não confirmada ou de outro tenant", async () => {
    holder.db.seed("fastbar_support_requests", [row()]);
    holder.db.table("fastbar_sessions")[0]!.status = "pending";
    expect(await getSupportStatus(SESSION)).toBeNull();
    holder.db.table("fastbar_sessions")[0]!.status = "open";
    holder.db.table("fastbar_sessions")[0]!.tenant_id = OTHER;
    expect(await getSupportStatus(SESSION)).toBeNull();
  });
  it("listas, mensagens e atualizações da equipe exigem gate", async () => {
    gate.mockRejectedValue(new Error("Acesso negado"));
    await expect(listSupportRequests()).rejects.toThrow("Acesso negado");
    await expect(getStaffSupportMessages(REQUEST)).rejects.toThrow("Acesso negado");
    await expect(
      advanceSupportRequest({ requestId: REQUEST, action: "attend", staffName: "Ana" }),
    ).rejects.toThrow("Acesso negado");
    await expect(
      sendSupportChat({ requestId: REQUEST, body: "Oi", staffName: "Ana" }, "staff"),
    ).rejects.toThrow("Acesso negado");
  });
  it("lista somente ativos do tenant e purga concluídos com mais de90dias", async () => {
    holder.db.seed("fastbar_support_requests", [
      row(),
      { ...row(), id: "other", tenant_id: OTHER },
      { ...row(), id: "old", status: "completed", completed_at: "2020-01-01T00:00:00Z" },
    ]);
    expect(await listSupportRequests()).toEqual([
      {
        id: REQUEST,
        status: "requested",
        escalated: false,
        sessionId: SESSION,
        customerName: "Nome privado",
        createdAt: "2026-11-04T18:00:00Z",
        attendedBy: null,
      },
    ]);
    expect(holder.db.table("fastbar_support_requests").some((r) => r.id === "old")).toBe(false);
  });
  it("gate não autoriza alteração em outro tenant", async () => {
    holder.db.seed("fastbar_support_requests", [{ ...row(), tenant_id: OTHER }]);
    expect(
      (await advanceSupportRequest({ requestId: REQUEST, action: "attend", staffName: "Ana" })).ok,
    ).toBe(false);
  });
  it("conclusão exige atendimento iniciado, responsável e narrativa", async () => {
    holder.db.seed("fastbar_support_requests", [row()]);
    expect(
      (
        await advanceSupportRequest({
          requestId: REQUEST,
          action: "complete",
          staffName: "Ana",
          note: "Apoio prestado",
        })
      ).ok,
    ).toBe(false);
    expect(
      (await advanceSupportRequest({ requestId: REQUEST, action: "attend", staffName: "A" })).ok,
    ).toBe(false);
    expect(
      (await advanceSupportRequest({ requestId: REQUEST, action: "attend", staffName: "Ana" })).ok,
    ).toBe(true);
    expect(
      (
        await advanceSupportRequest({
          requestId: REQUEST,
          action: "complete",
          staffName: "Ana",
          note: "curto",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await advanceSupportRequest({
          requestId: REQUEST,
          action: "complete",
          staffName: "Ana",
          note: "Apoio prestado",
        })
      ).ok,
    ).toBe(true);
    expect(holder.db.table("fastbar_support_requests")[0]).toMatchObject({
      attended_by: "Ana",
      completed_by: "Ana",
      completion_note: "Apoio prestado",
      status: "completed",
    });
  });
  it("não sobrepõe atendimento assumido por outro caixa", async () => {
    holder.db.seed("fastbar_support_requests", [row()]);
    expect(
      (await advanceSupportRequest({ requestId: REQUEST, action: "attend", staffName: "Ana" })).ok,
    ).toBe(true);
    expect(
      (await advanceSupportRequest({ requestId: REQUEST, action: "attend", staffName: "Bia" })).ok,
    ).toBe(false);
    expect(holder.db.table("fastbar_support_requests")[0]?.attended_by).toBe("Ana");
  });
});
describe("chat privado entre cliente e equipe", () => {
  it("preserva status e chat após pagamento de atendimento já criado", async () => {
    holder.db.seed("fastbar_support_requests", [row()]);
    holder.db.table("fastbar_sessions")[0]!.status = "paid";
    holder.db.seed("fastbar_support_messages", [
      {
        id: "m",
        tenant_id: TENANT,
        request_id: REQUEST,
        sender: "staff",
        body: "Estamos aqui",
        created_at: "2026-11-04T18:00:00Z",
      },
    ]);
    expect(await getSupportStatus(SESSION)).toEqual({
      id: REQUEST,
      status: "requested",
      escalated: false,
    });
    expect(await getCustomerSupportMessages(SESSION, REQUEST)).toHaveLength(1);
  });

  it("cliente não lê mensagens de outra comanda/tenant", async () => {
    holder.db.seed("fastbar_support_requests", [{ ...row(), session_id: OTHER }]);
    holder.db.seed("fastbar_support_messages", [
      {
        id: "m",
        tenant_id: TENANT,
        request_id: REQUEST,
        sender: "staff",
        body: "privado",
        created_at: "2026-11-04T18:00:00Z",
      },
    ]);
    expect(await getCustomerSupportMessages(SESSION, REQUEST)).toEqual([]);
  });
  it("só retorna campos públicos do chat e do tenant correto", async () => {
    holder.db.seed("fastbar_support_requests", [row()]);
    holder.db.seed("fastbar_support_messages", [
      {
        id: "m",
        tenant_id: TENANT,
        request_id: REQUEST,
        sender: "staff",
        staff_name: "Nome interno",
        body: "Como posso ajudar?",
        created_at: "2026-11-04T18:00:00Z",
      },
      {
        id: "x",
        tenant_id: OTHER,
        request_id: REQUEST,
        sender: "customer",
        body: "fora",
        created_at: "2026-11-04T18:00:00Z",
      },
    ]);
    expect(await getCustomerSupportMessages(SESSION, REQUEST)).toEqual([
      { id: "m", sender: "staff", body: "Como posso ajudar?", createdAt: "2026-11-04T18:00:00Z" },
    ]);
  });
  it("mensagem cliente obriga sessionId válido e não aceita autoria da equipe", async () => {
    expect((await sendSupportChat({ requestId: REQUEST, body: "oi" }, "customer")).ok).toBe(false);
    holder.db.rpcHandlers.set("fastbar_send_support_message", (args) => {
      expect(args).toEqual({
        p_tenant_id: TENANT,
        p_request_id: REQUEST,
        p_session_id: SESSION,
        p_sender: "customer",
        p_body: "Preciso que alguém venha até mim.",
        p_staff_name: null,
      });
      return { ok: true };
    });
    expect(
      await sendSupportChat(
        {
          requestId: REQUEST,
          sessionId: SESSION,
          body: " Preciso que alguém venha até mim. ",
          staffName: "tentativa",
        },
        "customer",
      ),
    ).toEqual({ ok: true });
  });
  it("recusa texto livre: só mensagens prontas passam, para cliente e equipe", async () => {
    const rpc = vi.fn(() => ({ ok: true }));
    holder.db.rpcHandlers.set("fastbar_send_support_message", rpc);
    expect(
      (
        await sendSupportChat(
          { requestId: REQUEST, sessionId: SESSION, body: "texto livre" },
          "customer",
        )
      ).ok,
    ).toBe(false);
    // frase pronta da equipe não vale como mensagem do cliente
    expect(
      (
        await sendSupportChat(
          { requestId: REQUEST, sessionId: SESSION, body: "Estamos indo até você." },
          "customer",
        )
      ).ok,
    ).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("recusa vazio, texto longo e staff sem responsável", async () => {
    expect(
      (await sendSupportChat({ requestId: REQUEST, sessionId: SESSION, body: " " }, "customer")).ok,
    ).toBe(false);
    expect(
      (
        await sendSupportChat(
          { requestId: REQUEST, sessionId: SESSION, body: "x".repeat(1001) },
          "customer",
        )
      ).ok,
    ).toBe(false);
    expect((await sendSupportChat({ requestId: REQUEST, body: "oi" }, "staff")).ok).toBe(false);
  });
  it("falha do RPC e rate limit não mostram sucesso", async () => {
    expect(
      (
        await sendSupportChat(
          { requestId: REQUEST, sessionId: SESSION, body: "Preciso que alguém venha até mim." },
          "customer",
        )
      ).ok,
    ).toBe(false);
    holder.db.rpcHandlers.set("fastbar_send_support_message", () => ({
      ok: false,
      message: "Aguarde um segundo antes de enviar outra mensagem.",
    }));
    expect(
      await sendSupportChat(
        { requestId: REQUEST, sessionId: SESSION, body: "Preciso que alguém venha até mim." },
        "customer",
      ),
    ).toEqual({ ok: false, message: "Aguarde um segundo antes de enviar outra mensagem." });
  });
});

describe("histórico privado e manutenção", () => {
  it("falha na limpeza não oculta a fila prioritária", async () => {
    holder.db.seed("fastbar_support_requests", [row()]);
    holder.db.failNext.set("fastbar_support_requests:delete", "maintenance unavailable");
    expect(await listSupportRequests()).toHaveLength(1);
  });
  it("histórico e detalhe exigem gate", async () => {
    gate.mockRejectedValue(new Error("Acesso negado"));
    await expect(listSupportOccurrences()).rejects.toThrow("Acesso negado");
    await expect(getSupportOccurrence(REQUEST)).rejects.toThrow("Acesso negado");
  });
  it("histórico inclui concluídos e narrativa somente no tenant autorizado", async () => {
    holder.db.seed("fastbar_support_requests", [
      {
        ...row(),
        status: "completed",
        completed_at: "2026-11-04T18:01:00Z",
        completed_by: "Ana",
        attended_by: "Ana",
        attended_at: "2026-11-04T18:00:00Z",
      },
      { ...row(), id: OTHER, tenant_id: OTHER, completion_note: "OUTRO TENANT" },
    ]);
    const history = await listSupportOccurrences();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: REQUEST,
      status: "completed",
      completionNote: "PRIVATE NOTE",
      completedBy: "Ana",
    });
    const detail = await getSupportOccurrence(REQUEST);
    expect(detail?.request).toEqual(history[0]);
    expect(await getSupportOccurrence(OTHER)).toBeNull();
  });
});

describe("apoio: roteiro guiado, lugares e presunção de resolvido", () => {
  const seedRequest = (createdAt: string, status = "requested") =>
    holder.db.seed("fastbar_support_requests", [
      { ...row(), status, created_at: createdAt, completion_note: null },
    ]);
  const seedMessage = (body: string, createdAt: string) =>
    holder.db.seed("fastbar_support_messages", [
      {
        id: `m-${createdAt}`,
        tenant_id: TENANT,
        request_id: REQUEST,
        sender: "customer",
        body,
        created_at: createdAt,
      },
    ]);

  it("aceita lugar só se estiver cadastrado pelo gestor", async () => {
    holder.db.rpcHandlers.set("fastbar_send_support_message", () => ({ ok: true }));
    holder.db.seed("fastbar_integrations", [
      { key: "branding", config: { supportPlaces: "Perto do balcão\nMesa de sinuca" } },
    ]);
    const send = (body: string) =>
      sendSupportChat({ requestId: REQUEST, sessionId: SESSION, body }, "customer");
    expect((await send("Estou perto de: Mesa de sinuca")).ok).toBe(true);
    expect((await send("Estou perto de: Cofre")).ok).toBe(false);
  });

  it("não presume resolvido antes de 5 minutos sem resposta", async () => {
    seedRequest(new Date(Date.now() - 60_000).toISOString());
    const result = await presumeSupportResolved({
      sessionId: SESSION,
      requestId: REQUEST,
      reason: "no_answer",
    });
    expect(result.ok).toBe(false);
  });

  it("presume resolvido após inércia, registrado como Sistema", async () => {
    seedRequest(new Date(Date.now() - 10 * 60_000).toISOString());
    const result = await presumeSupportResolved({
      sessionId: SESSION,
      requestId: REQUEST,
      reason: "no_answer",
    });
    expect(result.ok).toBe(true);
    const saved = holder.db.table("fastbar_support_requests")[0];
    expect(saved).toMatchObject({
      status: "completed",
      attended_by: "Sistema",
      completed_by: "Sistema",
    });
  });

  it("engano só encerra se a pessoa realmente disse que foi engano", async () => {
    seedRequest(new Date().toISOString());
    const input = { sessionId: SESSION, requestId: REQUEST, reason: "false_alarm" as const };
    expect((await presumeSupportResolved(input)).ok).toBe(false);
    seedMessage("Foi engano, está tudo bem.", new Date().toISOString());
    expect((await presumeSupportResolved(input)).ok).toBe(true);
  });

  it("não encerra atendimento já assumido pela equipe", async () => {
    seedRequest(new Date(Date.now() - 10 * 60_000).toISOString(), "attending");
    const result = await presumeSupportResolved({
      sessionId: SESSION,
      requestId: REQUEST,
      reason: "no_answer",
    });
    expect(result.ok).toBe(false);
  });
});
