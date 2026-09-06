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
 * Normalização de documentos por IA fica atrás de um endpoint configurável para não expor segredo
 * no navegador e para permitir trocar o provedor sem alterar o fluxo do estoque.
 * O endpoint deve receber { mimeType, base64, prompt } e devolver o JSON normalizado diretamente.
 */
export const normalizarDocumentoEstoqueComIA = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { base64: string; mimeType: string; fileName?: string | undefined }) => data,
  )
  .handler(async ({ data }): Promise<AIResult> => {
    const { assertRegisterAccess, admin } = await import("./fastbar.server");
    await assertRegisterAccess();

    const endpoint = process.env.FASTBAR_AI_NORMALIZER_URL;
    const secret = process.env.FASTBAR_AI_NORMALIZER_SECRET;
    if (!endpoint) {
      return {
        ok: false,
        itens: [],
        message:
          "O normalizador de IA não está configurado no servidor. Configure FASTBAR_AI_NORMALIZER_URL nas variáveis do FastBar.",
      };
    }

    const prompt = `Você é o normalizador de documentos de entrada de estoque do FastBar.
Leia a imagem/documento e retorne SOMENTE JSON válido, sem markdown, com este formato:
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
Não invente dados. Se um campo não estiver legível, use null. Preserve quantidade e unidade exatamente como aparecem. Use ponto decimal nos números.`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({
          mimeType: data.mimeType,
          base64: data.base64,
          fileName: data.fileName ?? null,
          prompt,
        }),
      });
      if (!response.ok) {
        return { ok: false, itens: [], message: `O serviço de IA respondeu HTTP ${response.status}.` };
      }

      const parsed = (await response.json()) as Partial<AIResult>;
      const itens = Array.isArray(parsed.itens)
        ? parsed.itens.filter(
            (item): item is AIItem =>
              !!item &&
              typeof item === "object" &&
              typeof (item as AIItem).descricao === "string" &&
              Number.isFinite(Number((item as AIItem).quantidade)),
          )
        : [];

      const chave = typeof parsed.chaveAcesso === "string" ? parsed.chaveAcesso.replace(/\D/g, "") : null;
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
    } catch {
      return { ok: false, itens: [], message: "Não foi possível consultar o serviço de IA agora." };
    }
  });
