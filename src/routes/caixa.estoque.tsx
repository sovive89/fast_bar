import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { brl, parseAmount } from "@/lib/format";
import { getStockOverview, restockProduct } from "@/lib/stock.functions";
import {
  addBaseDrinkEntry,
  addIngredientEntry,
  createBaseDrink,
  createIngredient,
  createProduct,
  createSupplier,
  getRecipeItems,
  getBaseDrinksOverview,
  listAllProducts,
  listSuppliers,
  setRecipeItems,
  updateBaseDrinkPackaging,
  updateIngredientPackaging,
  uploadProductPhoto,
  PRODUCT_UNITS,
  PRODUCT_PACKAGE_TYPES,
} from "@/lib/base-drinks.functions";

export const Route = createFileRoute("/caixa/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque | FastBar" },
      {
        name: "description",
        content: "Produtos, bebidas base, ingredientes, fornecedores e fichas técnicas.",
      },
    ],
  }),
  component: StockOverview,
});

type Tab = "produtos" | "bebidas" | "ingredientes" | "fornecedores" | "fichas";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "produtos", label: "Produtos" },
  { id: "bebidas", label: "Bebidas base" },
  { id: "ingredientes", label: "Ingredientes" },
  { id: "fornecedores", label: "Fornecedores" },
  { id: "fichas", label: "Fichas técnicas" },
];

function StockOverview() {
  const [tab, setTab] = useState<Tab>("produtos");

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Estoque</p>
        <h1 className="mt-1 text-3xl font-bold">Gestão do bar</h1>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${
              tab === item.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "produtos" && <ProdutosTab />}
        {tab === "bebidas" && <BebidasBaseTab />}
        {tab === "ingredientes" && <IngredientesTab />}
        {tab === "fornecedores" && <FornecedoresTab />}
        {tab === "fichas" && <FichasTecnicasTab />}
      </div>
    </main>
  );
}

// ============================================================
// Componentes de UI reutilizados nas abas
// ============================================================

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
      />
    </label>
  );
}

function PrimaryButton(props: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      {props.children}
    </button>
  );
}

function SectionCard(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{props.title}</p>
      <div className="mt-3">{props.children}</div>
    </div>
  );
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
  return { base64, contentType: "image/jpeg" };
}

// ============================================================
// Aba: Produtos (cardápio)
// ============================================================

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
};

const LOW_STOCK_THRESHOLD = 20;

function ProdutosTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [openRestockId, setOpenRestockId] = useState<string | null>(null);
  const [restockAmount, setRestockAmount] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Bebidas");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<(typeof PRODUCT_UNITS)[number]>("un");
  const [packageType, setPackageType] = useState<(typeof PRODUCT_PACKAGE_TYPES)[number]>("Lata");
  const [stockQuantity, setStockQuantity] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useServerFn(getStockOverview);
  const restock = useServerFn(restockProduct);
  const uploadPhoto = useServerFn(uploadProductPhoto);
  const create = useServerFn(createProduct);

  async function load() {
    const result = await loadOverview();
    setProducts(result.products as Product[]);
  }

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 15000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmRestock(productId: string) {
    const quantity = Number(restockAmount);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setBusyId(productId);
    const result = await restock({ data: { productId, quantity } });
    setBusyId(null);
    if (result.ok) {
      setOpenRestockId(null);
      setRestockAmount("");
      await load();
    }
  }

  async function submitNewProduct() {
    setError(null);
    const priceNumber = Number(price.replace(",", "."));
    if (name.trim().length < 2) return setError("Digite o nome do produto.");
    if (!Number.isFinite(priceNumber) || priceNumber < 0) return setError("Preço inválido.");

    setSaving(true);
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
        stockQuantity: stockQuantity ? Number(stockQuantity) : undefined,
      },
    });
    setSaving(false);
    if (!result.ok) return setError(result.message);

    setName("");
    setCategory("Bebidas");
    setPrice("");
    setUnit("un");
    setPackageType("Lata");
    setStockQuantity("");
    setPhotoFile(null);
    setShowForm(false);
    await load();
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
    <div className="space-y-5">
      <button
        onClick={() => setShowForm((value) => !value)}
        className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {showForm ? "Cancelar" : "+ Novo produto"}
      </button>

      {showForm && (
        <SectionCard title="Novo produto do cardápio">
          <div className="space-y-3">
            <TextField label="Nome" value={name} onChange={setName} placeholder="Caipirinha" />
            <TextField label="Categoria" value={category} onChange={setCategory} placeholder="Drinks" />
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
            <TextField
              label="Estoque inicial (só se NÃO tiver ficha técnica, ex.: cerveja lata)"
              value={stockQuantity}
              onChange={setStockQuantity}
              placeholder="0"
              type="number"
            />
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
            <p className="text-xs text-muted-foreground">
              Depois de criar, vá na aba "Fichas técnicas" pra ligar esse produto às bebidas base
              e ingredientes que ele consome — assim a baixa de estoque acontece sozinha a cada
              venda.
            </p>
          </div>
        </SectionCard>
      )}

      {grouped.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nenhum produto cadastrado ainda.
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([categoryName, items]) => (
            <div key={categoryName}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {categoryName}
              </p>
              <ul className="space-y-3">
                {items.map((product) => {
                  const low = product.stock_quantity < LOW_STOCK_THRESHOLD;
                  const isOpen = openRestockId === product.id;
                  return (
                    <li key={product.id} className="rounded-2xl border border-border bg-card p-4">
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
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-bold ${low ? "text-destructive" : ""}`}>
                            {product.stock_quantity} un
                          </span>
                          <button
                            onClick={() => {
                              setOpenRestockId(isOpen ? null : product.id);
                              setRestockAmount("");
                            }}
                            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {isOpen ? "Cancelar" : "+ Repor"}
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="mt-3 flex gap-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={restockAmount}
                            onChange={(event) => setRestockAmount(event.target.value)}
                            placeholder="Quantidade"
                            autoFocus
                            className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
                          />
                          <button
                            onClick={() => confirmRestock(product.id)}
                            disabled={busyId === product.id || !restockAmount}
                            className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                          >
                            {busyId === product.id ? "Salvando..." : "Confirmar"}
                          </button>
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
  );
}

// ============================================================
// Abas: Bebidas base / Ingredientes (mesmo padrão, unidades diferentes)
// ============================================================

type StockComponent = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  average_cost: number;
  purchase_unit: string | null;
  units_per_pack: number;
  content_amount: number;
  doses: Array<{ productName: string; doses: number }>;
};

type Supplier = { id: string; name: string; document: string | null; phone: string | null; active: boolean };

function ComponentStockTab(props: {
  kind: "base_drink" | "ingredient";
  title: string;
  units: string[];
  createFn: (input: {
    data: {
      name: string;
      unit: string;
      minStock?: number | undefined;
      purchaseUnit?: string | undefined;
      unitsPerPack?: number | undefined;
      contentAmount?: number | undefined;
    };
  }) => Promise<{ ok: boolean; message?: string }>;
  entryFn: (input: {
    data: {
      id: string;
      packs: number;
      purchaseCost?: number | undefined;
      supplierId?: string | undefined;
      note?: string | undefined;
    };
  }) => Promise<{ ok: boolean; message?: string }>;
  updatePackagingFn: (input: {
    data: {
      id: string;
      purchaseUnit?: string | undefined;
      unitsPerPack?: number | undefined;
      contentAmount?: number | undefined;
    };
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [items, setItems] = useState<StockComponent[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(props.units[0]);
  const [minStock, setMinStock] = useState("");
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [unitsPerPack, setUnitsPerPack] = useState("1");
  const [contentAmount, setContentAmount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [entryPacks, setEntryPacks] = useState("");
  const [entryPurchaseCost, setEntryPurchaseCost] = useState("");
  const [entrySupplierId, setEntrySupplierId] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);

  const [openPackagingId, setOpenPackagingId] = useState<string | null>(null);
  const [editPurchaseUnit, setEditPurchaseUnit] = useState("");
  const [editUnitsPerPack, setEditUnitsPerPack] = useState("1");
  const [editContentAmount, setEditContentAmount] = useState("1");
  const [packagingError, setPackagingError] = useState<string | null>(null);
  const [packagingBusy, setPackagingBusy] = useState(false);

  const overview = useServerFn(getBaseDrinksOverview);
  const listSup = useServerFn(listSuppliers);

  async function load() {
    const [overviewResult, suppliersResult] = await Promise.all([overview(), listSup()]);
    const list =
      props.kind === "base_drink" ? overviewResult.baseDrinks : overviewResult.ingredients;
    setItems((list ?? []) as StockComponent[]);
    setSuppliers(suppliersResult.suppliers as Supplier[]);
  }

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 15000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitNew() {
    setError(null);
    if (name.trim().length < 2) return setError("Digite o nome.");

    const packsPerPackValue = unitsPerPack ? parseAmount(unitsPerPack) : 1;
    if (packsPerPackValue === null || !Number.isInteger(packsPerPackValue) || packsPerPackValue <= 0) {
      return setError("Itens por embalagem deve ser um número inteiro maior que zero.");
    }
    const contentValue = contentAmount ? parseAmount(contentAmount) : 1;
    if (contentValue === null || contentValue <= 0) {
      return setError("Conteúdo por item deve ser maior que zero.");
    }

    setSaving(true);
    const result = await props.createFn({
      data: {
        name,
        unit,
        minStock: minStock ? Number(minStock) : undefined,
        purchaseUnit: purchaseUnit || undefined,
        unitsPerPack: packsPerPackValue,
        contentAmount: contentValue,
      },
    });
    setSaving(false);
    if (!result.ok) return setError(result.message ?? "Não foi possível salvar.");
    setName("");
    setMinStock("");
    setPurchaseUnit("");
    setUnitsPerPack("1");
    setContentAmount("1");
    setShowForm(false);
    await load();
  }

  async function submitEntry(item: StockComponent) {
    setEntryError(null);
    const packs = parseAmount(entryPacks);
    if (packs === null || !Number.isInteger(packs) || packs <= 0) {
      return setEntryError("Informe um número inteiro de embalagens.");
    }

    let purchaseCost: number | undefined;
    if (entryPurchaseCost.trim()) {
      const parsed = parseAmount(entryPurchaseCost);
      if (parsed === null || parsed < 0) return setEntryError("Valor pago inválido.");
      purchaseCost = parsed;
    }

    setEntryBusy(true);
    const result = await props.entryFn({
      data: {
        id: item.id,
        packs,
        purchaseCost,
        supplierId: entrySupplierId || undefined,
      },
    });
    setEntryBusy(false);
    if (!result.ok) return setEntryError(result.message ?? "Não foi possível registrar a entrada.");
    setOpenEntryId(null);
    setEntryPacks("");
    setEntryPurchaseCost("");
    setEntrySupplierId("");
    await load();
  }

  function openPackagingEditor(item: StockComponent) {
    setOpenPackagingId(item.id);
    setOpenEntryId(null);
    setPackagingError(null);
    setEditPurchaseUnit(item.purchase_unit ?? "");
    setEditUnitsPerPack(String(item.units_per_pack));
    setEditContentAmount(String(item.content_amount));
  }

  async function submitPackaging(item: StockComponent) {
    setPackagingError(null);
    const perPack = parseAmount(editUnitsPerPack);
    if (perPack === null || !Number.isInteger(perPack) || perPack <= 0) {
      return setPackagingError("Itens por embalagem deve ser um número inteiro maior que zero.");
    }
    const content = parseAmount(editContentAmount);
    if (content === null || content <= 0) {
      return setPackagingError("Conteúdo por item deve ser maior que zero.");
    }

    setPackagingBusy(true);
    const result = await props.updatePackagingFn({
      data: {
        id: item.id,
        purchaseUnit: editPurchaseUnit || undefined,
        unitsPerPack: perPack,
        contentAmount: content,
      },
    });
    setPackagingBusy(false);
    if (!result.ok) return setPackagingError(result.message ?? "Não foi possível salvar.");
    setOpenPackagingId(null);
    await load();
  }

  return (
    <div className="space-y-5">
      <button
        onClick={() => setShowForm((value) => !value)}
        className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {showForm ? "Cancelar" : `+ Nova ${props.title.toLowerCase()}`}
      </button>

      {showForm && (
        <SectionCard title={`Nova ${props.title.toLowerCase()}`}>
          <div className="space-y-3">
            <TextField label="Nome" value={name} onChange={setName} placeholder="Vodka Smirnoff 1L" />
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Unidade</span>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
              >
                {props.units.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Estoque mínimo (alerta)"
              value={minStock}
              onChange={setMinStock}
              placeholder="0"
              type="number"
            />
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-medium">Como você compra</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                O custo por {unit} é calculado a partir daqui — você nunca digita ele na mão.
              </p>
              <div className="mt-3 space-y-3">
                <TextField
                  label="Unidade de compra"
                  value={purchaseUnit}
                  onChange={setPurchaseUnit}
                  placeholder="garrafa, caixa, fardo..."
                />
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Itens por embalagem"
                    value={unitsPerPack}
                    onChange={setUnitsPerPack}
                    placeholder="1"
                    type="number"
                  />
                  <TextField
                    label={`Conteúdo por item (${unit})`}
                    value={contentAmount}
                    onChange={setContentAmount}
                    placeholder="1"
                    type="number"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ex.: caixa com 12 latas de 350 ml → 12 itens, 350 de conteúdo. Garrafa de 1L → 1
                item, 1000 de conteúdo.
              </p>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <PrimaryButton onClick={submitNew} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </PrimaryButton>
          </div>
        </SectionCard>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nada cadastrado ainda.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const low = item.current_stock < item.min_stock;
            const isOpen = openEntryId === item.id;
            const isPackagingOpen = openPackagingId === item.id;
            return (
              <li key={item.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Custo médio: {brl(item.average_cost)} / {item.unit}
                      {item.purchase_unit
                        ? ` · comprado em ${item.purchase_unit} (${item.units_per_pack} × ${item.content_amount}${item.unit})`
                        : ""}
                    </p>
                    {item.doses.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.doses.map((d) => `${d.productName}: ${d.doses} doses`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`text-sm font-bold ${low ? "text-destructive" : ""}`}>
                      {item.current_stock} {item.unit}
                    </span>
                    <button
                      onClick={() =>
                        isPackagingOpen ? setOpenPackagingId(null) : openPackagingEditor(item)
                      }
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {isPackagingOpen ? "Cancelar" : "Embalagem"}
                    </button>
                    <button
                      onClick={() => {
                        setOpenEntryId(isOpen ? null : item.id);
                        setOpenPackagingId(null);
                        setEntryPacks("");
                        setEntryPurchaseCost("");
                        setEntrySupplierId("");
                        setEntryError(null);
                      }}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {isOpen ? "Cancelar" : "+ Entrada"}
                    </button>
                  </div>
                </div>

                {!item.purchase_unit && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Embalagem de compra não configurada — a entrada é feita direto em {item.unit}.
                  </p>
                )}

                {isPackagingOpen && (
                  <div className="mt-3 space-y-3 rounded-xl border border-border p-3">
                    <TextField
                      label="Unidade de compra"
                      value={editPurchaseUnit}
                      onChange={setEditPurchaseUnit}
                      placeholder="garrafa, caixa, fardo..."
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <TextField
                        label="Itens por embalagem"
                        value={editUnitsPerPack}
                        onChange={setEditUnitsPerPack}
                        placeholder="1"
                        type="number"
                      />
                      <TextField
                        label={`Conteúdo por item (${item.unit})`}
                        value={editContentAmount}
                        onChange={setEditContentAmount}
                        placeholder="1"
                        type="number"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Vale para as próximas entradas. O estoque e o custo médio atuais não mudam.
                    </p>
                    {packagingError && <p className="text-xs text-destructive">{packagingError}</p>}
                    <button
                      onClick={() => submitPackaging(item)}
                      disabled={packagingBusy}
                      className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {packagingBusy ? "Salvando..." : "Salvar embalagem"}
                    </button>
                  </div>
                )}

                {isOpen && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        step={1}
                        min={1}
                        value={entryPacks}
                        onChange={(event) => setEntryPacks(event.target.value)}
                        placeholder={
                          item.purchase_unit
                            ? `Quantas ${item.purchase_unit}`
                            : `Quantidade (${item.unit})`
                        }
                        autoFocus
                        className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={entryPurchaseCost}
                        onChange={(event) => setEntryPurchaseCost(event.target.value)}
                        placeholder="Total pago (R$)"
                        className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
                      />
                    </div>
                    {(() => {
                      const packs = parseAmount(entryPacks);
                      if (packs === null || packs <= 0) return null;
                      const quantity = packs * item.units_per_pack * Number(item.content_amount);
                      const cost = entryPurchaseCost.trim() ? parseAmount(entryPurchaseCost) : null;
                      return (
                        <p className="text-xs text-muted-foreground">
                          Entra {quantity} {item.unit} no estoque
                          {cost !== null && cost > 0 && quantity > 0
                            ? ` · ${brl(cost / quantity)} por ${item.unit}`
                            : ""}
                        </p>
                      );
                    })()}
                    {entryError && <p className="text-xs text-destructive">{entryError}</p>}
                    <select
                      value={entrySupplierId}
                      onChange={(event) => setEntrySupplierId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                    >
                      <option value="">Sem fornecedor</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => submitEntry(item)}
                      disabled={entryBusy || !entryPacks}
                      className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {entryBusy ? "Salvando..." : "Confirmar entrada"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BebidasBaseTab() {
  const createFn = useServerFn(createBaseDrink);
  const entryFn = useServerFn(addBaseDrinkEntry);
  const updatePackagingFn = useServerFn(updateBaseDrinkPackaging);
  return (
    <ComponentStockTab
      kind="base_drink"
      title="Bebida base"
      units={["ml", "un"]}
      createFn={(input) =>
        createFn({
          data: {
            name: input.data.name,
            unit: input.data.unit as "ml" | "un",
            minStock: input.data.minStock,
            purchaseUnit: input.data.purchaseUnit,
            unitsPerPack: input.data.unitsPerPack,
            contentAmount: input.data.contentAmount,
          },
        })
      }
      entryFn={(input) =>
        entryFn({
          data: {
            baseDrinkId: input.data.id,
            packs: input.data.packs,
            purchaseCost: input.data.purchaseCost,
            supplierId: input.data.supplierId,
            note: input.data.note,
          },
        })
      }
      updatePackagingFn={(input) =>
        updatePackagingFn({
          data: {
            baseDrinkId: input.data.id,
            purchaseUnit: input.data.purchaseUnit,
            unitsPerPack: input.data.unitsPerPack,
            contentAmount: input.data.contentAmount,
          },
        })
      }
    />
  );
}

function IngredientesTab() {
  const createFn = useServerFn(createIngredient);
  const entryFn = useServerFn(addIngredientEntry);
  const updatePackagingFn = useServerFn(updateIngredientPackaging);
  return (
    <ComponentStockTab
      kind="ingredient"
      title="Ingrediente"
      units={["ml", "un", "g"]}
      createFn={(input) =>
        createFn({
          data: {
            name: input.data.name,
            unit: input.data.unit as "ml" | "un" | "g",
            minStock: input.data.minStock,
            purchaseUnit: input.data.purchaseUnit,
            unitsPerPack: input.data.unitsPerPack,
            contentAmount: input.data.contentAmount,
          },
        })
      }
      entryFn={(input) =>
        entryFn({
          data: {
            ingredientId: input.data.id,
            packs: input.data.packs,
            purchaseCost: input.data.purchaseCost,
            supplierId: input.data.supplierId,
            note: input.data.note,
          },
        })
      }
      updatePackagingFn={(input) =>
        updatePackagingFn({
          data: {
            ingredientId: input.data.id,
            purchaseUnit: input.data.purchaseUnit,
            unitsPerPack: input.data.unitsPerPack,
            contentAmount: input.data.contentAmount,
          },
        })
      }
    />
  );
}

// ============================================================
// Aba: Fornecedores
// ============================================================

function FornecedoresTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [document_, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const listSup = useServerFn(listSuppliers);
  const create = useServerFn(createSupplier);

  async function load() {
    const result = await listSup();
    setSuppliers(result.suppliers as Supplier[]);
  }

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 15000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError(null);
    if (name.trim().length < 2) return setError("Digite o nome do fornecedor.");
    setSaving(true);
    const result = await create({ data: { name, document: document_, phone } });
    setSaving(false);
    if (!result.ok) return setError(result.message);
    setName("");
    setDocument("");
    setPhone("");
    setShowForm(false);
    await load();
  }

  return (
    <div className="space-y-5">
      <button
        onClick={() => setShowForm((value) => !value)}
        className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {showForm ? "Cancelar" : "+ Novo fornecedor"}
      </button>

      {showForm && (
        <SectionCard title="Novo fornecedor">
          <div className="space-y-3">
            <TextField label="Nome" value={name} onChange={setName} placeholder="Distribuidora ABC" />
            <TextField label="CNPJ/CPF (opcional)" value={document_} onChange={setDocument} />
            <TextField label="Telefone (opcional)" value={phone} onChange={setPhone} />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <PrimaryButton onClick={submit} disabled={saving}>
              {saving ? "Salvando..." : "Salvar fornecedor"}
            </PrimaryButton>
          </div>
        </SectionCard>
      )}

      {suppliers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nenhum fornecedor cadastrado ainda.
        </p>
      ) : (
        <ul className="space-y-3">
          {suppliers.map((supplier) => (
            <li key={supplier.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="font-semibold">{supplier.name}</p>
              {(supplier.document || supplier.phone) && (
                <p className="text-xs text-muted-foreground">
                  {[supplier.document, supplier.phone].filter(Boolean).join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// Aba: Fichas técnicas
// ============================================================

type ProductOption = { id: string; name: string; category: string; is_active: boolean };
type RecipeRow = {
  id: string;
  base_drink_id: string | null;
  ingredient_id: string | null;
  quantity: number;
  base_drink: { name: string; unit: string } | null;
  ingredient: { name: string; unit: string } | null;
};

function FichasTecnicasTab() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [baseDrinks, setBaseDrinks] = useState<StockComponent[]>([]);
  const [ingredients, setIngredients] = useState<StockComponent[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);

  const [newType, setNewType] = useState<"base_drink" | "ingredient">("base_drink");
  const [newComponentId, setNewComponentId] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const listProducts = useServerFn(listAllProducts);
  const overview = useServerFn(getBaseDrinksOverview);
  const getItems = useServerFn(getRecipeItems);
  const saveItems = useServerFn(setRecipeItems);

  useEffect(() => {
    async function loadReferenceData() {
      const [productsResult, overviewResult] = await Promise.all([listProducts(), overview()]);
      setProducts(productsResult.products as ProductOption[]);
      setBaseDrinks((overviewResult.baseDrinks ?? []) as StockComponent[]);
      setIngredients((overviewResult.ingredients ?? []) as StockComponent[]);
    }
    void loadReferenceData();
    // só atualiza as listas de referência (produtos/bebidas base/ingredientes) — nunca mexe na
    // receita que o usuário está montando na tela, então é seguro rodar em segundo plano.
    const poll = setInterval(() => void loadReferenceData(), 15000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRecipe(productId: string) {
    setSelectedProduct(productId);
    setMessage(null);
    if (!productId) {
      setRecipe([]);
      return;
    }
    setLoadingRecipe(true);
    const result = await getItems({ data: { productId } });
    setRecipe(result.items as RecipeRow[]);
    setLoadingRecipe(false);
  }

  function addComponentToRecipe() {
    if (!newComponentId || !newQuantity) return;
    const quantity = Number(newQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    const source = newType === "base_drink" ? baseDrinks : ingredients;
    const component = source.find((item) => item.id === newComponentId);
    if (!component) return;

    setRecipe((current) => [
      ...current.filter((row) => {
        const rowComponentId = newType === "base_drink" ? row.base_drink_id : row.ingredient_id;
        return rowComponentId !== newComponentId;
      }),
      {
        id: `local-${newComponentId}`,
        base_drink_id: newType === "base_drink" ? newComponentId : null,
        ingredient_id: newType === "ingredient" ? newComponentId : null,
        quantity,
        base_drink:
          newType === "base_drink" ? { name: component.name, unit: component.unit } : null,
        ingredient:
          newType === "ingredient" ? { name: component.name, unit: component.unit } : null,
      },
    ]);
    setNewComponentId("");
    setNewQuantity("");
  }

  function removeRow(row: RecipeRow) {
    setRecipe((current) => current.filter((item) => item !== row));
  }

  async function save() {
    if (!selectedProduct) return;
    setSaving(true);
    setMessage(null);
    const result = await saveItems({
      data: {
        productId: selectedProduct,
        items: recipe.map((row) =>
          row.base_drink_id
            ? {
                type: "base_drink" as const,
                baseDrinkId: row.base_drink_id,
                quantity: row.quantity,
              }
            : {
                type: "ingredient" as const,
                ingredientId: row.ingredient_id as string,
                quantity: row.quantity,
              },
        ),
      },
    });
    setSaving(false);
    setMessage(result.ok ? "Ficha técnica salva." : result.message ?? "Erro ao salvar.");
  }

  const componentOptions = newType === "base_drink" ? baseDrinks : ingredients;

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Produto</span>
        <select
          value={selectedProduct}
          onChange={(event) => void loadRecipe(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
        >
          <option value="">Selecione um produto</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.category} — {product.name}
            </option>
          ))}
        </select>
      </label>

      {selectedProduct && (
        <SectionCard title="Ficha técnica">
          {loadingRecipe ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <>
              {recipe.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem ficha técnica — esse produto não desconta nada automaticamente ao ser
                  vendido (ex.: cerveja lata fechada).
                </p>
              ) : (
                <ul className="space-y-2">
                  {recipe.map((row) => {
                    const componentName =
                      row.base_drink?.name ?? row.ingredient?.name ?? "—";
                    const unit =
                      row.base_drink?.unit ?? row.ingredient?.unit ?? "";
                    return (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5"
                      >
                        <span className="text-sm">
                          {componentName}{" "}
                          <span className="text-muted-foreground">
                            — {row.quantity} {unit}
                          </span>
                        </span>
                        <button
                          onClick={() => removeRow(row)}
                          className="text-xs font-medium text-destructive"
                        >
                          Remover
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-4 space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground">Adicionar componente</p>
                <select
                  value={newType}
                  onChange={(event) => {
                    setNewType(event.target.value as "base_drink" | "ingredient");
                    setNewComponentId("");
                  }}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                >
                  <option value="base_drink">Bebida base</option>
                  <option value="ingredient">Ingrediente</option>
                </select>
                <select
                  value={newComponentId}
                  onChange={(event) => setNewComponentId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                >
                  <option value="">Selecione</option>
                  {componentOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={newQuantity}
                    onChange={(event) => setNewQuantity(event.target.value)}
                    placeholder="Quantidade consumida por venda"
                    className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                  />
                  <button
                    onClick={addComponentToRecipe}
                    disabled={!newComponentId || !newQuantity}
                    className="h-11 rounded-xl bg-secondary px-4 text-sm font-medium text-secondary-foreground disabled:opacity-60"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
              <PrimaryButton onClick={save} disabled={saving}>
                {saving ? "Salvando..." : "Salvar ficha técnica"}
              </PrimaryButton>
            </>
          )}
        </SectionCard>
      )}
    </div>
  );
}
