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

/** Todo portal de consulta de NFC-e roda sob um domínio .gov.br -- sem essa checagem, um QR code
 * malicioso poderia apontar o fetch do servidor pra qualquer URL arbitrária (SSRF), inclusive
 * endereços internos. Revalidada a cada redirecionamento, não só na URL original. */
function isTrustedSefazHost(hostname: string): boolean {
  return /(^|\.)gov\.br$/i.test(hostname);
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

type FetchNotaFiscalResult =
  | { ok: true; html: string }
  | { ok: false; code: "untrusted_host" | "network"; message: string };

/** Busca a página do portal da SEFAZ seguindo redirecionamentos manualmente (pra revalidar o
 * domínio a cada salto) sob um único prazo de 15s pra chamada inteira -- um `AbortController` novo
 * por redirecionamento deixaria 5 saltos lentos somarem até 75s, e mantém esse prazo cobrindo a
 * leitura do corpo da resposta, não só os headers, pro portal não poder travar a leitura depois de
 * responder. */
async function fetchNotaFiscalHtml(startUrl: string): Promise<FetchNotaFiscalResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let currentUrl = startUrl;
    for (let hop = 0; hop < 5; hop++) {
      let url: URL;
      try {
        url = new URL(currentUrl);
      } catch {
        return { ok: false, code: "untrusted_host", message: "URL do QR code inválida." };
      }
      if (!/^https?:$/.test(url.protocol) || !isTrustedSefazHost(url.hostname)) {
        return {
          ok: false,
          code: "untrusted_host",
          message: "URL fora do domínio oficial da SEFAZ (.gov.br) -- recusada por segurança.",
        };
      }

      try {
        const response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: "manual",
          headers: { "User-Agent": USER_AGENT },
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) {
            return { ok: false, code: "network", message: "Redirecionamento inválido do portal da SEFAZ." };
          }
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
        if (!response.ok) {
          return { ok: false, code: "network", message: `status_${response.status}` };
        }
        const html = await response.text();
        return { ok: true, html };
      } catch {
        return { ok: false, code: "network", message: "network_error" };
      }
    }
    return { ok: false, code: "network", message: "Muitos redirecionamentos no portal da SEFAZ." };
  } finally {
    clearTimeout(timeout);
  }
}

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
  | { ok: false; message: string; code?: string; chave?: string; uf?: string | null };

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

    const fetched = await fetchNotaFiscalHtml(qrUrl);
    if (!fetched.ok) {
      // URL fora do domínio oficial não é "portal indisponível" -- não habilita o fallback manual
      // com essa chave, porque a chave nem veio de uma fonte confiável pra começo de conversa.
      if (fetched.code === "untrusted_host") {
        return { ok: false, code: "url_nao_confiavel", message: fetched.message };
      }
      return {
        ok: false,
        code: "portal_indisponivel",
        chave,
        uf,
        message: `Não consegui acessar o portal da SEFAZ agora. A chave é ${chave}; adicione os itens manualmente.`,
      };
    }
    const html = fetched.html;

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

    // addBaseDrinkEntry/addIngredientEntry gravam o movimento e só depois atualizam o estoque em
    // updates separados (não é uma transação só) -- se o movimento gravar e a atualização do
    // estoque falhar depois, a função retorna ok:false mas já deixou rastro. Por isso a trava só
    // pode ser removida se NENHUM item chegou a de fato chamar essas funções (só reprovou na
    // validação daqui, sem nenhum efeito colateral possível); se alguma chamada foi tentada e
    // falhou, mantemos a trava mesmo com zero sucesso, porque não dá pra garantir que não sobrou
    // um movimento órfão.
    let algumaTentativaFeita = false;
    const resultados: Array<{ componentId: string; ok: boolean; message?: string }> = [];
    for (const item of data.itens) {
      if (!Number.isInteger(item.packs) || item.packs <= 0) {
        resultados.push({ componentId: item.componentId, ok: false, message: "Quantidade inválida." });
        continue;
      }
      algumaTentativaFeita = true;
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
    const sucessos = resultados.length - falhas.length;

    // Só libera retry se nenhuma chamada de entrada chegou a ser tentada -- aí sim é seguro
    // garantir que não sobrou efeito colateral nenhum (ver comentário acima).
    if (sucessos === 0 && !algumaTentativaFeita) {
      await admin().from("fastbar_notas_importadas").delete().eq("chave_acesso", data.chave);
    }

    return {
      ok: falhas.length === 0,
      resultados,
      message:
        falhas.length > 0
          ? sucessos === 0 && !algumaTentativaFeita
            ? `Nenhum item foi lançado. Corrija e tente de novo.`
            : `${sucessos} de ${resultados.length} itens lançados. Os demais falharam -- confira o estoque e lance manualmente pela tela de estoque o que faltar.`
          : undefined,
    };
  });
