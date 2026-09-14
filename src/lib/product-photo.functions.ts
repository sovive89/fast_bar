import { createServerFn } from "@tanstack/react-start";

/**
 * FOTO AUTOMÁTICA DE PRODUTO (parte 7 do escopo).
 *
 * Três caminhos pra mesma foto, na ordem em que fazem sentido:
 *
 *  1. BUSCA — produto comum e drink conhecido ("Heineken 350ml", "Caipirinha") já têm foto pronta
 *     no mundo. Gerar imagem por IA pra isso é caro, lento e sai pior que uma foto real.
 *  2. IA — drink autoral não existe em lugar nenhum, então aqui gerar é o único caminho.
 *  3. UPLOAD MANUAL — sempre disponível, em qualquer dispositivo, e é o que manda quando existe:
 *     a foto do copo de verdade do bar ganha de qualquer sugestão automática. Já existia
 *     (`uploadProductPhoto`) e continua valendo; esta camada não substitui, só acrescenta.
 *
 * REGRA CENTRAL: sugerir NÃO salva. `sugerirFotoProduto` devolve candidatas em base64 e não
 * escreve nada — nem no Storage, nem no produto. Só `salvarFotoProduto`, chamada depois que a
 * pessoa escolheu, é que grava. É o mesmo desenho do normalizador de nota fiscal, pelo mesmo
 * motivo: foto automática erra (vem o refrigerante errado, vem o rótulo de outro país), e uma
 * sugestão que se salva sozinha vira um cardápio cheio de imagem errada que ninguém revisou.
 *
 * "Mesma foto no cardápio e no estoque" sai de graça: a foto vive em `fastbar_products.image_url`,
 * e depois das partes 1-5 o produto é a mesma linha nas duas telas — não existe foto duplicada
 * pra sair de sincronia. Bebida base e ingrediente não têm foto própria de propósito: quem aparece
 * pro cliente e pra equipe é o produto.
 *
 * SOBRE A BUSCA E DIREITO DE USO: a busca é feita em banco de imagem com licença explícita
 * (Pexels/Unsplash), não em busca de imagem genérica da web. Foto achada solta no Google tem dono
 * e não vem licenciada pra estampar o cardápio de um bar — que é uso comercial. Pexels e Unsplash
 * publicam sob licença que permite uso comercial sem pagar, e é por isso que são os provedores
 * aqui. O crédito ao autor volta junto de cada sugestão (`credito`), porque o Unsplash pede
 * atribuição.
 */

const TIMEOUT_BUSCA_MS = 10_000;
const TIMEOUT_IA_MS = 60_000;
const TAMANHO_MAX_FOTO = 5 * 1024 * 1024;

export type OrigemFoto = "busca" | "ia";

export type FotoSugerida = {
  origem: OrigemFoto;
  /** Bytes da imagem em base64, sem o prefixo `data:`. AINDA NÃO SALVA. */
  base64: string;
  contentType: string;
  /** Atribuição exigida pela fonte (o Unsplash pede). null quando a fonte não exige. */
  credito: string | null;
  /** Página original, pra conferir licença e autor. */
  fonteUrl: string | null;
};

export type SugestaoFotoResult =
  | { ok: true; sugestoes: FotoSugerida[]; avisos: string[] }
  | { ok: false; message: string; code?: "sem_provedor_busca" | "sem_ia" | "falha" };

// ============ BUSCA EM BANCO DE IMAGEM LICENCIADO ============

type ResultadoBusca = { url: string; credito: string | null; fonteUrl: string | null };

