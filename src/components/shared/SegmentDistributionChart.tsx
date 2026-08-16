import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SEGMENT_CHART_COLOR, SEGMENT_LABEL, type LeadSegment } from "@/lib/crm";

const SEGMENT_ORDER: LeadSegment[] = ["vip", "fiel", "recorrente", "novo", "risco", "perdido"];

/**
 * Barra horizontal por segmento — usada pra contagem de clientes (CRM) e faturamento (Relatórios),
 * sempre com a mesma cor por segmento (SEGMENT_CHART_COLOR), pra identidade nunca mudar de uma
 * tela pra outra. Um valor só, não dois eixos: contagem e R$ nunca aparecem no mesmo gráfico.
 *
 * Valor escrito direto na ponta da barra (LabelList), não só na tooltip — a equipe usa isso no
 * celular no balcão, e tooltip de hover não existe em touch. Sem o número visível, uma única barra
 * cheia (ex.: base toda "Novo") parece um placeholder quebrado, não um gráfico com dado.
 */
export function SegmentDistributionChart({
  values,
  formatValue = (n) => String(n),
  tooltipSuffix = "",
  emptyLabel = "Sem dados ainda.",
}: {
  values: Record<string, number>;
  formatValue?: (value: number) => string;
  tooltipSuffix?: string;
  emptyLabel?: string;
}) {
  const data = SEGMENT_ORDER.filter((id) => (values[id] ?? 0) > 0).map((id) => ({
    id,
    label: SEGMENT_LABEL[id],
    value: values[id] ?? 0,
  }));

  if (data.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="mt-3" style={{ height: data.length * 44 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, bottom: 4, left: -10, right: 40 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={90}
          />
          <Tooltip
            formatter={(value: number) => [`${formatValue(value)}${tooltipSuffix}`, ""]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
            {data.map((row) => (
              <Cell key={row.id} fill={SEGMENT_CHART_COLOR[row.id]} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(value: number) => `${formatValue(value)}${tooltipSuffix}`}
              style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
