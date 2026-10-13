/** Resolve credentials on the server; an OpenAI key must never be sent to the Gateway. */
export function resolveOCRConnection(options: {
  endpoint?: string | undefined;
  apiKey?: string | undefined;
  normalizerEndpoint?: string | undefined;
  normalizerSecret?: string | undefined;
  openaiKey?: string | undefined;
  gatewayKey?: string | undefined;
  oidcToken?: string | undefined;
}) {
  const endpoint = options.endpoint?.trim() || options.normalizerEndpoint?.trim();
  const savedKey = options.apiKey?.trim();
  const openaiKey = options.openaiKey?.trim();
  if (endpoint) {
    const host = new URL(endpoint).hostname;
    const directOpenAI = host === "api.openai.com";
    const gateway = host === "ai-gateway.vercel.sh";
    return {
      endpoint,
      apiKey:
        savedKey ||
        (directOpenAI ? openaiKey : undefined) ||
        (gateway ? options.gatewayKey?.trim() || options.oidcToken?.trim() : undefined) ||
        (!options.endpoint?.trim() ? options.normalizerSecret?.trim() : undefined) ||
        "",
      fallback: directOpenAI || gateway,
    };
  }
  if (savedKey || openaiKey) {
    return {
      endpoint: "https://api.openai.com/v1/responses",
      apiKey: savedKey || openaiKey || "",
      fallback: true,
    };
  }
  return {
    endpoint: "https://ai-gateway.vercel.sh/v1/responses",
    apiKey: options.gatewayKey?.trim() || options.oidcToken?.trim() || "",
    fallback: true,
  };
}
