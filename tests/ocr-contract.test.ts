import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { normalizeOCRPayload, parseOCRText } from "../src/lib/ocr-contract";

type Fixture = Record<string, unknown>;

async function fixture(name: string): Promise<Fixture> {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as Fixture;
}

describe("extração de itens de estoque a partir de fotos de cupons", () => {
  it("normaliza um cupom legível sem perder lote, validade e metadados fiscais", async () => {
    const result = normalizeOCRPayload(await fixture("cupom-legivel.json"));

    expect(result.documentoTipo).toBe("nfce");
    expect(result.fornecedorNome).toBe("BAR DISTRIBUIDORA LTDA");
    expect(result.numeroNota).toBe("1842");
    expect(result.dataEmissao).toBe("2026-10-13");
    expect(result.chaveAcesso).toMatch(/^\d{44}$/);
    expect(result.confianca).toBe(0.94);
    expect(result.itens).toHaveLength(2);
    expect(result.itens[0]).toMatchObject({
      descricao: "Cerveja Pilsen 350ml",
      quantidade: 48,
      unidade: "UN",
      valorUnitario: 4.99,
      lote: "L2609A",
      fabricacao: "2026-09-01",
      validade: "2027-09-01",
    });
  });

  it("descarta subtotal e linhas inválidas, preservando o que está legível", async () => {
    const result = normalizeOCRPayload(await fixture("cupom-tremido.json"));

    expect(result.itens).toEqual([
      expect.objectContaining({
        descricao: "Água tônica",
        quantidade: 12,
        valorUnitario: 7.5,
        validade: "2026-12-01",
      }),
    ]);
    expect(result.valorTotal).toBeNull();
    expect(result.dataEmissao).toBeNull();
    expect(result.confianca).toBe(1);
  });

  it("aceita JSON cercado por markdown, como alguns modelos retornam", () => {
    const parsed = parseOCRText('```json\n{"itens":[{"descricao":"Gelo","quantidade":2}]}\n```');
    expect(parsed).toEqual({ itens: [{ descricao: "Gelo", quantidade: 2 }] });
  });

  it("não inventa item quando a IA retorna resposta inválida", () => {
    const result = normalizeOCRPayload({
      documentoTipo: "cupom",
      itens: [null, {}, { descricao: "", quantidade: 2 }, { descricao: "Troco", quantidade: 0 }],
    });
    expect(result.itens).toEqual([]);
  });

  it("mantém o contrato de leitura puro, sem persistir estoque durante a extração", async () => {
    const source = await readFile(new URL("../src/lib/ocr-contract.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/supabase|insert\s*\(|upsert\s*\(/i);
  });
});
