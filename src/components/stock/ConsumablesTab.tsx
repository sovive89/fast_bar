import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PrimaryButton, SectionCard, TextField } from "@/components/stock/SharedFormFields";
import { Loading } from "@/components/motion/Loading";
import {
  adjustConsumableFn,
  createConsumableFn,
  listConsumablesFn,
} from "@/lib/consumables.functions";
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  CONSUMABLE_CATEGORIES,
  CONSUMABLE_SECTORS,
  CONSUMABLE_UNITS,
  ENTRY_REASONS,
  EXIT_REASONS,
  SECTOR_LABELS,
  isBelowMinimum,
  type ConsumableCategory,
  type ConsumableSector,
  type MovementType,
} from "@/lib/consumables";

type Items = Awaited<ReturnType<typeof listConsumablesFn>>;

const chip = (active: boolean) =>
  `min-h-11 rounded-full px-4 text-sm font-medium ${
    active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
  }`;
const selectClass =
  "mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring";

/**
 * Materiais de consumo e utensílios, separados por setor (bar, cozinha, geral) e por tipo. Não
 * entram no cardápio nem em ficha técnica: a baixa é manual, com motivo (consumo, quebra, perda).
 */
export function ConsumablesTab() {
  const list = useServerFn(listConsumablesFn);
  const create = useServerFn(createConsumableFn);
  const adjust = useServerFn(adjustConsumableFn);

  const [items, setItems] = useState<Items | null>(null);
  const [loadError, setLoadError] = useState("");
  const [sector, setSector] = useState<ConsumableSector | "todos">("todos");
  const [category, setCategory] = useState<ConsumableCategory | "todos">("todos");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string>("un");
  const [minStock, setMinStock] = useState("");
  const [newSector, setNewSector] = useState<ConsumableSector>("geral");
  const [newCategory, setNewCategory] = useState<ConsumableCategory>("material_consumo");

  const [adjusting, setAdjusting] = useState<{ id: string; type: MovementType } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await list());
      setLoadError("");
    } catch {
      setLoadError("Não foi possível carregar. Tente de novo.");
    }
  }, [list]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (item) =>
          (sector === "todos" || item.sector === sector) &&
          (category === "todos" || item.category === category),
      ),
    [items, sector, category],
  );

  async function submitCreate() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await create({
        data: { name, unit, minStock, sector: newSector, category: newCategory },
      });
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      setMessage({ ok: true, text: "Item cadastrado." });
      setName("");
      setMinStock("");
      setShowForm(false);
      await load();
    } catch {
      setMessage({ ok: false, text: "Não foi possível cadastrar agora." });
    } finally {
      setBusy(false);
    }
  }

  function startAdjust(id: string, type: MovementType) {
    setAdjusting({ id, type });
    setQuantity("");
    setReason(type === "entrada" ? "compra" : "consumo");
    setNote("");
    setMessage(null);
  }

  async function submitAdjust() {
    if (!adjusting || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await adjust({
        data: {
          id: adjusting.id,
          type: adjusting.type,
          quantity: quantity.replace(",", "."),
          reason,
          note,
        },
      });
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      setAdjusting(null);
      await load();
    } catch {
      setMessage({ ok: false, text: "Não foi possível registrar agora." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div role="group" aria-label="Setor" className="flex flex-wrap gap-2">
          <button className={chip(sector === "todos")} onClick={() => setSector("todos")}>
            Todos os setores
          </button>
          {CONSUMABLE_SECTORS.map((value) => (
            <button key={value} className={chip(sector === value)} onClick={() => setSector(value)}>
              {SECTOR_LABELS[value]}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Tipo" className="flex flex-wrap gap-2">
          <button className={chip(category === "todos")} onClick={() => setCategory("todos")}>
            Todos os tipos
          </button>
          {CONSUMABLE_CATEGORIES.map((value) => (
            <button
              key={value}
              className={chip(category === value)}
              onClick={() => setCategory(value)}
            >
              {CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => setShowForm((value) => !value)}
        className="min-h-11 w-full rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {showForm ? "Cancelar" : "+ Novo item"}
      </button>

      {showForm && (
        <SectionCard title="Novo material ou utensílio">
          <div className="space-y-3">
            <TextField label="Nome" value={name} onChange={setName} placeholder="Detergente" />
            <div className="grid grid-cols-2 items-end gap-3">
              <label className="block text-xs font-medium text-muted-foreground">
                Unidade
                <select
                  className={selectClass}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  {CONSUMABLE_UNITS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="Estoque mínimo"
                value={minStock}
                onChange={setMinStock}
                placeholder="0"
                type="number"
              />
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Setor
              <select
                className={selectClass}
                value={newSector}
                onChange={(e) => setNewSector(e.target.value as ConsumableSector)}
              >
                {CONSUMABLE_SECTORS.map((value) => (
                  <option key={value} value={value}>
                    {SECTOR_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Tipo
              <select
                className={selectClass}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as ConsumableCategory)}
              >
                {CONSUMABLE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block font-normal">{CATEGORY_HINTS[newCategory]}</span>
            </label>
            <PrimaryButton onClick={submitCreate} disabled={busy}>
              {busy ? "Salvando..." : "Salvar item"}
            </PrimaryButton>
          </div>
        </SectionCard>
      )}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-emerald-600" : "text-destructive"}`}
        >
          {message.text}
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}

      {items === null && !loadError ? (
        <Loading label="Carregando..." />
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nenhum item neste filtro. Use "+ Novo item" para cadastrar limpeza, descartáveis, gás,
          copos, pratos e talheres.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => {
            const open = adjusting?.id === item.id;
            const low = isBelowMinimum(item);
            return (
              <li key={item.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 break-words font-semibold">{item.name}</p>
                  <p className="font-bold">
                    {item.current_stock} <span className="text-xs font-normal">{item.unit}</span>
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {SECTOR_LABELS[item.sector]} · {CATEGORY_LABELS[item.category]}
                  {item.min_stock > 0 ? ` · mínimo ${item.min_stock} ${item.unit}` : ""}
                </p>
                {low && (
                  <p className="mt-1 text-xs font-semibold text-amber-600">
                    Abaixo do mínimo: hora de repor.
                  </p>
                )}
                {!open ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium"
                      onClick={() => startAdjust(item.id, "entrada")}
                    >
                      + Entrada
                    </button>
                    <button
                      className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium"
                      onClick={() => startAdjust(item.id, "saida")}
                    >
                      − Baixa
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3 rounded-xl border border-border p-3">
                    <p className="text-sm font-semibold">
                      {adjusting.type === "entrada" ? "Entrada" : "Baixa"} de {item.name}
                    </p>
                    <TextField
                      label={`Quantidade (${item.unit})`}
                      value={quantity}
                      onChange={setQuantity}
                      type="number"
                    />
                    <label className="block text-xs font-medium text-muted-foreground">
                      Motivo
                      <select
                        className={selectClass}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      >
                        {Object.entries(
                          adjusting.type === "entrada" ? ENTRY_REASONS : EXIT_REASONS,
                        ).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <TextField label="Observação (opcional)" value={note} onChange={setNote} />
                    <div className="flex gap-2">
                      <PrimaryButton onClick={submitAdjust} disabled={busy || !quantity}>
                        {busy ? "Salvando..." : "Registrar"}
                      </PrimaryButton>
                      <button
                        className="min-h-11 rounded-xl border border-border px-4 text-sm"
                        onClick={() => setAdjusting(null)}
                      >
                        Cancelar
                      </button>
                    </div>
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
