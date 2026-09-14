import { createServerFn } from "@tanstack/react-start";

/**
 * NORMALIZADOR ÚNICO DE DOCUMENTO DE ENTRADA DE ESTOQUE (parte 6 do escopo).
 *
 * O problema que isso resolve: até aqui cada formato de documento tinha a sua própria função, com
 * a sua própria forma de resposta, e quem chamava precisava saber de antemão qual usar e depois
 * traduzir três formatos diferentes na mão:
 *
 *   - QR code / chave de acesso -> lookupNotaFiscal      (nota-fiscal.functions.ts)
 *   - planilha .xlsx/.xls/.csv  -> parseSupplyFile       (nota-fiscal.functions.ts)
 *   - foto / imagem / PDF       -> normalizarDocumentoEstoqueComIA (stock-ai.functions.ts)
 *   - XML da NF-e               -> não existia
 *
 * Aqui o documento entra por UMA porta só (`normalizarDocumentoEstoque`), o formato é detectado
 * pelo conteúdo (não pela confiança no nome do arquivo), a leitura é delegada para a perna certa —
 * as três que já existiam são reaproveitadas como estão, nada foi duplicado — e a resposta sai
 * sempre no MESMO formato, com o fornecedor já identificado contra o cadastro.
 *
 * A perna nova é a do XML da NF-e, que faltava. As outras três continuam exportadas e funcionando
 * sozinhas: isto é uma camada por cima, não uma substituição.
 *
 * O que esta camada deliberadamente NÃO faz: gravar qualquer coisa. Ela lê, identifica e devolve.
 * Criar fornecedor, lançar lote e marcar nota como importada continuam acontecendo só na
 * confirmação, depois da conferência humana — regra que o fluxo de estoque já seguia e que não faz
 * sentido furar logo na etapa de leitura, quando ninguém ainda olhou o que a IA entendeu.
 */

export type FonteDocumento = "qr" | "chave" | "xml" | "planilha" | "imagem";

export type ItemNormalizado = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
};

/**
 * Fornecedor extraído do documento, já cruzado com `fastbar_suppliers`:
 *  - `supplierId` preenchido = casou com um fornecedor já cadastrado, a tela só seleciona;
 *  - `supplierId` null e `novo: true` = veio nome/documento no papel mas não existe no cadastro,
 *    então a tela oferece criar na hora (parte 3 do escopo) já com os campos preenchidos;
 *  - tudo null = o documento não trouxe fornecedor legível, a equipe escolhe à mão.
 */
export type FornecedorNormalizado = {
  nome: string | null;
  /** Só dígitos — é assim que a comparação com o cadastro é feita, imune a máscara. */
  documento: string | null;
  supplierId: string | null;
  novo: boolean;
};

export type DocumentoNormalizado =
  | {
      ok: true;
      fonte: FonteDocumento;
      fornecedor: FornecedorNormalizado;
      numeroNota: string | null;
      chaveAcesso: string | null;
      dataEmissao: string | null;
      valorTotal: number | null;
      itens: ItemNormalizado[];
      /**
       * 0..1. Leitura determinística (XML, QR, planilha) vale 1: ou leu o campo, ou devolveu null.
       * Só a perna de IA devolve confiança de verdade, porque só ela pode ter entendido errado algo
       * que "parece" certo — é esse número que justifica a conferência humana ser obrigatória.
       */
      confianca: number | null;
      duplicada: boolean;
      avisoDuplicidade: string | null;
      /** Avisos não-fatais: itens não lidos, valor ausente, portal fora do ar mas chave válida… */
      avisos: string[];
    }
  | {
      ok: false;
      fonte: FonteDocumento | null;
      message: string;
      code?: string;
      /** Mesmo falhando pode ter sobrado algo aproveitável (ex.: chave lida, portal fora do ar). */
      chaveAcesso?: string | null;
    };

// ============ DETECÇÃO DE FORMATO ============

/** Decodifica o começo do arquivo pra farejar o conteúdo. NF-e costuma sair em ISO-8859-1, então
 * respeitamos a declaração de encoding em vez de assumir UTF-8 e corromper acento no nome do
 * emitente logo na primeira leitura. */
