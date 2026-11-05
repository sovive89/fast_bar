import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const TENANT = "00000000-0000-4000-8000-000000000001";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CUSTOMER = "00000000-0000-4000-8000-0000000000c2";
const holder = { db: new FakeSupabase() };
const roleGate = vi.fn(async (..._roles: string[]) => ({ role: "admin", staffId: "adm" }));
const passwordOk = vi.fn(async (_input: unknown) => true);
vi.mock("../src/lib/fastbar.server", () => ({
  admin: () => holder.db,
  getDefaultTenantId: async () => TENANT,
}));
vi.mock("../src/lib/staff-users.server", () => ({
  assertRole: (...roles: string[]) => roleGate(...roles),
}));
vi.mock("../src/lib/bar-gate.server", () => ({
  teamPasswordMatches: (input: unknown) => passwordOk(input),
}));
const { eraseCustomer, REMOVED_CUSTOMER_NAME } = await import("../src/lib/customer-erasure.server");

const seedCustomers = () =>
  holder.db.seed("fastbar_customers", [
    { id: CUSTOMER, tenant_id: TENANT, name: "Maria", phone: "61912345678", document: null },
    { id: OTHER_CUSTOMER, tenant_id: TENANT, name: "João", phone: "61999990000", document: null },
  ]);
const session = (id: string, patch: Record<string, unknown>) => ({
  id,
  tenant_id: TENANT,
  status: "paid",
  customer_id: CUSTOMER,
  customer_name: "Maria",
  phone: "61912345678",
  document: null,
  document_type: null,
  ...patch,
});

beforeEach(() => {
  holder.db = new FakeSupabase();
  roleGate.mockReset();
  roleGate.mockResolvedValue({ role: "admin", staffId: "adm" });
  passwordOk.mockReset();
  passwordOk.mockResolvedValue(true);
  seedCustomers();
});

describe("apagar cliente do CRM", () => {
  it("só admin, com senha; sem isso nada muda", async () => {
    roleGate.mockRejectedValueOnce(new Error("Seu perfil não tem permissão para esta ação."));
    await expect(eraseCustomer(CUSTOMER, "senha")).rejects.toThrow("permissão");
    passwordOk.mockResolvedValueOnce(false);
    expect((await eraseCustomer(CUSTOMER, "errada")).ok).toBe(false);
    expect(holder.db.table("fastbar_customers")).toHaveLength(2);
  });

  it("apaga o cadastro e tira o nome das comandas, mantendo as comandas", async () => {
    holder.db.seed("fastbar_sessions", [
      session("s1", {}),
      session("s2", { customer_id: null }), // só guardava o mesmo celular
      session("s3", { customer_id: OTHER_CUSTOMER, customer_name: "João", phone: "61999990000" }),
    ]);
    holder.db.seed("fastbar_operation_closures", [
      { id: "c1", session_id: "s1", session_customer_name: "Maria" },
      { id: "c3", session_id: "s3", session_customer_name: "João" },
    ]);
    const result = await eraseCustomer(CUSTOMER, "senha");
    expect(result).toEqual({ ok: true, sessions: 2 });

    expect(holder.db.table("fastbar_customers").map((c) => c["id"])).toEqual([OTHER_CUSTOMER]);
    const sessions = holder.db.table("fastbar_sessions");
    expect(sessions).toHaveLength(3); // nenhuma comanda some
    for (const id of ["s1", "s2"]) {
      expect(sessions.find((s) => s["id"] === id)).toMatchObject({
        customer_id: null,
        customer_name: REMOVED_CUSTOMER_NAME,
        phone: "removido",
        document: null,
      });
    }
    expect(sessions.find((s) => s["id"] === "s3")).toMatchObject({
      customer_name: "João",
      phone: "61999990000",
    });
    const closures = holder.db.table("fastbar_operation_closures");
    expect(closures.find((c) => c["id"] === "c1")!["session_customer_name"]).toBe(
      REMOVED_CUSTOMER_NAME,
    );
    expect(closures.find((c) => c["id"] === "c3")!["session_customer_name"]).toBe("João");
  });

  it("o marcador de celular nunca casa com uma busca por celular de verdade", async () => {
    holder.db.seed("fastbar_sessions", [session("s1", {})]);
    await eraseCustomer(CUSTOMER, "senha");
    expect(/\d/.test(String(holder.db.table("fastbar_sessions")[0]!["phone"]))).toBe(false);
  });

  it("não apaga cliente com comanda em andamento", async () => {
    holder.db.seed("fastbar_sessions", [session("s1", { status: "open" })]);
    const result = await eraseCustomer(CUSTOMER, "senha");
    expect(result.ok).toBe(false);
    expect(holder.db.table("fastbar_customers")).toHaveLength(2);
    expect(holder.db.table("fastbar_sessions")[0]!["customer_name"]).toBe("Maria");
  });

  it("deixa auditoria sem dados do cliente", async () => {
    holder.db.seed("fastbar_sessions", [session("s1", {})]);
    await eraseCustomer(CUSTOMER, "senha");
    const audit = holder.db.table("fastbar_staff_audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "cliente_apagado",
      target_id: CUSTOMER,
      actor: "adm",
    });
    const text = JSON.stringify(audit);
    expect(text).not.toContain("Maria");
    expect(text).not.toContain("61912345678");
  });

  it("falha na auditoria não desfaz a exclusão; cliente inexistente e id inválido são recusados", async () => {
    holder.db.failNext.set("fastbar_staff_audit:insert", "constraint");
    expect((await eraseCustomer(CUSTOMER, "senha")).ok).toBe(true);
    expect((await eraseCustomer(CUSTOMER, "senha")).ok).toBe(false); // já apagado
    expect((await eraseCustomer("bad", "senha")).ok).toBe(false);
  });
});
