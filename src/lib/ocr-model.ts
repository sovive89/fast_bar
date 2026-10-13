import { documentPart } from "./stock-ocr.ts";

// Verified in the AI Gateway model catalog: image, PDF and structured-output support.
export const DEFAULT_OCR_MODEL = "openai/gpt-4.1";

export function isDirectOpenAI(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  try {
    return new URL(endpoint).hostname === "api.openai.com";
  } catch {
    return false;
  }
}

/** Gateway IDs carry a provider prefix; the direct OpenAI API expects the native ID. */
export function createOCRRequest(params: {
  model?: string | undefined;
  endpoint?: string | null | undefined;
  prompt: string;
  data: { base64: string; mimeType: string; fileName?: string | undefined };
}) {
  const selected = params.model?.trim() || DEFAULT_OCR_MODEL;
  const direct = isDirectOpenAI(params.endpoint);
  if (direct && selected.includes("/") && !selected.startsWith("openai/")) {
    throw new Error("Para o endpoint OpenAI, selecione um modelo OpenAI, como gpt-4.1.");
  }
  const model = direct
    ? selected.replace(/^openai\//, "")
    : !params.endpoint && !selected.includes("/")
      ? `openai/${selected}`
      : selected;
  const openAI = direct || model.startsWith("openai/");
  // GPT-5 and reasoning models reject a custom temperature. Omitting it also supports
  // models with a different parameter set when the operator changes the configuration.
  const reasoning = /^(?:openai\/)?(?:gpt-5|o[134])(?:[.-]|$)/.test(model);
  return {
    model,
    messages: [
      { role: "user", content: [{ type: "text", text: params.prompt }, documentPart(params.data)] },
    ],
    ...(reasoning ? {} : { temperature: 0 }),
    ...(openAI ? { response_format: { type: "json_object" } } : {}),
    stream: false,
  };
}
