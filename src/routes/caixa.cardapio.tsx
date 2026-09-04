import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PasswordConfirm } from "@/components/shared/PasswordConfirm";
import { PrimaryButton, SectionCard, TextField } from "@/components/stock/SharedFormFields";
import { brl } from "@/lib/format";
import { addProductEntry, getStockOverview } from "@/lib/stock.functions";
import { deactivateProduct, deleteProduct as deleteProductFn } from "@/lib/register.functions";
import {
  createBaseDrink,
  createIngredient,
  createProduct,
  createProductCategory,
  setCategoryNeedsRecipe,
  deleteProductCategory,
  getBaseDrinksOverview,
  getRecipeItems,
  listProductCategories,
  setRecipeItems,
  updateProduct as updateProductFn,
  updateProductCategory,
  uploadProductPhoto,
  PRODUCT_UNITS,
  PRODUCT_PACKAGE_TYPES,
} from "@/lib/base-drinks.functions";

export const Route = createFileRoute("/caixa/cardapio")({
  head: () => ({
    meta: [
      { title: "Cardápio | FastBar" },
      {
        name: "description",
        content: "Produtos do cardápio: nome, preço, categoria, foto e disponibilidade.",
      },
    ],
  }),
  component: CardapioPage,
});

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  package_type: string | null;
  is_active: boolean;
  stock_quantity: number;
  image_url: string | null;
  purchase_unit: string | null;
  units_per_pack: number;
  content_amount: number;
  average_cost: number;
};

const LOW_STOCK_THRESHOLD = 20;

/** Insumo do estoque disponível para compor um item do cardápio. */
type StockOption = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  kind: "base_drink" | "ingredient";
};

/** Uma linha da ficha técnica sendo montada junto com o produto. stockId "__new__" significa que
 * a linha ainda não aponta pra um insumo do estoque — o próprio nome vem sendo digitado aqui, e o
 * insumo só é criado (com saldo zero) no momento de salvar o produto. É o que inverte a ordem:
 * não precisa mais ir cadastrar o insumo antes pra depois voltar aqui e montar a ficha. */
type ComponentRow = {
  key: string;
  stockId: string;
  quantity: string;
  // "whole" = consome unidades inteiras do insumo (ex.: 1 lata) — quantidade é número inteiro.
  // "fraction" = consome uma fração/dose do insumo (ex.: 50ml de uma garrafa de 1L).
  quantityMode: "whole" | "fraction";
  newName: string;
  newKind: "base_drink" | "ingredient" | "cozinha";
  newUnit: string;
};

const NEW_STOCK_ID = "__new__";

/** Quando a ficha já existe (edição) e a linha não guardou o modo escolhido na hora — infere pela
 * unidade do insumo e pelo valor: unidade "un" com quantidade inteira normalmente é "unidade
 * inteira" (ex.: 1 lata); qualquer outra coisa (ml, g, ou fração de "un") é "fraction". */
function inferQuantityMode(quantity: number, unit: string | undefined): "whole" | "fraction" {
  return unit === "un" && Number.isInteger(quantity) ? "whole" : "fraction";
}

/**
 * Reduz a foto pro tamanho de upload (server functions em serverless têm limite de payload,
 * ~4.5MB no Vercel — uma foto de celular sem compressão passa disso fácil). Redimensiona pro
 * lado maior no máximo 1280px e converte pra JPEG a 82% de qualidade, o que normalmente fica
 * bem abaixo de 1MB. `imageOrientation: "from-image"` corrige fotos de iPhone que aparecem
 * de lado (o EXIF guarda a rotação separado dos pixels).
 */
async function compressImageForUpload(
  file: File,
  maxDimension = 1280,
  quality = 0.82,
): Promise<{ base64: string; contentType: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado neste navegador.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Falha ao comprimir a foto."))),
      "image/jpeg",
      quality,
    );
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const [, base64] = dataUrl.split(",");
  if (!base64) throw new Error("Falha ao codificar a imagem.");
  return { base64, contentType: "image/jpeg" };
}

/**
 * Ficha técnica ("Do que é feito") — usado tanto no cadastro de produto novo quanto na edição de
 * um já existente, pra não duplicar a lista de linhas + criação inline de insumo em dois lugares.
 */
