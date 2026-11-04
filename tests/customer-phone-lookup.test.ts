import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const TENANT_ID = "tenant-fastbar";
const holder = { db: new FakeSupabase(), unlocked: true };

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: holder.db }));
vi.mock("@tanstack/react-start/server", () => ({
  useSession: async () => ({ data: { unlocked: holder.unlocked } }),
}));

const previousTenantSlug = process.env["FASTBAR_TENANT_SLUG"];
beforeAll(() => {
  process.env["FASTBAR_TENANT_SLUG"] = "golpebaixo";
});
afterAll(() => {
  if (previousTenantSlug === undefined) delete process.env["FASTBAR_TENANT_SLUG"];
  else process.env["FASTBAR_TENANT_SLUG"] = previousTenantSlug;
});

const { lookupCustomerNameByPhone } = await import("../src/lib/fastbar.server");

beforeEach(() => {
  holder.unlocked = true;
  holder.db.failNext.clear();
  for (const table of ["fastbar_tenants", "fastbar_customers"]) holder.db.table(table).splice(0);

  holder.db.seed("fastbar_tenants", [{ id: TENANT_ID, slug: "golpebaixo" }]);
  holder.db.seed("fastbar_customers", [
    { id: "customer-a", tenant_id: TENANT_ID, phone: "61911112222", name: "Ana Souza" },
    { id: "customer-b", tenant_id: "outro-tenant", phone: "61933334444", name: "Pessoa Externa" },
  ]);
});

describe("autocomplete de nome pelo telefone", () => {
  it("retorna somente o nome do cliente no tenant atual", async () => {
    await expect(lookupCustomerNameByPhone("(61) 91111-2222")).resolves.toEqual({
      name: "Ana Souza",
    });
  });

  it("não encontra cadastro que pertence a outro tenant", async () => {
    await expect(lookupCustomerNameByPhone("61933334444")).resolves.toEqual({ name: null });
  });

  it("não consulta o banco para telefone incompleto ou inválido", async () => {
    holder.db.failNext.set("fastbar_customers:select", "consulta não deveria ocorrer");

    await expect(lookupCustomerNameByPhone("12345")).resolves.toEqual({ name: null });

    expect(holder.db.failNext.has("fastbar_customers:select")).toBe(true);
  });

  it("exige o gate do caixa antes de consultar o cadastro", async () => {
    holder.unlocked = false;

    await expect(lookupCustomerNameByPhone("61911112222")).rejects.toThrow(
      "Acesso do caixa não autorizado.",
    );
  });

  it("propaga erro de banco para a UI poder ignorar a sugestão sem bloquear a abertura", async () => {
    holder.db.failNext.set("fastbar_customers:select", "indisponível");

    await expect(lookupCustomerNameByPhone("61911112222")).rejects.toThrow();
  });
});
