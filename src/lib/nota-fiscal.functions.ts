import { createServerFn } from "@tanstack/react-start";
import { addBaseDrinkEntry, addIngredientEntry } from "./base-drinks.functions";

const UF_POR_CODIGO: Record<string, string> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};

function extrairChave(qrUrl: string): string | null {
  const match = qrUrl.match(/\d{44}/);
  return match ? match[0] : null;
}

function parseNumeroBr(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3},)/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

type ItemLido = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
};

/**
 * Layout de consulta pública da NFC-e (id="tabResult", spans .txtTit/.Rqtd/.RUN/.RvlUnit) é o
 * mesmo herdado do SEFAZ Virtual (SVRS) e replicado por praticamente todo estado -- por isso
 * tentamos ele primeiro. Nem todo portal segue à risca, então isso pode voltar lista vazia; nesse
 * caso a tela deixa a equipe completar os itens à mão, só aproveitando a chave/valor já lidos.
 */
async function parseItens(html: string): Promise<ItemLido[]> {
  const { parse } = await import("node-html-parser");
  const root = parse(html);
  const itens: ItemLido[] = [];

  const linhas = root.querySelectorAll("#tabResult tr, .table tr, table tr");
  for (const linha of linhas) {
    const nomeEl = linha.querySelector(".txtTit");
    if (!nomeEl) continue;
    const descricao = nomeEl.text.trim();
    if (descricao.length < 2) continue;

    const qtdText = linha.querySelector(".Rqtd, .qtd")?.text ?? "";
    const unText = linha.querySelector(".RUN, .un")?.text ?? "";
    const valorUnitText = linha.querySelector(".RvlUnit, .vl_unit")?.text ?? "";

    const quantidade = parseNumeroBr(qtdText);
    const valorUnitario = parseNumeroBr(valorUnitText);
    const unidade = unText.replace(/UN:?/i, "").trim() || "un";

    if (quantidade && quantidade > 0) {
      itens.push({ descricao, quantidade, unidade, valorUnitario: valorUnitario ?? 0 });
    }
  }

  return itens;
}

async function parseEmitente(html: string): Promise<{ nome: string | null; documento: string | null }> {
  const { parse } = await import("node-html-parser");
  const root = parse(html);
  const nome = root.querySelector("#u20, .txtTopo, .identif strong")?.text?.trim() ?? null;
  const bodyText = root.text;
  const cnpjMatch = bodyText.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  return { nome, documento: cnpjMatch ? cnpjMatch[0] : null };
}

type LookupResult =
  | {
      ok: true;
      chave: string;
      uf: string | null;
      emitenteNome: string | null;
      emitenteDocumento: string | null;
      valorTotal: number | null;
      itens: ItemLido[];
      avisoItensVazios: boolean;
    }
  | { ok: false; message: string; code?: string };

export const lookupNotaFiscal = createServerFn({ method: "POST" })
  .inputValidator((data: { qrUrl: string }) => data)
  .handler(async ({ data }): Promise<LookupResult> => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const qrUrl = data.qrUrl.trim();
    if (!/^https?:\/\//i.test(qrUrl)) {
      return { ok: false, message: "QR code não parece ser de uma nota fiscal (não é uma URL)." };
    }

    const chave = extrairChave(qrUrl);
    if (!chave) {
      return { ok: false, message: "Não encontrei a chave de acesso (44 dígitos) nesse QR code." };
    }

    const { data: jaImportada } = await admin()
      .from("fastbar_notas_importadas")
      .select("id, created_at")
      .eq("chave_acesso", chave)
      .maybeSingle();
    if (jaImportada) {
      return {
        ok: false,
        code: "ja_importada",
        message: `Essa nota já foi importada em ${new Date(jaImportada.created_at).toLocaleString("pt-BR")}.`,
      };
    }

    const uf = UF_POR_CODIGO[chave.slice(0, 2)] ?? null;

    let html: string;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(qrUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      });
      clearTimeout(timeout);
      if (!response.ok) {
        return {
          ok: false,
          message: `O portal da SEFAZ (${uf ?? "?"}) respondeu com erro (${response.status}). A chave é ${chave}; adicione os itens manualmente.`,
        };
      }
      html = await response.text();
    } catch {
      return {
        ok: false,
        message: `Não consegui acessar o portal da SEFAZ agora. A chave é ${chave}; adicione os itens manualmente.`,
      };
    }

    const itens = await parseItens(html);
    const emitente = await parseEmitente(html);
    const valorTotalMatch = html.match(/Valor total R\$[^\d]*([\d.,]+)/i);
    const valorTotal = valorTotalMatch ? parseNumeroBr(valorTotalMatch[1]) : null;

    return {
      ok: true,
      chave,
      uf,
      emitenteNome: emitente.nome,
      emitenteDocumento: emitente.documento,
      valorTotal,
      itens,
      avisoItensVazios: itens.length === 0,
    };
  });

