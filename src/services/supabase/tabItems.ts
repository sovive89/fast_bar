import type { BarTabItem } from "@/types/fastbar";

export const tabTotal = (items: Pick<BarTabItem, "unit_price" | "quantity">[]) =>
  items.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);
