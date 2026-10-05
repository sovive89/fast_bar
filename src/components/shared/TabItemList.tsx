import { useMemo, useState } from "react";
import { PasswordConfirm } from "@/components/shared/PasswordConfirm";
import { brl, hhmm } from "@/lib/format";
import type { BarTabItem } from "@/types/fastbar";

/**
 * Cada lançamento continua sendo uma linha própria no banco (é assim que o estoque baixa e volta
 * item a item). A tela é que junta: 8 lançamentos de "BRAHMA a R$ 9,00" viram uma linha "8×".
 * Preço entra na chave de propósito — se o preço mudou no meio da noite, as duas levas ficam
 * separadas e o total de cada linha bate com o que foi cobrado.
 */
type ItemGroup = {
  key: string;
  productId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  /** Lançamentos da linha, do mais novo pro mais antigo — o "−" tira primeiro o último lançado. */
  items: BarTabItem[];
  firstAt: string;
  lastAt: string;
};

function groupItems(items: BarTabItem[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup>();
  for (const item of items) {
    const unitPrice = Number(item.unit_price);
    const key = `${item.product_id ?? `nome:${item.name}`}|${unitPrice}|${item.name}`;
    const group = groups.get(key);
    if (group) {
      group.quantity += item.quantity;
      group.items.push(item);
      if (item.added_at < group.firstAt) group.firstAt = item.added_at;
      if (item.added_at > group.lastAt) group.lastAt = item.added_at;
    } else {
      groups.set(key, {
        key,
        productId: item.product_id,
        name: item.name,
        unitPrice,
        quantity: item.quantity,
        items: [item],
        firstAt: item.added_at,
        lastAt: item.added_at,
      });
    }
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => (a.added_at < b.added_at ? 1 : -1));
  }
  return [...groups.values()];
}

/** Lançamentos a apagar pra tirar `units` unidades da linha, começando pelos mais recentes. */
function pickForRemoval(group: ItemGroup, units: number): BarTabItem[] {
  const picked: BarTabItem[] = [];
  let taken = 0;
  for (const item of group.items) {
    if (taken >= units) break;
    picked.push(item);
    taken += item.quantity;
  }
  return picked;
}

