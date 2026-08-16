import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeMetrics(
  metrics: unknown,
  question: string
) {
  const response = await openai.responses.create({
    model: process.env.LLM_MODEL || "gpt-5",
    instructions: `
Você é o analista de inteligência do FlashBar.

Analise somente os dados fornecidos pelo sistema.
Não invente números, fatos ou causas.
Não faça suposições que não possam ser sustentadas pelos dados.
Se os dados forem insuficientes, diga explicitamente que não há dados suficientes.

Responda de forma objetiva, técnica e clara.
Explique tendências, variações, anomalias e possíveis relações entre os indicadores.
Diferencie claramente fato observado de hipótese.
`,
    input: `
Pergunta do usuário:
${question}

Dados estatísticos calculados pelo FlashBar:
${JSON.stringify(metrics, null, 2)}
`,
  });

  return response.output_text;
}
