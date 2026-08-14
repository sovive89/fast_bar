import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PasswordConfirm } from "@/components/shared/PasswordConfirm";
import { PrimaryButton, SectionCard, TextField } from "@/components/stock/SharedFormFields";
import { brl } from "@/lib/format";
import { getStockOverview, restockProduct } from "@/lib/stock.functions";
import { deactivateProduct } from "@/lib/register.functions";
import {
  createProduct,
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
};

const LOW_STOCK_THRESHOLD = 20;

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

function CardapioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [recipeProductIds, setRecipeProductIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [openRestockId, setOpenRestockId] = useState<string | null>(null);
  const [restockAmount, setRestockAmount] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restockError, setRestockError] = useState<string | null>(null);

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
  const removeProduct = useServerFn(deactivateProduct);
  const uploadPhoto = useServerFn(uploadProductPhoto);
  const create = useServerFn(createProduct);

  async function load() {
    const result = await loadOverview();
    setProducts(result.products as Product[]);
    setRecipeProductIds(new Set(result.recipeProductIds));
  }

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 15000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmRestock(productId: string) {
    setRestockError(null);
    const quantity = Number(restockAmount);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return setRestockError("Informe uma quantidade válida.");
    }
    setBusyId(productId);
    const result = await restock({ data: { productId, quantity } });
    setBusyId(null);
    // Falha silenciosa aqui faria a equipe achar que repôs o estoque quando não repôs.
    if (!result.ok) return setRestockError(result.message ?? "Não foi possível repor o estoque.");
    setOpenRestockId(null);
    setRestockAmount("");
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

      {showPreview ? (
        <CustomerMenuPreview grouped={grouped} recipeProductIds={recipeProductIds} />
      ) : (
        <div className="mt-5 space-y-5">
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
                <TextField
                  label="Categoria"
                  value={category}
                  onChange={setCategory}
                  placeholder="Drinks"
                />
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
                  Depois de criar, vá em Estoque → "Fichas técnicas" pra ligar esse produto às
                  bebidas base e ingredientes que ele consome — assim a baixa de estoque acontece
                  sozinha a cada venda.
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
                      const low = !hasRecipe && product.stock_quantity < LOW_STOCK_THRESHOLD;
                      const isOpen = openRestockId === product.id;
                      const isDeleting = deletingId === product.id;
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
                                {hasRecipe ? "ficha técnica" : `${product.stock_quantity} un`}
                              </span>
                              {!hasRecipe && (
                                <button
                                  onClick={() => {
                                    setOpenRestockId(isOpen ? null : product.id);
                                    setRestockAmount("");
                                    setDeletingId(null);
                                  }}
                                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  {isOpen ? "Cancelar" : "+ Repor"}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setDeletingId(isDeleting ? null : product.id);
                                  setOpenRestockId(null);
                                  setRestockError(null);
                                }}
                                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                              >
                                Remover
                              </button>
                            </div>
                          </div>

                          {isDeleting && (
                            <div className="mt-3">
                              <PasswordConfirm
                                message={`Tirar “${product.name}” do cardápio? O cadastro e o histórico de vendas continuam guardados — o item só deixa de aparecer para lançamento. Confirme com a senha da equipe.`}
                                confirmLabel="Remover"
                                onCancel={() => setDeletingId(null)}
                                onConfirm={(password) => confirmDelete(product.id, password)}
                              />
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
