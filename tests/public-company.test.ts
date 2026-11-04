import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";
import { publicCnpj, publicCompany } from "../src/lib/public-company";

const holder = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({
  admin: () => holder.db,
  getDefaultTenantId: async () => "our-bar",
}));
const { loadPublicCompany } = await import("../src/lib/public-company.server");
beforeEach(() => {
  holder.db = new FakeSupabase();
});

describe("dados públicos da empresa", () => {
  it("publica somente contato comercial autorizado, sem CPF ou dados internos", () => {
    const value = publicCompany({
      tradeName: " Bar exemplo ",
      address: " Rua Exemplo, 123 ",
      phone: "(61) 99999-1234",
      document: "529.982.247-25",
      legalName: "Nome privado",
      managerName: "Gestor privado",
      apiKey: "segredo",
    });
    expect(value).toEqual({
      tradeName: "Bar exemplo",
      address: "Rua Exemplo, 123",
      phone: "+5561999991234",
      cnpj: null,
    });
    expect(publicCompany(null)).toEqual({
      tradeName: null,
      address: null,
      phone: null,
      cnpj: null,
    });
  });
  it("CNPJ precisa ter os dois dígitos válidos; repetidos e CPF não aparecem", () => {
    expect(publicCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
    expect(publicCnpj("12.ABC.345/01DE-35")).toBe("12.ABC.345/01DE-35");
    expect(publicCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
    expect(publicCnpj("12ABC34501DE36")).toBeNull();
    for (const value of [
      "11222333000182",
      "11222333000191",
      "00000000000000",
      "11111111111111",
      "52998224725",
      "CNPJ 11222333000181",
      null,
    ])
      expect(publicCnpj(value)).toBeNull();
  });
  it("ignora campos de tipo inválido e não gera link de telefone com código executável", () => {
    expect(
      publicCompany({ tradeName: {}, address: 5, phone: "javascript:alert(1)", document: {} }),
    ).toEqual({ tradeName: null, address: null, phone: null, cnpj: null });
    expect(publicCompany({ phone: "+55 (61) 99999-1234" }).phone).toBe("+5561999991234");
  });
  it("lê apenas estabelecimento do tenant atual e nunca devolve a configuração inteira", async () => {
    holder.db.seed("fastbar_integrations", [
      {
        tenant_id: "other-bar",
        key: "estabelecimento",
        config: { tradeName: "Outro bar", document: "11222333000181" },
      },
      { tenant_id: "our-bar", key: "acesso", config: { passwordHash: "segredo" } },
      {
        tenant_id: "our-bar",
        key: "estabelecimento",
        config: { tradeName: "Nosso bar", document: "11222333000181", managerName: "privado" },
      },
    ]);
    expect(await loadPublicCompany()).toEqual({
      tradeName: "Nosso bar",
      address: null,
      phone: null,
      cnpj: "11.222.333/0001-81",
    });
  });
  it("uma falha do banco não inventa contatos ou retorna o cadastro de outro bar", async () => {
    holder.db.failNext.set("fastbar_integrations:select", "detalhe privado");
    await expect(loadPublicCompany()).rejects.toThrow(
      "Não foi possível carregar os contatos do estabelecimento.",
    );
  });
});
