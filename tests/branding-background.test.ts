import { describe, expect, it } from "vitest";
import { sanitizeBrandBackground, sanitizeCardOpacity } from "../src/lib/branding/background";
describe("fundo público da marca", () => {
  it("aceita HTTPS e rejeita protocolos executáveis, HTTP e credenciais", () => {
    expect(sanitizeBrandBackground(" https://images.example.com/fundo.png ")).toBe(
      "https://images.example.com/fundo.png",
    );
    for (const invalid of [
      "javascript:alert(1)",
      "data:image/svg+xml,test",
      "http://site.test/fundo.jpg",
      "https://user:secret@site.test/fundo.jpg",
      "sem url",
      null,
    ])
      expect(sanitizeBrandBackground(invalid)).toBeNull();
  });
  it("limita a opacidade e mantém padrão para configurações ausentes", () => {
    expect(sanitizeCardOpacity(undefined)).toBe(0.82);
    expect(sanitizeCardOpacity("0.7")).toBe(0.7);
    expect(sanitizeCardOpacity("0.1")).toBe(0.6);
    expect(sanitizeCardOpacity(2)).toBe(1);
    expect(sanitizeCardOpacity("invalid")).toBe(0.82);
  });
});
