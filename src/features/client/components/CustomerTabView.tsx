import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TabItemList } from "@/components/shared/TabItemList";
import { MenuList } from "@/features/client/components/MenuList";
import { brl, elapsed, formatPhone, hhmm } from "@/lib/format";
import { tabTotal, tabTotalWithDiscount } from "@/services/supabase/tabItems";
import { BrandingProvider, useBranding, type TenantBranding } from "@/lib/branding";
import type { BarSession, BarTabItem, BillRequestState } from "@/types/fastbar";

export interface CustomerTabViewProps {
  loading: boolean;
  /** Primeiro carregamento falhou (rede/servidor) — diferente de "comanda não existe". */
  loadFailed?: boolean;
  session: BarSession | null;
  items: BarTabItem[];
  now: string | number | Date;
  /** Pedido de conta ativo desta comanda (só o estado), se houver. */
  billRequest?: BillRequestState | null;
  /** Pede a conta. Só avisa a equipe — não fecha a comanda. Ausente = sem o botão. */
  onRequestBill?: () => Promise<{ ok: boolean; message?: string }>;
}

/** Cabeçalho de marca das telas do cliente — mostra a identidade do estabelecimento (logo/nome
 * configurados em Conexões), nunca a marca do software. */
function BrandHeader({ branding }: { branding: TenantBranding }) {
  if (branding.logoUrl) {
    return (
      <div className="mb-1 flex items-center gap-2">
        <img
          src={branding.logoUrl}
          alt={branding.brandName}
          className="h-6 w-6 rounded-lg object-cover"
        />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {branding.brandName}
        </p>
      </div>
    );
  }
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
      {branding.brandName}
    </p>
  );
}

export function CustomerTabView(props: CustomerTabViewProps) {
  return (
    <BrandingProvider>
      <CustomerTabViewContent {...props} />
    </BrandingProvider>
  );
}

function CustomerTabViewContent({
  loading,
  loadFailed,
  session,
  items,
  now,
  billRequest,
  onRequestBill,
}: CustomerTabViewProps) {
  const { branding, style } = useBranding();
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function askForBill() {
    if (!onRequestBill || requesting) return;
    setRequesting(true);
    setRequestError(null);
    const result = await onRequestBill();
    if (!result.ok) setRequestError(result.message ?? "Não foi possível avisar a equipe.");
    setRequesting(false);
  }

  if (loadFailed && !session) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Não foi possível carregar a comanda agora. Vamos tentar de novo em instantes.
      </p>
    );
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando comanda...</p>;
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-bold">Comanda não encontrada</h1>
        <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
          Abrir uma nova comanda
        </Link>
      </main>
    );
  }

  if (session.status === "unverified") {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-bold">Confirme seu celular</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Falta confirmar o código enviado por SMS pra ver sua comanda.
        </p>
        <Link
          to="/c/$sessionId/verificar"
          params={{ sessionId: session.id }}
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Continuar verificação
        </Link>
      </main>
    );
  }

  if (session.status === "pending") {
    return (
      <main
        className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10"
        style={style}
      >
        <BrandHeader branding={branding} />
        <h1 className="mt-2 text-3xl font-bold">Quase lá, {session.customer_name.split(" ")[0]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Mostre essa tela para a equipe no caixa confirmar sua comanda. É rapidinho.
        </p>
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Aguardando confirmação da equipe...
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8" style={style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <BrandHeader branding={branding} />
          <h1 className="mt-1 truncate text-2xl font-bold">{session.customer_name}</h1>
          <p className="text-xs text-muted-foreground">{formatPhone(session.phone ?? "")}</p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Total consumido</p>
        {session.discount_percent ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground line-through">
              {brl(tabTotal(items))}
            </p>
            <p className="text-4xl font-bold">
              {brl(tabTotalWithDiscount(items, session.discount_percent))}
            </p>
            <p className="mt-1 text-xs font-medium text-success">
              {session.discount_percent}% de desconto de boas-vindas aplicado
            </p>
          </>
        ) : (
          <p className="mt-1 text-4xl font-bold">{brl(tabTotal(items))}</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Abertura</p>
            <p className="font-medium">{session.started_at ? hhmm(session.started_at) : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tempo no bar</p>
            <p className="font-medium">
              {elapsed(
                session.started_at,
                session.closed_at ?? session.paid_at,
                new Date(now).getTime(),
              )}
            </p>
          </div>
        </div>
      </div>

      {session.status === "open" && onRequestBill && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          {billRequest ? (
            <div role="status">
              <p className="text-sm font-semibold">
                {billRequest.status === "em_atendimento"
                  ? "A equipe já está vindo com a sua conta"
                  : "Pronto! A equipe foi avisada"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Você ainda pode pedir mais alguma coisa até a conta ser fechada.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void askForBill()}
                disabled={requesting}
                className="h-12 w-full rounded-xl border border-primary text-base font-semibold text-primary disabled:opacity-60"
              >
                {requesting ? "Avisando a equipe..." : "Pedir a conta"}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                Só avisa a equipe, que traz a conta até você. Dá pra continuar pedindo.
              </p>
              {requestError && <p className="mt-2 text-xs text-destructive">{requestError}</p>}
            </>
          )}
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold">Consumo</h2>
      <div className="mt-3">
        <TabItemList items={items} />
      </div>

      <MenuList />

      <p className="mt-6 text-xs text-muted-foreground">
        Os itens são lançados pelo caixa. O fechamento e o pagamento também são feitos no caixa.
      </p>
    </main>
  );
}

export default CustomerTabView;