function RecipeBuilder(props: {
  components: ComponentRow[];
  onChange: (updater: (current: ComponentRow[]) => ComponentRow[]) => void;
  stockOptions: StockOption[];
  warning: string | undefined;
  // Limita quantas linhas cabem — usado no modo "puxar direto do estoque" (1 insumo só). Sem
  // limite (undefined) no modo "elaborar ficha técnica", que aceita vários insumos.
  maxRows: number | undefined;
}) {
  const { components, onChange, stockOptions, warning, maxRows } = props;
  return (
    <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3">
      <p className="text-xs font-semibold">Do que é feito</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Puxe do estoque o que este item consome. A cada venda a baixa acontece sozinha nos
        insumos. Deixe vazio só se for algo sem controle de estoque nenhum.
      </p>
      {components.length === 0 && warning && (
        <p className="mt-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-600">
          {warning}
        </p>
      )}
      <p className="mt-1.5 text-xs font-medium text-primary">
        Cada insumo marca se sai do estoque por unidade inteira (ex.: 1 lata) ou por fração/dose
        (ex.: 50ml de uma garrafa de 1L) — escolha embaixo do insumo.
      </p>

      {stockOptions.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Nada no estoque ainda. Cadastre em Estoque → Bebidas base ou Ingredientes.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {components.map((row) => {
            const option = stockOptions.find((item) => item.id === row.stockId);
            const isNew = row.stockId === NEW_STOCK_ID;
            const isWhole = row.quantityMode === "whole";
            return (
              <div key={row.key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <select
                    value={row.stockId}
                    onChange={(event) =>
                      onChange((current) =>
                        current.map((c) =>
                          c.key === row.key ? { ...c, stockId: event.target.value } : c,
                        ),
                      )
                    }
                    className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="">Escolha o insumo</option>
                    <option value={NEW_STOCK_ID}>+ Criar novo insumo</option>
                    {stockOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    value={row.quantity}
                    onChange={(event) =>
                      onChange((current) =>
                        current.map((c) =>
                          c.key === row.key ? { ...c, quantity: event.target.value } : c,
                        ),
                      )
                    }
                    placeholder={isWhole ? "1" : isNew ? row.newUnit || "qtd" : option ? option.unit : "qtd"}
                    inputMode={isWhole ? "numeric" : "decimal"}
                    type={isWhole ? "number" : "text"}
                    min={isWhole ? 1 : undefined}
                    step={isWhole ? 1 : undefined}
                    className="h-11 w-24 shrink-0 rounded-xl border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                  />
                  <button
                    onClick={() => onChange((current) => current.filter((c) => c.key !== row.key))}
                    aria-label="Remover insumo"
                    className="shrink-0 rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      onChange((current) =>
                        current.map((c) =>
                          c.key === row.key
                            ? { ...c, quantityMode: "whole", quantity: c.quantity || "1" }
                            : c,
                        ),
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      isWhole
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    Unidade inteira
                  </button>
                  <button
                    onClick={() =>
                      onChange((current) =>
                        current.map((c) =>
                          c.key === row.key ? { ...c, quantityMode: "fraction" } : c,
                        ),
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      !isWhole
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    Fração / dose
                  </button>
                </div>
                {isNew && (
                  <div className="rounded-lg border border-dashed border-primary/40 bg-background p-2.5">
                    <p className="text-[11px] text-muted-foreground">
                      Ainda não existe no estoque — nasce com saldo zero. Configure a embalagem e
                      dê a primeira entrada em Estoque quando a mercadoria chegar.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={row.newName}
                        onChange={(event) =>
                          onChange((current) =>
                            current.map((c) =>
                              c.key === row.key ? { ...c, newName: event.target.value } : c,
                            ),
                          )
                        }
                        placeholder="Nome do insumo (ex.: Tequila)"
                        className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                      />
                      <select
                        value={row.newKind}
                        onChange={(event) =>
                          onChange((current) =>
                            current.map((c) =>
                              c.key === row.key
                                ? {
                                    ...c,
                                    newKind: event.target.value as ComponentRow["newKind"],
                                    newUnit: event.target.value === "base_drink" ? "ml" : c.newUnit,
                                  }
                                : c,
                            ),
                          )
                        }
                        className="h-10 shrink-0 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-ring"
                      >
                        <option value="base_drink">Bebida base</option>
                        <option value="ingredient">Ingrediente (drink)</option>
                        <option value="cozinha">Insumo de cozinha</option>
                      </select>
                      <select
                        value={row.newUnit}
                        onChange={(event) =>
                          onChange((current) =>
                            current.map((c) =>
                              c.key === row.key ? { ...c, newUnit: event.target.value } : c,
                            ),
                          )
                        }
                        className="h-10 w-20 shrink-0 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-ring"
                      >
                        {(row.newKind === "base_drink" ? ["ml", "un"] : ["ml", "un", "g"]).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(maxRows === undefined || components.length < maxRows) && (
            <button
              onClick={() =>
                onChange((current) => [
                  ...current,
                  {
                    key: `c-${Date.now()}-${current.length}`,
                    stockId: "",
                    quantity: "",
                    quantityMode: "fraction",
                    newName: "",
                    newKind: "base_drink",
                    newUnit: "ml",
                  },
                ])
              }
              className="w-full rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              + Puxar insumo do estoque
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CardapioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [recipeProductIds, setRecipeProductIds] = useState<Set<string>>(new Set());
  const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [openRestockId, setOpenRestockId] = useState<string | null>(null);
  const [restockAmount, setRestockAmount] = useState("");
  const [restockCost, setRestockCost] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restockError, setRestockError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<(typeof PRODUCT_UNITS)[number]>("un");
  const [packageType, setPackageType] = useState<(typeof PRODUCT_PACKAGE_TYPES)[number]>("Lata");
  const [stockQuantity, setStockQuantity] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Sugestão de item já existente enquanto digita o nome — evita cadastrar de novo algo que já
  // está no estoque ou no cardápio. "Ignorar"/"+ Puxar como insumo" guardam os ids que já
  // apareceram, não um booleano: assim, digitar mais letras do mesmo nome (que continua batendo
  // com os mesmos itens) não faz o aviso reaparecer a cada tecla — só quando surge um item novo.
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());

  // Insumos do estoque disponíveis para compor o item, e a ficha sendo montada aqui mesmo — sem
  // isso, montar o cardápio exigia digitar o nome do zero e depois ir a outra aba fazer a ligação.
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [components, setComponents] = useState<ComponentRow[]>([]);
  // null = ainda não escolheu; "stock" = puxar um insumo só direto do estoque; "recipe" = montar
  // ficha técnica com vários insumos. Só decide a apresentação — os dois usam a mesma tabela de
  // receita por baixo, então trocar de modo não perde nada além das linhas já digitadas.
  const [productMode, setProductMode] = useState<"stock" | "recipe" | null>(null);

  // Categoria é uma divisão do menu, não um produto — cadastro próprio, separado do formulário
  // de produto, pra "criar categoria" nunca virar "criar um produto vazio só pra registrar o nome".
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; needs_recipe: boolean }>
  >([]);
  const [newCategoryNeedsRecipe, setNewCategoryNeedsRecipe] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategorySaving, setEditCategorySaving] = useState(false);
  const [editCategoryError, setEditCategoryError] = useState<string | null>(null);

  // Edição de um produto já cadastrado — campos próprios, separados dos de "Novo produto", pra
  // abrir um não pisar no outro se os dois ficarem abertos ao mesmo tempo.
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState("");
  const [editProductCategory, setEditProductCategory] = useState("");
  const [editProductPrice, setEditProductPrice] = useState("");
  const [editProductUnit, setEditProductUnit] = useState<(typeof PRODUCT_UNITS)[number]>("un");
  const [editProductPackageType, setEditProductPackageType] =
    useState<(typeof PRODUCT_PACKAGE_TYPES)[number]>("Lata");
  const [editProductPhotoFile, setEditProductPhotoFile] = useState<File | null>(null);
  const [editProductSaving, setEditProductSaving] = useState(false);
  const [editProductCompressing, setEditProductCompressing] = useState(false);
  const [editProductError, setEditProductError] = useState<string | null>(null);
  // Ficha técnica do produto sendo editado — carregada do banco ao abrir o painel, separada de
  // `components` (que é só do formulário de "Novo produto") pra abrir um editor não pisar no outro.
  const [editComponents, setEditComponents] = useState<ComponentRow[]>([]);
  const [editRecipeLoading, setEditRecipeLoading] = useState(false);
  const [editRecipeLoadFailed, setEditRecipeLoadFailed] = useState(false);

  const loadOverview = useServerFn(getStockOverview);
  const loadStock = useServerFn(getBaseDrinksOverview);
  const loadCategories = useServerFn(listProductCategories);
  const createCategory = useServerFn(createProductCategory);
  const toggleCategoryNeedsRecipe = useServerFn(setCategoryNeedsRecipe);
  const deleteCategory = useServerFn(deleteProductCategory);
  const renameCategory = useServerFn(updateProductCategory);
  const productEntry = useServerFn(addProductEntry);
  const removeProduct = useServerFn(deactivateProduct);
  const deleteProduct = useServerFn(deleteProductFn);
  const uploadPhoto = useServerFn(uploadProductPhoto);
  const create = useServerFn(createProduct);
  const createBaseDrinkFn = useServerFn(createBaseDrink);
  const createIngredientFn = useServerFn(createIngredient);
  const update = useServerFn(updateProductFn);
  const saveRecipe = useServerFn(setRecipeItems);
  const loadRecipeItems = useServerFn(getRecipeItems);

  async function load() {
    const [result, stock, categoriesResult] = await Promise.all([
      loadOverview(),
      loadStock(),
      loadCategories(),
    ]);
    setLoadError(null);
    setProducts(result.products as Product[]);
    setRecipeProductIds(new Set(result.recipeProductIds));
    setPendingProductIds(new Set(result.pendingProductIds));
    setStockOptions([
      ...((stock.baseDrinks ?? []) as Array<Omit<StockOption, "kind">>).map((item) => ({
        ...item,
        kind: "base_drink" as const,
      })),
      ...((stock.ingredients ?? []) as Array<Omit<StockOption, "kind">>).map((item) => ({
        ...item,
        kind: "ingredient" as const,
      })),
    ]);
    setCategories(categoriesResult.categories);
    // Primeiro carregamento: começa com a primeira categoria já selecionada, pra não deixar o
    // formulário de produto abrir sem nenhuma escolhida.
    setCategory((current) => current || categoriesResult.categories[0]?.name || "");
  }

  async function submitNewCategory() {
    // Guarda contra duplo-envio: sem isso, apertar Enter de novo durante o pedido em andamento
    // dispara uma segunda criação e volta um "já existe" falso pra quem só apertou duas vezes.
    if (categorySaving) return;
    setCategoryError(null);
    setCategorySaving(true);
    try {
      const result = await createCategory({
        data: { name: newCategoryName, needsRecipe: newCategoryNeedsRecipe },
      });
      if (!result.ok) return setCategoryError(result.message ?? "Não foi possível criar.");
      setNewCategoryName("");
      setNewCategoryNeedsRecipe(false);
      setShowCategoryForm(false);
      // Categoria já foi criada nesse ponto — se o load() que só atualiza a tela falhar, isso não
      // pode virar "não foi possível criar" no catch de fora, que atribuiria a falha errada.
      try {
        await load();
      } catch {
        setCategoryError("Categoria criada, mas a lista não atualizou — recarregue a página.");
      }
    } catch {
      setCategoryError("Não foi possível criar — tente de novo.");
    } finally {
      setCategorySaving(false);
    }
  }

  async function toggleNeedsRecipe(cat: { id: string; needs_recipe: boolean }) {
    // Otimista: é um botão que se aperta e solta rápido — esperar o round-trip pra atualizar a
    // tela deixaria o clique parecendo que não fez nada.
    setCategories((current) =>
      current.map((c) => (c.id === cat.id ? { ...c, needs_recipe: !cat.needs_recipe } : c)),
    );
    const result = await toggleCategoryNeedsRecipe({
      data: { id: cat.id, needsRecipe: !cat.needs_recipe },
    });
    if (!result.ok) {
      setCategories((current) =>
        current.map((c) => (c.id === cat.id ? { ...c, needs_recipe: cat.needs_recipe } : c)),
      );
    }
  }

  async function confirmDeleteCategory(id: string, password: string) {
    const result = await deleteCategory({ data: { id, password } });
    if (result.ok) {
      setDeletingCategoryId(null);
      // Se a categoria apagada era a selecionada no formulário de produto, o select ficaria
      // apontando pra um nome que não existe mais — limpa pra load() escolher outra válida.
      if (categories.some((item) => item.id === id && item.name === category)) {
        setCategory("");
      }
      await load();
    }
    return result;
  }

  function openEditCategory(cat: { id: string; name: string }) {
    setEditingCategoryId(cat.id);
    setEditCategoryName(cat.name);
    setEditCategoryError(null);
    setDeletingCategoryId(null);
  }

  async function submitEditCategory() {
    if (!editingCategoryId) return;
    setEditCategoryError(null);
    setEditCategorySaving(true);
    try {
      const result = await renameCategory({
        data: { id: editingCategoryId, name: editCategoryName },
      });
      if (!result.ok) return setEditCategoryError(result.message ?? "Não foi possível salvar.");
      // Se a categoria renomeada é a selecionada no formulário de "Novo produto" ou no de editar
      // um produto já existente, acompanha o novo nome — senão o select ficaria com um valor que
      // não existe mais nas opções e a próxima tentativa de salvar falharia sem explicação.
      const renamedFrom = categories.find((item) => item.id === editingCategoryId)?.name;
      const newName = editCategoryName.trim();
      if (renamedFrom === category) setCategory(newName);
      if (renamedFrom === editProductCategory) setEditProductCategory(newName);
      setEditingCategoryId(null);
      await load();
    } catch {
      setEditCategoryError("Não foi possível salvar — tente de novo.");
    } finally {
      setEditCategorySaving(false);
    }
  }

  useEffect(() => {
    // listProductCategories agora lança em vez de virar lista vazia silenciosa quando a leitura
    // falha — mas isso significa que o carregamento em segundo plano, sem clique de ninguém pra
    // pegar o erro, precisa de um .catch explícito aqui. Sem isso, a tela não avisa nada e outros
    // dados carregados (produtos, insumos) também ficam desatualizados sem sinal nenhum.
    const safeLoad = () =>
      void load().catch(() => setLoadError("Não foi possível atualizar o cardápio."));
    safeLoad();
    const poll = setInterval(safeLoad, 15000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmRestock(productId: string) {
    setRestockError(null);
    const packs = Number(restockAmount);
    if (!Number.isFinite(packs) || !Number.isInteger(packs) || packs <= 0) {
      return setRestockError("Informe uma quantidade inteira maior que zero.");
    }
    let purchaseCost: number | undefined;
    if (restockCost.trim()) {
      const parsed = Number(restockCost.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) return setRestockError("Valor pago inválido.");
      purchaseCost = parsed;
    }
    setBusyId(productId);
    const result = await productEntry({ data: { productId, packs, purchaseCost } });
    setBusyId(null);
    // Falha silenciosa aqui faria a equipe achar que deu entrada quando não deu.
    if (!result.ok) return setRestockError(result.message ?? "Não foi possível registrar a entrada.");
    setOpenRestockId(null);
    setRestockAmount("");
    setRestockCost("");
    await load();
  }

  async function confirmDelete(productId: string, password: string) {
    const result = await removeProduct({ data: { productId, password } });
    if (result.ok) {
      setDeletingId(null);
      await load();
    }
    return result;
  }

  async function confirmDeletePermanently(productId: string, password: string) {
    const result = await deleteProduct({ data: { productId, password } });
    if (result.ok) {
      setDeletingId(null);
      await load();
    }
    return result;
  }

  async function openEditProduct(product: Product) {
    setEditingProductId(product.id);
    setEditProductName(product.name);
    setEditProductCategory(product.category);
    setEditProductPrice(String(product.price).replace(".", ","));
    setEditProductUnit(
      PRODUCT_UNITS.includes(product.unit as (typeof PRODUCT_UNITS)[number])
        ? (product.unit as (typeof PRODUCT_UNITS)[number])
        : "un",
    );
    setEditProductPackageType(
      PRODUCT_PACKAGE_TYPES.includes(product.package_type as (typeof PRODUCT_PACKAGE_TYPES)[number])
        ? (product.package_type as (typeof PRODUCT_PACKAGE_TYPES)[number])
        : "Outro",
    );
    setEditProductPhotoFile(null);
    setEditProductError(null);
    // Só um painel por produto — abrir editar fecha remover/entrada, e vice-versa (nos handlers
    // deles), senão os formulários se misturam na mesma linha.
    setDeletingId(null);
    setOpenRestockId(null);

    // Ficha técnica não vem junto no overview de produtos — busca à parte ao abrir o painel, pra
    // editar aqui mesmo em vez de mandar pra Estoque → Fichas técnicas.
    setEditComponents([]);
    setEditRecipeLoadFailed(false);
    setEditRecipeLoading(true);
    try {
      const result = await loadRecipeItems({ data: { productId: product.id } });
      setEditComponents(
        result.items.map((item, index) => {
          const unit = item.base_drink?.unit ?? item.ingredient?.unit ?? "ml";
          return {
            key: `e-${product.id}-${item.id ?? index}`,
            stockId: item.base_drink_id ?? item.ingredient_id ?? "",
            quantity: String(item.quantity).replace(".", ","),
            quantityMode: inferQuantityMode(Number(item.quantity), unit),
            newName: "",
            newKind: "base_drink" as const,
            newUnit: unit,
          };
        }),
      );
    } catch {
      // Se falhar, marca a ficha como não carregada — salvar não mexe na receita existente até
      // o usuário reabrir e tentar de novo (senão salvaria uma "ficha vazia" por cima da de
      // verdade e apagaria os insumos do produto sem querer).
      setEditRecipeLoadFailed(true);
      setEditProductError(
        "Não foi possível carregar a ficha técnica atual. As outras alterações podem ser salvas normalmente, mas reabra o editor pra mexer em \"Do que é feito\".",
      );
    } finally {
      setEditRecipeLoading(false);
    }
  }

  async function submitEditProduct() {
    if (!editingProductId) return;
    setEditProductError(null);
    const priceNumber = Number(editProductPrice.replace(",", "."));
    if (editProductName.trim().length < 2) return setEditProductError("Digite o nome do produto.");
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      return setEditProductError("Preço inválido.");
    }
    if (!editProductCategory) return setEditProductError("Escolha uma categoria.");

    // Mesma validação da ficha técnica do cadastro novo — uma linha malformada não pode virar
    // ficha salva pela metade.
    if (!editRecipeLoadFailed) {
      for (const row of editComponents) {
        if (!row.stockId) return setEditProductError("Escolha o insumo em todas as linhas, ou remova a linha.");
        if (row.stockId === NEW_STOCK_ID && row.newName.trim().length < 2) {
          return setEditProductError("Digite o nome do novo insumo em todas as linhas marcadas como novo.");
        }
        const quantity = Number(row.quantity.replace(",", "."));
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return setEditProductError("Informe uma quantidade maior que zero para cada insumo.");
        }
        if (row.quantityMode === "whole" && !Number.isInteger(quantity)) {
          return setEditProductError("Unidade inteira precisa de uma quantidade inteira (1, 2, 3...).");
        }
        if (row.stockId !== NEW_STOCK_ID && !stockOptions.find((item) => item.id === row.stockId)) {
          return setEditProductError("Insumo não encontrado — recarregue a página.");
        }
      }
    }

    setEditProductSaving(true);
    try {
      // Linhas "+ Criar novo insumo" nascem agora, com saldo zero, igual no cadastro novo.
      const resolvedComponents: Array<{
        kind: "base_drink" | "ingredient";
        id: string;
        quantity: number;
      }> = [];
      if (!editRecipeLoadFailed) {
        for (const row of editComponents) {
          const quantity = Number(row.quantity.replace(",", "."));
          if (row.stockId !== NEW_STOCK_ID) {
            const option = stockOptions.find((item) => item.id === row.stockId)!;
            resolvedComponents.push({ kind: option.kind, id: option.id, quantity });
            continue;
          }
          if (row.newKind === "base_drink") {
            const created = await createBaseDrinkFn({
              data: { name: row.newName, unit: row.newUnit as "ml" | "un" },
            });
            if (!created.ok) {
              return setEditProductError(
                `Não foi possível criar o insumo "${row.newName}": ${created.message ?? ""}`,
              );
            }
            resolvedComponents.push({ kind: "base_drink", id: created.id, quantity });
          } else {
            const created = await createIngredientFn({
              data: {
                name: row.newName,
                unit: row.newUnit as "ml" | "un" | "g",
                kind: row.newKind === "cozinha" ? "cozinha" : "drink",
              },
            });
            if (!created.ok) {
              return setEditProductError(
                `Não foi possível criar o insumo "${row.newName}": ${created.message ?? ""}`,
              );
            }
            resolvedComponents.push({ kind: "ingredient", id: created.id, quantity });
          }
        }
      }

      let imageUrl: string | undefined;
      if (editProductPhotoFile) {
        setEditProductCompressing(true);
        let compressed: { base64: string; contentType: string };
        try {
          compressed = await compressImageForUpload(editProductPhotoFile);
        } catch {
          return setEditProductError("Não foi possível processar a foto. Tente outra imagem.");
        } finally {
          setEditProductCompressing(false);
        }

        const jpgFileName = editProductPhotoFile.name.replace(/\.\w+$/, "") + ".jpg";
        const uploadResult = await uploadPhoto({
          data: { fileName: jpgFileName, base64: compressed.base64, contentType: compressed.contentType },
        });
        if (!uploadResult.ok) return setEditProductError(uploadResult.message);
        imageUrl = uploadResult.url;
      }

      const result = await update({
        data: {
          productId: editingProductId,
          name: editProductName,
          price: priceNumber,
          category: editProductCategory,
          unit: editProductUnit,
          packageType: editProductPackageType,
          ...(imageUrl !== undefined ? { imageUrl } : {}),
        },
      });
      if (!result.ok) return setEditProductError(result.message);

      // A ficha só é regravada quando ela carregou certinho ao abrir o painel — é o que permite
      // remover todos os insumos (ficha some) sem correr o risco de apagar por engano uma ficha
      // que nem chegou a carregar.
      if (!editRecipeLoadFailed) {
        const recipe: Array<
          | { type: "base_drink"; baseDrinkId: string; quantity: number }
          | { type: "ingredient"; ingredientId: string; quantity: number }
        > = resolvedComponents.map((c) =>
          c.kind === "base_drink"
            ? { type: "base_drink", baseDrinkId: c.id, quantity: c.quantity }
            : { type: "ingredient", ingredientId: c.id, quantity: c.quantity },
        );
        const savedRecipe = await saveRecipe({ data: { productId: editingProductId, items: recipe } });
        if (!savedRecipe.ok) {
          await load();
          return setEditProductError(
            `Produto salvo, mas a ficha técnica não atualizou: ${savedRecipe.message ?? "tente de novo."}`,
          );
        }
      }

      setEditingProductId(null);
      await load();
    } catch {
      setEditProductError("Não foi possível salvar — tente de novo.");
    } finally {
      setEditProductSaving(false);
    }
  }

  async function submitNewProduct() {
    setError(null);
    const priceNumber = Number(price.replace(",", "."));
    if (name.trim().length < 2) return setError("Digite o nome do produto.");
    if (!Number.isFinite(priceNumber) || priceNumber < 0) return setError("Preço inválido.");
    if (!category) return setError("Escolha uma categoria.");

    // Valida a ficha antes de criar o produto: melhor recusar agora do que deixar um produto
    // gravado com a receita pela metade.
    for (const row of components) {
      if (!row.stockId) return setError("Escolha o insumo em todas as linhas, ou remova a linha.");
      if (row.stockId === NEW_STOCK_ID && row.newName.trim().length < 2) {
        return setError("Digite o nome do novo insumo em todas as linhas marcadas como novo.");
      }
      const quantity = Number(row.quantity.replace(",", "."));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return setError("Informe uma quantidade maior que zero para cada insumo.");
      }
      if (row.quantityMode === "whole" && !Number.isInteger(quantity)) {
        return setError("Unidade inteira precisa de uma quantidade inteira (1, 2, 3...).");
      }
      if (row.stockId !== NEW_STOCK_ID && !stockOptions.find((item) => item.id === row.stockId)) {
        return setError("Insumo não encontrado — recarregue a página.");
      }
    }

    setSaving(true);

    // Linhas marcadas "+ Criar novo insumo" ainda não existem no estoque — nascem agora, com
    // saldo zero, antes de a ficha ser salva. É esse passo que inverte a ordem: o insumo pode ser
    // apontado na ficha antes de existir fisicamente no bar.
    const resolvedComponents: Array<{
      kind: "base_drink" | "ingredient";
      id: string;
      quantity: number;
    }> = [];
    for (const row of components) {
      const quantity = Number(row.quantity.replace(",", "."));
      if (row.stockId !== NEW_STOCK_ID) {
        const option = stockOptions.find((item) => item.id === row.stockId)!;
        resolvedComponents.push({ kind: option.kind, id: option.id, quantity });
        continue;
      }
      if (row.newKind === "base_drink") {
        const created = await createBaseDrinkFn({
          data: { name: row.newName, unit: row.newUnit as "ml" | "un" },
        });
        if (!created.ok) {
          setSaving(false);
          return setError(`Não foi possível criar o insumo "${row.newName}": ${created.message ?? ""}`);
        }
        resolvedComponents.push({ kind: "base_drink", id: created.id, quantity });
      } else {
        const created = await createIngredientFn({
          data: {
            name: row.newName,
            unit: row.newUnit as "ml" | "un" | "g",
            kind: row.newKind === "cozinha" ? "cozinha" : "drink",
          },
        });
        if (!created.ok) {
          setSaving(false);
          return setError(`Não foi possível criar o insumo "${row.newName}": ${created.message ?? ""}`);
        }
        resolvedComponents.push({ kind: "ingredient", id: created.id, quantity });
      }
    }

    const recipe: Array<
      | { type: "base_drink"; baseDrinkId: string; quantity: number }
      | { type: "ingredient"; ingredientId: string; quantity: number }
    > = resolvedComponents.map((c) =>
      c.kind === "base_drink"
        ? { type: "base_drink", baseDrinkId: c.id, quantity: c.quantity }
        : { type: "ingredient", ingredientId: c.id, quantity: c.quantity },
    );
    let imageUrl: string | undefined;
    if (photoFile) {
      setCompressing(true);
      let compressed: { base64: string; contentType: string };
      try {
        compressed = await compressImageForUpload(photoFile);
      } catch {
        setCompressing(false);
        setSaving(false);
        return setError("Não foi possível processar a foto. Tente outra imagem.");
      }
      setCompressing(false);

      const jpgFileName = photoFile.name.replace(/\.\w+$/, "") + ".jpg";
      const uploadResult = await uploadPhoto({
        data: { fileName: jpgFileName, base64: compressed.base64, contentType: compressed.contentType },
      });
      if (!uploadResult.ok) {
        setSaving(false);
        return setError(uploadResult.message);
      }
      imageUrl = uploadResult.url;
    }

    const result = await create({
      data: {
        name,
        category,
        price: priceNumber,
        unit,
        packageType,
        imageUrl,
        // Produto com ficha técnica não tem estoque próprio: quem controla é o dos insumos.
        stockQuantity: recipe.length > 0 ? undefined : stockQuantity ? Number(stockQuantity) : undefined,
      },
    });
    if (!result.ok) {
      setSaving(false);
      return setError(result.message);
    }

    // O produto já foi gravado. Se a ficha falhar, ele existe sem receita — a mensagem diz onde
    // parou, para a equipe completar em Estoque → Fichas técnicas, em vez de recadastrar tudo.
    if (recipe.length > 0 && result.productId) {
      const saved = await saveRecipe({ data: { productId: result.productId, items: recipe } });
      if (!saved.ok) {
        setSaving(false);
        await load();
        return setError(
          `Produto criado, mas a ficha técnica não foi salva: ${saved.message ?? "complete em Estoque → Fichas técnicas."}`,
        );
      }
    }

    setSaving(false);
    setComponents([]);
    setProductMode(null);
    setName("");
    setPrice("");
    setUnit("un");
    setPackageType("Lata");
    setStockQuantity("");
    setPhotoFile(null);
    setShowForm(false);
    setDismissedSuggestionIds(new Set());
    await load();
  }

  const nameMatches = useMemo(() => {
    const query = name.trim().toLowerCase();
    if (query.length < 2) return { products: [], stock: [] };
    return {
      products: products
        .filter((item) => item.name.toLowerCase().includes(query))
        .filter((item) => !dismissedSuggestionIds.has(item.id))
        .slice(0, 5),
      stock: stockOptions
        .filter((item) => item.name.toLowerCase().includes(query))
        .filter((item) => !dismissedSuggestionIds.has(item.id))
        .slice(0, 5),
    };
  }, [name, products, stockOptions, dismissedSuggestionIds]);

  function dismissNameSuggestions() {
    // Ignora TODOS os itens que batem com a busca, não só os 5 exibidos — senão "Ignorar" some
    // o bloco por um instante e ele reaparece na hora com o próximo lote de itens escondidos.
    const query = name.trim().toLowerCase();
    setDismissedSuggestionIds(
      (current) =>
        new Set([
          ...current,
          ...products.filter((item) => item.name.toLowerCase().includes(query)).map((item) => item.id),
          ...stockOptions
            .filter((item) => item.name.toLowerCase().includes(query))
            .map((item) => item.id),
        ]),
    );
  }

  function addComponentFromStock(stockId: string) {
    const option = stockOptions.find((item) => item.id === stockId);
    setComponents((current) => [
      ...current,
      {
        key: `c-${Date.now()}-${current.length}`,
        stockId,
        quantity: "",
        quantityMode: option?.unit === "un" ? "whole" : "fraction",
        newName: "",
        newKind: "base_drink",
        newUnit: "ml",
      },
    ]);
    setDismissedSuggestionIds((current) => new Set([...current, stockId]));
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const product of products) {
      const list = map.get(product.category) ?? [];
      list.push(product);
      map.set(product.category, list);
    }
    return Array.from(map.entries());
  }, [products]);


  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Cardápio</p>
          <h1 className="mt-1 text-3xl font-bold">Produtos</h1>
        </div>
        <button
          onClick={() => setShowPreview((value) => !value)}
          className="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {showPreview ? "Voltar à edição" : "Ver como fica pro cliente"}
        </button>
      </div>

      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}

      {showPreview ? (
        <CustomerMenuPreview grouped={grouped} recipeProductIds={recipeProductIds} />
      ) : (
        <div className="mt-5 space-y-5">
          {/* Categoria é só a divisão do menu — cadastro próprio, que pede apenas nome. Fica fora
              e antes do formulário de produto de propósito, pra não parecerem a mesma ação. */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Categorias</p>
              <button
                onClick={() => {
                  setShowCategoryForm((value) => !value);
                  setCategoryError(null);
                  setNewCategoryName("");
                }}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {showCategoryForm ? "Cancelar" : "+ Nova categoria"}
              </button>
            </div>

            {categories.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Nenhuma categoria ainda.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {categories.map((cat) =>
                  editingCategoryId === cat.id ? (
                    <span
                      key={cat.id}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-2 pr-1.5"
                    >
                      <input
                        value={editCategoryName}
                        onChange={(event) => setEditCategoryName(event.target.value)}
                        autoFocus
                        onKeyDown={(event) => event.key === "Enter" && void submitEditCategory()}
                        className="h-7 w-28 rounded-full border border-border bg-background px-2 text-xs outline-none focus:border-ring"
                      />
                      <button
                        onClick={() => void submitEditCategory()}
                        disabled={editCategorySaving}
                        aria-label="Salvar nome da categoria"
                        className="rounded-full px-1 text-primary disabled:opacity-60"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingCategoryId(null)}
                        aria-label="Cancelar edição da categoria"
                        className="rounded-full px-1 text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <span
                      key={cat.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-1 pl-3 pr-1.5 text-xs font-medium text-secondary-foreground"
                    >
                      <button onClick={() => openEditCategory(cat)} className="hover:underline">
                        {cat.name}
                      </button>
                      <button
                        onClick={() => void toggleNeedsRecipe(cat)}
                        title={
                          cat.needs_recipe
                            ? "Itens desta categoria consomem insumos — clique para desligar"
                            : "Marcar que itens desta categoria consomem insumos (precisam de ficha técnica)"
                        }
                        className={`rounded-full px-1 ${cat.needs_recipe ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
                      >
                        🧪
                      </button>
                      <button
                        onClick={() =>
                          setDeletingCategoryId(deletingCategoryId === cat.id ? null : cat.id)
                        }
                        aria-label={`Apagar categoria ${cat.name}`}
                        className="rounded-full px-1 text-muted-foreground hover:text-destructive"
                      >
                        ×
                      </button>
                    </span>
                  ),
                )}
              </div>
            )}
            {editCategoryError && <p className="mt-2 text-xs text-destructive">{editCategoryError}</p>}
            {deletingCategoryId && (
              <div className="mt-2">
                <PasswordConfirm
                  message={`Apagar a categoria "${categories.find((c) => c.id === deletingCategoryId)?.name}"? Só funciona se nenhum produto estiver nela — mude a categoria deles antes. Confirme com a senha da equipe.`}
                  confirmLabel="Apagar categoria"
                  onCancel={() => setDeletingCategoryId(null)}
                  onConfirm={(password) => confirmDeleteCategory(deletingCategoryId, password)}
                />
              </div>
            )}
            {showCategoryForm && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="Nome da categoria"
                    autoFocus
                    onKeyDown={(event) => event.key === "Enter" && void submitNewCategory()}
                    className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
                  />
                  <button
                    onClick={() => void submitNewCategory()}
                    disabled={categorySaving || newCategoryName.trim().length < 2}
                    className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {categorySaving ? "Salvando..." : "Criar"}
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={newCategoryNeedsRecipe}
                    onChange={(event) => setNewCategoryNeedsRecipe(event.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Itens desta categoria consomem insumos (drinks, cozinha) — aponta os produtos sem
                  ficha técnica como pendentes
                </label>
              </div>
            )}
            {categoryError && <p className="mt-2 text-xs text-destructive">{categoryError}</p>}
          </div>

          <button
            onClick={() => {
              setShowForm((value) => !value);
              setDismissedSuggestionIds(new Set());
            }}
            className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {showForm ? "Cancelar" : "+ Novo produto"}
          </button>

          {showForm && (
            <SectionCard title="Novo produto do cardápio">
              <div className="space-y-3">
                <TextField label="Nome" value={name} onChange={setName} placeholder="Caipirinha" />
                {(nameMatches.products.length > 0 || nameMatches.stock.length > 0) && (
                    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold">Já existe algo parecido</p>
                        <button
                          onClick={dismissNameSuggestions}
                          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Ignorar
                        </button>
                      </div>
                      {nameMatches.products.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          <p className="text-xs text-muted-foreground">No cardápio:</p>
                          {nameMatches.products.map((item) => (
                            <p key={item.id} className="text-xs">
                              {item.name} · {item.category}
                            </p>
                          ))}
                        </div>
                      )}
                      {nameMatches.stock.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs text-muted-foreground">No estoque:</p>
                          {nameMatches.stock.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-2">
                              <span className="text-xs">
                                {item.name} ({item.current_stock} {item.unit})
                              </span>
                              <button
                                onClick={() => addComponentFromStock(item.id)}
                                className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                              >
                                + Puxar como insumo
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                {/* Categoria é uma entidade própria (ver seção abaixo) — aqui só escolhe entre as
                    que já existem. Sem opção de criar embutida: criar categoria não é criar produto. */}
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Categoria</span>
                  {categories.length === 0 ? (
                    <p className="mt-1 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                      Nenhuma categoria cadastrada. Crie uma na seção "Categorias" acima antes de
                      cadastrar o produto.
                    </p>
                  ) : (
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                    >
                      {categories.map((option) => (
                        <option key={option.id} value={option.name}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <TextField label="Preço (R$)" value={price} onChange={setPrice} placeholder="18,00" />
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">Unidade de medida</span>
                    <select
                      value={unit}
                      onChange={(event) => setUnit(event.target.value as (typeof PRODUCT_UNITS)[number])}
                      className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                    >
                      {PRODUCT_UNITS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">Tipo</span>
                    <select
                      value={packageType}
                      onChange={(event) =>
                        setPackageType(event.target.value as (typeof PRODUCT_PACKAGE_TYPES)[number])
                      }
                      className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                    >
                      {PRODUCT_PACKAGE_TYPES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {productMode === null ? (
                  <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3">
                    <p className="text-xs font-semibold">Do que é feito</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Esse item consome algo do estoque pra vender? Escolha como — ou deixe assim
                      e use "Estoque inicial" logo abaixo pra um item sem insumo nenhum.
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => {
                          setProductMode("stock");
                          setComponents([
                            {
                              key: `c-${Date.now()}-0`,
                              stockId: "",
                              quantity: "",
                              quantityMode: "whole",
                              newName: "",
                              newKind: "base_drink",
                              newUnit: "ml",
                            },
                          ]);
                        }}
                        className="rounded-xl border border-dashed border-border p-3 text-left hover:border-primary"
                      >
                        <p className="text-xs font-semibold">Puxar direto do estoque</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Um insumo só — ex.: cerveja lata (unidade inteira) ou uma dose de uma
                          garrafa (fração).
                        </p>
                      </button>
                      <button
                        onClick={() => {
                          setProductMode("recipe");
                          setComponents([]);
                        }}
                        className="rounded-xl border border-dashed border-border p-3 text-left hover:border-primary"
                      >
                        <p className="text-xs font-semibold">Elaborar ficha técnica</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Vários insumos juntos — drinks e pratos com mais de um componente.
                        </p>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <button
                      onClick={() => {
                        setProductMode(null);
                        setComponents([]);
                      }}
                      className="text-[11px] font-medium text-muted-foreground underline hover:text-foreground"
                    >
                      ← trocar modo
                    </button>
                    <RecipeBuilder
                      components={components}
                      onChange={setComponents}
                      stockOptions={stockOptions}
                      maxRows={productMode === "stock" ? 1 : undefined}
                      warning={
                        categories.find((c) => c.name === category)?.needs_recipe
                          ? `A categoria "${category}" marca que os itens consomem insumos — este produto vai ficar pendente até você montar a ficha.`
                          : undefined
                      }
                    />
                  </div>
                )}

                {/* Só aparece antes de escolher um modo de "Do que é feito" — depois que o modo é
                    escolhido (mesmo com a lista ainda vazia), o campo certo pra saldo é a ficha,
                    não esse aqui, senão vira um número paralelo que nunca baixa. */}
                {productMode === null && (
                  <TextField
                    label="Estoque inicial (só para item SEM insumo escolhido acima, ex.: cerveja lata fechada)"
                    value={stockQuantity}
                    onChange={setStockQuantity}
                    placeholder="0"
                    type="number"
                  />
                )}
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Foto (opcional)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-medium"
                  />
                </label>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <PrimaryButton onClick={submitNewProduct} disabled={saving}>
                  {compressing ? "Comprimindo foto..." : saving ? "Salvando..." : "Salvar produto"}
                </PrimaryButton>
              </div>
            </SectionCard>
          )}

          {grouped.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              Nenhum produto cadastrado ainda.
            </p>
          ) : (
            <div className="space-y-6">
              {grouped.map(([categoryName, categoryProducts]) => (
                <div key={categoryName}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    {categoryName}
                  </p>
                  <ul className="space-y-3">
                    {categoryProducts.map((product) => {
                      // Produto com ficha técnica não tem estoque próprio: quem manda é o estoque
                      // dos componentes. Mostrar "0 un" em vermelho e oferecer "+ Repor" aqui
                      // sugeriria um problema que não existe e um botão que não resolve nada.
                      const hasRecipe = recipeProductIds.has(product.id);
                      const isPending = pendingProductIds.has(product.id);
                      const low = !hasRecipe && product.stock_quantity < LOW_STOCK_THRESHOLD;
                      const isOpen = openRestockId === product.id;
                      const isDeleting = deletingId === product.id;
                      const isEditing = editingProductId === product.id;
                      return (
                        <li key={product.id} className="rounded-2xl border border-border bg-card p-4">
                          {isPending && (
                            <p className="mb-2 text-xs font-medium text-destructive">
                              ⚠ Configuração de estoque pendente — vincule uma ficha técnica ou dê
                              a primeira entrada para liberar a venda.
                            </p>
                          )}
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="h-10 w-10 shrink-0 rounded-lg bg-muted" />
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{product.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {brl(product.price)}
                                  {product.package_type ? ` · ${product.package_type}` : ""}
                                  {product.unit ? ` (${product.unit})` : ""}
                                  {!hasRecipe && product.average_cost > 0
                                    ? ` · custo ${brl(product.average_cost)}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-sm font-bold ${low ? "text-destructive" : ""}`}>
                                {hasRecipe ? "ficha técnica" : `${product.stock_quantity} un`}
                              </span>
                              {!hasRecipe && (
                                <button
                                  onClick={() => {
                                    setOpenRestockId(isOpen ? null : product.id);
                                    setRestockAmount("");
                                    setRestockCost("");
                                    setDeletingId(null);
                                    setEditingProductId(null);
                                    // Sem isso, o erro de uma linha reaparece no formulário da
                                    // próxima que for aberta.
                                    setRestockError(null);
                                  }}
                                  // Uma entrada por vez: o formulário é compartilhado, então
                                  // abrir outro no meio de um envio mistura as duas linhas.
                                  disabled={busyId !== null && busyId !== product.id}
                                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                                >
                                  {isOpen ? "Cancelar" : "+ Entrada"}
                                </button>
                              )}
                              <button
                                onClick={() => (isEditing ? setEditingProductId(null) : openEditProduct(product))}
                                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                              >
                                {isEditing ? "Cancelar" : "Editar"}
                              </button>
                              <button
                                onClick={() => {
                                  setDeletingId(isDeleting ? null : product.id);
                                  setOpenRestockId(null);
                                  setEditingProductId(null);
                                  setRestockError(null);
                                }}
                                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                              >
                                Remover
                              </button>
                            </div>
                          </div>

                          {isEditing && (
                            <div className="mt-3 space-y-3 rounded-xl border border-dashed border-border p-3">
                              <TextField label="Nome" value={editProductName} onChange={setEditProductName} />
                              <label className="block">
                                <span className="text-xs font-medium text-muted-foreground">Categoria</span>
                                <select
                                  value={editProductCategory}
                                  onChange={(event) => setEditProductCategory(event.target.value)}
                                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                                >
                                  {categories.map((option) => (
                                    <option key={option.id} value={option.name}>
                                      {option.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <TextField label="Preço (R$)" value={editProductPrice} onChange={setEditProductPrice} />
                              <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                  <span className="text-xs font-medium text-muted-foreground">Unidade de medida</span>
                                  <select
                                    value={editProductUnit}
                                    onChange={(event) =>
                                      setEditProductUnit(event.target.value as (typeof PRODUCT_UNITS)[number])
                                    }
                                    className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                                  >
                                    {PRODUCT_UNITS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block">
                                  <span className="text-xs font-medium text-muted-foreground">Tipo</span>
                                  <select
                                    value={editProductPackageType}
                                    onChange={(event) =>
                                      setEditProductPackageType(
                                        event.target.value as (typeof PRODUCT_PACKAGE_TYPES)[number],
                                      )
                                    }
                                    className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                                  >
                                    {PRODUCT_PACKAGE_TYPES.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              {editRecipeLoading ? (
                                <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                                  Carregando ficha técnica atual...
                                </p>
                              ) : editRecipeLoadFailed ? (
                                <p className="rounded-xl border border-dashed border-destructive/40 p-3 text-xs text-destructive">
                                  Não foi possível carregar a ficha técnica — feche e reabra "Editar"
                                  para tentar de novo. As outras alterações acima podem ser salvas
                                  normalmente.
                                </p>
                              ) : (
                                <RecipeBuilder
                                  components={editComponents}
                                  onChange={setEditComponents}
                                  stockOptions={stockOptions}
                                  maxRows={undefined}
                                  warning={
                                    categories.find((c) => c.name === editProductCategory)?.needs_recipe
                                      ? `A categoria "${editProductCategory}" marca que os itens consomem insumos — este produto vai ficar pendente até a ficha ter pelo menos um insumo.`
                                      : undefined
                                  }
                                />
                              )}
                              <label className="block">
                                <span className="text-xs font-medium text-muted-foreground">
                                  Trocar foto (opcional)
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(event) => setEditProductPhotoFile(event.target.files?.[0] ?? null)}
                                  className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-medium"
                                />
                              </label>
                              {editProductError && (
                                <p className="text-xs text-destructive">{editProductError}</p>
                              )}
                              <PrimaryButton
                                onClick={submitEditProduct}
                                disabled={editProductSaving || editRecipeLoading}
                              >
                                {editProductCompressing
                                  ? "Comprimindo foto..."
                                  : editProductSaving
                                    ? "Salvando..."
                                    : "Salvar alterações"}
                              </PrimaryButton>
                            </div>
                          )}

                          {isDeleting && (
                            <div className="mt-3 space-y-2">
                              <PasswordConfirm
                                message={`Tirar “${product.name}” do cardápio? O cadastro e o histórico de vendas continuam guardados — o item só deixa de aparecer para lançamento. Confirme com a senha da equipe.`}
                                confirmLabel="Remover"
                                onCancel={() => setDeletingId(null)}
                                onConfirm={(password) => confirmDelete(product.id, password)}
                              />
                              {/* Só some do banco quando não há histórico de verdade (vendas/
                                  movimentos) — a função no servidor recusa se houver, mesmo com
                                  senha certa. O estoque em si nunca é o que bloqueia. */}
                              <details className="rounded-xl border border-dashed border-border px-3 py-2">
                                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-destructive">
                                  Cadastrei errado — apagar de vez (sem histórico)
                                </summary>
                                <div className="mt-2">
                                  <PasswordConfirm
                                    message={`Apagar “${product.name}” de vez? Só funciona se ele nunca teve venda nem movimento de estoque registrado — não dá pra desfazer. Confirme com a senha da equipe.`}
                                    confirmLabel="Apagar de vez"
                                    onCancel={() => setDeletingId(null)}
                                    onConfirm={(password) => confirmDeletePermanently(product.id, password)}
                                  />
                                </div>
                              </details>
                            </div>
                          )}

                          {isOpen && (
                            <div className="mt-3">
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  value={restockAmount}
                                  onChange={(event) => setRestockAmount(event.target.value)}
                                  placeholder={
                                    product.purchase_unit
                                      ? `Quantas ${product.purchase_unit}`
                                      : "Quantidade"
                                  }
                                  autoFocus
                                  className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
                                />
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={restockCost}
                                  onChange={(event) => setRestockCost(event.target.value)}
                                  placeholder="Total pago (R$)"
                                  className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
                                />
                              </div>
                              {Number(restockAmount) > 0 && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Entram{" "}
                                  {Number(restockAmount) *
                                    product.units_per_pack *
                                    Number(product.content_amount)}{" "}
                                  un no estoque
                                  {Number(restockCost.replace(",", ".")) > 0
                                    ? ` · ${brl(
                                        Number(restockCost.replace(",", ".")) /
                                          (Number(restockAmount) *
                                            product.units_per_pack *
                                            Number(product.content_amount)),
                                      )} por un`
                                    : ""}
                                </p>
                              )}
                              <button
                                onClick={() => confirmRestock(product.id)}
                                disabled={busyId === product.id || !restockAmount}
                                className="mt-2 h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                              >
                                {busyId === product.id ? "Salvando..." : "Confirmar entrada"}
                              </button>
                              {restockError && (
                                <p className="mt-2 text-xs text-destructive">{restockError}</p>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

/** Prévia somente-leitura: como o cardápio aparece pra quem está lançando/vendo pelo lado do cliente. */
function CustomerMenuPreview(props: {
  grouped: Array<[string, Product[]]>;
  recipeProductIds: Set<string>;
}) {
  // O cliente só vê produto ativo, então a categoria que ficou sem nenhum não deve aparecer
  // como um título solto com grade vazia.
  const visible = props.grouped
    .map(([name, items]) => [name, items.filter((p) => p.is_active)] as [string, Product[]])
    .filter(([, items]) => items.length > 0);

  if (visible.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Nenhum produto ativo no cardápio.
      </p>
    );
  }

  return (
    <div className="mt-5 space-y-6">
      {visible.map(([categoryName, categoryProducts]) => (
        <div key={categoryName}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {categoryName}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {categoryProducts
              .map((product) => {
                // stock_quantity só é confiável pra produto sem ficha técnica (ex.: cerveja lata) —
                // produto com receita depende do estoque dos componentes, não desse campo.
                const soldOut =
                  !props.recipeProductIds.has(product.id) && product.stock_quantity <= 0;
                return (
                  <div
                    key={product.id}
                    className={`flex items-center gap-3 rounded-2xl border border-border bg-card p-3 ${soldOut ? "opacity-50" : ""}`}
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-muted" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-snug">{product.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {soldOut ? "Esgotado" : brl(Number(product.price))}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
