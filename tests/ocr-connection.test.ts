import test from "node:test";
import assert from "node:assert/strict";
import { resolveOCRConnection } from "../src/lib/ocr-connection.ts";

test("saved OpenAI key and blank endpoint bypass Vercel authentication", () => {
  const result = resolveOCRConnection({
    apiKey: " saved-placeholder ",
    oidcToken: "vercel-placeholder",
  });
  assert.equal(result.endpoint, "https://api.openai.com/v1/responses");
  assert.equal(result.apiKey, "saved-placeholder");
});

test("server OpenAI key works without a configured endpoint", () => {
  const result = resolveOCRConnection({
    openaiKey: "server-placeholder",
    gatewayKey: "gateway-placeholder",
  });
  assert.equal(result.endpoint, "https://api.openai.com/v1/responses");
  assert.equal(result.apiKey, "server-placeholder");
});

test("explicit Gateway endpoint never receives server OpenAI credentials", () => {
  const result = resolveOCRConnection({
    endpoint: "https://ai-gateway.vercel.sh/v1/responses",
    openaiKey: "server-placeholder",
  });
  assert.equal(result.apiKey, "");
});

test("third-party normalizer configuration stays intact", () => {
  assert.deepEqual(
    resolveOCRConnection({
      normalizerEndpoint: "https://ocr.example.com/v1/chat/completions",
      normalizerSecret: "normalizer-placeholder",
      openaiKey: "server-placeholder",
    }),
    {
      endpoint: "https://ocr.example.com/v1/chat/completions",
      apiKey: "normalizer-placeholder",
      fallback: false,
    },
  );
});

test("Gateway is used when no OpenAI or custom configuration exists", () => {
  assert.equal(
    resolveOCRConnection({ oidcToken: "vercel-placeholder" }).apiKey,
    "vercel-placeholder",
  );
  assert.equal(resolveOCRConnection({}).endpoint, "https://ai-gateway.vercel.sh/v1/responses");
});
