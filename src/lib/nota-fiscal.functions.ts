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

// ============ APRENDIZADO DE CORRESPONDÊNCIA (aliases) ============
// Cada vez que a equipe confirma qual insumo do estoque corresponde a uma descrição de item vinda
// de fora (nota fiscal por QR, foto, planilha), essa correspondência fica guardada -- a próxima
// vez que a MESMA descrição aparecer, de qualquer fonte, a sugestão já vem pronta.

/** Só grava quando a fonte trouxe uma descrição de verdade (linha adicionada manualmente, sem
 * texto original, não tem o que aprender) e o lançamento daquele item teve sucesso -- aprender a
 * partir de um item que falhou arriscaria salvar uma correspondência que a equipe nem chegou a
 * validar de fato (ex.: quantidade inválida barrou antes de confirmar a escolha). */
async function upsertSupplyAliases(
  itens: Array<{ descricaoOriginal?: string | undefined; kind: "base_drink" | "ingredient"; componentId: string }>,
) {
  const { admin } = await import("./fastbar.server");
  const rows = itens
    .filter((item) => item.descricaoOriginal && item.descricaoOriginal.trim().length >= 2)
    .map((item) => ({
      raw_text: item.descricaoOriginal!.trim(),
      component_kind: item.kind,
      component_id: item.componentId,
    }));
  if (rows.length === 0) return;
  // onConflict na coluna gerada (raw_text_normalized) -- upsert atualiza pro componente escolhido
  // mais recentemente pra aquele texto, sem duplicar linha nem exigir um passo de "corrigir alias".
  await admin().from("fastbar_supply_item_aliases").upsert(rows, { onConflict: "raw_text_normalized" });
}

/** Todas as correspondências aprendidas até agora -- o cliente usa como primeira tentativa de
 * casar a descrição de um item externo com um insumo do estoque, antes do casamento por substring
 * (que é só um fallback, bem menos confiável). */
