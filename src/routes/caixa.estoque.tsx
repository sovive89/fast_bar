import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PasswordConfirm } from "@/components/shared/PasswordConfirm";
import { NotaFiscalImport } from "@/components/stock/NotaFiscalImport";
import { PrimaryButton, SectionCard, TextField } from "@/components/stock/SharedFormFields";
import { brl, parseAmount } from "@/lib/format";
import {
  addBaseDrinkEntry,
  addBaseDrinkLoss,
  addIngredientEntry,
  addIngredientLoss,
  createBaseDrink,
  createIngredient,
  createSupplier,
  deleteBaseDrink,
  deleteIngredient,
  getRecipeItems,
  getBaseDrinksOverview,
  getStockLots,
  getStockReport,
  listAllProducts,
  listSuppliers,
  updateBaseDrink,
  updateIngredient,
  updateStockLot,
} from "@/lib/base-drinks.functions";

export const Route = createFileRoute("/caixa/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque | Pop9Bar" },
      {
        name: "description",
        content: "Bebidas, ingredientes e fornecedores.",
      },
    ],
  }),
  component: StockOverview,
});

type Tab = "bebidas" | "ingredientes" | "fornecedores" | "relatorios";

/**
 * Duas listas de estoque, divididas por COMPORTAMENTO, não por tabela do banco:
 *
 *   Bebidas     - tudo que vem em garrafa, lata ou barril: cerveja, refrigerante, cachaça, gin,
 *                 vinho. Lado a lado, sem subdividir. A mesma garrafa pode sair inteira, em dose,
 *                 ou dentro de um drink — nos três casos é o MESMO saldo, e é por isso que ficam
 *                 juntas: separar por "tipo de bebida" faria o estoque mentir.
 *   Ingredientes - o que só serve pra preparo: limão, açúcar, xarope, hortelã, gelo.
 *
 * A aba "Ficha técnica (Receitas)" saiu daqui de propósito. Ficha é propriedade do item que é
 * PRODUZIDO, não um acervo do estoque — ela vive dentro do produto, no Cardápio. Ter um cadastro
 * de receitas aqui fazia o campo de ficha aparecer pra cerveja, que não é produzida.
 */
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "bebidas", label: "Bebidas" },
  { id: "ingredientes", label: "Ingredientes" },
  { id: "fornecedores", label: "Fornecedores" },
  { id: "relatorios", label: "Relatórios" },
];

function StockOverview() {
  const [tab, setTab] = useState<Tab>("bebidas");
  const [scanningNota, setScanningNota] = useState(false);
  const [notaBaseDrinks, setNotaBaseDrinks] = useState<Array<{ id: string; name: string }>>([]);
  const [notaIngredients, setNotaIngredients] = useState<Array<{ id: string; name: string }>>([]);
  const [notaError, setNotaError] = useState<string | null>(null);

  const overview = useServerFn(getBaseDrinksOverview);

  async function loadComponentesParaNota() {
    try {
      const result = await overview();
      setNotaBaseDrinks((result.baseDrinks ?? []).map((b) => ({ id: b.id, name: b.name })));
      setNotaIngredients((result.ingredients ?? []).map((i) => ({ id: i.id, name: i.name })));
      setNotaError(null);
      return true;
    } catch {
      setNotaError("Não foi possível carregar bebidas e ingredientes -- tente de novo.");
      return false;
    }
  }

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
        <button
          onClick={() => void loadComponentesParaNota().then((ok) => ok && setScanningNota(true))}
          className="rounded-full border border-primary/50 px-3.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
        >
          Dar entrada por nota/planilha
        </button>
      </div>

      {notaError && <p className="mt-2 text-xs text-destructive">{notaError}</p>}

      {scanningNota && (
        <NotaFiscalImport
          baseDrinks={notaBaseDrinks}
          ingredients={notaIngredients}
          onClose={() => setScanningNota(false)}
          onImported={() => void loadComponentesParaNota()}
        />
      )}

      <div className="mt-6">
        {tab === "bebidas" && <BebidasBaseTab />}
        {tab === "ingredientes" && <IngredientesTab />}
        {tab === "fornecedores" && <FornecedoresTab />}
        {tab === "relatorios" && <RelatoriosTab />}
      </div>
    </main>
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
  // Só existe pra ingredientes — bebida base não tem esse campo (vem undefined, e o card não
  // mostra nada, o que é o comportamento certo pra ela).
  kind?: "drink" | "cozinha";
  depletion_rule: "fefo" | "lowest_cost";
};

