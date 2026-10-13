import assert from "node:assert/strict";
import { test } from "node:test";
import { createOCRRequest, DEFAULT_OCR_MODEL, isDirectOpenAI } from "../src/lib/ocr-model.ts";

const image = { base64: "aW1hZ2U=", mimeType: "image/jpeg" };

test("defaults to the OpenAI vision model with JSON output through Gateway", () => {
  const body = createOCRRequest({ prompt: "Retorne JSON", data: image });
  assert.equal(DEFAULT_OCR_MODEL, "openai/gpt-4.1");
  assert.equal(body.model, DEFAULT_OCR_MODEL);
  assert.equal(body.response_format?.type, "json_object");
  assert.equal(body.temperature, 0);
  assert.equal(body.messages[0]?.content[1]?.type, "image_url");
});

test("direct OpenAI uses the native model ID and a file part for PDF", () => {
  const body = createOCRRequest({
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "openai/gpt-4.1",
    prompt: "Retorne JSON",
    data: { base64: "JVBERg==", mimeType: "application/pdf", fileName: "nota.pdf" },
  });
  assert.equal(body.model, "gpt-4.1");
  assert.equal(body.messages[0]?.content[1]?.type, "file");
  assert.equal(body.response_format?.type, "json_object");
});

test("native OpenAI names entered in Connections work through Gateway", () => {
  assert.equal(
    createOCRRequest({ model: "gpt-4.1-mini", prompt: "JSON", data: image }).model,
    "openai/gpt-4.1-mini",
  );
});

test("explicit custom endpoint and model are preserved", () => {
  const body = createOCRRequest({
    endpoint: "https://ocr.example.com/v1/chat/completions",
    model: "custom-vision",
    prompt: "JSON",
    data: image,
  });
  assert.equal(body.model, "custom-vision");
  assert.equal(body.response_format, undefined);
});

test("GPT-5 requests omit unsupported temperature", () => {
  assert.equal(
    createOCRRequest({ model: "openai/gpt-5", prompt: "JSON", data: image }).temperature,
    undefined,
  );
});

test("the direct API cannot receive a different provider's model", () => {
  assert.throws(() =>
    createOCRRequest({
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "google/gemini-3.8-flash",
      prompt: "JSON",
      data: image,
    }),
  );
  assert.equal(isDirectOpenAI("https://api.openai.com.example.com/v1/chat/completions"), false);
});