export function TabItemList({
  items,
  onAddOne,
  onRemoveMany,
}: {
  items: BarTabItem[];
  /** "+" na linha: lança mais uma unidade do mesmo produto (passa pela checagem de estoque). */
  onAddOne?: (productId: string) => Promise<{ ok: boolean; message?: string }>;
  /** Remoção (seleção ou "−"): uma senha só pra tudo que estiver marcado. */
  onRemoveMany?: (
    itemIds: string[],
    password: string,
  ) => Promise<{ ok: boolean; message?: string; removed?: number }>;
}) {
  const groups = useMemo(() => groupItems(items), [items]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minus, setMinus] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const editable = Boolean(onRemoveMany);

  // O que vai sair, já resolvido em lançamentos. Seleção ganha do "−": linha marcada sai inteira.
  const pending = useMemo(() => {
    const lines: { group: ItemGroup; units: number; ids: string[] }[] = [];
    for (const group of groups) {
      const units = selected.has(group.key)
        ? group.quantity
        : Math.min(minus[group.key] ?? 0, group.quantity);
      if (units <= 0) continue;
      const picked = selected.has(group.key) ? group.items : pickForRemoval(group, units);
      lines.push({
        group,
        units: picked.reduce((sum, item) => sum + item.quantity, 0),
        ids: picked.map((item) => item.id),
      });
    }
    return lines;
  }, [groups, selected, minus]);

  const pendingUnits = pending.reduce((sum, line) => sum + line.units, 0);
  const pendingValue = pending.reduce((sum, line) => sum + line.units * line.group.unitPrice, 0);
  const allSelected = groups.length > 0 && groups.every((group) => selected.has(group.key));

  function clearPending() {
    setSelected(new Set());
    setMinus({});
    setConfirming(false);
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function changeMinus(group: ItemGroup, delta: number) {
    setMinus((current) => {
      const value = Math.max(0, Math.min(group.quantity, (current[group.key] ?? 0) + delta));
      return { ...current, [group.key]: value };
    });
  }

  async function addOne(group: ItemGroup) {
    if (!onAddOne || !group.productId || addingKey) return;
    // "+" numa linha que tem remoção pendente desfaz a remoção primeiro, em vez de lançar de novo.
    if ((minus[group.key] ?? 0) > 0) {
      changeMinus(group, -1);
      return;
    }
    setAddingKey(group.key);
    setAddError(null);
    try {
      const result = await onAddOne(group.productId);
      if (!result.ok) setAddError(result.message ?? "Não foi possível lançar o item.");
    } finally {
      setAddingKey(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Nenhum item lançado ainda.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex items-center justify-between gap-3 px-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(groups.map((group) => group.key)))
              }
              className="h-4 w-4 accent-primary"
            />
            Selecionar todos
          </label>
          {pendingUnits > 0 && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground"
            >
              Remover {pendingUnits} {pendingUnits === 1 ? "item" : "itens"}
            </button>
          )}
        </div>
      )}

      {editable && confirming && pendingUnits > 0 && onRemoveMany && (
        <PasswordConfirm
          message={`Remover da comanda: ${pending
            .map((line) => `${line.units}× ${line.group.name}`)
            .join(", ")} (${brl(pendingValue)}). Confirme com a senha da equipe.`}
          confirmLabel={`Remover ${pendingUnits} ${pendingUnits === 1 ? "item" : "itens"}`}
          onCancel={() => setConfirming(false)}
          onConfirm={async (password) => {
            const result = await onRemoveMany(
              pending.flatMap((line) => line.ids),
              password,
            );
            // Mesmo com falha no meio, o que já saiu saiu: limpa a marcação pra não tentar de novo
            // itens que não existem mais. A mensagem diz quantos foram.
            if (result.ok || (result.removed ?? 0) > 0) clearPending();
            return result;
          }}
        />
      )}

      {addError && <p className="px-1 text-xs text-destructive">{addError}</p>}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {groups.map((group) => {
          const isSelected = selected.has(group.key);
          const removing = isSelected ? group.quantity : Math.min(minus[group.key] ?? 0, group.quantity);
          const remaining = group.quantity - removing;
          const time =
            hhmm(group.firstAt) === hhmm(group.lastAt)
              ? hhmm(group.lastAt)
              : `${hhmm(group.firstAt)}–${hhmm(group.lastAt)}`;
          return (
            <li
              key={group.key}
              className={`flex items-center gap-3 px-4 py-3 ${removing > 0 ? "bg-destructive/5" : ""}`}
            >
              {editable && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(group.key)}
                  aria-label={`Selecionar ${group.name}`}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {removing > 0 ? (
                    <>
                      <span className="text-muted-foreground line-through">{group.quantity}×</span>{" "}
                      <span className="text-destructive">{remaining}×</span>
                    </>
                  ) : (
                    <>{group.quantity}×</>
                  )}{" "}
                  {group.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {brl(group.unitPrice)} un. · {time}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold">
                {brl(group.unitPrice * (removing > 0 ? remaining : group.quantity))}
              </span>
              {editable && (
                <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-border">
                  <button
                    onClick={() => changeMinus(group, 1)}
                    disabled={isSelected || remaining <= 0}
                    aria-label={`Tirar um ${group.name}`}
                    className="h-8 w-8 text-base font-semibold text-muted-foreground hover:text-destructive disabled:opacity-40"
                  >
                    −
                  </button>
                  <button
                    onClick={() => void addOne(group)}
                    disabled={
                      isSelected ||
                      addingKey !== null ||
                      ((minus[group.key] ?? 0) === 0 && (!onAddOne || !group.productId))
                    }
                    aria-label={`Lançar mais um ${group.name}`}
                    className="h-8 w-8 border-l border-border text-base font-semibold text-muted-foreground hover:text-primary disabled:opacity-40"
                  >
                    {addingKey === group.key ? "…" : "+"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
