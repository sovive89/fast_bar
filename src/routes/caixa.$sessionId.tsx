import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TabItemList } from "@/components/shared/TabItemList";
import { ProductPicker } from "@/features/register/components/ProductPicker";
import { useLiveTab } from "@/hooks/use-live-tab";
import { brl, elapsed, formatIdentifier, hhmm } from "@/lib/format";
import { getMachinePaymentStatus } from "@/lib/integrations.functions";
import {
  addTabItem,
  cancelMachineCharge,
  checkMachineChargeStatus,
  closeSession,
  confirmSession,
  refundMachineCharge,
  registerPayment,
  removeTabItem,
  reopenSession,
  startMachineCharge,
  type PaymentMethod,
} from "@/lib/register.functions";
import { fetchProducts } from "@/services/supabase/products";
import { tabTotal, tabTotalWithDiscount } from "@/services/supabase/tabItems";
import type { BarProduct } from "@/types/fastbar";

export const Route = createFileRoute("/caixa/$sessionId")({
  head: () => ({
    meta: [
      { title: "Detalhe da comanda | Caixa Pop9Bar" },
      {
        name: "description",
        content: "Lance bebidas, feche a comanda e registre o pagamento do cliente.",
      },
      { property: "og:title", content: "Detalhe da comanda | Caixa Pop9Bar" },
      {
        property: "og:description",
        content: "Lançamento de bebidas, fechamento e pagamento da comanda.",
      },
    ],
  }),
  component: RegisterTabDetail,
});

