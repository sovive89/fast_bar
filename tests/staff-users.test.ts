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
const requestHeaders = new Map<string, string>();
vi.mock("@tanstack/react-start/server", () => ({
  useSession: async () => sessionData,
  getRequest: () => ({ headers: { get: (name: string) => requestHeaders.get(name) ?? null } }),
}));
const notify = vi.fn(async () => ({ sent: 1, removed: 0, failed: 0 }));
vi.mock("../src/lib/push.server", () => ({ notifyStaff: (...args: unknown[]) => notify(...args) }));
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
  requestHeaders.clear();
  notify.mockReset();
  notify.mockResolvedValue({ sent: 1, removed: 0, failed: 0 });
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
    expect(bad({ password: "abc" })).toBe(false); // curta demais
    expect(bad({ password: "abcd" })).toBe(true); // piloto: qualquer tipo de senha
    expect(bad({ password: "senha1234" })).toBe(true);
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

describe("login registrado e avisado ao admin", () => {
  const activeStaff = async (role = "atendimento") => {
    asLegacy();
    await server.registerStaff({ ...valid, role });
    anonymous();
    return String(holder.db.table("fastbar_staff_users")[0]!["id"]);
  };

  it("grava o login, avisa só admins e não guarda o IP", async () => {
    await activeStaff();
    requestHeaders.set("x-forwarded-for", "203.0.113.9, 10.0.0.1");
    expect((await server.loginStaff("maria@bar.com", "Senha@123")).ok).toBe(true);
    const logins = holder.db.table("fastbar_staff_logins");
    expect(logins).toHaveLength(1);
    expect(logins[0]!["on_bar_network"]).toBeNull();
    expect(JSON.stringify(logins)).not.toContain("203.0.113.9");
    expect(notify).toHaveBeenCalledTimes(1);
    const [payload, options] = notify.mock.calls[0] as [
      Record<string, string>,
      Record<string, boolean>,
    ];
    expect(payload["kind"]).toBe("equipe");
    expect(payload["body"]).toContain("Maria da Silva");
    expect(options["onlyAdmins"]).toBe(true);
  });

  it("na rede do bar: sem aviso de fora; fora da rede: só avisa, nunca bloqueia", async () => {
    await activeStaff();
    holder.db.seed("fastbar_integrations", [{ key: "rede", config: { ip: "203.0.113.9" } }]);
    requestHeaders.set("x-forwarded-for", "203.0.113.9");
    expect((await server.loginStaff("maria@bar.com", "Senha@123")).ok).toBe(true);
    expect(holder.db.table("fastbar_staff_logins")[0]!["on_bar_network"]).toBe(true);
    expect((notify.mock.calls[0] as [Record<string, string>])[0]["body"]).not.toContain("fora");

    anonymous();
    requestHeaders.set("x-forwarded-for", "198.51.100.7");
    expect((await server.loginStaff("maria@bar.com", "Senha@123")).ok).toBe(true);
    expect(holder.db.table("fastbar_staff_logins")[1]!["on_bar_network"]).toBe(false);
    expect((notify.mock.calls[1] as [Record<string, string>])[0]["body"]).toContain(
      "fora do Wi-Fi do bar",
    );
  });

  it("login de admin é registrado, mas não avisa", async () => {
    await activeStaff("admin");
    expect((await server.loginStaff("maria@bar.com", "Senha@123")).ok).toBe(true);
    expect(holder.db.table("fastbar_staff_logins")).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("falha no push não derruba o login", async () => {
    await activeStaff();
    notify.mockRejectedValue(new Error("push fora do ar"));
    expect((await server.loginStaff("maria@bar.com", "Senha@123")).ok).toBe(true);
    expect(sessionData.data["unlocked"]).toBe(true);
  });

  it("só admin cadastra a rede do bar e lê o histórico de logins", async () => {
    asAtendente();
    await expect(server.setBarNetworkFromRequest()).rejects.toThrow("permissão");
    await expect(server.listStaffLogins()).rejects.toThrow("permissão");
    asAdmin();
    requestHeaders.set("x-forwarded-for", "203.0.113.9");
    expect((await server.setBarNetworkFromRequest()).ok).toBe(true);
    expect(holder.db.table("fastbar_integrations")[0]).toMatchObject({
      key: "rede",
      config: { ip: "203.0.113.9" },
    });
  });
});
