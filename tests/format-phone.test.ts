import { describe, expect, it } from "vitest";
import { formatPhone } from "../src/lib/format";

describe("formatPhone", () => {
  it("formata celular e fixo", () => {
    expect(formatPhone("61983069554")).toBe("(61) 98306-9554");
    expect(formatPhone("6133334444")).toBe("(61) 3333-4444");
  });

  // Cliente cadastrado só com CPF/RG tem phone nulo no banco. Antes isso derrubava Alertas,
  // a lista de clientes e a ficha do cliente ("Cannot read properties of null (reading 'replace')").
  it("aceita vazio sem quebrar", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone(undefined)).toBe("");
    expect(formatPhone("")).toBe("");
  });
});
