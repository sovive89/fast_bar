import { createServerFn } from "@tanstack/react-start";

/**
 * Interpretação de métricas já calculadas — nunca cálculo. A IA recebe um resumo de números que o
 * próprio FastBar já computou de forma determinística (faturamento, CMV, segmentos, desperdício,
 * retenção...) e só produz uma explicação em texto. Ela nunca vê tabela crua, nunca soma nada,
 * nunca inventa um número que não veio no resumo — isso é regra do prompt de sistema, não sugestão.
 *
 * Mesmo padrão de todo server function do projeto: gate atrás da senha do caixa
 * (assertRegisterAccess), nada de rota pública sem autenticação.
 *
 * Esse projeto (TanStack Start nesta versão) não tem rota HTTP de path fixo estilo Express —
 * o único padrão de backend existente é server function (RPC via createServerFn), chamada do
 * client com useServerFn(analyzeMetrics). Não existe "POST /analytics/analyze" endereçável por
 * um cliente HTTP arbitrário; quem chama isso é sempre código React deste app.
 */
export const analyzeMetrics = createServerFn({ method: "POST" })
  .inputValidator((data: { metrics: Record<string, unknown>; question?: string | undefined }) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("@/lib/fastbar.server");
    await assertRegisterAccess();

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return { success: false as const, error: "OPENAI_API_KEY não configurada no ambiente." };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Você interpreta métricas de um bar que já foram calculadas por código, nunca por você. " +
              "Regras: (1) use só os números do JSON recebido, nunca invente ou recalcule nada; " +
              "(2) se um dado necessário não estiver no JSON, diga que falta o dado em vez de estimar; " +
              "(3) responda em português, direto, sem jargão técnico, como se estivesse explicando pro dono do bar; " +
              "(4) no máximo um parágrafo curto, a menos que a pergunta peça mais detalhe.",
          },
          {
            role: "user",
            content: JSON.stringify({ metrics: data.metrics, question: data.question ?? null }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return { success: false as const, error: `OpenAI respondeu ${response.status}.` };
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = json.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return { success: false as const, error: "Resposta da OpenAI veio vazia." };
    }

    return { success: true as const, answer };
  });
