import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { brl, parseAmount } from "@/lib/format";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { addBaseDrinkEntry, addIngredientEntry, createSupplier } from "@/lib/base-drinks.functions";

/**
 * Formulário único de lançamento de lote — usado no Estoque ("+ Entrada" do card) e no fim do
 * cadastro de produto no Cardápio ("Já tem isso no bar?"). Um componente só de propósito: se cada
 * tela tivesse o seu, a regra de quantidade/valor divergiria na primeira correção feita em uma e
 * esquecida na outra.
 *
 * Cada lote escolhe a própria forma de entrada — o item não fica preso a um formato:
 *  - "pacote": a embalagem cadastrada no item (só aparece se o item tiver uma);
 *  - "caixa":  caixa/fardo avulso, informando quantos itens vêm nela (e o conteúdo de cada, quando
 *              a unidade não é "un") — a compra de hoje veio num fardo diferente do de sempre;
 *  - "avulso": a quantidade direto na unidade do estoque.
 * E o valor pode ser o TOTAL pago no lote ou o valor UNITÁRIO: o outro é calculado.
 */

export type LotEntryTarget = {
  kind: "base_drink" | "ingredient";
  id: string;
  name: string;
  unit: string;
  purchase_unit: string | null;
  units_per_pack: number;
  content_amount: number;
};

export type LotEntrySupplier = { id: string; name: string };

type EntryForm = "pacote" | "caixa" | "avulso";

const NEW_SUPPLIER = "__novo__";

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring";