function decodificarTexto(buffer: Buffer): string {
  const amostra = buffer.subarray(0, 200).toString("latin1");
  const encoding = amostra.match(/encoding=["']([\w-]+)["']/i)?.[1]?.toLowerCase();
  if (encoding && /8859|latin/i.test(encoding)) return buffer.toString("latin1");
  return buffer.toString("utf8");
}

function ehXmlNfe(texto: string): boolean {
  const inicio = texto.slice(0, 2000);
  return /<\?xml|<nfeProc|<NFe[\s>]/i.test(inicio) && /infNFe|<NFe[\s>]/i.test(texto.slice(0, 20000));
}

function ehPlanilha(fileName: string, buffer: Buffer): boolean {
  if (/\.(xlsx|xls|csv)$/i.test(fileName)) return true;
  // .xlsx é um zip ("PK"), .xls antigo é um OLE2 (D0 CF 11 E0).
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf) return true;
  return false;
}

// ============ PERNA NOVA: XML DA NF-e / NFC-e ============

function extrairTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  const valor = match?.[1]?.trim();
  return valor ? valor : null;
}

function numeroOuNull(texto: string | null): number | null {
  if (!texto) return null;
  const valor = Number(texto.replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Lê o XML da NF-e/NFC-e por extração direta de tags em vez de montar uma árvore DOM. O leiaute da
 * NF-e é fechado e versionado pela SEFAZ (`emit`, `ide`, `det`/`prod`, `ICMSTot`), então não há a
 * variação de layout que obriga o parser de HTML do portal e o de planilha a serem heurísticos:
 * aqui ou a tag está lá com o nome exato do schema, ou o documento não é uma NF-e.
 */
function lerXmlNfe(xml: string): {
  fornecedorNome: string | null;
  fornecedorDocumento: string | null;
  numeroNota: string | null;
  chaveAcesso: string | null;
  dataEmissao: string | null;
  valorTotal: number | null;
  itens: ItemNormalizado[];
} {
  const blocoEmit = xml.match(/<emit>([\s\S]*?)<\/emit>/i)?.[1] ?? "";
  const fornecedorNome = extrairTag(blocoEmit, "xNome");
  const fornecedorDocumento = (extrairTag(blocoEmit, "CNPJ") ?? extrairTag(blocoEmit, "CPF"))
    ?.replace(/\D/g, "") ?? null;

  // A chave vive no atributo Id do infNFe, prefixada com "NFe".
  const chaveAcesso = xml.match(/Id=["']NFe(\d{44})["']/i)?.[1] ?? xml.match(/\d{44}/)?.[0] ?? null;

  const blocoIde = xml.match(/<ide>([\s\S]*?)<\/ide>/i)?.[1] ?? "";
  const numeroNota = extrairTag(blocoIde, "nNF");
  const dataEmissao = extrairTag(blocoIde, "dhEmi") ?? extrairTag(blocoIde, "dEmi");

  const blocoTotal = xml.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/i)?.[1] ?? "";
  const valorTotal = numeroOuNull(extrairTag(blocoTotal, "vNF"));

  const itens: ItemNormalizado[] = [];
  for (const bloco of xml.matchAll(/<det[^>]*>([\s\S]*?)<\/det>/gi)) {
    const prod = bloco[1]?.match(/<prod>([\s\S]*?)<\/prod>/i)?.[1];
    if (!prod) continue;
    const descricao = extrairTag(prod, "xProd");
    const quantidade = numeroOuNull(extrairTag(prod, "qCom"));
    if (!descricao || !quantidade || quantidade <= 0) continue;
    itens.push({
      descricao,
      quantidade,
      unidade: extrairTag(prod, "uCom") ?? "un",
      valorUnitario: numeroOuNull(extrairTag(prod, "vUnCom")) ?? 0,
    });
  }

  return {
    fornecedorNome,
    fornecedorDocumento,
    numeroNota,
    chaveAcesso,
    dataEmissao,
    valorTotal,
    itens,
  };
}

// ============ CONFERÊNCIA ARITMÉTICA ============

/**
 * Soma quantidade × valor unitário dos itens lidos e compara com o total declarado no documento.
 *
 * Isto é a trava de qualidade mais barata que existe no fluxo, e a única que não depende de IA:
 * é aritmética. Quando a leitura troca um dígito — 48,90 virando 4,89, ou 10 caixas virando 70 —
 * a soma para de fechar, e isso aparece SEM precisar de ninguém comparando item por item com o
 * papel na mão. O modelo pode devolver confiança alta num número que ele leu errado; a soma, não.
 *
 * Tolerância de 2%: nota real tem desconto de linha, frete diluído e arredondamento de centavo,
 * então exigir igualdade exata geraria alarme em nota correta — e alarme que toca à toa é alarme
 * que a equipe aprende a ignorar.
 */
function conferirSomaDosItens(itens: ItemNormalizado[], valorTotal: number | null): string | null {
  if (!valorTotal || valorTotal <= 0 || itens.length === 0) return null;

  const soma = itens.reduce((total, item) => total + item.quantidade * item.valorUnitario, 0);
  if (soma <= 0) return null;

  const diferenca = Math.abs(soma - valorTotal);
  if (diferenca / valorTotal <= 0.02) return null;

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `A soma dos itens (${fmt(soma)}) não bate com o total da nota (${fmt(valorTotal)}). Confira quantidade e valor unitário antes de confirmar — provavelmente algum número foi lido errado.`;
}

// ============ IDENTIFICAÇÃO DO FORNECEDOR ============

function normalizarNome(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Cruza o fornecedor lido no documento com `fastbar_suppliers`. Documento (CNPJ) manda sobre nome:
 * a mesma empresa aparece como "DISTRIB. BEBIDAS LTDA", "Distribuidora de Bebidas Ltda ME" e por aí
 * vai, mas o CNPJ é o mesmo — comparar por dígitos evita cadastrar o mesmo fornecedor três vezes.
 * O nome só decide quando o documento não veio (cupom sem CNPJ legível, planilha sem cabeçalho).
 *
 * Não cria nada: quando não acha, devolve `novo: true` com os dados prontos pra tela oferecer o
 * cadastro na hora do lançamento do lote.
 */
async function identificarFornecedor(
  nome: string | null,
  documento: string | null,
): Promise<FornecedorNormalizado> {
  const { admin } = await import("./fastbar.server");
  const documentoLimpo = documento?.replace(/\D/g, "") || null;
  const nomeLimpo = nome?.trim() || null;

  if (!documentoLimpo && !nomeLimpo) {
    return { nome: null, documento: null, supplierId: null, novo: false };
  }

  const { data: fornecedores } = await admin()
    .from("fastbar_suppliers")
    .select("id, name, document")
    .eq("active", true);

  const lista = fornecedores ?? [];

  if (documentoLimpo) {
    const porDocumento = lista.find(
      (f) => (f.document ?? "").replace(/\D/g, "") === documentoLimpo,
    );
    if (porDocumento) {
      return {
        nome: nomeLimpo ?? porDocumento.name,
        documento: documentoLimpo,
        supplierId: porDocumento.id,
        novo: false,
      };
    }
  }

  if (nomeLimpo) {
    const alvo = normalizarNome(nomeLimpo);
    const porNome = lista.find((f) => normalizarNome(f.name) === alvo);
    if (porNome) {
      return {
        nome: porNome.name,
        documento: documentoLimpo ?? (porNome.document?.replace(/\D/g, "") || null),
        supplierId: porNome.id,
        novo: false,
      };
    }
  }

  return { nome: nomeLimpo, documento: documentoLimpo, supplierId: null, novo: true };
}

/** Confere se a chave já entrou antes. Mesma checagem que cada perna já fazia por conta própria —
 * centralizada aqui pra que XML e planilha também ganhem a proteção, não só QR e IA. */
async function checarDuplicidade(
  chave: string | null,
): Promise<{ duplicada: boolean; aviso: string | null }> {
  if (!chave || !/^\d{44}$/.test(chave)) return { duplicada: false, aviso: null };
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_notas_importadas")
    .select("id, created_at")
    .eq("chave_acesso", chave)
    .maybeSingle();
  if (!data) return { duplicada: false, aviso: null };
  return {
    duplicada: true,
    aviso: `Essa nota já foi importada em ${new Date(data.created_at).toLocaleString("pt-BR")}.`,
  };
}

// ============ PORTA ÚNICA ============

/**
 * `texto` = conteúdo lido do QR code, ou a chave de acesso digitada (44 dígitos).
 * `arquivo` = qualquer documento: XML da NF-e, planilha, foto da nota ou PDF.
 * Passe um ou outro — o formato é detectado aqui dentro.
 */
export const normalizarDocumentoEstoque = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      texto?: string | undefined;
      arquivo?:
        | { fileName: string; base64: string; mimeType?: string | undefined }
        | undefined;
    }) => data,
  )
  .handler(async ({ data }): Promise<DocumentoNormalizado> => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const texto = data.texto?.trim();
    if (texto) return normalizarTexto(texto);
    if (data.arquivo) return normalizarArquivo(data.arquivo);

    return { ok: false, fonte: null, message: "Nenhum documento informado." };
  });