async function buscarNoPexels(termo: string, limite: number): Promise<ResultadoBusca[]> {
  const chave = process.env["PEXELS_API_KEY"];
  if (!chave) return [];

  const resposta = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(termo)}&per_page=${limite}&orientation=square`,
    { headers: { Authorization: chave }, signal: AbortSignal.timeout(TIMEOUT_BUSCA_MS) },
  );
  if (!resposta.ok) return [];

  const dados = (await resposta.json()) as {
    photos?: Array<{
      src?: { large?: string; medium?: string };
      photographer?: string;
      url?: string;
    }>;
  };

  return (dados.photos ?? [])
    .map((foto) => ({
      url: foto.src?.large ?? foto.src?.medium ?? "",
      credito: foto.photographer ? `Foto por ${foto.photographer} (Pexels)` : "Pexels",
      fonteUrl: foto.url ?? null,
    }))
    .filter((foto) => foto.url);
}

async function buscarNoUnsplash(termo: string, limite: number): Promise<ResultadoBusca[]> {
  const chave = process.env["UNSPLASH_ACCESS_KEY"];
  if (!chave) return [];

  const resposta = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(termo)}&per_page=${limite}&orientation=squarish`,
    {
      headers: { Authorization: `Client-ID ${chave}` },
      signal: AbortSignal.timeout(TIMEOUT_BUSCA_MS),
    },
  );
  if (!resposta.ok) return [];

  const dados = (await resposta.json()) as {
    results?: Array<{
      urls?: { regular?: string; small?: string };
      user?: { name?: string };
      links?: { html?: string };
    }>;
  };

  return (dados.results ?? [])
    .map((foto) => ({
      url: foto.urls?.regular ?? foto.urls?.small ?? "",
      credito: foto.user?.name ? `Foto por ${foto.user.name} (Unsplash)` : "Unsplash",
      fonteUrl: foto.links?.html ?? null,
    }))
    .filter((foto) => foto.url);
}

/**
 * Baixa a imagem no servidor e devolve base64, em vez de entregar a URL do provedor pra tela.
 * Assim a foto que a pessoa aprovou é exatamente a que vai pro Storage — sem depender de o link
 * do provedor continuar de pé, e sem o navegador do caixa precisar alcançar um domínio externo.
 */
async function baixarComoBase64(
  url: string,
): Promise<{ base64: string; contentType: string } | null> {
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_BUSCA_MS) });
    if (!resposta.ok) return null;

    const contentType = resposta.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const bytes = Buffer.from(await resposta.arrayBuffer());
    if (bytes.length === 0 || bytes.length > TAMANHO_MAX_FOTO) return null;

    return { base64: bytes.toString("base64"), contentType };
  } catch {
    return null;
  }
}

// ============ GERAÇÃO POR IA ============

/**
 * Usa a API de imagens da OpenAI com a `OPENAI_API_KEY` que o projeto já tem configurada e já usa
 * na interpretação de métricas (`services/openai.ts`) — em vez de abrir um segundo provedor de IA
 * só pra isso. O gateway da Vercel, usado no OCR de nota, é um caminho de chat/visão: geração de
 * imagem ali exigiria fixar um slug de modelo diferente, então a rota direta é a previsível.
 */
async function gerarComIA(nome: string, quantidade: number): Promise<FotoSugerida[]> {
  const chave = process.env["OPENAI_API_KEY"];
  if (!chave) return [];

  const prompt =
    `Fotografia profissional de bebida para cardápio de bar: ${nome}. ` +
    `Servido em copo apropriado, fundo escuro desfocado de balcão de bar, iluminação quente e lateral, ` +
    `foco nítido na bebida, enquadramento quadrado, aparência de foto real — sem texto, sem marca, ` +
    `sem logotipo, sem pessoas, sem mãos.`;

  const resposta = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: quantidade,
      size: "1024x1024",
    }),
    signal: AbortSignal.timeout(TIMEOUT_IA_MS),
  });

  if (!resposta.ok) return [];

  const dados = (await resposta.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const sugestoes: FotoSugerida[] = [];

  for (const item of dados.data ?? []) {
    if (item.b64_json) {
      sugestoes.push({
        origem: "ia",
        base64: item.b64_json,
        contentType: "image/png",
        credito: "Imagem gerada por IA",
        fonteUrl: null,
      });
      continue;
    }
    // Alguns modelos devolvem URL temporária em vez do base64 — baixa na hora, porque esse link
    // expira e a pessoa ainda vai levar um tempo olhando antes de confirmar.
    if (item.url) {
      const baixada = await baixarComoBase64(item.url);
      if (baixada) {
        sugestoes.push({
          origem: "ia",
          base64: baixada.base64,
          contentType: baixada.contentType,
          credito: "Imagem gerada por IA",
          fonteUrl: null,
        });
      }
    }
  }

  return sugestoes;
}

// ============ SUGESTÃO (não salva nada) ============

/**
 * `autoral: true` pula a busca e vai direto pra IA — drink inventado pela casa não está em banco de
 * imagem nenhum, procurar só gastaria tempo pra trazer a foto de outra bebida parecida, que é
 * pior que não trazer nada.
 *
 * Sem `autoral`, tenta busca primeiro e cai pra IA quando não acha (ou quando não há provedor de
 * busca configurado). Essa ordem é o que faz "produto comum" e "drink conhecido" funcionarem sem
 * a tela precisar adivinhar em qual categoria o item cai.
 */
