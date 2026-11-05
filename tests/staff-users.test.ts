import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const TENANT = "00000000-0000-4000-8000-000000000001";
const holder = { db: new FakeSupabase() };
const sessionData: { data: Record<string, unknown>; update: ReturnType<typeof vi.fn> } = {
  data: {},
  update: vi.fn(async (next: Record<string, unknown>) => {
    sessionData.data = { ...sessionData.data, ...next };
  }),
};
vi.mock("@tanstack/react-start/server", () => ({ useSession: async () => sessionData }));
vi.mock("../src/lib/fastbar.server", () => ({
  admin: () => holder.db,
  getDefaultTenantId: async () => TENANT,
}));
const server = await import("../src/lib/staff-users.server");
const rules = await import("../src/lib/staff-users");

const valid = {
  fullName: "Maria da Silva",
  cpf: "529.982.247-25",
  email: "Maria@Bar.com",
  phone: "(61) 91234-5678",
  password: "Senha@123",
  role: "atendimento",
};
const asLegacy = () => (sessionData.data = { unlocked: true });
const asAdmin = () => (sessionData.data = { unlocked: true, staffId: "adm", role: "admin" });
const asAtendente = () =>
  (sessionData.data = { unlocked: true, staffId: "at", role: "atendimento" });
const anonymous = () => (sessionData.data = {});

beforeEach(() => {
  holder.db = new FakeSupabase();
  anonymous();
});

describe("regras de cadastro", () => {
  it("valida nome completo, CPF, e-mail, telefone e senha", () => {
    expect(rules.validateStaffRegistration(valid).ok).toBe(true);
    const bad = (patch: Record<string, unknown>) =>
      rules.validateStaffRegistration({ ...valid, ...patch }).ok;
    expect(bad({ fullName: "Maria" })).toBe(false);
    expect(bad({ cpf: "111.111.111-11" })).toBe(false);
    expect(bad({ cpf: "529.982.247-26" })).toBe(false);
    expect(bad({ email: "sem-arroba" })).toBe(false);
    expect(bad({ phone: "123" })).toBe(false);
    expect(bad({ password: "Ab@1" })).toBe(false);
    expect(bad({ password: "senha@123" })).toBe(false);
    expect(bad({ password: "Senha1234" })).toBe(false);
    expect(bad({ password: "Ab@cde" })).toBe(true);
    expect(bad({ role: "dono" })).toBe(false);
  });
  it("normaliza CPF, telefone e e-mail", () => {
    const result = rules.validateStaffRegistration(valid);
    expect(result.ok && result.value).toMatchObject({
      cpf: "52998224725",
      phone: "61912345678",
      email: "maria@bar.com",
    });
  });
});

describe("vínculo", () => {
  it("perfil freelancer é sempre vínculo freelancer; outros são fixos por padrão", () => {
    const get = (patch: Record<string, unknown>) => {
      const r = rules.validateStaffRegistration({ ...valid, ...patch });
      return r.ok ? r.value.employment : null;
    };
    expect(get({})).toBe("fixo");
    expect(get({ role: "freelancer", employment: "fixo" })).toBe("freelancer");
    expect(get({ role: "cozinha", employment: "freelancer" })).toBe("freelancer");
  });
});

describe("senha", () => {
  it("guarda só hash e confere a senha certa", () => {
    const hash = server.hashPassword("Minha@senha1");
    expect(hash).not.toContain("Minha@senha1");
    expect(server.verifyPassword("Minha@senha1", hash)).toBe(true);
    expect(server.verifyPassword("Outra@senha1", hash)).toBe(false);
    expect(server.hashPassword("Minha@senha1")).not.toBe(hash);
  });
});

describe("cadastro, aprovação e login", () => {
  it("autocadastro nasce pendente e não consegue entrar até o admin aprovar", async () => {
    expect((await server.registerStaff(valid)).ok).toBe(true);
    const row = holder.db.table("fastbar_staff_users")[0]!;
    expect(row["status"]).toBe("pendente");
    expect(String(row["password_hash"])).not.toContain("Senha@123");
    expect((await server.loginStaff("maria@bar.com", "Senha@123")).ok).toBe(false);
    expect(sessionData.data["unlocked"]).toBeUndefined();
  });

  it("autocadastro nunca vira admin", async () => {
    const result = await server.registerStaff({ ...valid, role: "admin" });
    expect(result.ok).toBe(false);
    expect(holder.db.table("fastbar_staff_users")).toHaveLength(0);
  });

  it("recusa CPF ou e-mail repetidos", async () => {
    await server.registerStaff(valid);
    expect((await server.registerStaff(valid)).ok).toBe(false);
    expect((await server.registerStaff({ ...valid, cpf: "168.995.350-09" })).ok).toBe(false);
  });

  it("admin cria o primeiro admin já ativo; senha legada serve de bootstrap", async () => {
    asLegacy();
    expect((await server.registerStaff({ ...valid, role: "admin" })).ok).toBe(true);
    expect(holder.db.table("fastbar_staff_users")[0]!["status"]).toBe("ativo");
  });

  it("só admin lista e aprova; atendimento é recusado", async () => {
    await server.registerStaff(valid);
    asAtendente();
    await expect(server.listStaff()).rejects.toThrow("permissão");
    await expect(server.setStaffStatus("x", "aprovar")).rejects.toThrow("permissão");
    anonymous();
    await expect(server.listStaff()).rejects.toThrow("permissão");
  });

  it("aprovado, entra com a própria sessão e perfil", async () => {
    await server.registerStaff(valid);
    const id = String(holder.db.table("fastbar_staff_users")[0]!["id"]);
    asAdmin();
    expect((await server.setStaffStatus(id, "aprovar")).ok).toBe(true);
    anonymous();
    expect((await server.loginStaff("MARIA@bar.com", "Senha@123")).ok).toBe(true);
    expect(sessionData.data).toMatchObject({ unlocked: true, staffId: id, role: "atendimento" });
  });

  it("bloqueia depois de várias senhas erradas", async () => {
    asLegacy();
    await server.registerStaff(valid);
    anonymous();
    for (let i = 0; i < rules.MAX_FAILED_LOGINS; i++)
      await server.loginStaff("maria@bar.com", "Errada@errada");
    const result = await server.loginStaff("maria@bar.com", "Senha@123");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("bloqueado");
  });

  it("desativado não entra; admin não desativa a si mesmo", async () => {
    asLegacy();
    await server.registerStaff(valid);
    const id = String(holder.db.table("fastbar_staff_users")[0]!["id"]);
    expect((await server.setStaffStatus(id, "desativar")).ok).toBe(true);
    anonymous();
    expect((await server.loginStaff("maria@bar.com", "Senha@123")).ok).toBe(false);
    asAdmin();
    expect((await server.setStaffStatus("adm", "desativar")).ok).toBe(false);
  });

  it("a auditoria não guarda dados pessoais", async () => {
    await server.registerStaff(valid);
    const audit = JSON.stringify(holder.db.table("fastbar_staff_audit"));
    expect(audit).not.toContain("52998224725");
    expect(audit).not.toContain("maria@bar.com");
    expect(audit).not.toContain("Maria");
  });
});