/** QR code (URL do portal) ou chave de acesso digitada. Os dois terminam na mesma consulta — a
 * diferença é só de onde vieram os 44 dígitos, e isso vira a `fonte` pra ficar registrado. */
async function normalizarTexto(texto: string): Promise<DocumentoNormalizado> {
  const fonte: FonteDocumento = /^https?:\/\//i.test(texto) ? "qr" : "chave";
  const somenteDigitos = texto.replace(/\D/g, "");

  if (fonte === "chave" && !/^\d{44}$/.test(somenteDigitos)) {
    return {
      ok: false,
      fonte,
      message: "Isso não parece uma chave de acesso (precisa ter 44 dígitos) nem um QR de nota.",
    };
  }

  const { lookupNotaFiscal } = await import("./nota-fiscal.functions");
  // A consulta ao portal espera uma URL; chave digitada vira a URL de consulta equivalente.
  const qrUrl =
    fonte === "qr"
      ? texto
      : `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa&nfe=${somenteDigitos}`;

  const resultado = await lookupNotaFiscal({ data: { qrUrl } });

  if (!resultado.ok) {
    return {
      ok: false,
      fonte,
      message: resultado.message,
      ...(resultado.code ? { code: resultado.code } : {}),
      chaveAcesso: resultado.chave ?? (fonte === "chave" ? somenteDigitos : null),
    };
  }

  const fornecedor = await identificarFornecedor(
    resultado.emitenteNome,
    resultado.emitenteDocumento,
  );
  const duplicidade = await checarDuplicidade(resultado.chave);

  const avisos: string[] = [];
  const somaQR = conferirSomaDosItens(resultado.itens, resultado.valorTotal);
  if (somaQR) avisos.push(somaQR);
  if (resultado.avisoItensVazios) {
    avisos.push(
      "O portal respondeu, mas não consegui ler os itens — a chave e o valor estão aqui, os itens precisam ser adicionados à mão.",
    );
  }

  return {
    ok: true,
    fonte,
    fornecedor,
    numeroNota: null,
    chaveAcesso: resultado.chave,
    dataEmissao: null,
    valorTotal: resultado.valorTotal,
    itens: resultado.itens,
    confianca: 1,
    duplicada: duplicidade.duplicada,
    avisoDuplicidade: duplicidade.aviso,
    avisos,
  };
}

