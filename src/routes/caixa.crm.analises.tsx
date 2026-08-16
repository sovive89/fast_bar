import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRetentionCohorts } from "@/lib/customers.functions";

export const Route = createFileRoute("/caixa/crm/analises")({
  head: () => ({
    meta: [{ title: "Análises | CRM | FastBar" }],
  }),
  component: AnalisesTab,
});

type Cohort = {
  cohort: string;
  size: number;
  retained: Array<{ offset: number; percent: number; count: number }>;
};

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year!, month! - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

const currentMonthKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
}).format(new Date());

function monthsSince(cohort: string) {
  const [cy, cm] = cohort.split("-").map(Number);
  const [ny, nm] = currentMonthKey.split("-").map(Number);
  return (ny! - cy!) * 12 + (nm! - cm!);
}

/** Verde mais forte quanto maior a retenção — heatmap simples, sem depender de recharts. */
function cellStyle(percent: number, hasData: boolean) {
  if (!hasData) return { background: "transparent" };
  const alpha = Math.min(1, Math.max(0.06, percent / 100));
  return { background: `oklch(0.7 0.15 150 / ${alpha})` };
}

function AnalisesTab() {
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [depth, setDepth] = useState(6);
  const load = useServerFn(getRetentionCohorts);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await load();
      if (!cancelled) {
        setCohorts(result.cohorts as Cohort[]);
        setDepth(result.depth);
      }
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Retenção por coorte</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Cada linha é o grupo de clientes que chegou naquele mês. As colunas mostram quantos %
          desse grupo voltou a comprar 1, 2, 3... meses depois — diferente de "taxa de recompra",
          isso mostra se a retenção está melhorando ou piorando com o tempo, não só um número só.
        </p>

        {!cohorts ? (
          <p className="mt-4 text-sm text-muted-foreground">Carregando...</p>
        ) : cohorts.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Sem clientes suficientes ainda pra montar coortes.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-1.5 text-left font-medium text-muted-foreground">Coorte</th>
                  <th className="p-1.5 text-right font-medium text-muted-foreground">n</th>
                  {Array.from({ length: depth }, (_, i) => (
                    <th key={i} className="p-1.5 text-center font-medium text-muted-foreground">
                      +{i}m
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((row) => (
                  <tr key={row.cohort}>
                    <td className="whitespace-nowrap p-1.5 font-medium capitalize">
                      {monthLabel(row.cohort)}
                    </td>
                    <td className="p-1.5 text-right text-muted-foreground">{row.size}</td>
                    {row.retained.map((cell) => {
                      // Coorte de 2 meses atrás não tem como ter dado de +5 meses ainda — célula
                      // vazia (tempo não passou), não zero (ninguém voltou) — são coisas diferentes.
                      const hasData = cell.offset <= monthsSince(row.cohort);
                      return (
                        <td
                          key={cell.offset}
                          className="p-1.5 text-center font-medium"
                          style={cellStyle(cell.percent, hasData)}
                          title={hasData ? `${cell.count} de ${row.size} clientes` : "Ainda não deu tempo"}
                        >
                          {hasData ? `${cell.percent.toFixed(0)}%` : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
