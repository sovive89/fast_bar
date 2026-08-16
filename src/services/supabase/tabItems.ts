import type { BarTabItem } from "@/types/fastbar";

export const tabTotal = (items: Pick<BarTabItem, "unit_price" | "quantity">[]) =>
  items.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);

/** Total já com o desconto de boas-vindas abatido, quando a comanda tiver um percentual gravado. */
export const tabTotalWithDiscount = (
  items: Pick<BarTabItem, "unit_price" | "quantity">[],
  discountPercent: number | null | undefined,
) => {
  const subtotal = tabTotal(items);
  const percent = discountPercent ?? 0;
  return percent > 0 ? subtotal * (1 - percent / 100) : subtotal;
};
