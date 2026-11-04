/**
 * Livro de pagamentos da comanda e pagamento parcial (item 3 do roadmap, P2 do CLAUDE.md:
 * "Pagamento parcial não é desconto: deve levar o saldo para pendência de pagamento/inadimplência.
 * Reabrir exige permissão e não pode apagar a dívida").
 *
 * Regras que este módulo garante:
 *
 * - O saldo nunca é um número guardado: é sempre o total dos itens (com desconto e taxa) menos a
 *   soma de fastbar_session_payments. Mudar itens, taxa ou reabrir a comanda não pode "apagar" o
 *   que já foi recebido nem o que ainda falta.
 * - Receber menos do que o saldo é possível, mas exige autorização (senha) e um motivo, e o que
 *   faltou vira dívida: a comanda vai para 'inadimplente'. Não existe caminho aqui que perdoe a
 *   diferença — perdoar é cortesia, e passa pelo fechamento da operação.
 * - Não aceita receber mais do que o saldo (troco é problema do balcão, não do livro).
 */

export type PaymentMethod = "dinheiro" | "cartao" | "pix" | "maquininha";

/** Arredonda em centavos: somar preços * quantidades em ponto flutuante deixa resíduo (0.1 + 0.2),
 * e um saldo de 0.0000001 não pode manter uma comanda "devendo". */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface SessionBalance {
  total: number;
  paid: number;
  balance: number;
}

/** Total, recebido e saldo de uma comanda. Recebe as linhas já lidas para poder ser usado em lote. */
export function computeBalance(
  items: { unit_price: number; quantity: number }[],
  discountPercent: number | null | undefined,
  serviceFeePercent: number | null | undefined,
  payments: { amount: number }[],
  tabTotals: (
    items: { unit_price: number; quantity: number }[],
    discount?: number,
    fee?: number,
  ) => { total: number },
): SessionBalance {
  const total = round2(tabTotals(items, discountPercent ?? 0, serviceFeePercent ?? 0).total);
  const paid = round2(payments.reduce((sum, payment) => sum + Number(payment.amount), 0));
  return { total, paid, balance: Math.max(0, round2(total - paid)) };
}

export async function loadSessionBalance(sessionId: string): Promise<{
  session: {
    id: string;
    status: string;
    closed_at: string | null;
    operacao_id: string | null;
    discount_percent: number | null;
    service_fee_percent: number | null;
  };
  payments: {
    id: string;
    amount: number;
    method: string;
    motivo: string | null;
    saldo_apos: number;
    created_at: string;
  }[];
  balance: SessionBalance;
} | null> {
  const { admin } = await import("./fastbar.server");
  const { tabTotals } = await import("@/services/supabase/tabItems");

  const { data: session } = await admin()
    .from("fastbar_sessions")
    .select("id, status, closed_at, operacao_id, discount_percent, service_fee_percent")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;

  const [{ data: items }, { data: payments }] = await Promise.all([
    admin().from("fastbar_tab_items").select("unit_price, quantity").eq("session_id", sessionId),
    admin()
      .from("fastbar_session_payments")
      .select("id, amount, method, motivo, saldo_apos, created_at")
      .eq("session_id", sessionId)
      .order("created_at"),
  ]);

  const rows = (payments ?? []).map((payment) => ({ ...payment, amount: Number(payment.amount) }));
  return {
    session,
    payments: rows,
    balance: computeBalance(
      items ?? [],
      session.discount_percent,
      session.service_fee_percent,
      rows,
      tabTotals,
    ),
  };
}

export type RecordPaymentResult =
  { ok: true; settled: boolean; balanceAfter: number } | { ok: false; message: string };

/**
 * Registra um recebimento. `amount` omitido = quitar o saldo inteiro (o caminho de sempre).
 * `authorize` só é chamada quando o recebimento é parcial: devolve true se a senha da equipe
 * conferiu — assim o caminho normal não pede senha e o parcial nunca passa sem ela.
 */
export async function recordSessionPayment(params: {
  sessionId: string;
  method: PaymentMethod;
  amount?: number | undefined;
  motivo?: string | undefined;
  realizadoPor: string;
  authorize: () => Promise<boolean>;
}): Promise<RecordPaymentResult> {
  const { admin, registerCustomerSpend } = await import("./fastbar.server");

  const loaded = await loadSessionBalance(params.sessionId);
  if (!loaded) return { ok: false, message: "Comanda inválida." };
  const { session, balance } = loaded;

  if (session.status === "cancelled") {
    return { ok: false, message: "Comanda cancelada não pode receber pagamento." };
  }
  if (!["open", "closed", "inadimplente"].includes(session.status)) {
    return {
      ok: false,
      message:
        session.status === "paid" ? "Comanda já está paga." : "Comanda inválida para pagamento.",
    };
  }

  const nowIso = new Date().toISOString();

  // Nada a receber (comanda sem itens, ou reaberta sem consumo novo depois de já quitada):
  // só fecha. Mantém o comportamento antigo de poder encerrar uma comanda de valor zero.
  if (balance.balance <= 0) {
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({
        status: "paid",
        closed_at: session.closed_at ?? nowIso,
        paid_at: nowIso,
        payment_method: params.method,
      })
      .eq("id", session.id)
      .neq("status", "cancelled");
    if (error) return { ok: false, message: "Não foi possível registrar o pagamento." };
    await registerCustomerSpend(session.id);
    return { ok: true, settled: true, balanceAfter: 0 };
  }

  const amount = params.amount === undefined ? balance.balance : round2(Number(params.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Informe um valor maior que zero." };
  }
  if (amount > balance.balance) {
    return { ok: false, message: "O valor é maior que o saldo da comanda." };
  }

  const balanceAfter = round2(balance.balance - amount);
  const partial = balanceAfter > 0;
  const motivo = params.motivo?.trim() ?? "";

  if (partial) {
    if (motivo.length < 5) {
      return { ok: false, message: "Pagamento parcial exige o motivo (mínimo 5 letras)." };
    }
    if (!(await params.authorize())) return { ok: false, message: "Senha incorreta." };
  }

  const { error: insertError } = await admin()
    .from("fastbar_session_payments")
    .insert({
      session_id: session.id,
      operacao_id: session.operacao_id,
      amount,
      method: params.method,
      saldo_apos: balanceAfter,
      motivo: partial ? motivo : null,
      realizado_por: params.realizadoPor,
    });
  if (insertError) return { ok: false, message: "Não foi possível registrar o pagamento." };

  // O recebimento já está no livro; agora o status da comanda acompanha. Se este UPDATE falhar, o
  // dinheiro continua registrado (nada se perde) e a equipe vê o erro e pode tentar de novo — o
  // saldo recalculado não deixa receber duas vezes o mesmo valor.
  const { data: updated, error } = await admin()
    .from("fastbar_sessions")
    .update(
      partial
        ? { status: "inadimplente", closed_at: session.closed_at ?? nowIso, paid_at: null }
        : {
            status: "paid",
            closed_at: session.closed_at ?? nowIso,
            paid_at: nowIso,
            payment_method: params.method,
          },
    )
    .eq("id", session.id)
    .neq("status", "cancelled")
    .select("id");
  if (error || !updated || updated.length === 0) {
    return {
      ok: false,
      message:
        "O valor foi registrado, mas a comanda não mudou de status. Abra a comanda e confira.",
    };
  }

  if (!partial) await registerCustomerSpend(session.id);
  return { ok: true, settled: !partial, balanceAfter };
}