async function normalizarArquivo(arquivo: {
  fileName: string;
  base64: string;
  mimeType?: string | undefined;
}): Promise<DocumentoNormalizado> {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(arquivo.base64, "base64");
  } catch {
    return { ok: false, fonte: null, message: "Arquivo inválido." };
  }
  if (buffer.length === 0) return { ok: false, fonte: null, message: "Arquivo vazio." };

  // O conteúdo decide, não a extensão: nota exportada como "nota.txt" ou planilha renomeada não
  // deveria cair na perna errada só por causa do nome.
  const comoTexto = buffer.length < 8 * 1024 * 1024 ? decodificarTexto(buffer) : "";

  if (comoTexto && ehXmlNfe(comoTexto)) return normalizarXml(comoTexto);
  if (ehPlanilha(arquivo.fileName, buffer)) return normalizarPlanilha(arquivo);
  return normalizarComIA(arquivo);
}

async function normalizarXml(xml: string): Promise<DocumentoNormalizado> {
  const lido = lerXmlNfe(xml);

  if (!lido.chaveAcesso && lido.itens.length === 0) {
    return {
      ok: false,
      fonte: "xml",
      message: "Esse XML não parece uma NF-e — não achei a chave de acesso nem os itens.",
    };
  }

  const fornecedor = await identificarFornecedor(lido.fornecedorNome, lido.fornecedorDocumento);
  const duplicidade = await checarDuplicidade(lido.chaveAcesso);

  const avisos: string[] = [];
  const somaXml = conferirSomaDosItens(lido.itens, lido.valorTotal);
  if (somaXml) avisos.push(somaXml);
  if (lido.itens.length === 0) {
    avisos.push("O XML foi lido mas não tinha itens (det/prod) — adicione os itens à mão.");
  }

  return {
    ok: true,
    fonte: "xml",
    fornecedor,
    numeroNota: lido.numeroNota,
    chaveAcesso: lido.chaveAcesso,
    dataEmissao: lido.dataEmissao,
    valorTotal: lido.valorTotal,
    itens: lido.itens,
    confianca: 1,
    duplicada: duplicidade.duplicada,
    avisoDuplicidade: duplicidade.aviso,
    avisos,
  };
}

