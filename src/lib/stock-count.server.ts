/**
 * Conferência de estoque na abertura da operação (seção 3 da documentação funcional, P1.1-4 do
 * CLAUDE.md): compara o estoque teórico (o saldo atual de bebidas base, ingredientes e produtos de
 * revenda — ver listCountableItems) com a contagem física que a equipe informa.
 *
 * Esta conferência é um REGISTRO, nunca um ajuste automático: ela não escreve em nenhum saldo
 * (stock_quantity, current_stock) nem em fastbar_stock_lots. Corrigir o saldo a partir de uma
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

/** De onde vem o saldo do item: produto de revenda, bebida base, ingrediente ou item produzido
 * (xarope, polpa, molho — saída da Produção) — cada um mora numa tabela própria, com o saldo numa
 * coluna própria. */
export type CountableKind = "product" | "base_drink" | "ingredient" | "produced_item";

export interface CountableItem {
  /** "tipo:id" — identifica o item sem ambiguidade entre as tabelas. */
  key: string;
  kind: CountableKind;
  id: string;
  name: string;
  category: string;
  unit: string;
  stockQuantity: number;
}

/**
 * Itens "contáveis" na conferência, das quatro origens de saldo do bar:
 *
 * - Bebidas base (fastbar_base_drinks) e ingredientes (fastbar_drink_ingredients): ativos, saldo
 *   em current_stock (numérico — aceita fração, ex.: ml). É aqui que fica a maior parte do estoque
 *   de um bar: garrafas, latas, polpas.
 * - Produtos de revenda (fastbar_products): ativos, sem estoque ilimitado e sem ficha técnica.
 *   Produto com ficha técnica não tem stock_quantity confiável — quem segura o saldo de verdade
 *   são os componentes da receita (as bebidas base/ingredientes acima), não ele — mesmo critério
 *   que stock.functions.ts já usa pra separar "pendente de configurar origem do estoque".
 * - Itens produzidos (fastbar_produced_items): ativos, saldo em current_stock (numérico). Sem eles
 *   a Produção criaria saldo que a conferência de abertura nunca veria.
 *
 * A primeira versão só olhava fastbar_products, e na prática a conferência saía vazia: o estoque
 * do bar estava todo em bebidas base.
 */
export async function listCountableItems(): Promise<CountableItem[]> {
  const { admin } = await import("./fastbar.server");
  const [
    { data: products },
    { data: recipeLinks },
    { data: baseDrinks },
    { data: ingredients },
    { data: producedItems },
  ] = await Promise.all([
    admin()
      .from("fastbar_products")
      .select("id, name, category, unit, stock_quantity")
      .eq("is_active", true)
      .eq("unlimited_stock", false)
      .order("category")
      .order("name"),
    admin().from("fastbar_recipe_items").select("product_id"),
    admin()
      .from("fastbar_base_drinks")
      .select("id, name, unit, current_stock")
      .eq("active", true)
      .order("name"),
    admin()
      .from("fastbar_drink_ingredients")
      .select("id, name, unit, current_stock")
      .eq("active", true)
      .order("name"),
    admin()
      .from("fastbar_produced_items")
      .select("id, name, unit, current_stock")
      .eq("active", true)
      .order("name"),
  ]);

  const recipeSet = new Set((recipeLinks ?? []).map((link) => link.product_id as string));
  const fromComponents = (
    rows: { id: string; name: string; unit: string; current_stock: number | string }[] | null,
    kind: CountableKind,
    category: string,
  ): CountableItem[] =>
    (rows ?? []).map((row) => ({
      key: `${kind}:${row.id}`,
      kind,
      id: row.id,
      name: row.name,
      category,
      unit: row.unit,
      stockQuantity: Number(row.current_stock),
    }));

  return [
    ...fromComponents(baseDrinks, "base_drink", "Bebidas base"),
    ...fromComponents(ingredients, "ingredient", "Ingredientes"),
    ...fromComponents(producedItems, "produced_item", "Itens produzidos"),
    ...(products ?? [])
      .filter((product) => !recipeSet.has(product.id))
      .map((product) => ({
        key: `product:${product.id}`,
        kind: "product" as const,
        id: product.id,
        name: product.name,
        category: product.category,
        unit: product.unit,
        stockQuantity: product.stock_quantity,
      })),
  ];
}

export interface StockCountItemInput {
  /** CountableItem.key ("tipo:id"). */
  itemKey: string;
  contada: number;
  motivo?: StockCountMotivo | undefined;
  observacao?: string | undefined;
}

/** Produto guarda saldo inteiro (stock_quantity integer); bebida base e ingrediente guardam
 * numérico. Arredonda em 3 casas pra não registrar "diferença" por ruído de ponto flutuante. */
function normalizeCount(value: number, kind: CountableKind): number {
  return kind === "product" ? Math.floor(value) : Math.round(value * 1000) / 1000;
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

  const candidates = await listCountableItems();
  const byKey = new Map(candidates.map((item) => [item.key, item]));

  const rows: {
    item_kind: CountableKind;
    item_id: string;
    product_id: string | null;
    product_name: string;
    unit: string;
    quantidade_esperada: number;
    quantidade_contada: number;
    motivo: StockCountMotivo | null;
    observacao: string | null;
  }[] = [];

  for (const input of params.items) {
    const item = byKey.get(input.itemKey);
    if (!item) continue; // desativado/removido entre abrir a tela e confirmar — ignora

    const raw = Number(input.contada);
    if (!Number.isFinite(raw) || raw < 0) {
      return { ok: false, message: `Quantidade inválida para "${item.name}".` };
    }
    const contada = normalizeCount(raw, item.kind);
    const esperada = normalizeCount(item.stockQuantity, item.kind);

    const divergiu = contada !== esperada;
    if (divergiu && !input.motivo) {
      return { ok: false, message: `Informe o motivo da diferença em "${item.name}".` };
    }

    rows.push({
      item_kind: item.kind,
      item_id: item.id,
      // product_id continua preenchido para produto (FK e consultas antigas); para bebida base e
      // ingrediente fica nulo — o vínculo vai em item_kind + item_id.
      product_id: item.kind === "product" ? item.id : null,
      product_name: item.name,
      unit: item.unit,
      quantidade_esperada: esperada,
      quantidade_contada: contada,
      motivo: divergiu ? (input.motivo as StockCountMotivo) : null,
      observacao: divergiu ? input.observacao?.trim() || null : null,
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
