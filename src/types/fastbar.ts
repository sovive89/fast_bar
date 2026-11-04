export type SessionStatus =
  "unverified" | "pending" | "open" | "closed" | "paid" | "cancelled" | "cortesia" | "inadimplente";
// (cortesia e inadimplente são novos — fechamento de operação, P1.5-6 do CLAUDE.md)

/** Public (client-safe) shape of a fastbar_sessions row — never includes verification_code. */
export type BarSession = {
  id: string;
  customer_name: string;
  phone: string | null;
  document?: string | null;
  document_type?: "cpf" | "rg" | null;
  status: SessionStatus;
  started_at: string | null;
  closed_at: string | null;
  paid_at: string | null;
  payment_method?: string | null;
  customer_id?: string | null;
  archived_at?: string | null;
  /** Operação (turno) em que a comanda nasceu; null nas anteriores ao controle de operações. */
  operacao_id?: string | null;
  discount_percent?: number;
  /** Taxa de serviço carimbada nesta comanda no fechamento. 0 = sem taxa (cliente recusou, ou o
   * bar não cobra). Fica gravada na comanda, e não lida da config na hora de cobrar, pra que mudar
   * o percentual depois não reescreva o que já foi cobrado de quem pagou antes. */
  service_fee_percent?: number;
  // Cobrança em andamento na maquininha (Mercado Pago Point) — pos_order_id não-nulo é o sinal de
  // "aguardando o terminal"; some sozinho quando o pagamento é confirmado (ou cancelado).
  pos_order_id?: string | null;
  pos_amount?: number | null;
  /** O que a cobrança em andamento na maquininha vai fazer: quitar a conta ou virar crédito. */
  pos_purpose?: "pagamento" | "credito" | null;
  // ID do pedido no Mercado Pago que efetivamente pagou a comanda — preservado mesmo depois que
  // pos_order_id é zerado (que acontece assim que o pagamento é confirmado), pra dar pra estornar
  // depois. Só existe pra comandas pagas via maquininha.
  pos_paid_order_id?: string | null;
  pos_refunded_at?: string | null;
};

export type BarTabItem = {
  id: string;
  session_id: string;
  product_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
  added_at: string;
};

/** Um recebimento da comanda (fastbar_session_payments). O saldo = total − soma destes valores. */
export type SessionPayment = {
  id: string;
  amount: number;
  method: string;
  motivo: string | null;
  saldo_apos: number;
  created_at: string;
};

/** Crédito adiantado recebido na comanda (fastbar_session_credits). */
export type SessionCredit = {
  id: string;
  amount: number;
  method: string;
  created_at: string;
};

/** Pedido de conta ativo da comanda, como o cliente enxerga: só o estado. */
export type BillRequestState = { status: "pedida" | "em_atendimento" };

export type BarProduct = {
  id: string;
  name: string;
  price: number;
  category: string;
  stock_quantity: number;
  image_url: string | null;
};

export const SESSION_PUBLIC_COLUMNS =
  "id, customer_name, phone, status, started_at, closed_at, paid_at";

export const STATUS_LABEL: Record<SessionStatus, string> = {
  unverified: "Aguardando verificação do celular",
  pending: "Aguardando confirmação",
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
  cancelled: "Cancelada",
  cortesia: "Cortesia",
  inadimplente: "Inadimplente",
};
