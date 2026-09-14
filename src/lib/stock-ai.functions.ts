import { createServerFn } from "@tanstack/react-start";

type AIItem = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
};

type AIResult = {
  ok: boolean;
  message?: string;
  fornecedorNome?: string | null;
  fornecedorDocumento?: string | null;
  numeroNota?: string | null;
  chaveAcesso?: string | null;
  dataEmissao?: string | null;
  valorTotal?: number | null;
  itens: AIItem[];
  confianca?: number | null;
  duplicada?: boolean;
  avisoDuplicidade?: string | null;
};

/**
 * Modelo usado na leitura. Trocável por variável de ambiente (FASTBAR_OCR_MODEL) porque "qual
 * modelo lê melhor" só se responde testando contra nota de verdade do fornecedor do bar — cupom
 * amassado, impressão fraca, foto torta — e não contra benchmark de blog.
 *
 * Alternativas já verificadas no catálogo do gateway, da mais barata pra mais cara:
 *   google/gemini-3.8-flash      $0,75/M entrada  (padrão — geração mais nova do mesmo modelo)
 *   openai/gpt-5                 $1,25/M
 *   google/gemini-3.1-pro-preview $2,00/M
 *   anthropic/claude-sonnet-5    $2,00/M
 *
 * A diferença de custo entre elas é irrelevante aqui: uma nota gasta ~2 mil tokens de entrada, o
 * que dá menos de dois centavos por documento no mais caro da lista. Num bar que recebe 20 notas
 * por mês, escolher pelo preço é otimizar o que não custa — escolha por acerto.
 *
 * (Declarando o óbvio: quem escreveu este comentário é o Claude, então tome a menção ao
 * claude-sonnet-5 com o desconto devido e teste você mesmo.)
 */
const MODELO_PADRAO = "google/gemini-3.8-flash";

const PROMPT = `Você é o normalizador de documentos de entrada de estoque de um bar brasileiro.
Leia a imagem ou documento e retorne SOMENTE JSON válido, sem markdown, com este formato:
{
  "fornecedorNome": string|null,
  "fornecedorDocumento": string|null,
  "numeroNota": string|null,
  "chaveAcesso": string|null,
  "dataEmissao": string|null,
  "valorTotal": number|null,
  "confianca": number,
  "itens": [{"descricao":string,"quantidade":number,"unidade":string,"valorUnitario":number}]
}

REGRAS:
- Não invente dados. Campo ilegível ou ausente = null. É melhor null do que um palpite.
- "confianca" é de 0 a 1 e deve refletir a legibilidade REAL do documento. Foto tremida, impressão
  fraca ou papel amassado = confiança baixa. Não infle esse número.

NÚMEROS (documento brasileiro):
- O separador decimal no papel é a VÍRGULA e o de milhar é o PONTO: "1.234,56" são mil duzentos e
  trinta e quatro reais e cinquenta e seis centavos. No JSON, converta para ponto decimal: 1234.56.
- "valorUnitario" é o preço de UMA unidade, não o total da linha. Em cupom costuma aparecer como
  "VL UNIT", "V.UNIT" ou "UNIT"; o total da linha aparece como "VL TOTAL" ou à direita. Se só o
  total da linha estiver legível, divida pela quantidade.

CHAVE DE ACESSO:
- Se aparecer uma sequência de 44 dígitos (costuma vir quebrada em grupos de 4, embaixo do código
  de barras ou perto do QR code), junte todos os dígitos e devolva em "chaveAcesso". Esse campo
  vale muito: com ele o sistema consulta a nota na fonte oficial em vez de depender desta leitura.

ITENS:
- A descrição de um item pode quebrar em duas linhas no cupom — junte antes de devolver.
- Ignore linhas que não são produto: subtotal, desconto, troco, forma de pagamento, tributos.
- Preserve a unidade como está no papel (UN, CX, KG, FD, PC, L).

O documento pode ser nota fiscal, cupom fiscal (NFC-e), DANFE, comprovante, etiqueta ou planilha
impressa. Extraia somente o que está visível.`;

