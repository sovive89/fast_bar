import { createServerFn } from "@tanstack/react-start";
import { normalizeOCRPayload } from "./ocr-contract";
import type { OCRItem } from "./ocr-contract";
import { DEFAULT_OCR_MODEL, DEFAULT_OCR_FALLBACK_MODEL, isDirectOpenAI } from "./ocr-model";
import { normalizeProductPhoto, PRODUCT_PHOTO_PROMPT } from "./stock-photo";

type AIResult = {
  ok: boolean;
  message?: string;
  fornecedorNome?: string | null;
  fornecedorDocumento?: string | null;
  numeroNota?: string | null;
  serie?: string | null;
  documentoTipo?: "nfe" | "nfce" | "danfe" | "cupom" | "comprovante" | "outro" | null;
  chaveAcesso?: string | null;
  dataEmissao?: string | null;
  valorTotal?: number | null;
  itens: (Omit<OCRItem, "quantidade" | "valorUnitario"> & {
    quantidade: number | null;
    valorUnitario: number | null;
  })[];
  avisos?: string[];
  confianca?: number | null;
  duplicada?: boolean;
  avisoDuplicidade?: string | null;
};

// O modelo pode ser definido em Conexões ou FASTBAR_OCR_MODEL.
// O padrão OpenAI aceita fotos e PDFs; a revisão humana continua obrigatória.
const PROMPT = `Você é o normalizador de documentos de entrada de estoque de um bar brasileiro.
Leia a imagem ou documento e retorne SOMENTE JSON válido, sem markdown, com este formato:
{
  "documentoTipo": "nfe"|"nfce"|"danfe"|"cupom"|"comprovante"|"outro"|null,
  "fornecedorNome": string|null,
  "fornecedorDocumento": string|null,
  "numeroNota": string|null,
  "serie": string|null,
  "chaveAcesso": string|null,
  "dataEmissao": string|null,
  "valorTotal": number|null,
  "confianca": number,
  "itens": [{"descricao":string,"quantidade":number,"unidade":string,"valorUnitario":number,"lote":string|null,"fabricacao":string|null,"validade":string|null}]
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
- Procure lote, fabricação e validade na linha do produto, na embalagem ou em observações; não
  invente e não aplique um lote de um item a outro. Converta datas para YYYY-MM-DD quando houver
  dia, mês e ano; data parcial deve ser null.
- Diferencie NF-e/XML, DANFE, NFC-e/cupom, recibo/comprovante e documento não fiscal. Um cupom
  pode não ter chave de 44 dígitos; isso não é erro.
- Se o arquivo for PDF, leia todas as páginas visíveis. Se for planilha ou tabela impressa, trate
  cada linha de produto como item e ignore cabeçalhos, totais, descontos, impostos e pagamentos.

O documento pode ser nota fiscal, cupom fiscal (NFC-e), DANFE, comprovante, etiqueta ou planilha
impressa. Extraia somente o que está visível.`;