function RegisterTabDetail() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const { session, items, loading, now, reload } = useLiveTab(sessionId, "register");
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("dinheiro");
  const [paymentMode, setPaymentMode] = useState<"manual" | "maquina">("manual");
  const [machineConfigured, setMachineConfigured] = useState(false);

  const add = useServerFn(addTabItem);
  const remove = useServerFn(removeTabItem);
  const close = useServerFn(closeSession);
  const pay = useServerFn(registerPayment);
  const reopen = useServerFn(reopenSession);
  const confirm = useServerFn(confirmSession);
  const startCharge = useServerFn(startMachineCharge);
  const cancelCharge = useServerFn(cancelMachineCharge);
  const checkCharge = useServerFn(checkMachineChargeStatus);
  const refundCharge = useServerFn(refundMachineCharge);
  const machineStatus = useServerFn(getMachinePaymentStatus);

  useEffect(() => {
    void fetchProducts().then(setProducts);
    // Sem isso, um produto criado depois que essa comanda já estava aberta na tela nunca
    // aparecia pra lançar — a lista só carregava uma vez, no primeiro acesso à página.
    const poll = setInterval(() => void fetchProducts().then(setProducts), 15000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    void machineStatus().then((res) => {
      setMachineConfigured(res.configured);
      if (res.configured) setPaymentMode("maquina");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cobrança na maquininha é assíncrona: quem confirma o pagamento é o webhook (ou "Verificar
  // agora"), não este clique. Detecta quando uma cobrança que estava em andamento (pos_order_id
  // preenchido) terminou aprovada (status virou "paid") pra sair da tela sozinho, do mesmo jeito
  // que o pagamento manual já fazia.
  const wasWaitingForMachineRef = useRef(false);
  useEffect(() => {
    const waitingNow = Boolean(session?.pos_order_id);
    if (wasWaitingForMachineRef.current && !waitingNow && session?.status === "paid") {
      void navigate({ to: "/caixa" });
    }
    wasWaitingForMachineRef.current = waitingNow;
  }, [session?.pos_order_id, session?.status, navigate]);

  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.ok) setError(result.message ?? "Ação não concluída.");
    await reload();
    setBusy(false);
    return result.ok;
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando comanda...</p>;
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Comanda não encontrada</h1>
        <Link to="/caixa" className="mt-4 inline-block text-sm text-primary underline">
          Voltar às comandas
        </Link>
      </main>
    );
  }

  const isOpen = session.status === "open";
  const isPending = session.status === "pending";
  const totalValue = session.discount_percent
    ? tabTotalWithDiscount(items, session.discount_percent)
    : tabTotal(items);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link to="/caixa" className="text-sm text-muted-foreground underline underline-offset-4">
        ← Voltar às comandas
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{session.customer_name}</h1>
          <p className="text-xs text-muted-foreground">
            {formatIdentifier(session.phone, session.document, session.document_type)}
            {session.started_at ? ` · abertura ${hhmm(session.started_at)}` : ""} ·{" "}
            {elapsed(session.started_at, session.closed_at ?? session.paid_at, now)}
          </p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Total da comanda</p>
        {session.discount_percent ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground line-through">{brl(tabTotal(items))}</p>
            <p className="text-3xl font-bold">
              {brl(tabTotalWithDiscount(items, session.discount_percent))}
            </p>
            <p className="mt-1 text-xs font-medium text-success">
              {session.discount_percent}% de desconto de boas-vindas (cliente novo, cadastro completo)
            </p>
          </>
        ) : (
          <p className="mt-1 text-3xl font-bold">{brl(tabTotal(items))}</p>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {isOpen && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Lançamentos</h2>
          <div className="mt-3">
            <ProductPicker
              products={products}
              disabled={busy}
              onPick={(product) =>
                void run(() => add({ data: { sessionId: session.id, productId: product.id } }))
              }
            />
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Itens da comanda</h2>
        <div className="mt-3">
          <TabItemList
            items={items}
            {...(isOpen
              ? {
                  onRemove: async (itemId: string, password: string) => {
                    const result = await remove({ data: { itemId, password } });
                    if (result.ok) await reload();
                    return result;
                  },
                }
              : {})}
          />
        </div>
      </section>

      <section className="mt-8 space-y-3">
        {isPending && (
          <button
            onClick={() => void run(() => confirm({ data: { sessionId: session.id } }))}
            disabled={busy}
            className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
          >
            {busy ? "Confirmando..." : "Confirmar comanda"}
          </button>
        )}

        {isOpen && (
          <button
            onClick={() => {
              if (!window.confirm("Fechar essa comanda? Ela para de receber novos lançamentos."))
                return;
              void run(() => close({ data: { sessionId: session.id } }));
            }}
            disabled={busy}
            className="h-12 w-full rounded-xl border border-border text-base font-semibold disabled:opacity-60"
          >
            Fechar comanda
          </button>
        )}

        {!isPending && session.status !== "paid" && (
          <>
            {session.pos_order_id ? (
              <div className="space-y-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  Aguardando pagamento na maquininha...
                </div>
                <p className="text-xs text-muted-foreground">
                  Valor enviado: {brl(session.pos_amount ?? 0)}. A comanda fecha sozinha assim que
                  o pagamento for aprovado no terminal.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void run(() => checkCharge({ data: { sessionId: session.id } }))}
                    disabled={busy}
                    className="h-10 flex-1 rounded-xl border border-border text-sm font-medium disabled:opacity-60"
                  >
                    Verificar agora
                  </button>
                  <button
                    onClick={() => void run(() => cancelCharge({ data: { sessionId: session.id } }))}
                    disabled={busy}
                    className="h-10 flex-1 rounded-xl border border-destructive/40 text-sm font-medium text-destructive disabled:opacity-60"
                  >
                    Cancelar cobrança
                  </button>
                </div>
              </div>
            ) : (
              <>
                {machineConfigured && (
                  <div className="flex gap-1 rounded-xl border border-border p-1 text-xs font-medium">
                    <button
                      onClick={() => setPaymentMode("manual")}
                      className={`h-8 flex-1 rounded-lg ${
                        paymentMode === "manual"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      Manual
                    </button>
                    <button
                      onClick={() => setPaymentMode("maquina")}
                      className={`h-8 flex-1 rounded-lg ${
                        paymentMode === "maquina"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      Maquininha
                    </button>
                  </div>
                )}

                {paymentMode === "maquina" && machineConfigured ? (
                  <button
                    onClick={() => void run(() => startCharge({ data: { sessionId: session.id } }))}
                    disabled={busy}
                    className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
                  >
                    {busy ? "Enviando pra maquininha..." : `Cobrar ${brl(totalValue)} na maquininha`}
                  </button>
                ) : (
                  <>
                    <div className="flex gap-2">
                      {(
                        [
                          ["dinheiro", "Dinheiro"],
                          ["cartao", "Cartão"],
                          ["pix", "Pix"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setPaymentMethod(value)}
                          disabled={busy}
                          className={`h-10 flex-1 rounded-xl text-sm font-medium disabled:opacity-60 ${
                            paymentMethod === value
                              ? "bg-primary text-primary-foreground"
                              : "border border-border text-muted-foreground"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await run(() =>
                          pay({ data: { sessionId: session.id, method: paymentMethod } }),
                        );
                        if (ok) await navigate({ to: "/caixa" });
                      }}
                      disabled={busy}
                      className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
                    >
                      Registrar pagamento
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}

        {!isPending && !isOpen && session.status !== "paid" && (
          <button
            onClick={() => void run(() => reopen({ data: { sessionId: session.id } }))}
            disabled={busy}
            className="h-12 w-full rounded-xl border border-border text-sm font-medium text-muted-foreground disabled:opacity-60"
          >
            Reabrir comanda
          </button>
        )}

        {session.status === "paid" && session.pos_paid_order_id && (
          <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
            {session.pos_refunded_at ? (
              <p className="text-xs font-medium text-muted-foreground">
                Pagamento estornado em {hhmm(session.pos_refunded_at)}.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Pago na maquininha. Cliente pediu o dinheiro de volta ou pagou errado? Dá pra
                  estornar direto no Mercado Pago (até 90 dias após o pagamento).
                </p>
                <button
                  onClick={() =>
                    void run(() => refundCharge({ data: { sessionId: session.id } }))
                  }
                  disabled={busy}
                  className="h-10 w-full rounded-xl border border-destructive/40 text-sm font-medium text-destructive disabled:opacity-60"
                >
                  Estornar pagamento
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