export const sugerirFotoProduto = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      nome: string;
      autoral?: boolean | undefined;
      quantidade?: number | undefined;
    }) => data,
  )
  .handler(async ({ data }): Promise<SugestaoFotoResult> => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const nome = data.nome.trim();
    if (nome.length < 2) return { ok: false, message: "Informe o nome do produto." };

    const quantidade = Math.min(Math.max(data.quantidade ?? 3, 1), 6);
    const avisos: string[] = [];

    if (!data.autoral) {
      let encontradas: ResultadoBusca[] = [];
      try {
        encontradas = await buscarNoPexels(nome, quantidade);
        if (encontradas.length === 0) encontradas = await buscarNoUnsplash(nome, quantidade);
      } catch {
        avisos.push("A busca de fotos falhou; tentei gerar por IA.");
      }

      const sugestoes: FotoSugerida[] = [];
      for (const achada of encontradas) {
        const baixada = await baixarComoBase64(achada.url);
        if (!baixada) continue;
        sugestoes.push({
          origem: "busca",
          base64: baixada.base64,
          contentType: baixada.contentType,
          credito: achada.credito,
          fonteUrl: achada.fonteUrl,
        });
      }

      if (sugestoes.length > 0) return { ok: true, sugestoes, avisos };

      const temProvedorBusca =
        !!process.env["PEXELS_API_KEY"] || !!process.env["UNSPLASH_ACCESS_KEY"];
      avisos.push(
        temProvedorBusca
          ? "Não achei foto pronta com esse nome; gerei por IA."
          : "Busca de fotos não configurada (falta PEXELS_API_KEY ou UNSPLASH_ACCESS_KEY); gerei por IA.",
      );
    }

    let geradas: FotoSugerida[] = [];
    try {
      geradas = await gerarComIA(nome, data.autoral ? quantidade : 1);
    } catch {
      geradas = [];
    }

    if (geradas.length === 0) {
      const temIA = !!process.env["OPENAI_API_KEY"];
      return {
        ok: false,
        code: temIA ? "falha" : "sem_ia",
        message: temIA
          ? "Não consegui sugerir uma foto agora — envie uma foto manualmente."
          : "Geração por IA não configurada (falta OPENAI_API_KEY) e nenhuma foto pronta foi encontrada — envie uma foto manualmente.",
      };
    }

    return { ok: true, sugestoes: geradas, avisos };
  });

// ============ GRAVAÇÃO (só depois da confirmação) ============

/**
 * Sobe a foto escolhida pro Storage e, se vier `productId`, já aponta o produto pra ela. Sem
 * `productId` só devolve a URL — é o caso do cadastro de produto novo, em que a foto é escolhida
 * antes do produto existir e a URL entra no `createMenuProduct`.
 *
 * Reaproveita `uploadProductPhoto`, que já existia e já resolve bucket, nome de arquivo e URL
 * pública — não há motivo pra ter um segundo caminho de upload com as mesmas regras.
 */
export const salvarFotoProduto = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      base64: string;
      contentType: string;
      nome: string;
      productId?: string | undefined;
    }) => data,
  )
  .handler(
    async ({ data }): Promise<{ ok: true; url: string } | { ok: false; message: string }> => {
      const { admin, assertRegisterAccess } = await import("./fastbar.server");
      const { uploadProductPhoto } = await import("./base-drinks.functions");
      await assertRegisterAccess();

      const extensao = data.contentType === "image/png" ? "png" : "jpg";
      const enviada = await uploadProductPhoto({
        data: {
          fileName: `${data.nome.trim() || "produto"}.${extensao}`,
          base64: data.base64,
          contentType: data.contentType,
        },
      });
      if (!enviada.ok) return { ok: false, message: enviada.message };

      if (data.productId) {
        const { error } = await admin()
          .from("fastbar_products")
          .update({ image_url: enviada.url })
          .eq("id", data.productId);
        if (error) {
          return {
            ok: false,
            message: "A foto subiu, mas não consegui vincular ao produto — tente de novo.",
          };
        }
      }

      return { ok: true, url: enviada.url };
    },
  );
