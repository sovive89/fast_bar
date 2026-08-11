import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { brl } from "@/lib/format";
import { getReportsOverview } from "@/lib/reports.functions";

export const Route = createFileRoute("/caixa/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios | FastBar" },
      {
        name: "description",
        content: "Faturamento, ticket médio, produtos mais vendidos e formas de pagamento.",
      },
    ],
  }),
  component: Reports,
});

type Overview = {
  totalRevenue: number;
  paidSessionsCount: number;
  averageTicket: number;
  revenueByDay: { date: string; revenue: number }[];
  revenueByMethod: { method: string; revenue: number }[];
  revenueByCategory: { category: string; revenue: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
};

const PERIODS = [
  { id: "today", label: "Hoje", days: 1 },
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "30 dias", days: 30 },
] as const;

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  pix: "Pix",
};

function formatDayLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function rangeFor(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function Reports() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("7d");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useServerFn(getReportsOverview);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const days = PERIODS.find((p) => p.id === period)?.days ?? 7;
      const result = await load({ data: rangeFor(days) });
      if (!cancelled) {
        setOverview(result as Overview);
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [period, load]);

  const chartData = useMemo(
    () =>
      (overview?.revenueByDay ?? []).map((row) => ({
        ...row,
        label: formatDayLabel(row.date),
      })),
    [overview],
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Relatórios
        </p>
        <h1 className="mt-1 text-3xl font-bold">Faturamento</h1>
      </div>

      <div className="mt-5 flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              period === p.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading || !overview ? (
        <p className="mt-6 text-sm text-muted-foreground">Carregando relatório...</p>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Faturamento</p>
              <p className="mt-1 text-lg font-bold">{brl(overview.totalRevenue)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Comandas pagas</p>
              <p className="mt-1 text-lg font-bold">{overview.paidSessionsCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Ticket médio</p>
              <p className="mt-1 text-lg font-bold">{brl(overview.averageTicket)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">Faturamento por dia</p>
            {chartData.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma comanda paga nesse período.
              </p>
            ) : (
              <div className="mt-3 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                    <Tooltip
                      formatter={(value: number) => brl(value)}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">Produtos mais vendidos</p>
            {overview.topProducts.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Sem vendas nesse período.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {overview.topProducts.map((product) => (
                  <li key={product.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">
                      {product.name}{" "}
                      <span className="text-muted-foreground">· {product.quantity}x</span>
                    </span>
                    <span className="shrink-0 font-semibold">{brl(product.revenue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Por categoria</p>
              {overview.revenueByCategory.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {overview.revenueByCategory.map((row) => (
                    <li key={row.category} className="flex items-center justify-between text-sm">
                      <span className="truncate">{row.category}</span>
                      <span className="shrink-0 font-semibold">{brl(row.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Por pagamento</p>
              {overview.revenueByMethod.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {overview.revenueByMethod.map((row) => (
                    <li key={row.method} className="flex items-center justify-between text-sm">
                      <span className="truncate">{PAYMENT_LABEL[row.method] ?? row.method}</span>
                      <span className="shrink-0 font-semibold">{brl(row.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
