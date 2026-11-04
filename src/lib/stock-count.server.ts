/**
 * Conferência de estoque na abertura da operação (seção 3 da documentação funcional, P1.1-4 do
 * CLAUDE.md): compara o estoque teórico (fastbar_products.stock_quantity agora, que é o saldo
 * acumulado desde a última conferência/entrada) com a contagem física que a equipe informa.
 *
 * Esta conferência é um REGISTRO, nunca um ajuste automático: ela não escreve em
 * fastbar_products.stock_quantity nem em fastbar_stock_lots. Corrigir o saldo a partir de uma
 * divergência encontrada aqui é uma ação deliberada à parte (entrada/perda em Estoque) — "o skip
 * não elimina o estoque teórico... apenas permite a abertura controlada do dia" vale pro caminho
 * normal também: a conferência não decide sozinha qual saldo é o "certo".
 */

export type StockCountMotivo =
  | "perda_quebra"
  | "vencimento"
  | "consumo_interno"
  | "lancamento_incorreto"
  | "divergencia_nao_identificada";

/** Mesma ordem e nomes da seção 3.2 da documentação funcional — "divergência não identificada" é
 * uma escolha deliberada (a equipe clica nela), nunca o motivo padrão de uma diferença. */
export const STOCK_COUNT_MOTIVOS: ReadonlyArray<{ value: StockCountMotivo; label: string }> = [
  { value: "perda_quebra", label: "Perda / quebra" },
  { value: "vencimento", label: "Vencimento" },
  { value: "consumo_interno", label: "Consumo interno" },
  { value: "lancamento_incorreto", label: "Lançamento incorreto" },
  { value: "divergencia_nao_identificada", label: "Divergência não identificada" },
];

export function isStockCountMotivo(value: unknown): value is StockCountMotivo {
  return typeof value === "string" && STOCK_COUNT_MOTIVOS.some((motivo) => motivo.value === value);
}

export interface CountableProduct {
  id: string;
  name: string;
  category: string;
  unit: string;
  stockQuantity: number;
}

/**
 * Produtos "contáveis": ativos, com saldo próprio (sem estoque ilimitado) e sem ficha técnica.
 * Produto com ficha técnica não tem stock_quantity confiável — quem segura o saldo de verdade são
 * os componentes da receita (bebida base/ingrediente), não ele — mesmo critério que
 * stock.functions.ts já usa pra separar "pendente de configurar origem do estoque".
 *
 * Limitação conhecida desta primeira entrega: só cobre fastbar_products. Bebida base e
 * ingrediente têm o próprio saldo (fastbar_base_drinks.current_stock,
 * fastbar_drink_ingredients) e ainda não entram nesta conferência — ligado à separação de estoque
 * do item 4 do roadmap (bebidas/ingredientes/produção/suprimentos/utensílios), ainda não feita.
 */
export async function listCountableProducts(): Promise<CountableProduct[]> {
  const { admin } = await import("./fastbar.server");
  const [{ data: products }, { data: recipeLinks }] = await Promise.all([
    admin()
      .from("fastbar_products")
      .select("id, name, category, unit, stock_quantity")
      .eq("is_active", true)
      .eq("unlimited_stock", false)
      .order("category")
      .order("name"),
    admin().from("fastbar_recipe_items").select("product_id"),
  ]);
  const recipeSet = new Set((recipeLinks ?? []).map((link) => link.product_id as string));
  return (products ?? [])
    .filter((product) => !recipeSet.has(product.id))
    .map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      stockQuantity: product.stock_quantity,
    }));
}

export interface StockCountItemInput {
  productId: string;
  contada: number;
  motivo?: StockCountMotivo | undefined;
  observacao?: string | undefined;
}

type OpenResult =
  | { ok: true; operationId: string; dataOperacional: string; auditWarning?: string }
  | { ok: false; message: string };

/**
 * Grava a conferência (item por item, com motivo+observação exigidos em toda diferença) e abre a
 * operação em seguida — as duas coisas só fazem sentido juntas, a conferência existe pra acontecer
 * ANTES da operação abrir. A operação só é criada depois de validar todos os itens, pra não abrir
 * e recusar a conferência em seguida por um motivo faltando.
 *
 * Se a operação abrir mas o registro da conferência falhar na sequência (erro de rede entre as
 * duas escritas — raro, e sem transação entre as duas tabelas pelo client), devolve ok:true com
 * `auditWarning`: a operação já está aberta (não tem como desfazer sem fechar o caixa), mas a
 * equipe precisa saber que a conferência não ficou registrada, em vez de ver uma confirmação
 * silenciosamente falsa.
 */
