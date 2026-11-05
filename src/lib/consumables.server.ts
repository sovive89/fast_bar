import {
  isCategory,
  isSector,
  validateAdjust,
  validateCreate,
  type ConsumableCategory,
  type ConsumableSector,
} from "./consumables";

export type ConsumableItem = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  sector: ConsumableSector;
  category: ConsumableCategory;
};
export type ConsumableResult = { ok: true } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = "id, name, unit, current_stock, min_stock, sector, category";

// Uma única importação compartilhada: chamadas simultâneas não disputam o carregamento do módulo.
let serverModule: Promise<typeof import("./fastbar.server")> | null = null;
const loadServer = () => (serverModule ??= import("./fastbar.server"));

async function ctx() {
  const { admin, assertRegisterAccess, getDefaultTenantId } = await loadServer();
  await assertRegisterAccess();
  return { db: admin(), tenantId: await getDefaultTenantId() };
}

export async function listConsumables(): Promise<ConsumableItem[]> {
  const { db, tenantId } = await ctx();
  const { data, error } = await db
    .from("fastbar_consumables")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name")
    .limit(500);
  if (error) throw new Error("Não foi possível carregar os materiais e utensílios.");
  return (data ?? []).flatMap((row) =>
    isSector(row.sector) && isCategory(row.category)
      ? [
          {
            id: row.id,
            name: row.name,
            unit: row.unit,
            current_stock: Number(row.current_stock),
            min_stock: Number(row.min_stock),
            sector: row.sector,
            category: row.category,
          },
        ]
      : [],
  );
}

export async function createConsumable(raw: Record<string, unknown>): Promise<ConsumableResult> {
  const parsed = validateCreate(raw);
  if (!parsed.ok) return parsed;
  const { db, tenantId } = await ctx();
  const input = parsed.value;
  const { error } = await db.from("fastbar_consumables").insert({
    tenant_id: tenantId,
    name: input.name,
    unit: input.unit,
    min_stock: input.minStock,
    sector: input.sector,
    category: input.category,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Já existe um item com esse nome." };
    return { ok: false, message: "Não foi possível cadastrar o item." };
  }
  return { ok: true };
}

/**
 * Entrada ou baixa manual. A baixa nunca deixa o saldo negativo. O saldo muda por "compare e
 * troque" (só grava se ninguém mexeu entre a leitura e a escrita), então duas pessoas lançando ao
 * mesmo tempo não perdem uma das baixas: a segunda tenta de novo.
 */
export async function adjustConsumable(
  id: unknown,
  raw: Record<string, unknown>,
): Promise<ConsumableResult> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, message: "Item inválido." };
  const parsed = validateAdjust(raw);
  if (!parsed.ok) return parsed;
  const { db, tenantId } = await ctx();
  const input = parsed.value;

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: item } = await db
      .from("fastbar_consumables")
      .select("id, current_stock")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (!item) return { ok: false, message: "Esse item já não existe." };
    const before = Number(item.current_stock);
    const after = input.type === "entrada" ? before + input.quantity : before - input.quantity;
    if (after < 0)
      return {
        ok: false,
        message: `Só há ${before} em estoque; não dá para baixar ${input.quantity}.`,
      };
    const { data: updated, error } = await db
      .from("fastbar_consumables")
      .update({ current_stock: after, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .eq("current_stock", before)
      .select("id");
    if (error) return { ok: false, message: "Não foi possível atualizar o estoque." };
    if (!updated?.length) continue; // alguém mexeu junto: lê de novo
    const { error: movementError } = await db.from("fastbar_consumable_movements").insert({
      tenant_id: tenantId,
      consumable_id: id,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason,
      note: input.note,
    });
    if (movementError) {
      // Sem o registro do movimento não há trilha: desfaz a mudança de saldo.
      await db
        .from("fastbar_consumables")
        .update({ current_stock: before })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .eq("current_stock", after);
      return { ok: false, message: "Não foi possível registrar o movimento." };
    }
    return { ok: true };
  }
  return { ok: false, message: "O estoque mudou ao mesmo tempo. Tente de novo." };
}
