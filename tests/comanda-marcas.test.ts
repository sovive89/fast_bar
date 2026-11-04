import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";
import { MARK_COLOR_KEYS, normalizeMark } from "../src/lib/session-marks";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({ admin: () => holder.db }));
const { saveSessionMark, loadMarks, loadMark } = await import("../src/lib/session-marks.server");

const marks = () => holder.db.table("fastbar_session_marks");

beforeEach(() => {
  holder.db = new FakeSupabase();
  holder.db.seed("fastbar_sessions", [{ id: "ana", tenant_id: "t1" }, { id: "caio", tenant_id: "t1" }]);
});

describe("normalizeMark (regras que a tela e o servidor compartilham)", () => {
  it("limpa espaços, junta quebras repetidas e tira o excesso das pontas", () => {
    const r = normalizeMark({ label: "  Aniversário   da  Ana ", note: "  alérgica   a amendoim\n\n\n\nparar de servir  " });
    expect(r).toEqual({
      ok: true,
      mark: { label: "Aniversário da Ana", color: null, note: "alérgica a amendoim\n\nparar de servir" },
    });
  });

  it("etiqueta é de uma linha só: quebra de linha vira espaço", () => {
    expect(normalizeMark({ label: "mesa\nsinuca" })).toMatchObject({ ok: true, mark: { label: "mesa sinuca" } });
  });

  it("tudo vazio significa 'sem marca' (o servidor apaga a linha)", () => {
    expect(normalizeMark({})).toEqual({ ok: true, mark: null });
    expect(normalizeMark({ label: "   ", color: "", note: "\n \t" })).toEqual({ ok: true, mark: null });
  });

  it("aceita as 8 cores da paleta e recusa qualquer outra", () => {
    expect(MARK_COLOR_KEYS).toHaveLength(8);
    for (const color of MARK_COLOR_KEYS) expect(normalizeMark({ color })).toMatchObject({ ok: true });
    for (const color of ["#ff0000", "red", "Laranja", "javascript:alert(1)"]) {
      expect(normalizeMark({ color })).toEqual({ ok: false, message: "Cor fora da lista." });
    }
  });

  it("recusa texto grande demais em vez de cortar em silêncio", () => {
    expect(normalizeMark({ label: "x".repeat(24) })).toMatchObject({ ok: true });
    expect(normalizeMark({ label: "x".repeat(25) })).toMatchObject({ ok: false });
    expect(normalizeMark({ note: "x".repeat(500) })).toMatchObject({ ok: true });
    expect(normalizeMark({ note: "x".repeat(501) })).toMatchObject({ ok: false });
  });

  it("recusa tipos que não são texto", () => {
    expect(normalizeMark({ label: 123 })).toMatchObject({ ok: false });
    expect(normalizeMark({ note: { a: 1 } })).toMatchObject({ ok: false });
  });
});

describe("saveSessionMark", () => {
  const save = (sessionId: string, input: Record<string, unknown>) =>
    saveSessionMark({ sessionId, input, realizadoPor: "equipe" });

  it("grava com o bar da comanda e quem mexeu", async () => {
    expect(await save("ana", { label: "Aniversário", color: "laranja", note: "bolo às 22h" })).toEqual({
      ok: true,
      mark: { label: "Aniversário", color: "laranja", note: "bolo às 22h" },
    });
    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toMatchObject({ session_id: "ana", tenant_id: "t1", updated_by: "equipe", color: "laranja" });
  });

  it("salvar de novo substitui, não soma (uma linha por comanda)", async () => {
    await save("ana", { label: "A", color: "azul", note: "um" });
    await save("ana", { label: "B" });
    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toMatchObject({ label: "B", color: null, note: null });
  });

  it("deixar tudo vazio apaga a marca", async () => {
    await save("ana", { color: "verde" });
    expect(await save("ana", {})).toEqual({ ok: true, mark: null });
    expect(marks()).toHaveLength(0);
  });

  it("não mexe nas marcas de outras comandas", async () => {
    await save("ana", { label: "A" });
    await save("caio", { label: "C" });
    await save("ana", {});
    expect(marks().map((m) => m.session_id)).toEqual(["caio"]);
  });

  it("comanda inexistente é recusada e nada é gravado", async () => {
    expect(await save("fantasma", { label: "x" })).toEqual({ ok: false, message: "Comanda não encontrada." });
    expect(marks()).toHaveLength(0);
  });

  it("entrada inválida é recusada antes de tocar no banco", async () => {
    expect(await save("ana", { color: "pink" })).toMatchObject({ ok: false });
    expect(await save("ana", { label: "x".repeat(40) })).toMatchObject({ ok: false });
    expect(marks()).toHaveLength(0);
  });

  it("falha do banco devolve mensagem, não exceção", async () => {
    holder.db.failNext.set("fastbar_session_marks:upsert", "rede caiu");
    expect(await save("ana", { label: "x" })).toEqual({
      ok: false,
      message: "Não foi possível salvar a identificação.",
    });
  });
});

describe("leitura", () => {
  it("loadMarks devolve por id da comanda e loadMark devolve null sem marca", async () => {
    await saveSessionMark({ sessionId: "ana", input: { color: "rosa", note: "oi" }, realizadoPor: "equipe" });
    expect(await loadMarks()).toEqual({ ana: { label: null, color: "rosa", note: "oi" } });
    expect(await loadMark("ana")).toEqual({ label: null, color: "rosa", note: "oi" });
    expect(await loadMark("caio")).toBeNull();
  });

  it("valor fora das regras gravado à mão no banco não quebra a leitura", async () => {
    holder.db.seed("fastbar_session_marks", [{ session_id: "ana", color: "#fff", label: null, note: null }]);
    expect(await loadMark("ana")).toEqual({ label: null, color: null, note: null });
  });
});

describe("privacidade: observação sobre cliente só existe no caixa", () => {
  it("só o servidor e os tipos citam a tabela; nenhum arquivo do cliente a lê", () => {
    const allowed = new Set(["src/lib/session-marks.server.ts", "src/integrations/supabase/types.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && readFileSync(path, "utf8").includes("fastbar_session_marks")) {
          if (!allowed.has(path)) offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