export function LotEntryForm(props: {
  target: LotEntryTarget;
  suppliers: LotEntrySupplier[];
  /** Chamado depois de criar um fornecedor aqui mesmo, pra quem é dono da lista atualizá-la. */
  onSupplierCreated?: (supplier: LotEntrySupplier) => void;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const { target } = props;
  const addBaseDrink = useServerFn(addBaseDrinkEntry);
  const addIngredient = useServerFn(addIngredientEntry);
  const saveSupplier = useServerFn(createSupplier);

  const hasPackaging = !!target.purchase_unit;
  const [form, setForm] = useState<EntryForm>(hasPackaging ? "pacote" : "avulso");
  const [packs, setPacks] = useState("");
  const [boxes, setBoxes] = useState("");
  const [perBox, setPerBox] = useState("");
  // Conteúdo de cada item da caixa — só pergunta quando a unidade não é "un" (garrafa de 1L = 1000ml).
  const [contentPerItem, setContentPerItem] = useState("");
  const [loose, setLoose] = useState("");

  const [valueMode, setValueMode] = useState<"total" | "unit">("total");
  const [value, setValue] = useState("");

  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [expiresOn, setExpiresOn] = useState("");
  const [note, setNote] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsContent = target.unit !== "un";

  /** Quantidade que vai entrar, na unidade do estoque — null enquanto o formulário está incompleto. */
  function resolvedQuantity(): number | null {
    if (form === "pacote") {
      const n = parseAmount(packs);
      if (n === null || !Number.isInteger(n) || n <= 0) return null;
      return n * target.units_per_pack * Number(target.content_amount);
    }
    if (form === "caixa") {
      const b = parseAmount(boxes);
      const p = parseAmount(perBox);
      const c = needsContent ? parseAmount(contentPerItem) : 1;
      if (b === null || !Number.isInteger(b) || b <= 0) return null;
      if (p === null || !Number.isInteger(p) || p <= 0) return null;
      if (c === null || c <= 0) return null;
      return b * p * c;
    }
    const q = parseAmount(loose);
    return q === null || q <= 0 ? null : q;
  }

  const quantity = resolvedQuantity();
  const parsedValue = value.trim() ? parseAmount(value) : null;
  const unitCost =
    parsedValue === null || quantity === null
      ? null
      : valueMode === "total"
        ? parsedValue / quantity
        : parsedValue;
  const totalCost =
    parsedValue === null || quantity === null
      ? null
      : valueMode === "total"
        ? parsedValue
        : parsedValue * quantity;

  async function addSupplier() {
    const name = newSupplierName.trim();
    if (name.length < 2) return setError("Digite o nome do fornecedor.");
    setSupplierBusy(true);
    const result = await saveSupplier({ data: { name } });
    setSupplierBusy(false);
    if (!result.ok || !("id" in result)) {
      return setError(result.ok ? "Não foi possível salvar o fornecedor." : result.message);
    }
    props.onSupplierCreated?.({ id: result.id, name });
    setSupplierId(result.id);
    setNewSupplierName("");
    setError(null);
  }

  async function submit() {
    setError(null);
    if (quantity === null) {
      return setError(
        form === "pacote"
          ? `Informe quantas ${target.purchase_unit} chegaram (número inteiro).`
          : form === "caixa"
            ? needsContent
              ? `Informe caixas, itens por caixa e o conteúdo de cada item em ${target.unit}.`
              : "Informe quantas caixas e quantos itens vêm em cada uma (números inteiros)."
            : `Informe a quantidade em ${target.unit}.`,
      );
    }
    if (value.trim() && (parsedValue === null || parsedValue < 0)) {
      return setError("Valor inválido — use o formato 120,00.");
    }
    if (supplierId === NEW_SUPPLIER) {
      return setError("Salve o fornecedor novo antes, ou escolha um da lista.");
    }

    const payload = {
      // "caixa" vira avulso no servidor: a conta caixas × itens × conteúdo já foi feita aqui, e a
      // embalagem cadastrada do item não pode ser usada (a compra de hoje veio em outro formato).
      entryMode: form === "pacote" ? ("pacote" as const) : ("avulso" as const),
      packs: form === "pacote" ? (parseAmount(packs) ?? 0) : 1,
      avulsoQuantity: form === "pacote" ? undefined : quantity,
      purchaseCost: parsedValue !== null && valueMode === "total" ? parsedValue : undefined,
      unitCost: parsedValue !== null && valueMode === "unit" ? parsedValue : undefined,
      supplierId: supplierId || undefined,
      expiresOn: expiresOn || undefined,
      note: note.trim() || undefined,
    };

    setBusy(true);
    const result =
      target.kind === "base_drink"
        ? await addBaseDrink({ data: { baseDrinkId: target.id, ...payload } })
        : await addIngredient({ data: { ingredientId: target.id, ...payload } });
    setBusy(false);
    if (!result.ok) return setError(result.message ?? "Não foi possível registrar a entrada.");
    await props.onSaved();
  }

  const formOptions: Array<{ key: EntryForm; label: string }> = [
    ...(hasPackaging ? [{ key: "pacote" as const, label: `Por ${target.purchase_unit}` }] : []),
    { key: "caixa", label: "Caixa / fardo" },
    { key: "avulso", label: `Avulso (${target.unit})` },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Como chegou este lote">
        {formOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={form === option.key}
            onClick={() => setForm(option.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              form === option.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {form === "pacote" && (
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={packs}
          onChange={(event) => setPacks(event.target.value)}
          placeholder={`Quantas ${target.purchase_unit} (${target.units_per_pack} × ${target.content_amount}${target.unit})`}
          autoFocus={props.autoFocus}
          className={inputClass}
        />
      )}
      {form === "caixa" && (
        <div className={`grid gap-2 ${needsContent ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={boxes}
            onChange={(event) => setBoxes(event.target.value)}
            placeholder="Quantas caixas"
            autoFocus={props.autoFocus}
            className={inputClass}
          />
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={perBox}
            onChange={(event) => setPerBox(event.target.value)}
            placeholder="Itens por caixa"
            className={inputClass}
          />
          {needsContent && (
            <input
              type="text"
              inputMode="decimal"
              value={contentPerItem}
              onChange={(event) => setContentPerItem(event.target.value)}
              placeholder={`Conteúdo de cada (${target.unit})`}
              className={inputClass}
            />
          )}
        </div>
      )}
      {form === "avulso" && (
        <input
          type="text"
          inputMode="decimal"
          value={loose}
          onChange={(event) => setLoose(event.target.value)}
          placeholder={`Quantidade (${target.unit})`}
          autoFocus={props.autoFocus}
          className={inputClass}
        />
      )}

      <div className="flex gap-2">
        <select
          value={valueMode}
          onChange={(event) => setValueMode(event.target.value as "total" | "unit")}
          aria-label="Tipo de valor"
          className="h-11 shrink-0 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
        >
          <option value="total">Total pago</option>
          <option value="unit">Valor por {target.unit}</option>
        </select>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="R$ (opcional)"
          className={inputClass}
        />
      </div>

      {quantity !== null && (
        <p className="text-xs text-muted-foreground">
          Entra {Number(quantity.toFixed(3)).toLocaleString("pt-BR")} {target.unit} no estoque
          {unitCost !== null && totalCost !== null && quantity > 0
            ? ` · ${brl(unitCost)} por ${target.unit} · total ${brl(totalCost)}`
            : ""}
        </p>
      )}

      <select
        value={supplierId}
        onChange={(event) => setSupplierId(event.target.value)}
        aria-label="Fornecedor"
        className={inputClass}
      >
        <option value="">Sem fornecedor</option>
        {props.suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
        <option value={NEW_SUPPLIER}>+ Novo fornecedor…</option>
      </select>
      {supplierId === NEW_SUPPLIER && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newSupplierName}
            onChange={(event) => setNewSupplierName(event.target.value)}
            placeholder="Nome do fornecedor"
            autoFocus
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void addSupplier()}
            disabled={supplierBusy}
            className="h-11 shrink-0 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-60"
          >
            {supplierBusy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Validade deste lote (opcional)</span>
        <DatePickerField
          value={expiresOn}
          onChange={setExpiresOn}
          placeholder="Sem validade"
          className="mt-1"
        />
      </label>
      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Observação (opcional)"
        className={inputClass}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        {props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-muted-foreground"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Salvando..." : (props.submitLabel ?? "Confirmar entrada")}
        </button>
      </div>
    </div>
  );
}