export const getSupplyItemAliases = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { data } = await admin()
    .from("fastbar_supply_item_aliases")
    .select("raw_text_normalized, component_kind, component_id");
  return {
    aliases: (data ?? []).map((row) => ({
      rawTextNormalized: row.raw_text_normalized,
      kind: row.component_kind as "base_drink" | "ingredient",
      componentId: row.component_id,
    })),
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
        descricaoOriginal?: string | undefined;
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
        // A trava já existe -- pode ser de uma tentativa concluída (com sucesso total ou
        // parcial) ou de uma que ainda está no meio do loop de itens logo abaixo. Sem checar
        // todos_itens_ok aqui, um cliente reconciliando uma resposta perdida de rede assumiria
        // sucesso total só pela linha existir, mascarando lançamentos parciais ou incompletos.
        const { data: existente } = await admin()
          .from("fastbar_notas_importadas")
          .select("itens_importados, todos_itens_ok")
          .eq("chave_acesso", data.chave)
          .maybeSingle();
        const todosItensOk = existente?.todos_itens_ok ?? null;
        return {
          ok: false as const,
          code: "ja_importada" as const,
          todosItensOk,
          itensImportados: existente?.itens_importados ?? null,
          itensTotal: data.itens.length,
          message:
            todosItensOk === false
              ? `Essa nota já tinha sido processada, mas só ${existente?.itens_importados ?? 0} de ${data.itens.length} itens foram lançados. Confira o estoque e lance o restante manualmente.`
              : todosItensOk === null
                ? "Essa nota já está sendo processada em outra tentativa -- aguarde alguns segundos e confira o estoque antes de tentar de novo."
                : "Essa nota já foi importada.",
        };
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

    // Aprende só das linhas que de fato lançaram -- ver comentário de upsertSupplyAliases.
    const idsComSucesso = new Set(resultados.filter((r) => r.ok).map((r) => r.componentId));
    await upsertSupplyAliases(
      data.itens.filter((item) => idsComSucesso.has(item.componentId)),
    );

    // Só libera retry se nenhuma chamada de entrada chegou a ser tentada -- aí sim é seguro
    // garantir que não sobrou efeito colateral nenhum (ver comentário acima).
    if (sucessos === 0 && !algumaTentativaFeita) {
      await admin().from("fastbar_notas_importadas").delete().eq("chave_acesso", data.chave);
    } else if (algumaTentativaFeita) {
      // Grava o resultado real do loop -- até aqui a linha só provava "uma tentativa começou"
      // (todos_itens_ok ainda null); sem essa atualização, uma tentativa concorrente que colida
      // com a trava (ver ramo do 23505 acima) nunca saberia se foi sucesso total, parcial, ou se
      // ainda está em andamento.
      await admin()
        .from("fastbar_notas_importadas")
        .update({ itens_importados: sucessos, todos_itens_ok: falhas.length === 0 })
        .eq("chave_acesso", data.chave);
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

// ============ ENTRADA DE ESTOQUE SEM NOTA FISCAL (planilha, futuramente foto) ============
// Mesmo lançamento de sempre (addBaseDrinkEntry/addIngredientEntry), mas sem a trava de chave de
// acesso -- uma planilha ou foto não tem um identificador único de 44 dígitos como a NFC-e, então
// não há uma forma confiável de detectar "essa mesma entrada já foi confirmada antes" aqui. Um
// clique duplo em "Confirmar" duplica a entrada, do mesmo jeito que duplicaria clicando duas vezes
// em "+ Entrada" na tela de estoque -- não é pior que o caminho manual que já existia.

export const confirmarEntradaEstoque = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      origem: string; // rótulo curto pra nota do movimento, ex.: "planilha: notas.xlsx"
      fornecedorId?: string | undefined;
      itens: Array<{
        kind: "base_drink" | "ingredient";
        componentId: string;
        packs: number;
        purchaseCost?: number | undefined;
        descricaoOriginal?: string | undefined;
      }>;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    if (data.itens.length === 0) {
      return { ok: false as const, message: "Adicione ao menos um item antes de confirmar." };
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
                note: `Entrada via ${data.origem}`,
              },
            })
          : await addIngredientEntry({
              data: {
                ingredientId: item.componentId,
                packs: item.packs,
                ...(item.purchaseCost !== undefined ? { purchaseCost: item.purchaseCost } : {}),
                ...(data.fornecedorId ? { supplierId: data.fornecedorId } : {}),
                note: `Entrada via ${data.origem}`,
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

    const idsComSucesso = new Set(resultados.filter((r) => r.ok).map((r) => r.componentId));
    await upsertSupplyAliases(data.itens.filter((item) => idsComSucesso.has(item.componentId)));

    return {
      ok: falhas.length === 0,
      resultados,
      message:
        falhas.length > 0
          ? `${sucessos} de ${resultados.length} itens lançados. Os demais falharam -- confira o estoque e lance manualmente pela tela de estoque o que faltar.`
          : undefined,
    };
  });

// ============ LEITURA DE PLANILHA (.xlsx / .xls / .csv) ============

type LinhaArquivo = { descricao: string; quantidade: number; unidade: string; valorUnitario: number };

const CABECALHO_NOME = /produto|descri|item|nome/i;
const CABECALHO_QTD = /qtd|quant/i;
const CABECALHO_UNIDADE = /^un$|^und$|unidade/i;
const CABECALHO_VALOR_UNIT = /valor.*unit|pre[cç]o.*unit|vl.*unit|unit[aá]rio/i;
const CABECALHO_VALOR_GENERICO = /valor|pre[cç]o/i;

/**
 * Acha a linha de cabeçalho (primeira com uma coluna de nome + uma de quantidade reconhecíveis) e
 * lê as linhas seguintes como itens. Layout de planilha de fornecedor varia muito -- por isso é
 * heurístico, igual ao parser de HTML da nota fiscal: quando não acha as colunas certas, devolve
 * erro claro em vez de itens errados; quando acha, campos que não bateram (unidade, valor) ficam
 * com um valor neutro e a equipe completa na tela de confirmação.
 */
export const parseSupplyFile = createServerFn({ method: "POST" })
  .inputValidator((data: { fileName: string; base64: string }) => data)
  .handler(
    async ({ data }): Promise<{ ok: true; itens: LinhaArquivo[] } | { ok: false; message: string }> => {
      const { assertRegisterAccess } = await import("./fastbar.server");
      await assertRegisterAccess();

      let buffer: Buffer;
      try {
        buffer = Buffer.from(data.base64, "base64");
      } catch {
        return { ok: false, message: "Arquivo inválido." };
      }
      if (buffer.length === 0) return { ok: false, message: "Arquivo vazio." };
      if (buffer.length > 5 * 1024 * 1024) {
        return { ok: false, message: "Arquivo muito grande (máximo 5MB)." };
      }

      const XLSX = await import("xlsx");
      let sheetRows: unknown[][];
      try {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
        if (!sheet) return { ok: false, message: "Nenhuma planilha encontrada no arquivo." };
        sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
      } catch {
        return {
          ok: false,
          message:
            "Não consegui ler esse arquivo -- confirme que é uma planilha (.xlsx, .xls ou .csv) válida.",
        };
      }

      // Procura nas primeiras 20 linhas -- planilha exportada às vezes tem linhas em branco ou um
      // título da empresa antes do cabeçalho de verdade.
      let headerIndex = -1;
      let colNome = -1;
      let colQtd = -1;
      let colUnidade = -1;
      let colValor = -1;
      for (let i = 0; i < Math.min(sheetRows.length, 20); i++) {
        const row = sheetRows[i] ?? [];
        const nome = row.findIndex((cell) => CABECALHO_NOME.test(String(cell ?? "")));
        const qtd = row.findIndex((cell) => CABECALHO_QTD.test(String(cell ?? "")));
        if (nome >= 0 && qtd >= 0) {
          headerIndex = i;
          colNome = nome;
          colQtd = qtd;
          colUnidade = row.findIndex((cell) => CABECALHO_UNIDADE.test(String(cell ?? "").trim()));
          colValor = row.findIndex((cell) => CABECALHO_VALOR_UNIT.test(String(cell ?? "")));
          if (colValor < 0) {
            colValor = row.findIndex((cell) => CABECALHO_VALOR_GENERICO.test(String(cell ?? "")));
          }
          break;
        }
      }
      if (headerIndex < 0) {
        return {
          ok: false,
          message:
            'Não encontrei colunas de produto e quantidade nesse arquivo -- confira se a primeira linha tem os nomes das colunas (ex.: "Produto", "Quantidade", "Valor unitário").',
        };
      }

      const itens: LinhaArquivo[] = [];
      for (let i = headerIndex + 1; i < sheetRows.length; i++) {
        const row = sheetRows[i] ?? [];
        const descricao = String(row[colNome] ?? "").trim();
        if (!descricao) continue;
        const quantidade = parseNumeroBr(String(row[colQtd] ?? "")) ?? 0;
        const unidade = colUnidade >= 0 ? String(row[colUnidade] ?? "").trim() || "un" : "un";
        const valorUnitario = colValor >= 0 ? (parseNumeroBr(String(row[colValor] ?? "")) ?? 0) : 0;
        itens.push({ descricao, quantidade, unidade, valorUnitario });
      }

      if (itens.length === 0) {
        return { ok: false, message: "Não encontrei nenhum item com nome preenchido nas linhas do arquivo." };
      }

      return { ok: true, itens };
    },
  );