function parseAIText(text: string): Partial<AIResult> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as Partial<AIResult>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as Partial<AIResult>;
    }
    throw new Error("Resposta da IA não contém JSON válido.");
  }
}

async function chamarIA(data: { base64: string; mimeType: string; fileName?: string | undefined }) {
  const customEndpoint = process.env["FASTBAR_AI_NORMALIZER_URL"];
  const customSecret = process.env["FASTBAR_AI_NORMALIZER_SECRET"];

  if (customEndpoint) {
    const response = await fetch(customEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(customSecret ? { Authorization: `Bearer ${customSecret}` } : {}),
      },
      body: JSON.stringify({
        mimeType: data.mimeType,
        base64: data.base64,
        fileName: data.fileName ?? null,
        prompt: PROMPT,
      }),
    });
    if (!response.ok) throw new Error(`O serviço de IA respondeu HTTP ${response.status}.`);
    return (await response.json()) as Partial<AIResult>;
  }

  // Em Vercel, VERCEL_OIDC_TOKEN é disponibilizado automaticamente para funções implantadas.
  // Assim o FastBar não precisa de um endpoint de IA próprio nem de segredo exposto no navegador.
  const gatewayToken = process.env["AI_GATEWAY_API_KEY"] || process.env["VERCEL_OIDC_TOKEN"];
  if (!gatewayToken) {
    throw new Error(
      "A IA não está autenticada. No Vercel, habilite o AI Gateway/OIDC ou configure AI_GATEWAY_API_KEY.",
    );
  }

  const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({
      model: process.env["FASTBAR_OCR_MODEL"] || MODELO_PADRAO,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${data.mimeType};base64,${data.base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      temperature: 0,
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`O Vercel AI Gateway respondeu HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : "."}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((part) => part.text ?? "").join("")
    : content;
  if (!text) throw new Error("A IA não retornou conteúdo para o documento.");
  return parseAIText(text);
}

export const normalizarDocumentoEstoqueComIA = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { base64: string; mimeType: string; fileName?: string | undefined }) => data,
  )
  .handler(async ({ data }): Promise<AIResult> => {
    const { assertRegisterAccess, admin } = await import("./fastbar.server");
    await assertRegisterAccess();

    try {
      const parsed = await chamarIA(data);
      const itens = Array.isArray(parsed.itens)
        ? parsed.itens.filter(
            (item): item is AIItem =>
              !!item &&
              typeof item === "object" &&
              typeof (item as AIItem).descricao === "string" &&
              Number.isFinite(Number((item as AIItem).quantidade)),
          )
        : [];

      const chave =
        typeof parsed.chaveAcesso === "string" ? parsed.chaveAcesso.replace(/\D/g, "") : null;
      let duplicada = false;
      let avisoDuplicidade: string | null = null;
      if (chave && /^\d{44}$/.test(chave)) {
        const { data: existente } = await admin()
          .from("fastbar_notas_importadas")
          .select("id, created_at")
          .eq("chave_acesso", chave)
          .maybeSingle();
        if (existente) {
          duplicada = true;
          avisoDuplicidade = `A nota com chave ${chave} já foi importada em ${new Date(existente.created_at).toLocaleString("pt-BR")}.`;
        }
      }

      return {
        ok: true,
        fornecedorNome: parsed.fornecedorNome ?? null,
        fornecedorDocumento: parsed.fornecedorDocumento ?? null,
        numeroNota: parsed.numeroNota ?? null,
        chaveAcesso: chave,
        dataEmissao: parsed.dataEmissao ?? null,
        valorTotal: typeof parsed.valorTotal === "number" ? parsed.valorTotal : null,
        confianca: typeof parsed.confianca === "number" ? parsed.confianca : null,
        itens,
        duplicada,
        avisoDuplicidade,
      };
    } catch (error) {
      return {
        ok: false,
        itens: [],
        message: error instanceof Error ? error.message : "Não foi possível consultar a IA agora.",
      };
    }
  });
