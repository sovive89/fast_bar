/** Formatos mínimos que o app usa da API do Mercado Pago (Point/Orders) — não é o schema completo
 * da API, só os campos que este módulo realmente lê ou envia. */

export type PointOrderStatus =
  | "created"
  | "processing"
  | "at_terminal"
  | "finished"
  | "error"
  | "canceled"
  | "refunded"
  | (string & {});

export interface PointPaymentMethod {
  type?: string; // "credit_card" | "debit_card" | "pix" | "account_money" | ...
  id?: string; // bandeira do cartão (ex.: "master", "visa")
  installments?: number;
}

export interface PointOrderPayment {
  status?: string;
  status_detail?: string;
  paid_amount?: string;
  payment_method?: PointPaymentMethod;
}

export interface PointOrder {
  id: string;
  type: string;
  status: PointOrderStatus;
  status_detail?: string;
  external_reference?: string;
  transactions?: { payments?: PointOrderPayment[] };
}

export interface PointTerminal {
  id: string;
  pos_id?: number;
  store_id?: string;
  external_pos_id?: string;
  operating_mode?: string;
}