export async function recordStockCountAndOpenOperation(params: {
  items: StockCountItemInput[];
  realizadoPor: string;
}): Promise<OpenResult & { divergences?: number }> {
  const { admin } = await import("./fastbar.server");
  const { createOperationRow } = await import("./operations.server");

  const candidates = await listCountableProducts();
  const byId = new Map(candidates.map((product) => [product.id, product]));

  const rows: {
    product_id: string;
    product_name: string;
    unit: string;
    quantidade_esperada: number;
    quantidade_contada: number;
    motivo: StockCountMotivo | null;
    observacao: string | null;
  }[] = [];

  for (const item of params.items) {
    const product = byId.get(item.productId);
    if (!product) continue; // desativado/removido entre abrir a tela e confirmar — ignora

    const contada = Math.floor(Number(item.contada));
    if (!Number.isFinite(contada) || contada < 0) {
      return { ok: false, message: `Quantidade inválida para "${product.name}".` };
    }

    const divergiu = contada !== product.stockQuantity;
    if (divergiu && !item.motivo) {
      return { ok: false, message: `Informe o motivo da diferença em "${product.name}".` };
    }

    rows.push({
      product_id: product.id,
      product_name: product.name,
      unit: product.unit,
      quantidade_esperada: product.stockQuantity,
      quantidade_contada: contada,
      motivo: divergiu ? (item.motivo as StockCountMotivo) : null,
      observacao: divergiu ? item.observacao?.trim() || null : null,
    });
  }

  const opened = await createOperationRow();
  if (!opened.ok) return opened;

  const { data: header, error: headerError } = await admin()
    .from("fastbar_stock_counts")
    .insert({
      operacao_id: opened.operationId,
      status: "CONCLUIDA",
      realizado_por: params.realizadoPor,
    })
    .select("id")
    .single();

  if (headerError || !header) {
    return {
      ok: true,
      operationId: opened.operationId,
      dataOperacional: opened.dataOperacional,
      auditWarning:
        "A operação abriu, mas o registro da conferência não foi salvo. Avise quem cuida do sistema.",
    };
  }

  if (rows.length > 0) {
    const { error: itemsError } = await admin()
      .from("fastbar_stock_count_items")
      .insert(rows.map((row) => ({ ...row, stock_count_id: header.id })));
    if (itemsError) {
      return {
        ok: true,
        operationId: opened.operationId,
        dataOperacional: opened.dataOperacional,
        auditWarning:
          "A operação abriu, mas os itens da conferência não foram salvos. Avise quem cuida do sistema.",
      };
    }
  }

  const divergences = rows.filter(
    (row) => row.quantidade_contada !== row.quantidade_esperada,
  ).length;
  return {
    ok: true,
    operationId: opened.operationId,
    dataOperacional: opened.dataOperacional,
    divergences,
  };
}

/**
 * Pula a conferência e abre a operação mesmo assim. Só chega aqui depois que o handler
 * (stock-count.functions.ts) já conferiu a senha da equipe — o motivo mínimo de 5 caracteres é
 * replicado aqui (a mesma trava já existe no banco) pra devolver um erro legível antes de gastar
 * um insert, em vez de deixar o constraint do banco estourar.
 */
export async function skipStockCountAndOpenOperation(params: {
  motivo: string;
  realizadoPor: string;
}): Promise<OpenResult> {
  const motivo = params.motivo.trim();
  if (motivo.length < 5) {
    return { ok: false, message: "Descreva o motivo de pular a conferência." };
  }

  const { admin } = await import("./fastbar.server");
  const { createOperationRow } = await import("./operations.server");

  const opened = await createOperationRow();
  if (!opened.ok) return opened;

  const { error } = await admin().from("fastbar_stock_counts").insert({
    operacao_id: opened.operationId,
    status: "PULADA",
    motivo_pulo: motivo,
    realizado_por: params.realizadoPor,
  });

  if (error) {
    return {
      ok: true,
      operationId: opened.operationId,
      dataOperacional: opened.dataOperacional,
      auditWarning:
        "A operação abriu, mas o registro de ter pulado a conferência não foi salvo. Avise quem cuida do sistema.",
    };
  }

  return { ok: true, operationId: opened.operationId, dataOperacional: opened.dataOperacional };
}
