/**
 * Materiais de consumo e utensílios do estoque. Regras puras, usadas pela tela e pelo servidor.
 * Nunca entram no cardápio nem em ficha técnica: a baixa é manual (consumo, quebra, perda).
 */
export const CONSUMABLE_SECTORS = ["bar", "cozinha", "geral"] as const;
export type ConsumableSector = (typeof CONSUMABLE_SECTORS)[number];
export const SECTOR_LABELS: Record<ConsumableSector, string> = {
  bar: "Bar",
  cozinha: "Cozinha",
  geral: "Geral",
};

export const CONSUMABLE_CATEGORIES = ["material_consumo", "utensilio"] as const;
export type ConsumableCategory = (typeof CONSUMABLE_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<ConsumableCategory, string> = {
  material_consumo: "Material de consumo",
  utensilio: "Utensílio",
};
export const CATEGORY_HINTS: Record<ConsumableCategory, string> = {
  material_consumo: "Limpeza, descartáveis, gás, óleo, filtros, pilhas.",
  utensilio: "Copos, taças, pratos, talheres, panelas.",
};

export const CONSUMABLE_UNITS = [
  "un",
  "cx",
  "pct",
  "kg",
  "g",
  "L",
  "ml",
  "rolo",
  "botijão",
] as const;

export const ENTRY_REASONS = { compra: "Compra", ajuste: "Ajuste de contagem" } as const;
export const EXIT_REASONS = {
  consumo: "Consumo",
  quebra: "Quebra",
  perda: "Perda ou extravio",
  vencimento: "Vencimento",
  ajuste: "Ajuste de contagem",
} as const;
export type MovementType = "entrada" | "saida";

const isIn = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);
export const isSector = (value: unknown): value is ConsumableSector =>
  isIn(CONSUMABLE_SECTORS, value);
export const isCategory = (value: unknown): value is ConsumableCategory =>
  isIn(CONSUMABLE_CATEGORIES, value);

export type CreateInput = {
  name: string;
  unit: string;
  minStock: number;
  sector: ConsumableSector;
  category: ConsumableCategory;
};
export type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

export function validateCreate(raw: Record<string, unknown>): Validation<CreateInput> {
  const name = typeof raw["name"] === "string" ? raw["name"].trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80) return { ok: false, message: "Digite o nome do item." };
  const unit = typeof raw["unit"] === "string" ? raw["unit"].trim() : "";
  if (unit.length < 1 || unit.length > 12) return { ok: false, message: "Informe a unidade." };
  const minStock =
    raw["minStock"] === undefined || raw["minStock"] === "" ? 0 : Number(raw["minStock"]);
  if (!Number.isFinite(minStock) || minStock < 0 || minStock > 1_000_000)
    return { ok: false, message: "Estoque mínimo inválido." };
  if (!isSector(raw["sector"])) return { ok: false, message: "Escolha o setor." };
  if (!isCategory(raw["category"])) return { ok: false, message: "Escolha o tipo." };
  return {
    ok: true,
    value: { name, unit, minStock, sector: raw["sector"], category: raw["category"] },
  };
}

export type AdjustInput = {
  type: MovementType;
  quantity: number;
  reason: string;
  note: string | null;
};

export function validateAdjust(raw: Record<string, unknown>): Validation<AdjustInput> {
  const type = raw["type"];
  if (type !== "entrada" && type !== "saida") return { ok: false, message: "Movimento inválido." };
  const quantity = Number(raw["quantity"]);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000)
    return { ok: false, message: "Informe uma quantidade maior que zero." };
  const reasons: Record<string, string> = type === "entrada" ? ENTRY_REASONS : EXIT_REASONS;
  const reason = typeof raw["reason"] === "string" ? raw["reason"] : "";
  if (!(reason in reasons)) return { ok: false, message: "Escolha o motivo." };
  const note = typeof raw["note"] === "string" ? raw["note"].trim().slice(0, 300) : "";
  return { ok: true, value: { type, quantity, reason, note: note || null } };
}

export function isBelowMinimum(item: { current_stock: number; min_stock: number }): boolean {
  return item.min_stock > 0 && item.current_stock <= item.min_stock;
}
