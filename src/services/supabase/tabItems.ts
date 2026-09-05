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

export type TabTotals = {
  /** Soma dos itens a preço de tabela. */
  subtotal: number;
  /** Quanto o desconto de boas-vindas abateu (em reais, não percentual). */
  discount: number;
  /** Valor da taxa de serviço. */
  serviceFee: number;
  /** O que o cliente paga. */
  total: number;
};

/**
 * Conta única do que a comanda custa — usada pela tela, pelo pagamento manual, pela maquininha e
 * pelo crédito no CRM. Existe pra que esses quatro caminhos não cheguem a valores diferentes: já
 * eram três cópias da mesma multiplicação antes da taxa de serviço entrar, e cada cópia é uma
 * chance de o cliente ver um valor na tela e outro na maquininha.
 *
 * A ordem importa: a taxa incide sobre o consumo JÁ com o desconto aplicado. Cobrar taxa sobre o
 * preço de tabela faria o cliente pagar serviço sobre um valor que ninguém pagou.
 */
export function tabTotals(
  items: Pick<BarTabItem, "unit_price" | "quantity">[],
  discountPercent: number | null | undefined,
  serviceFeePercent: number | null | undefined,
): TabTotals {
  const subtotal = tabTotal(items);
  const discount = subtotal * (Math.max(0, Number(discountPercent ?? 0)) / 100);
  const afterDiscount = subtotal - discount;
  const serviceFee = afterDiscount * (Math.max(0, Number(serviceFeePercent ?? 0)) / 100);
  return { subtotal, discount, serviceFee, total: afterDiscount + serviceFee };
}
