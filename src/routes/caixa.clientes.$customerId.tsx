import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { brl, formatPhone, hhmm } from "@/lib/format";
import { getCustomerDetail, updateCustomerNotes } from "@/lib/customers.functions";
import { SEGMENT_HINT, SEGMENT_LABEL, SEGMENT_STYLE, type LeadSegment } from "@/lib/crm";
import type { SessionStatus } from "@/types/fastbar";

export const Route = createFileRoute("/caixa/clientes/$customerId")({
  head: () => ({
    meta: [{ title: "Cliente | FastBar" }],
  }),
  component: CustomerDetail,
});

type Customer = {
  id: string;
  name: string;
  phone: string;
  total_visits: number;
  total_spent: number;
  first_seen_at: string;
  last_seen_at: string;
  notes: string | null;
};

type Visit = {
  id: string;
  status: SessionStatus;
  started_at: string | null;
  closed_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  total: number;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function CustomerDetail() {
  const { customerId } = Route.useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [favorites, setFavorites] = useState<
    Array<{ name: string; quantity: number; revenue: number }>
  >([]);
  const [segment, setSegment] = useState<LeadSegment | null>(null);
  const [averageTicket, setAverageTicket] = useState(0);
  const [idleDays, setIdleDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useServerFn(getCustomerDetail);
  const save = useServerFn(updateCustomerNotes);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const result = await load({ data: { customerId } });
      if (!cancelled) {
        setCustomer(result.customer as Customer | null);
        setVisits(result.visits as Visit[]);
        setFavorites(result.favorites);
        setSegment(result.segment as LeadSegment | null);
        setAverageTicket(result.averageTicket);
        setIdleDays(result.idleDays);
        setNotes((result.customer as Customer | null)?.notes ?? "");
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [customerId, load]);

  async function saveNotes() {
    setSaving(true);
    setSaved(false);
    const result = await save({ data: { customerId, notes } });
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando cliente...</p>;
  }

  if (!customer) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Cliente não encontrado</h1>
        <Link to="/caixa/clientes" className="mt-4 inline-block text-sm text-primary underline">
          Voltar aos clientes
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link
        to="/caixa/clientes"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Voltar aos clientes
      </Link>

      <div className="mt-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          {segment && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${SEGMENT_STYLE[segment]}`}
            >
              {SEGMENT_LABEL[segment]}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{formatPhone(customer.phone)}</p>
        {segment && <p className="mt-1 text-xs text-muted-foreground">{SEGMENT_HINT[segment]}</p>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total gasto</p>
          <p className="mt-1 text-lg font-bold">{brl(customer.total_spent)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Visitas</p>
          <p className="mt-1 text-lg font-bold">{customer.total_visits}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Ticket médio</p>
          <p className="mt-1 text-lg font-bold">{brl(averageTicket)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Última visita</p>
          <p className="mt-1 text-sm font-semibold">{formatDate(customer.last_seen_at)}</p>
          {idleDays > 0 && (
            <p className="text-xs text-muted-foreground">{idleDays} dias atrás</p>
          )}
        </div>
      </div>

      {favorites.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">O que ele mais consome</p>
          <ul className="mt-3 space-y-2">
            {favorites.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {item.name} <span className="text-muted-foreground">· {item.quantity}x</span>
                </span>
                <span className="shrink-0 font-semibold">{brl(item.revenue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Anotações</p>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Preferências, alergias, observações da equipe..."
          rows={3}
          className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={saveNotes}
            disabled={saving}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar nota"}
          </button>
          {saved && <span className="text-xs text-success">Salvo.</span>}
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Histórico de visitas</h2>
      {visits.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nenhuma visita registrada ainda.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {visits.map((visit) => (
            <li
              key={visit.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {visit.started_at ? `${formatDate(visit.started_at)} · ${hhmm(visit.started_at)}` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {visit.payment_method === "dinheiro"
                    ? "Dinheiro"
                    : visit.payment_method === "cartao"
                      ? "Cartão"
                      : visit.payment_method === "pix"
                        ? "Pix"
                        : "—"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="font-bold">{brl(visit.total)}</p>
                <StatusBadge status={visit.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
