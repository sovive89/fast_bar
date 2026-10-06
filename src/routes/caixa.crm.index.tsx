import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { brl } from "@/lib/format";
import { getCrmDashboard, getCustomersOverview } from "@/lib/customers.functions";
import type { LeadSegment } from "@/lib/crm";

// Ver comentário em caixa.crm.clientes.tsx: import estático desse componente em mais de uma rota
// gerou chunk circular no servidor numa versão anterior.
const SegmentDistributionChart = lazy(() =>
  import("@/components/shared/SegmentDistributionChart").then((m) => ({
    default: m.SegmentDistributionChart,
  })),
);

type Customer = {
  total_spent: number;
  total_visits: number;
  segment: LeadSegment;
};

export const Route = createFileRoute("/caixa/crm/")({
  head: () => ({
    meta: [{ title: "CRM | FastBar" }],
  }),
  component: CrmOverview,
});

/**
 * Página inicial do CRM: só os números agregados, sem a lista crua de clientes — essa fica na
 * aba Clientes. Deixa espaço livre pra Campanhas/Fidelidade entrarem aqui do lado dos números,
 * sem competir com uma lista de dezenas de cards.
 */
type Dashboard = {
  revenueBySegment: Record<string, number>;
  birthdaysThisMonth: { id: string; name: string; day: number }[];
  howFoundOutCounts: Record<string, number>;
  marketingOptInCount: number;
  totalCustomers: number;
};

const MONTH_NAME = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date());

function CrmOverview() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const load = useServerFn(getCustomersOverview);
  const loadDashboard = useServerFn(getCrmDashboard);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const [result, dashboardResult] = await Promise.all([load(), loadDashboard()]);
      if (!cancelled) {
        setCustomers(result.customers as Customer[]);
        setDashboard(dashboardResult as Dashboard);
      }
    }
    void run();
    const poll = setInterval(() => void run(), 20000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const map = new Map<LeadSegment, number>();
    for (const customer of customers) {
      map.set(customer.segment, (map.get(customer.segment) ?? 0) + 1);
    }
    return map;
  }, [customers]);

  const summary = useMemo(() => {
    const totalSpent = customers.reduce((sum, c) => sum + Number(c.total_spent), 0);
    const withVisits = customers.filter((c) => c.total_visits > 0);
    const returning = customers.filter((c) => c.total_visits >= 2).length;
    return {
      total: customers.length,
      ltv: withVisits.length > 0 ? totalSpent / withVisits.length : 0,
      returnRate: customers.length > 0 ? (returning / customers.length) * 100 : 0,
      atRisk: (counts.get("risco") ?? 0) + (counts.get("perdido") ?? 0),
    };
  }, [customers, counts]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Clientes</p>
          <p className="mt-1 text-lg font-bold">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Gasto médio</p>
          <p className="mt-1 text-lg font-bold">{brl(summary.ltv)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Recompra</p>
          <p className="mt-1 text-lg font-bold">{summary.returnRate.toFixed(0)}%</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className={`mt-1 text-lg font-bold ${summary.atRisk > 0 ? "text-amber-500" : ""}`}>
            {summary.atRisk}
          </p>
          <p className="text-xs text-muted-foreground">Sumidos</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Distribuição por segmento</p>
        <Suspense fallback={<div className="mt-3 h-24" />}>
          <SegmentDistributionChart
            values={Object.fromEntries(counts)}
            emptyLabel="Sem clientes classificados ainda."
          />
        </Suspense>
      </div>

      {/* Faturamento acumulado por segmento — total histórico (fastbar_customers.total_spent),
          diferente do gráfico por período em Relatórios. Responde "quem já trouxe mais dinheiro
          pra casa desde sempre", não "nesse mês". */}
      {dashboard && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Faturamento acumulado por segmento</p>
          <Suspense fallback={<div className="mt-3 h-24" />}>
            <SegmentDistributionChart
              values={dashboard.revenueBySegment}
              formatValue={brl}
              emptyLabel="Sem faturamento registrado ainda."
            />
          </Suspense>
        </div>
      )}

      {dashboard && dashboard.birthdaysThisMonth.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Aniversariantes de {MONTH_NAME}</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {dashboard.birthdaysThisMonth.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="shrink-0 text-muted-foreground">dia {c.day}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dashboard && Object.keys(dashboard.howFoundOutCounts).length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Como conheceu o bar</p>
          <ul className="mt-3 space-y-2">
            {Object.entries(dashboard.howFoundOutCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([source, count]) => {
                const max = Math.max(...Object.values(dashboard.howFoundOutCounts));
                return (
                  <li key={source}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{source}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {dashboard && dashboard.totalCustomers > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Aceitam receber promoções</p>
          <p className="mt-1 text-2xl font-bold">
            {((dashboard.marketingOptInCount / dashboard.totalCustomers) * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {dashboard.marketingOptInCount} de {dashboard.totalCustomers} clientes — quantos dá
            pra alcançar numa campanha de WhatsApp/Instagram
          </p>
        </div>
      )}

      <Link
        to="/caixa/crm/clientes"
        className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-sm font-medium transition-colors hover:border-ring"
      >
        Ver todos os clientes
        <span className="text-muted-foreground">→</span>
      </Link>
    </main>
  );
}
