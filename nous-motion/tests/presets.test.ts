import { describe, expect, it } from "vitest";
import { BUILT_IN_PRESETS, acceptSuggestion, createMemoryAdapter, parsePresetJson, validatePreset } from "../src";

const ok = { id: "p1", component: "loader", template: "orbit", version: 1, parameters: { primaryColor: "#FF6B00", size: 48 } };

describe("presets", () => {
  it("aceita preset válido e devolve cópia reconstruída", () => {
    const r = validatePreset(ok);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual(ok);
    expect(r.value).not.toBe(ok);
  });
  it("os presets embutidos são todos válidos", () => {
    for (const p of BUILT_IN_PRESETS) expect(validatePreset(p).errors).toEqual([]);
  });
  it.each([
    ["version errada", { ...ok, version: 2 }],
    ["componente inexistente", { ...ok, component: "modal" }],
    ["template de outro componente", { ...ok, template: "ripple" }],
    ["id com caracteres perigosos", { ...ok, id: "../x" }],
    ["parâmetro desconhecido (onClick)", { ...ok, parameters: { onClick: "alert(1)" } }],
    ["cor com url()", { ...ok, parameters: { primaryColor: "url(javascript:alert(1))" } }],
    ["cor que escapa do CSS", { ...ok, parameters: { primaryColor: "red;} body{display:none" } }],
    ["logo javascript:", { ...ok, parameters: { logo: "javascript:alert(1)" } }],
    ["logo http (sem TLS)", { ...ok, parameters: { logo: "http://x.com/a.png" } }],
    ["número fora do limite", { ...ok, parameters: { size: 99999 } }],
    ["enum inválido", { ...ok, parameters: { state: "exploding" } }],
    ["não é objeto", "texto"],
  ])("rejeita: %s", (_n, input) => {
    const r = validatePreset(input);
    expect(r.ok).toBe(false);
    expect(r.value).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it("não é vulnerável a __proto__ no JSON", () => {
    const r = parsePresetJson('{"id":"p","component":"loader","template":"orbit","version":1,"parameters":{"__proto__":{"x":1}}}');
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>)["x"]).toBeUndefined();
  });
  it("JSON malformado vira erro, não exceção", () => {
    expect(parsePresetJson("{nope").errors).toEqual(["JSON inválido"]);
  });
  it("aceita logo https e data:image", () => {
    expect(validatePreset({ ...ok, parameters: { logo: "https://x.com/a.png" } }).ok).toBe(true);
    expect(validatePreset({ ...ok, parameters: { logo: "data:image/png;base64,AAAA" } }).ok).toBe(true);
  });
});

describe("IA (sugestão) e armazenamento", () => {
  it("sugestão com código executável é recusada", async () => {
    const evil = { suggest: async () => ({ ...ok, parameters: { primaryColor: "#fff", run: "fetch('//x')" } }) };
    const r = await acceptSuggestion(evil, "faça algo", { component: "loader" });
    expect(r.ok).toBe(false);
  });
  it("sugestão válida passa", async () => {
    const good = { suggest: async () => ok };
    expect((await acceptSuggestion(good, "laranja", { component: "loader" })).ok).toBe(true);
  });
  it("adaptadores em memória são isolados entre si (um por tenant)", async () => {
    const a = createMemoryAdapter();
    const b = createMemoryAdapter();
    await a.save(ok as never);
    expect(await a.get("p1")).toEqual(ok);
    expect(await b.get("p1")).toBeNull();
    expect(await a.list()).toHaveLength(1);
    await a.remove("p1");
    expect(await a.list()).toHaveLength(0);
  });
});
