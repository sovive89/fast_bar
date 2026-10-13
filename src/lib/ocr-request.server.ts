import { createOCRRequest } from "./ocr-model.ts";
import { parseOCRText } from "./ocr-contract.ts";

class OCRRequestError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

/** At most two model attempts; the alternative never writes stock or replaces operator review. */
export async function requestOCR(params: {
  endpoint: string;
  apiKey: string;
  model: string;
  fallbackModel?: string | undefined;
  prompt: string;
  data: { base64: string; mimeType: string; fileName?: string | undefined };
  fetcher?: typeof fetch;
}) {
  const models = [params.model];
  if (params.fallbackModel && params.fallbackModel !== params.model)
    models.push(params.fallbackModel);
  const fetcher = params.fetcher ?? fetch;
  for (const [index, model] of models.entries()) {
    // Request validation errors (e.g. a wrong provider at api.openai.com) are not retried.
    const body = createOCRRequest({
      model,
      endpoint:
        params.endpoint === "https://ai-gateway.vercel.sh/v1/chat/completions"
          ? undefined
          : params.endpoint,
      prompt: params.prompt,
      data: params.data,
    });
    try {
      const response = await fetcher(params.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new OCRRequestError(
          `O serviço OCR respondeu HTTP ${response.status}.`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      const text = Array.isArray(content)
        ? content.map((part) => part.text ?? "").join("")
        : content;
      if (!text) throw new OCRRequestError("A IA não retornou conteúdo para leitura.", true);
      const parsed = parseOCRText(text);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !Array.isArray(parsed["itens"])
      ) {
        throw new OCRRequestError("A IA retornou uma lista de itens inválida.", true);
      }
      return parsed;
    } catch (error) {
      const retryable = !(error instanceof OCRRequestError) || error.retryable;
      if (!retryable || index === models.length - 1) throw error;
    }
  }
  throw new Error("Não foi possível ler o documento.");
}
