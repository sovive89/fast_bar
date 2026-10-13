import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createOCRResponsesRequest,
  extractOCRResponseText,
  resolveOCRTransport,
  OCR_RESPONSE_SCHEMA,
} from "../src/lib/ocr-responses.ts";

const data = { base64: "aW1hZ2U=", mimeType: "image/jpeg" };

test("Responses image request uses input_image, nested reasoning and strict JSON", () => {
  const body = createOCRResponsesRequest({
    prompt: "Retorne JSON",
    data,
    endpoint: "https://api.openai.com/v1/responses",
  });
  assert.equal(body.model, "gpt-6-astra");
  assert.equal(body.input[0]?.content[0]?.type, "input_text");
  assert.equal(body.input[0]?.content[1]?.type, "input_image");
  const image = body.input[0]?.content[1] as { image_url: string; detail: string };
  assert.equal(image.image_url, "data:image/jpeg;base64,aW1hZ2U=");
  assert.equal(image.detail, "original");
  assert.equal(body.reasoning?.effort, "low");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.store, false);
  assert.equal("messages" in body, false);
  assert.equal("tools" in body, false);
  assert.equal("reasoning_effort" in body, false);
});

test("Responses PDFs use input_file and retain the filename", () => {
  const body = createOCRResponsesRequest({
    prompt: "JSON",
    data: { base64: "JVBERg==", mimeType: "application/pdf", fileName: "nota.pdf" },
  });
  const part = body.input[0]?.content[1] as { type: string; filename: string; file_data: string };
  assert.equal(part.type, "input_file");
  assert.equal(part.filename, "nota.pdf");
  assert.equal(part.file_data, "data:application/pdf;base64,JVBERg==");
});

test("saved OpenAI and Gateway Chat paths upgrade without changing hosts", () => {
  assert.equal(
    resolveOCRTransport("https://api.openai.com/v1/chat/completions").endpoint,
    "https://api.openai.com/v1/responses",
  );
  assert.equal(
    resolveOCRTransport("https://ai-gateway.vercel.sh/v1/chat/completions").gateway,
    true,
  );
  assert.equal(resolveOCRTransport("https://ocr.example.com/v1/chat/completions").responses, false);
  assert.equal(resolveOCRTransport("https://api.openai.com/v1/responses").responses, true);
});

test("response parsing reads assistant output and ignores reasoning blocks", () => {
  const parsed = extractOCRResponseText({
    status: "completed",
    output: [
      { type: "reasoning", content: [{ type: "output_text", text: "ignore" }] },
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: '{"itens":' },
          { type: "output_text", text: "[]}" },
        ],
      },
    ],
  });
  assert.equal(parsed.text, '{"itens":[]}');
  assert.equal(parsed.incomplete, false);
  assert.equal(parsed.refused, false);
});

test("strict OCR schema keeps illegible fields nullable without accepting arbitrary fields", () => {
  assert.deepEqual(
    [...OCR_RESPONSE_SCHEMA.required].sort(),
    Object.keys(OCR_RESPONSE_SCHEMA.properties).sort(),
  );
  assert.equal(OCR_RESPONSE_SCHEMA.additionalProperties, false);
  assert.ok(OCR_RESPONSE_SCHEMA.properties.itens.items.properties.quantidade.type.includes("null"));
  assert.equal(OCR_RESPONSE_SCHEMA.properties.itens.items.additionalProperties, false);
});