export const confirmarNotaFiscal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      chave: string;
      uf?: string | undefined;
      emitenteNome?: string | undefined;
      emitenteDocumento?: string | undefined;
      valorTotal?: number | undefined;
      fornecedorId?: string | undefined;
      itens: Array<{
        kind: "base_drink" | "ingredient";
        componentId: string;
        packs: number;
        purchaseCost?: number | undefined;
      }>;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    if (!/^\d{44}$/.test(data.chave)) {
      return { ok: false as const, message: "Chave de acesso inválida." };
    }
    if (data.itens.length === 0) {
      return { ok: false as const, message: "Adicione ao menos um item antes de confirmar." };
    }

    // Trava a nota primeiro -- índice único em chave_acesso rejeita uma segunda confirmação da
    // mesma nota (câmera lendo de novo, duas pessoas confirmando ao mesmo tempo) antes de lançar
    // qualquer entrada de estoque.
    const { error: insertError } = await admin().from("fastbar_notas_importadas").insert({
      chave_acesso: data.chave,
      uf: data.uf || null,
      emitente_nome: data.emitenteNome || null,
      emitente_documento: data.emitenteDocumento || null,
      valor_total: data.valorTotal ?? null,
      itens_importados: data.itens.length,
    });
    if (insertError) {
      if (insertError.code === "23505") {
        return { ok: false as const, message: "Essa nota já foi importada." };
      }
      return { ok: false as const, message: "Não foi possível registrar a nota." };
    }

    const resultados: Array<{ componentId: string; ok: boolean; message?: string }> = [];
    for (const item of data.itens) {
      if (!Number.isInteger(item.packs) || item.packs <= 0) {
        resultados.push({ componentId: item.componentId, ok: false, message: "Quantidade inválida." });
        continue;
      }
      const result =
        item.kind === "base_drink"
          ? await addBaseDrinkEntry({
              data: {
                baseDrinkId: item.componentId,
                packs: item.packs,
                ...(item.purchaseCost !== undefined ? { purchaseCost: item.purchaseCost } : {}),
                ...(data.fornecedorId ? { supplierId: data.fornecedorId } : {}),
                note: `Entrada via nota fiscal ${data.chave}`,
              },
            })
          : await addIngredientEntry({
              data: {
                ingredientId: item.componentId,
                packs: item.packs,
                ...(item.purchaseCost !== undefined ? { purchaseCost: item.purchaseCost } : {}),
                ...(data.fornecedorId ? { supplierId: data.fornecedorId } : {}),
                note: `Entrada via nota fiscal ${data.chave}`,
              },
            });
      resultados.push(
        result.ok
          ? { componentId: item.componentId, ok: true }
          : { componentId: item.componentId, ok: false, message: result.message ?? "Falha ao registrar." },
      );
    }

    const falhas = resultados.filter((r) => !r.ok);
    return {
      ok: falhas.length === 0,
      resultados,
      message:
        falhas.length > 0
          ? `${resultados.length - falhas.length} de ${resultados.length} itens lançados. Alguns falharam.`
          : undefined,
    };
  });
