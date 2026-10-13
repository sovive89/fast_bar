import assert from "node:assert/strict";
import { test } from "node:test";
import { documentPart, normalizeOCR, ocrNumber, parseOCRText } from "../src/lib/stock-ocr.ts";
import { normalizeProductPhoto } from "../src/lib/stock-photo.ts";
import { preprocessDocumentImage } from "../src/lib/ocr-image.ts";
import { photoLinesForEntry } from "../src/lib/stock-entry-review.ts";

test("reads Brazilian decimals without converting missing values to zero", () => {
  assert.equal(ocrNumber("R$ 1.234,56"), 1234.56);
  assert.equal(ocrNumber("0,750"), 0.75);
  for (const value of [null, undefined, "", "ilegível", true, Infinity, "1,2,3"])
    assert.equal(ocrNumber(value), null);
});

test("keeps partially unreadable rows for review", () => {
  const result = normalizeOCR({
    itens: [{ descricao: "Cerveja 350 ml", quantidade: null, valorUnitario: "" }],
  });
  assert.equal(result.itens.length, 1);
  assert.equal(result.itens[0]?.quantidade, null);
  assert.equal(result.itens[0]?.valorUnitario, null);
  assert.equal(result.avisos.length, 2);
});

test("derives price only from a readable total and quantity", () => {
  const result = normalizeOCR({
    itens: [{ descricao: "Caixa", quantidade: 2, valorTotal: "49,80" }],
  });
  assert.equal(result.itens[0]?.valorUnitario, 24.9);
  assert.equal(
    normalizeOCR({ itens: [{ descricao: "Caixa", quantidade: null, valorTotal: 49.8 }] }).itens[0]
      ?.valorUnitario,
    null,
  );
});

test("flags inconsistent line totals without silently changing them", () => {
  const result = normalizeOCR({
    itens: [{ descricao: "Garrafa", quantidade: 10, valorUnitario: 48.9, valorTotal: 48.9 }],
  });
  assert.ok(result.avisos.some((warning) => warning.includes("difere")));
  assert.equal(result.itens[0]?.valorUnitario, 48.9);
});

test("rejects failed services, malformed output and invalid item arrays", () => {
  for (const value of [null, [], {}, { itens: {}, ok: true }, { ok: false, itens: [] }])
    assert.throws(() => normalizeOCR(value));
  assert.deepEqual(parseOCRText('```json\n{"itens":[]}\n```'), { itens: [] });
  assert.throws(() => parseOCRText("documento ilegível"));
});

test("PDF is a file part and JPEG remains a high-detail image", () => {
  assert.equal(documentPart({ mimeType: "application/pdf", base64: "JVBERg==" }).type, "file");
  assert.equal(documentPart({ mimeType: "image/jpeg", base64: "abc" }).type, "image_url");
});

test("product photos never supply prices or fiscal metadata", () => {
  const result = normalizeProductPhoto({
    fornecedorNome: "Inventado",
    chaveAcesso: "1".repeat(44),
    valorTotal: 500,
    itens: [
      {
        descricao: "Marca A 350 ml",
        quantidade: 6,
        unidade: "UN",
        valorUnitario: 30,
        valorTotal: 180,
      },
    ],
  });
  assert.equal(result.itens[0]?.quantidade, 6);
  assert.equal(result.itens[0]?.valorUnitario, null);
  assert.equal(result.fornecedorNome, null);
  assert.equal(result.chaveAcesso, null);
  assert.equal(result.valorTotal, null);
  assert.ok(!result.avisos.some((warning) => warning.includes("valor unitário")));
});

test("closed boxes stay boxes, brands stay separate, hidden counts stay unknown", () => {
  const result = normalizeProductPhoto({
    itens: [
      { descricao: "Marca A 350 ml", quantidade: 2, unidade: "CX" },
      { descricao: "Marca B 350 ml", quantidade: null, unidade: "UN" },
    ],
  });
  assert.equal(result.itens[0]?.quantidade, 2);
  assert.equal(result.itens[0]?.unidade, "CX");
  assert.equal(result.itens[1]?.quantidade, null);
  assert.equal(result.itens.length, 2);
  assert.ok(result.avisos.some((warning) => warning.includes("já estava")));
});

test("fractional and negative counts do not become stock suggestions", () => {
  for (const quantidade of [2.5, -2, 0])
    assert.equal(
      normalizeProductPhoto({ itens: [{ descricao: "Lata", quantidade }] }).itens[0]?.quantidade,
      null,
    );
});

test("old fridge stock is excluded even if recognized and matched", () => {
  const old = { included: false, componentId: "old-stock", packs: "20" };
  const added = { included: true, componentId: "new-stock", packs: "3" };
  assert.deepEqual(photoLinesForEntry([old, added]), [added]);
  assert.throws(() => photoLinesForEntry([old]));
});

test("photo entry requires a mapped product and reviewed package count", () => {
  assert.throws(() => photoLinesForEntry([{ included: true, componentId: "", packs: "2" }]));
  for (const packs of ["", "0", "-1", "2.5", "NaN", "9007199254740992"])
    assert.throws(() => photoLinesForEntry([{ included: true, componentId: "sku", packs }]));
});

test("product photo preprocessing preserves label colors and limits image size", async (t) => {
  const previousBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let closed = false;
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "",
    fillStyle: "",
    fillRect() {},
    drawImage() {},
    getImageData() {
      throw new Error("Product photos must not be converted to grayscale");
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback: (blob: Blob) => void) {
      callback(new Blob(["image"], { type: "image/jpeg" }));
    },
  };
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => ({
      width: 4000,
      height: 2000,
      close() {
        closed = true;
      },
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => canvas },
  });
  t.after(() => {
    if (previousBitmap) Object.defineProperty(globalThis, "createImageBitmap", previousBitmap);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const result = await preprocessDocumentImage(
    new File(["original"], "geladeira.png", { type: "image/png" }),
    { preserveColor: true },
  );
  assert.equal(result.type, "image/jpeg");
  assert.equal(canvas.width, 2400);
  assert.equal(canvas.height, 1200);
  assert.equal(closed, true);
});
