import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SEGMENT_CHART_COLOR, SEGMENT_LABEL, type LeadSegment } from "@/lib/crm";

const SEGMENT_ORDER: LeadSegment[] = ["vip", "fiel", "recorrente", "novo", "risco", "perdido"];

/**
 * Barra horizontal com a distribuição de clientes por segmento — usada tanto no CRM quanto nos
 * relatórios, sempre com a mesma cor por segmento (SEGMENT_CHART_COLOR), pra identidade nunca
 * mudar de uma tela pra outra.
 */
export function SegmentDistributionChart({ counts }: { counts: Record<string, number> }) {
  const data = SEGMENT_ORDER.filter((id) => (counts[id] ?? 0) > 0).map((id) => ({
    id,
    label: SEGMENT_LABEL[id],
    count: counts[id] ?? 0,
  }));

  if (data.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Sem clientes classificados ainda.</p>;
  }

  return (
    <div className="mt-3" style={{ height: Math.max(data.length * 34, 100) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: -10, right: 16 }}>
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
            formatter={(value: number) => [value, "clientes"]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
            {data.map((row) => (
              <Cell key={row.id} fill={SEGMENT_CHART_COLOR[row.id]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