function validarEndpoint(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const privado =
      host === "localhost" ||
      host === "metadata.google.internal" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (url.protocol !== "https:" || privado) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function chamarIA(data: {
  base64: string;
  mimeType: string;
  fileName?: string | undefined;
  modoLeitura?: "documento" | "produtos" | undefined;
}) {
  const prompt = data.modoLeitura === "produtos" ? PRODUCT_PHOTO_PROMPT : PROMPT;
  const { admin, getDefaultTenantId } = await import("./fastbar.server");
  const tenantId = await getDefaultTenantId();
  const { data: integration } = await admin()
    .from("fastbar_integrations")
    .select("enabled, config")
    .eq("tenant_id", tenantId)
    .eq("key", "ocr_ai")
    .maybeSingle();
  if (integration && !integration.enabled) {
    throw new Error("A conexão OCR está desativada em Conexões.");
  }
  const config = (integration?.config ?? {}) as Record<string, string>;
  const configuredEndpoint = config["endpoint"]?.trim();
  const customEndpoint = configuredEndpoint
    ? validarEndpoint(configuredEndpoint)
    : process.env["FASTBAR_AI_NORMALIZER_URL"];
  if (configuredEndpoint && !customEndpoint) {
    throw new Error("O endpoint OCR precisa ser uma URL HTTPS pública e válida.");
  }
  const customSecret =
    config["apiKey"]?.trim() ||
    (isDirectOpenAI(customEndpoint) ? process.env["OPENAI_API_KEY"] : undefined) ||
    (!configuredEndpoint ? process.env["FASTBAR_AI_NORMALIZER_SECRET"] : undefined);
  const configuredModel = config["model"]?.trim();
  const model = configuredModel || process.env["FASTBAR_OCR_MODEL"] || DEFAULT_OCR_MODEL;
  const fallbackModel = config["fallbackModel"]?.trim() || DEFAULT_OCR_FALLBACK_MODEL;
  const { requestOCR } = await import("./ocr-request.server");

  if (customEndpoint) {
    if (isDirectOpenAI(customEndpoint) && !customSecret) {
      throw new Error("Configure a chave OpenAI em Conexões ou OPENAI_API_KEY no servidor.");
    }
    return requestOCR({
      endpoint: customEndpoint,
      apiKey: customSecret ?? "",
      model,
      fallbackModel: isDirectOpenAI(customEndpoint) ? fallbackModel : undefined,
      prompt,
      data,
    });
  }

  // Em Vercel, VERCEL_OIDC_TOKEN é disponibilizado automaticamente para funções implantadas.
  // Assim o FastBar não precisa de um endpoint de IA próprio nem de segredo exposto no navegador.
  const gatewayToken = process.env["AI_GATEWAY_API_KEY"] || process.env["VERCEL_OIDC_TOKEN"];
  if (!gatewayToken) {
    throw new Error(
      "A IA não está autenticada. No Vercel, habilite o AI Gateway/OIDC ou configure AI_GATEWAY_API_KEY.",
    );
  }

  return requestOCR({
    endpoint: "https://ai-gateway.vercel.sh/v1/responses",
    apiKey: gatewayToken,
    model,
    fallbackModel,
    prompt,
    data,
  });
}

export const normalizarDocumentoEstoqueComIA = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      base64: string;
      mimeType: string;
      fileName?: string | undefined;
      modoLeitura?: "documento" | "produtos" | undefined;
    }) => {
      if (data.modoLeitura !== undefined && !["documento", "produtos"].includes(data.modoLeitura))
        throw new Error("Modo de leitura inválido.");
      if (typeof data.base64 !== "string" || data.base64.length > 4 * 1024 * 1024)
        throw new Error("Envie um arquivo de até 3 MB.");
      if (data.modoLeitura === "produtos" && !/^image\/(jpeg|png|webp)$/.test(data.mimeType))
        throw new Error("Envie uma foto JPEG, PNG ou WebP para identificar produtos.");
      return data;
    },
  )
  .handler(async ({ data }): Promise<AIResult> => {
    const { assertRegisterAccess, admin } = await import("./fastbar.server");
    await assertRegisterAccess();

    try {
      const parsed = await chamarIA(data);
      const normalized =
        data.modoLeitura === "produtos"
          ? normalizeProductPhoto(parsed)
          : normalizeOCRPayload(parsed);
      const itens = normalized.itens;

      const chave = normalized.chaveAcesso;
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
        fornecedorNome: normalized.fornecedorNome,
        fornecedorDocumento: normalized.fornecedorDocumento,
        numeroNota: normalized.numeroNota,
        serie: normalized.serie,
        documentoTipo: normalized.documentoTipo,
        chaveAcesso: chave,
        dataEmissao: normalized.dataEmissao,
        valorTotal: normalized.valorTotal,
        confianca: normalized.confianca,
        itens,
        avisos: "avisos" in normalized ? normalized.avisos : [],
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
