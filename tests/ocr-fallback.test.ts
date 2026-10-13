import assert from "node:assert/strict";
import { test } from "node:test";
import { requestOCR } from "../src/lib/ocr-request.server.ts";
import { DEFAULT_OCR_MODEL, DEFAULT_OCR_FALLBACK_MODEL } from "../src/lib/ocr-model.ts";

const params = {
  endpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "test-placeholder",
  model: DEFAULT_OCR_MODEL,
  fallbackModel: DEFAULT_OCR_FALLBACK_MODEL,
  prompt: "Retorne JSON",
  data: { base64: "aW1hZ2U=", mimeType: "image/jpeg" },
};
function success() {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: '{"itens":[{"descricao":"Lata","quantidade":2}]}' }],
      },
    ],
  });
}
function fake(responses: Array<Response | Error>) {
  const bodies: Array<Record<string, unknown>> = [];
  const urls: string[] = [];
  const headers: Headers[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    urls.push(String(_url));
    headers.push(new Headers(init?.headers));
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("Unexpected additional attempt");
    return next;
  };
  return { fetcher, bodies, urls, headers };
}

test("primary success makes only one request", async () => {
  const client = fake([success()]);
  const result = await requestOCR({ ...params, fetcher: client.fetcher });
  assert.equal(client.bodies.length, 1);
  assert.equal(client.urls[0], "https://api.openai.com/v1/responses");
  assert.match(client.headers[0]?.get("X-Client-Request-Id") ?? "", /^[a-f0-9-]{36}$/);
  assert.equal(client.bodies[0]?.["model"], "gpt-6-astra");
  assert.equal(result["itens"] instanceof Array, true);
});

test("temporary API errors invoke Luna once", async () => {
  for (const status of [408, 429, 500, 503]) {
    const client = fake([new Response("temporary", { status }), success()]);
    await requestOCR({ ...params, fetcher: client.fetcher });
    assert.equal(client.bodies.length, 2);
    assert.equal(client.bodies[1]?.["model"], "gpt-5.6-luna");
    assert.equal((client.bodies[1]?.["reasoning"] as { effort: string })?.effort, "low");
  }
});

test("auth, permission, billing and invalid requests do not switch models", async () => {
  for (const status of [400, 401, 402, 403, 404]) {
    const client = fake([new Response("error", { status }), success()]);
    await assert.rejects(
      requestOCR({ ...params, fetcher: client.fetcher }),
      new RegExp(String(status)),
    );
    assert.equal(client.bodies.length, 1);
  }
});

test("invalid model response retries without inventing stock data", async () => {
  for (const content of ["not JSON", '{"itens":null}', ""]) {
    const client = fake([
      Response.json({
        status: "completed",
        output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: content }] },
        ],
      }),
      success(),
    ]);
    await requestOCR({ ...params, fetcher: client.fetcher });
    assert.equal(client.bodies.length, 2);
  }
});

test("network failure uses the alternative; two failures stop", async () => {
  const recovered = fake([new TypeError("network"), success()]);
  await requestOCR({ ...params, fetcher: recovered.fetcher });
  assert.equal(recovered.bodies.length, 2);
  const failed = fake([new TypeError("network"), new TypeError("still offline")]);
  await assert.rejects(requestOCR({ ...params, fetcher: failed.fetcher }), /still offline/);
  assert.equal(failed.bodies.length, 2);
});

test("Gateway requests preserve provider-prefixed IDs on both attempts", async () => {
  const client = fake([new Response("temporary", { status: 503 }), success()]);
  await requestOCR({
    ...params,
    endpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
    fetcher: client.fetcher,
  });
  assert.equal(client.bodies[0]?.["model"], "openai/gpt-6-astra");
  assert.equal(client.bodies[1]?.["model"], "openai/gpt-5.6-luna");
});

test("empty valid extraction is returned for manual review, not retried", async () => {
  const client = fake([
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: '{"itens":[]}' }],
        },
      ],
    }),
  ]);
  assert.deepEqual(await requestOCR({ ...params, fetcher: client.fetcher }), { itens: [] });
  assert.equal(client.bodies.length, 1);
});

test("incomplete Responses output retries even when the partial JSON looks valid", async () => {
  const client = fake([
    Response.json({ status: "incomplete", output_text: '{"itens":[]}' }),
    success(),
  ]);
  await requestOCR({ ...params, fetcher: client.fetcher });
  assert.equal(client.bodies.length, 2);
  assert.notEqual(
    client.headers[0]?.get("X-Client-Request-Id"),
    client.headers[1]?.get("X-Client-Request-Id"),
  );
});

test("a model refusal does not invoke an alternative", async () => {
  const client = fake([
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "refusal", refusal: "Cannot analyze" }],
        },
      ],
    }),
    success(),
  ]);
  await assert.rejects(requestOCR({ ...params, fetcher: client.fetcher }), /não pôde analisar/);
  assert.equal(client.bodies.length, 1);
});

test("third-party Chat endpoints keep their previous wire format", async () => {
  const client = fake([Response.json({ choices: [{ message: { content: '{"itens":[]}' } }] })]);
  await requestOCR({
    ...params,
    endpoint: "https://ocr.example.com/v1/chat/completions",
    model: "custom-vision",
    fallbackModel: undefined,
    fetcher: client.fetcher,
  });
  assert.equal(client.urls[0], "https://ocr.example.com/v1/chat/completions");
  assert.ok(Array.isArray(client.bodies[0]?.["messages"]));
  assert.equal(client.bodies[0]?.["input"], undefined);
});

test("OpenAI quota errors at HTTP 429 do not trigger a pointless fallback", async () => {
  const client = fake([
    Response.json({ error: { code: "insufficient_quota" } }, { status: 429 }),
    success(),
  ]);
  await assert.rejects(requestOCR({ ...params, fetcher: client.fetcher }), /créditos/);
  assert.equal(client.bodies.length, 1);
});
