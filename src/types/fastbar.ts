export type SessionStatus = "pending" | "open" | "closed" | "paid" | "cancelled";

/** Public (client-safe) shape of a bar_sessions row — never includes verification_code. */
export type BarSession = {
  id: string;
  customer_name: string;
  phone: string;
  status: SessionStatus;
  started_at: string | null;
  closed_at: string | null;
  paid_at: string | null;
  payment_method?: string | null;
  customer_id?: string | null;
  archived_at?: string | null;
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
  pending: "Aguardando confirmação",
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
  cancelled: "Cancelada",
};