type StockLot = {
  id: string;
  unitCost: number | null;
  quantityReceived: number;
  quantityRemaining: number;
  expiresOn: string | null;
  receivedAt: string;
  note: string | null;
  supplierId: string | null;
  supplierName: string | null;
  // Rastreabilidade: de onde a mercadoria veio e por qual documento entrou. Tudo anulável porque
  // compra de bar vem de tudo quanto é jeito — distribuidor com NF-e, mercado com cupom, feira sem
  // papel nenhum. Campo vazio é honesto; obrigar preenchimento produziria "SEM LOTE" e validade
  // 31/12/2099, que é pior: mata a chance de auditar de verdade.
  lote: string | null;
  fabricacao: string | null;
  fornecedorDocumento: string | null;
  documentoTipo: string | null;
  documentoNumero: string | null;
  documentoSerie: string | null;
  chaveAcesso: string | null;
  documentoEmissao: string | null;
  motivo: string | null;
  registradoPor: string | null;
  status: string | null;
};

/** Rótulo do tipo de documento. "Entrada manual" é documento INTERNO — nunca some com NF-e. */
const DOCUMENTO_LABEL: Record<string, string> = {
  nfe: "NF-e",
  nfce: "NFC-e",
  danfe: "DANFE",
  cupom: "Cupom fiscal",
  comprovante: "Comprovante",
  entrada_manual: "Entrada manual",
  outro: "Documento",
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
  }) => Promise<{ ok: boolean; message?: string; id?: string }>;
  entryFn: (input: {
    data: {
      id: string;
      packs: number;
      purchaseCost?: number | undefined;
      supplierId?: string | undefined;
      note?: string | undefined;
      expiresOn?: string | undefined;
    };
  }) => Promise<{ ok: boolean; message?: string }>;
  updateFn: (input: {
    data: {
      id: string;
      name: string;
      unit: string;
      minStock: number;
      purchaseUnit?: string | undefined;
      unitsPerPack?: number | undefined;
      contentAmount?: number | undefined;
      depletionRule?: "fefo" | "lowest_cost" | undefined;
    };
  }) => Promise<{ ok: boolean; message?: string }>;
  lotsFn: (input: {
    data: { componentId: string };
  }) => Promise<{ lots: StockLot[] }>;
  updateLotFn: (input: {
    data: {
      lotId: string;
      quantityReceived: number;
      unitCost?: number | undefined;
      supplierId?: string | undefined;
      expiresOn?: string | undefined;
      note?: string | undefined;
    };
  }) => Promise<{ ok: boolean; message?: string }>;
  deleteFn: (input: {
    data: { id: string; password: string };
  }) => Promise<{ ok: boolean; message?: string }>;
  lossFn: (input: {
    data: { id: string; quantity: number; note?: string | undefined };
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [items, setItems] = useState<StockComponent[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(props.units[0] ?? "");
  const [minStock, setMinStock] = useState("");
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [unitsPerPack, setUnitsPerPack] = useState("1");
  // Vazio de propósito, não "1": um padrão de "1" parece já preenchido corretamente e passa
  // despercebido — foi assim que uma garrafa de 1L ficou registrada como "1ml" na prática.
  const [contentAmount, setContentAmount] = useState("");
  // Quantidade e valor da primeira compra: o cadastro e a entrada acontecem no mesmo gesto, que é
  // como a coisa acontece no bar — chega a mercadoria e se registra o que chegou.
  const [newPacks, setNewPacks] = useState("");
  const [newPurchaseCost, setNewPurchaseCost] = useState("");
  const [newSupplierId, setNewSupplierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [entryPacks, setEntryPacks] = useState("");
  const [entryPurchaseCost, setEntryPurchaseCost] = useState("");
  const [entrySupplierId, setEntrySupplierId] = useState("");
  const [entryExpiresOn, setEntryExpiresOn] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);

  // Card expandido mostrando os lotes (data/preço/fornecedor de cada entrada) de um item — busca
  // sob demanda, só quando a equipe abre, pra não puxar tudo isso na listagem toda hora.
  const [openLotsId, setOpenLotsId] = useState<string | null>(null);
  const [lots, setLots] = useState<StockLot[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);

  // Edição de um lote já recebido — quantidade, custo, validade e fornecedor podem estar errados
  // desde a hora do lançamento (típico: apertou salvar antes de conferir), e sem isso a única saída
  // era registrar perda/entrada compensando, o que suja o histórico.
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [lotQuantity, setLotQuantity] = useState("");
  const [lotUnitCost, setLotUnitCost] = useState("");
  const [lotSupplierId, setLotSupplierId] = useState("");
  const [lotExpiresOn, setLotExpiresOn] = useState("");
  const [lotNote, setLotNote] = useState("");
  const [lotError, setLotError] = useState<string | null>(null);
  const [lotBusy, setLotBusy] = useState(false);

  const [openLossId, setOpenLossId] = useState<string | null>(null);
  const [lossQuantity, setLossQuantity] = useState("");
  const [lossNote, setLossNote] = useState("");
  const [lossError, setLossError] = useState<string | null>(null);
  const [lossBusy, setLossBusy] = useState(false);

  // Editor único do cadastro (nome, unidade, mínimo e embalagem). Saldo e custo médio ficam de
  // fora: só mudam por entrada, perda ou venda — editar na mão quebraria o histórico.
  const [openEditId, setOpenEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editMinStock, setEditMinStock] = useState("");
  const [editPurchaseUnit, setEditPurchaseUnit] = useState("");
  const [editUnitsPerPack, setEditUnitsPerPack] = useState("1");
  const [editContentAmount, setEditContentAmount] = useState("1");
  const [editDepletionRule, setEditDepletionRule] = useState<"fefo" | "lowest_cost">("fefo");
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    // Sem valor padrão aqui, de propósito: "1" parece já preenchido corretamente e passa
    // despercebido — foi assim que uma garrafa de 1L virou "1ml" de conteúdo na prática.
    const contentValue = contentAmount ? parseAmount(contentAmount) : null;
    if (contentValue === null || contentValue <= 0) {
      return setError(`Preencha o conteúdo por item em ${unit} (ex.: garrafa de 1L → 1000).`);
    }

    // Quantidade é opcional: dá para cadastrar o insumo sem entrada, se a mercadoria ainda não
    // chegou. Mas se veio preenchida, precisa ser válida antes de cadastrar qualquer coisa.
    let packs: number | undefined;
    if (newPacks.trim()) {
      const parsed = parseAmount(newPacks);
      if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
        return setError(
          purchaseUnit.trim()
            ? "Informe um número inteiro de embalagens."
            : "Informe uma quantidade inteira maior que zero.",
        );
      }
      packs = parsed;
    }
    let purchaseCost: number | undefined;
    if (newPurchaseCost.trim()) {
      const parsed = parseAmount(newPurchaseCost);
      if (parsed === null || parsed < 0) return setError("Valor pago inválido.");
      purchaseCost = parsed;
    }

    // Valor pago ou fornecedor sem quantidade significa entrada esquecida pela metade. Salvar
    // assim descartaria o que foi digitado sem avisar ninguém.
    if (packs === undefined && (purchaseCost !== undefined || newSupplierId)) {
      return setError("Informe a quantidade que chegou, ou limpe o valor pago e o fornecedor.");
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
    if (!result.ok) {
      setSaving(false);
      return setError(result.message ?? "Não foi possível salvar.");
    }

    // O cadastro já foi gravado. Se a entrada falhar aqui, o insumo continua criado e a equipe
    // pode dar a entrada pelo botão da linha — por isso a mensagem diz exatamente onde parou, em
    // vez de sugerir que nada foi salvo.
    if (packs !== undefined && result.id) {
      const entry = await props.entryFn({
        data: {
          id: result.id,
          packs,
          purchaseCost,
          supplierId: newSupplierId || undefined,
        },
      });
      if (!entry.ok) {
        setSaving(false);
        await load();
        return setError(
          `${props.title} cadastrada, mas a entrada não foi registrada: ${entry.message ?? "tente pelo botão Entrada da linha."}`,
        );
      }
    }

    setSaving(false);
    setName("");
    setMinStock("");
    setPurchaseUnit("");
    setUnitsPerPack("1");
    setContentAmount("");
    setNewPacks("");
    setNewPurchaseCost("");
    setNewSupplierId("");
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
        expiresOn: entryExpiresOn || undefined,
      },
    });
    setEntryBusy(false);
    if (!result.ok) return setEntryError(result.message ?? "Não foi possível registrar a entrada.");
    setOpenEntryId(null);
    setEntryPacks("");
    setEntryPurchaseCost("");
    setEntrySupplierId("");
    setEntryExpiresOn("");
    if (openLotsId === item.id) await loadLots(item);
    await load();
  }

  async function loadLots(item: StockComponent) {
    setLotsLoading(true);
    const result = await props.lotsFn({ data: { componentId: item.id } });
    setLots(result.lots);
    setLotsLoading(false);
  }

  async function toggleLots(item: StockComponent) {
    if (openLotsId === item.id) {
      setOpenLotsId(null);
      return;
    }
    setOpenLotsId(item.id);
    setLots([]);
    await loadLots(item);
  }

  function openLotEditor(lot: StockLot) {
    setEditingLotId(lot.id);
    setLotQuantity(String(lot.quantityReceived));
    setLotUnitCost(lot.unitCost !== null ? String(lot.unitCost) : "");
    setLotSupplierId(lot.supplierId ?? "");
    setLotExpiresOn(lot.expiresOn ?? "");
    setLotNote(lot.note ?? "");
    setLotError(null);
  }

  async function submitLotEdit(item: StockComponent) {
    setLotError(null);
    const quantity = parseAmount(lotQuantity);
    if (quantity === null || quantity <= 0) {
      return setLotError(`Informe uma quantidade recebida válida em ${item.unit}.`);
    }
    let unitCost: number | undefined;
    if (lotUnitCost.trim()) {
      const parsed = parseAmount(lotUnitCost);
      if (parsed === null || parsed < 0) return setLotError("Custo por unidade inválido.");
      unitCost = parsed;
    }

    setLotBusy(true);
    const result = await props.updateLotFn({
      data: {
        lotId: editingLotId as string,
        quantityReceived: quantity,
        unitCost,
        supplierId: lotSupplierId || undefined,
        expiresOn: lotExpiresOn || undefined,
        note: lotNote.trim() || undefined,
      },
    });
    setLotBusy(false);
    if (!result.ok) return setLotError(result.message ?? "Não foi possível salvar o lote.");
    setEditingLotId(null);
    await loadLots(item);
    await load();
  }

  async function submitLoss(item: StockComponent) {
    setLossError(null);
    const quantity = parseAmount(lossQuantity);
    if (quantity === null || quantity <= 0) {
      return setLossError(`Informe uma quantidade perdida em ${item.unit}.`);
    }
    if (quantity > item.current_stock) {
      return setLossError(`Maior do que o estoque atual (${item.current_stock} ${item.unit}).`);
    }

    setLossBusy(true);
    const result = await props.lossFn({
      data: { id: item.id, quantity, note: lossNote.trim() || undefined },
    });
    setLossBusy(false);
    if (!result.ok) return setLossError(result.message ?? "Não foi possível registrar a perda.");
    setOpenLossId(null);
    setLossQuantity("");
    setLossNote("");
    await load();
  }

  function openEditor(item: StockComponent) {
    setOpenEditId(item.id);
    setOpenEntryId(null);
    setDeletingId(null);
    setOpenLossId(null);
    setEditName(item.name);
    setEditUnit(item.unit);
    setEditMinStock(String(item.min_stock));
    setEditPurchaseUnit(item.purchase_unit ?? "");
    setEditUnitsPerPack(String(item.units_per_pack));
    setEditContentAmount(String(item.content_amount));
    setEditDepletionRule(item.depletion_rule ?? "fefo");
    setEditError(null);
  }

  async function submitEdit(item: StockComponent) {
    setEditError(null);
    if (editName.trim().length < 2) return setEditError("Digite o nome.");
    const minStock = parseAmount(editMinStock);
    if (minStock === null || minStock < 0) return setEditError("Estoque mínimo inválido.");
    const perPack = parseAmount(editUnitsPerPack);
    if (perPack === null || !Number.isInteger(perPack) || perPack <= 0) {
      return setEditError("Itens por embalagem deve ser um número inteiro maior que zero.");
    }
    const content = parseAmount(editContentAmount);
    if (content === null || content <= 0) {
      return setEditError("Conteúdo por item deve ser maior que zero.");
    }

    setEditBusy(true);
    const result = await props.updateFn({
      data: {
        id: item.id,
        name: editName,
        unit: editUnit,
        minStock,
        purchaseUnit: editPurchaseUnit || undefined,
        unitsPerPack: perPack,
        contentAmount: content,
        depletionRule: editDepletionRule,
      },
    });
    setEditBusy(false);
    if (!result.ok) return setEditError(result.message ?? "Não foi possível salvar.");
    setOpenEditId(null);
    await load();
  }

  async function confirmDeleteStockItem(id: string, password: string) {
    const result = await props.deleteFn({ data: { id, password } });
    if (result.ok) {
      setDeletingId(null);
      await load();
    }
    return result;
  }

  return (
    <div className="space-y-5">
      <button
        onClick={() => setShowForm((value) => !value)}
        className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {showForm ? "Cancelar" : "+ Entrada"}
      </button>

      {showForm && (
        <SectionCard title={`Entrada de ${props.title.toLowerCase()}`}>
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
            <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-semibold">Como você compra</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                O custo por {unit} é calculado a partir daqui — você nunca digita ele na mão.
              </p>
              <p className="mt-1.5 text-xs font-medium text-primary">
                Ex.: caixa com 12 latas de 350 ml → 12 itens por embalagem, 350 de conteúdo cada.
                Garrafa de 1L → 1 item por embalagem, 1000 de conteúdo (não deixe em 1).
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
                    label={`Conteúdo por item (${unit}) — obrigatório`}
                    value={contentAmount}
                    onChange={setContentAmount}
                    placeholder={unit === "ml" || unit === "g" ? "ex.: 1000" : "ex.: 1"}
                    type="number"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-medium">O que chegou agora</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pode deixar em branco se a mercadoria ainda não chegou — dá para lançar depois pelo
                botão Entrada da linha.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <TextField
                  // Sem unidade de compra definida, a embalagem é 1×1 e o número digitado é a
                  // própria quantidade — pedir "embalagens" aqui faria a equipe informar outra coisa.
                  label={
                    purchaseUnit.trim() ? `Quantas ${purchaseUnit.trim()}` : `Quantidade (${unit})`
                  }
                  value={newPacks}
                  onChange={setNewPacks}
                  placeholder="0"
                  type="number"
                />
                <TextField
                  label="Total pago (R$)"
                  value={newPurchaseCost}
                  onChange={setNewPurchaseCost}
                  placeholder="0,00"
                />
              </div>
              {/* A prévia lê os campos com parseAmount, o mesmo que o salvamento usa: com Number,
                  digitar "1.000" mostrava um total aqui e gravava outro no estoque. */}
              {(() => {
                // A prévia só descreve entradas que o salvamento aceitaria: quantidade inteira e
                // embalagem positiva. Descrever um total que vai ser recusado é pior que não
                // mostrar nada.
                const packs = parseAmount(newPacks);
                if (packs === null || !Number.isInteger(packs) || packs <= 0) return null;
                const perPack = parseAmount(unitsPerPack);
                const content = parseAmount(contentAmount);
                if (perPack === null || perPack <= 0 || content === null || content <= 0) {
                  return null;
                }
                const total = packs * perPack * content;
                const cost = newPurchaseCost.trim() ? parseAmount(newPurchaseCost) : null;
                return (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Entra {total} {unit} no estoque
                    {cost !== null && cost > 0 && total > 0
                      ? ` · ${brl(cost / total)} por ${unit}`
                      : ""}
                  </p>
                );
              })()}
              <select
                value={newSupplierId}
                onChange={(event) => setNewSupplierId(event.target.value)}
                className="mt-3 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              >
                <option value="">Fornecedor (opcional)</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
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
            const isEditing = openEditId === item.id;
            // Unidade só troca com saldo zero e fora de ficha técnica — o servidor recusa de
            // qualquer jeito, mas a tela já explica em vez de deixar tentar.
            const unitLocked = Number(item.current_stock) !== 0 || item.doses.length > 0;
            const isDeleting = deletingId === item.id;
            return (
              <li key={item.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {item.name}
                      {item.kind === "cozinha" && (
                        <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 align-middle text-[10px] font-medium text-secondary-foreground">
                          Cozinha
                        </span>
                      )}
                    </p>
                    {Number(item.current_stock) === 0 && !item.purchase_unit && (
                      <p className="mt-0.5 text-[11px] font-medium text-amber-600">
                        Aguardando primeira entrada — veio de uma ficha técnica, configure a
                        embalagem e dê entrada quando a mercadoria chegar.
                      </p>
                    )}
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
                      onClick={() => (isEditing ? setOpenEditId(null) : openEditor(item))}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {isEditing ? "Cancelar" : "Editar"}
                    </button>
                    <button
                      onClick={() => {
                        setOpenEntryId(isOpen ? null : item.id);
                        setOpenEditId(null);
                        setDeletingId(null);
                        setOpenLossId(null);
                        setEntryPacks("");
                        setEntryPurchaseCost("");
                        setEntrySupplierId("");
                        setEntryExpiresOn("");
                        setEntryError(null);
                      }}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {isOpen ? "Cancelar" : "+ Entrada"}
                    </button>
                    <button
                      onClick={() => {
                        const isLossOpen = openLossId === item.id;
                        setOpenLossId(isLossOpen ? null : item.id);
                        setOpenEditId(null);
                        setOpenEntryId(null);
                        setDeletingId(null);
                        setLossQuantity("");
                        setLossNote("");
                        setLossError(null);
                      }}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-amber-500"
                    >
                      {openLossId === item.id ? "Cancelar" : "− Perda"}
                    </button>
                    <button
                      onClick={() => {
                        setDeletingId(isDeleting ? null : item.id);
                        setOpenEditId(null);
                        setOpenEntryId(null);
                        setOpenLossId(null);
                      }}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                    >
                      {isDeleting ? "Cancelar" : "Apagar"}
                    </button>
                    <button
                      onClick={() => void toggleLots(item)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {openLotsId === item.id ? "Ocultar lotes" : "Lotes"}
                    </button>
                  </div>
                </div>

                {openLotsId === item.id && (
                  <div className="mt-3 rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold">Lotes recebidos</p>
                    {lotsLoading ? (
                      <p className="mt-1 text-xs text-muted-foreground">Carregando...</p>
                    ) : lots.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Nenhum lote registrado ainda — entradas feitas antes desse recurso não têm
                        lote, só saldo.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {lots.map((lot) => (
                          <li key={lot.id} className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
                            {editingLotId === lot.id ? (
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={lotQuantity}
                                    onChange={(event) => setLotQuantity(event.target.value)}
                                    placeholder={`Quantidade recebida (${item.unit})`}
                                    className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                                  />
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={lotUnitCost}
                                    onChange={(event) => setLotUnitCost(event.target.value)}
                                    placeholder={`Custo por ${item.unit} (R$)`}
                                    className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                                  />
                                </div>
                                <select
                                  value={lotSupplierId}
                                  onChange={(event) => setLotSupplierId(event.target.value)}
                                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                                >
                                  <option value="">Sem fornecedor</option>
                                  {suppliers.map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                      {supplier.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="date"
                                  value={lotExpiresOn}
                                  onChange={(event) => setLotExpiresOn(event.target.value)}
                                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                                />
                                <input
                                  type="text"
                                  value={lotNote}
                                  onChange={(event) => setLotNote(event.target.value)}
                                  placeholder="Observação (opcional)"
                                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                                />
                                {lot.quantityReceived !== lot.quantityRemaining && (
                                  <p className="text-[11px] text-muted-foreground">
                                    Já saíram {lot.quantityReceived - lot.quantityRemaining} {item.unit}{" "}
                                    desse lote (venda ou perda) — a quantidade recebida não pode cair
                                    abaixo disso.
                                  </p>
                                )}
                                {lotError && <p className="text-destructive">{lotError}</p>}
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setEditingLotId(null)}
                                    className="h-9 flex-1 rounded-lg border border-border text-xs font-medium text-muted-foreground"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => void submitLotEdit(item)}
                                    disabled={lotBusy}
                                    className="h-9 flex-1 rounded-lg bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-60"
                                  >
                                    {lotBusy ? "Salvando..." : "Salvar lote"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2 text-muted-foreground">
                                <div className="min-w-0">
                                  <span>
                                    <span className="font-medium text-foreground">
                                      {lot.quantityRemaining} / {lot.quantityReceived} {item.unit}
                                    </span>{" "}
                                    restante · recebido{" "}
                                    {new Date(lot.receivedAt).toLocaleDateString("pt-BR")}
                                    {lot.expiresOn
                                      ? ` · vence ${new Date(`${lot.expiresOn}T00:00:00`).toLocaleDateString("pt-BR")}`
                                      : ""}
                                    {lot.unitCost !== null ? ` · ${brl(lot.unitCost)}/${item.unit}` : ""}
                                    {lot.supplierName ? ` · ${lot.supplierName}` : ""}
                                  </span>

                                  {/* Lote é o campo que uma fiscalização/recolhimento pede primeiro — ficava
                                      perdido no meio do texto corrido. */}
                                  {lot.lote && (
                                    <p className="mt-0.5 text-foreground">Lote {lot.lote}</p>
                                  )}

                                  {/* Documento de origem — é o que liga este saldo a um papel. */}
                                  {lot.documentoTipo && (
                                    <p className="mt-0.5 text-[11px]">
                                      {DOCUMENTO_LABEL[lot.documentoTipo] ?? lot.documentoTipo}
                                      {lot.documentoNumero ? ` nº ${lot.documentoNumero}` : ""}
                                      {lot.documentoSerie ? `/${lot.documentoSerie}` : ""}
                                      {lot.motivo ? ` · ${lot.motivo}` : ""}
                                      {lot.chaveAcesso ? (
                                        <span className="block break-all opacity-70">
                                          chave {lot.chaveAcesso}
                                        </span>
                                      ) : null}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => openLotEditor(lot)}
                                  className="shrink-0 text-xs font-medium text-primary"
                                >
                                  Editar
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 space-y-3 rounded-xl border border-border p-3">
                    <TextField label="Nome" value={editName} onChange={setEditName} />
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-xs font-medium text-muted-foreground">Unidade</span>
                        <select
                          value={editUnit}
                          onChange={(event) => setEditUnit(event.target.value)}
                          disabled={unitLocked}
                          className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring disabled:opacity-60"
                        >
                          {props.units.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <TextField
                        label={`Estoque mínimo (${editUnit})`}
                        value={editMinStock}
                        onChange={setEditMinStock}
                        type="number"
                      />
                    </div>
                    {unitLocked && (
                      <p className="text-xs text-muted-foreground">
                        A unidade só pode ser trocada com o estoque zerado e sem ficha técnica usando
                        este item.
                      </p>
                    )}
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold">Como você compra</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Vale para as próximas entradas. O estoque e o custo médio atuais não mudam.
                      </p>
                      <div className="mt-3 space-y-3">
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
                            label={`Conteúdo por item (${editUnit})`}
                            value={editContentAmount}
                            onChange={setEditContentAmount}
                            placeholder={editUnit === "ml" || editUnit === "g" ? "ex.: 1000" : "ex.: 1"}
                            type="number"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold">Qual lote sai primeiro na venda</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Vale quando há mais de um lote em estoque ao mesmo tempo (preços/datas
                        diferentes). Não muda o saldo nem o custo médio de agora.
                      </p>
                      <div className="mt-2 flex gap-2">
                        {(
                          [
                            { id: "fefo" as const, label: "Vencimento (FEFO)" },
                            { id: "lowest_cost" as const, label: "Menor custo" },
                          ]
                        ).map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setEditDepletionRule(option.id)}
                            className={`h-9 flex-1 rounded-lg text-xs font-medium ${editDepletionRule === option.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {editError && <p className="text-xs text-destructive">{editError}</p>}
                    <button
                      onClick={() => submitEdit(item)}
                      disabled={editBusy}
                      className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {editBusy ? "Salvando..." : "Salvar alterações"}
                    </button>
                  </div>
                )}

                {isDeleting && (
                  <div className="mt-3">
                    <PasswordConfirm
                      message={`Apagar "${item.name}" de vez? Só funciona se ele nunca foi usado numa ficha técnica nem saiu por venda — não dá pra desfazer. Confirme com a senha da equipe.`}
                      confirmLabel="Apagar de vez"
                      onCancel={() => setDeletingId(null)}
                      onConfirm={(password) => confirmDeleteStockItem(item.id, password)}
                    />
                  </div>
                )}

                {!item.purchase_unit && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Embalagem de compra não configurada — a entrada é feita direto em {item.unit}.
                    Configure em Editar.
                  </p>
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
                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">
                        Validade deste lote (opcional)
                      </span>
                      <input
                        type="date"
                        value={entryExpiresOn}
                        onChange={(event) => setEntryExpiresOn(event.target.value)}
                        className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                      />
                    </label>
                    <button
                      onClick={() => submitEntry(item)}
                      disabled={entryBusy || !entryPacks}
                      className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {entryBusy ? "Salvando..." : "Confirmar entrada"}
                    </button>
                  </div>
                )}

                {openLossId === item.id && (
                  <div className="mt-3 space-y-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      value={lossQuantity}
                      onChange={(event) => setLossQuantity(event.target.value)}
                      placeholder={`Quantidade perdida (${item.unit})`}
                      autoFocus
                      className="h-11 w-full rounded-xl border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
                    />
                    <input
                      type="text"
                      value={lossNote}
                      onChange={(event) => setLossNote(event.target.value)}
                      placeholder="Motivo (opcional): quebrou, venceu, derramou..."
                      className="h-11 w-full rounded-xl border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
                    />
                    {lossError && <p className="text-xs text-destructive">{lossError}</p>}
                    <button
                      onClick={() => submitLoss(item)}
                      disabled={lossBusy || !lossQuantity}
                      className="h-11 w-full rounded-xl bg-amber-500 text-sm font-semibold text-black disabled:opacity-60"
                    >
                      {lossBusy ? "Salvando..." : "Confirmar perda"}
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
  const updateFn = useServerFn(updateBaseDrink);
  const deleteFn = useServerFn(deleteBaseDrink);
  const lossFn = useServerFn(addBaseDrinkLoss);
  const lotsFn = useServerFn(getStockLots);
  const updateLotFn = useServerFn(updateStockLot);
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
            expiresOn: input.data.expiresOn,
          },
        })
      }
      updateFn={(input) =>
        updateFn({ data: { ...input.data, unit: input.data.unit as "ml" | "un" } })
      }
      deleteFn={(input) => deleteFn({ data: input.data })}
      lossFn={(input) =>
        lossFn({ data: { baseDrinkId: input.data.id, quantity: input.data.quantity, note: input.data.note } })
      }
      lotsFn={(input) => lotsFn({ data: { kind: "base_drink", componentId: input.data.componentId } })}
      updateLotFn={(input) => updateLotFn({ data: { kind: "base_drink", ...input.data } })}
    />
  );
}

function IngredientesTab() {
  const createFn = useServerFn(createIngredient);
  const entryFn = useServerFn(addIngredientEntry);
  const updateFn = useServerFn(updateIngredient);
  const deleteFn = useServerFn(deleteIngredient);
  const lossFn = useServerFn(addIngredientLoss);
  const lotsFn = useServerFn(getStockLots);
  const updateLotFn = useServerFn(updateStockLot);
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
            expiresOn: input.data.expiresOn,
          },
        })
      }
      updateFn={(input) =>
        updateFn({ data: { ...input.data, unit: input.data.unit as "ml" | "un" | "g" } })
      }
      deleteFn={(input) => deleteFn({ data: input.data })}
      lotsFn={(input) => lotsFn({ data: { kind: "ingredient", componentId: input.data.componentId } })}
      updateLotFn={(input) => updateLotFn({ data: { kind: "ingredient", ...input.data } })}
      lossFn={(input) =>
        lossFn({ data: { ingredientId: input.data.id, quantity: input.data.quantity, note: input.data.note } })
      }
    />
  );
}

// ============================================================
// Aba: Relatórios
// ============================================================

type StockReport = {
  totalValue: number;
  valueByKind: Record<string, number>;
  lowStock: Array<{
    id: string;
    name: string;
    unit: string;
    current: number;
    min: number;
    kind: "Bebida base" | "Ingrediente";
  }>;
  outOfStockProducts: Array<{ id: string; name: string; category: string }>;
  waste: {
    totalValue: number;
    byItem: Array<{ name: string; quantity: number; value: number }>;
    byMonth: Array<{ month: string; value: number }>;
  };
};

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year!, month! - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function RelatoriosTab() {
  const [report, setReport] = useState<StockReport | null>(null);
  const load = useServerFn(getStockReport);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await load();
      if (!cancelled) setReport(result as StockReport);
    }
    void run();
    const poll = setInterval(() => void run(), 20000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!report) {
    return <p className="text-sm text-muted-foreground">Carregando relatório...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Valor total parado em estoque</p>
        <p className="mt-1 text-2xl font-bold">{brl(report.totalValue)}</p>
        <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
          {Object.entries(report.valueByKind).map(([kind, value]) => (
            <div key={kind} className="flex items-center justify-between">
              <span className="text-muted-foreground">{kind}</span>
              <span className="font-medium">{brl(value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Abaixo do mínimo</p>
        {report.lowStock.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Tudo dentro do mínimo cadastrado.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {report.lowStock.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {item.name} <span className="text-muted-foreground">· {item.kind}</span>
                </span>
                <span className="shrink-0 font-semibold text-amber-500">
                  {item.current} / {item.min} {item.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Produtos zerados</p>
        {report.outOfStockProducts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum produto de revenda zerado.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {report.outOfStockProducts.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{product.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{product.category}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desperdício: existe desde que a ação "− Perda" foi criada nesta versão — meses antes
          disso aparecem vazios porque não tinha como registrar, não porque não teve perda. */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Desperdício</p>
        <p className="mt-1 text-2xl font-bold text-amber-500">{brl(report.waste.totalValue)}</p>
        <p className="text-xs text-muted-foreground">perdido no total, desde que passou a ser registrado</p>

        {report.waste.byMonth.length > 1 && (
          <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
            {report.waste.byMonth.map((row) => (
              <div key={row.month} className="flex items-center justify-between">
                <span className="capitalize text-muted-foreground">{monthLabel(row.month)}</span>
                <span className="font-medium">{brl(row.value)}</span>
              </div>
            ))}
          </div>
        )}

        {report.waste.byItem.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma perda registrada ainda. Use o botão "− Perda" nas abas de Bebidas base e
            Ingredientes pra registrar quebra, vencimento ou derrame.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 border-t border-border pt-3">
            {report.waste.byItem.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {item.name} <span className="text-muted-foreground">· {item.quantity}</span>
                </span>
                <span className="shrink-0 font-semibold text-amber-500">{brl(item.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