async function normalizarPlanilha(arquivo: {
  fileName: string;
  base64: string;
}): Promise<DocumentoNormalizado> {
  const { parseSupplyFile } = await import("./nota-fiscal.functions");
  const resultado = await parseSupplyFile({
    data: { fileName: arquivo.fileName, base64: arquivo.base64 },
  });

  if (!resultado.ok) return { ok: false, fonte: "planilha", message: resultado.message };

  // Planilha é lista de compra, não documento fiscal: não tem emitente, chave nem número de nota.
  // O fornecedor é escolhido no lançamento do lote, como em qualquer entrada manual.
  return {
    ok: true,
    fonte: "planilha",
    fornecedor: { nome: null, documento: null, supplierId: null, novo: false },
    numeroNota: null,
    chaveAcesso: null,
    dataEmissao: null,
    valorTotal: null,
    itens: resultado.itens,
    confianca: 1,
    duplicada: false,
    avisoDuplicidade: null,
    avisos: ["Planilha não traz fornecedor nem chave fiscal — escolha o fornecedor no lote."],
  };
}

async function normalizarComIA(arquivo: {
  fileName: string;
  base64: string;
  mimeType?: string | undefined;
}): Promise<DocumentoNormalizado> {
  const { normalizarDocumentoEstoqueComIA } = await import("./stock-ai.functions");
  const resultado = await normalizarDocumentoEstoqueComIA({
    data: {
      base64: arquivo.base64,
      mimeType: arquivo.mimeType || "image/jpeg",
      fileName: arquivo.fileName,
    },
  });

  if (!resultado.ok) {
    return {
      ok: false,
      fonte: "imagem",
      message: resultado.message ?? "Não consegui ler esse documento.",
    };
  }

  const fornecedor = await identificarFornecedor(
    resultado.fornecedorNome ?? null,
    resultado.fornecedorDocumento ?? null,
  );

  const avisos: string[] = [];
  const somaIA = conferirSomaDosItens(resultado.itens, resultado.valorTotal ?? null);
  if (somaIA) avisos.push(somaIA);
  if (typeof resultado.confianca === "number" && resultado.confianca < 0.7) {
    avisos.push(
      "A leitura saiu com confiança baixa — confira item por item antes de confirmar a entrada.",
    );
  }
  if (resultado.itens.length === 0) {
    avisos.push("Não consegui ler nenhum item nessa imagem — adicione os itens à mão.");
  }

  return {
    ok: true,
    fonte: "imagem",
    fornecedor,
    numeroNota: resultado.numeroNota ?? null,
    chaveAcesso: resultado.chaveAcesso ?? null,
    dataEmissao: resultado.dataEmissao ?? null,
    valorTotal: resultado.valorTotal ?? null,
    itens: resultado.itens,
    confianca: resultado.confianca ?? null,
    duplicada: resultado.duplicada ?? false,
    avisoDuplicidade: resultado.avisoDuplicidade ?? null,
    avisos,
  };
}

// ============ CRIAÇÃO DO FORNECEDOR NA CONFIRMAÇÃO ============

/**
 * Resolve o fornecedor para o lançamento do lote: devolve o id do que já existe ou cria na hora com
 * os dados que vieram da nota. Fica separado do normalizador de propósito — ler um documento não
 * pode criar cadastro; só a confirmação, depois da conferência, é que grava.
 *
 * Idempotente pelo mesmo critério do cruzamento (CNPJ antes de nome), pra que confirmar duas notas
 * do mesmo fornecedor não gere dois cadastros.
 */
export const garantirFornecedor = createServerFn({ method: "POST" })
  .inputValidator((data: { nome: string; documento?: string | undefined }) => data)
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; supplierId: string; criado: boolean } | { ok: false; message: string }
    > => {
      const { admin, assertRegisterAccess } = await import("./fastbar.server");
      await assertRegisterAccess();

      const nome = data.nome.trim();
      if (nome.length < 2) return { ok: false, message: "Nome do fornecedor inválido." };

      const existente = await identificarFornecedor(nome, data.documento ?? null);
      if (existente.supplierId) {
        return { ok: true, supplierId: existente.supplierId, criado: false };
      }

      const documento = data.documento?.replace(/\D/g, "") || null;
      const { data: criado, error } = await admin()
        .from("fastbar_suppliers")
        .insert({ name: nome, document: documento })
        .select("id")
        .single();

      if (error || !criado) {
        return { ok: false, message: "Não foi possível cadastrar o fornecedor." };
      }
      return { ok: true, supplierId: criado.id, criado: true };
    },
  );
