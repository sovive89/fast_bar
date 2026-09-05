import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { brl, formatPhone, hhmm } from "@/lib/format";
import { getCustomerDetail, updateCustomerNotes } from "@/lib/customers.functions";
import { SEGMENT_HINT, SEGMENT_LABEL, SEGMENT_STYLE, type LeadSegment } from "@/lib/crm";
import type { SessionStatus } from "@/types/fastbar";

export const Route = createFileRoute("/caixa/crm/clientes_/$customerId")({
  head: () => ({
    meta: [{ title: "Cliente | Pop9Bar" }],
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
  // Coletados na segunda tela, depois de abrir a comanda — todos opcionais, ninguém é obrigado
  // a preencher além do consentimento de marketing.
  full_name: string | null;
  birthday_day: number | null;
  birthday_month: number | null;
  administrative_region: string | null;
  how_found_out: string | null;
  age_range: string | null;
  profession: string | null;
  favorite_music_genre: string | null;
  marketing_opt_in: boolean;
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

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  pix: "Pix",
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
  const [favoriteCategory, setFavoriteCategory] = useState<string | null>(null);
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<string | null>(null);
  const [peakHour, setPeakHour] = useState<number | null>(null);
  const [avgDaysBetweenVisits, setAvgDaysBetweenVisits] = useState<number | null>(null);
  const [revenueShare, setRevenueShare] = useState(0);
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
        setFavoriteCategory(result.favoriteCategory);
        setPreferredPaymentMethod(result.preferredPaymentMethod);
        setPeakHour(result.peakHour);
        setAvgDaysBetweenVisits(result.avgDaysBetweenVisits);
        setRevenueShare(result.revenueShare);
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
        <Link to="/caixa/crm/clientes" className="mt-4 inline-block text-sm text-primary underline">
          Voltar aos clientes
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <Link
        to="/caixa/crm/clientes"
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

      {/* Perfil de consumo: o que dá pra saber sobre o hábito dele além de quanto gastou —
          útil na hora de decidir uma promoção ou puxar assunto no balcão. */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Perfil de consumo</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Categoria favorita</p>
            <p className="mt-0.5 font-semibold">{favoriteCategory ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pagamento preferido</p>
            <p className="mt-0.5 font-semibold">
              {preferredPaymentMethod ? (PAYMENT_LABEL[preferredPaymentMethod] ?? preferredPaymentMethod) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Horário que mais vem</p>
            <p className="mt-0.5 font-semibold">
              {peakHour !== null ? `${String(peakHour).padStart(2, "0")}h` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Frequência</p>
            <p className="mt-0.5 font-semibold">
              {avgDaysBetweenVisits !== null
                ? `a cada ${Math.round(avgDaysBetweenVisits)} dias`
                : "só uma visita"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fatia do faturamento</p>
            <p className="mt-0.5 font-semibold">{(revenueShare * 100).toFixed(1)}% do total</p>
          </div>
        </div>
      </div>

      {/* Dados de marketing: coletados na segunda tela depois de abrir a comanda, todos
          opcionais — só aparece o que a pessoa realmente preencheu. */}
      {(customer.full_name ||
        customer.birthday_day ||
        customer.administrative_region ||
        customer.how_found_out ||
        customer.age_range ||
        customer.profession ||
        customer.favorite_music_genre) && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Dados de cadastro</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {customer.full_name && (
              <div>
                <p className="text-xs text-muted-foreground">Nome completo</p>
                <p className="mt-0.5 font-semibold">{customer.full_name}</p>
              </div>
            )}
            {customer.birthday_day && customer.birthday_month && (
              <div>
                <p className="text-xs text-muted-foreground">Aniversário</p>
                <p className="mt-0.5 font-semibold">
                  {String(customer.birthday_day).padStart(2, "0")}/
                  {String(customer.birthday_month).padStart(2, "0")}
                </p>
              </div>
            )}
            {customer.administrative_region && (
              <div>
                <p className="text-xs text-muted-foreground">Bairro / RA</p>
                <p className="mt-0.5 font-semibold">{customer.administrative_region}</p>
              </div>
            )}
            {customer.how_found_out && (
              <div>
                <p className="text-xs text-muted-foreground">Como conheceu</p>
                <p className="mt-0.5 font-semibold">{customer.how_found_out}</p>
              </div>
            )}
            {customer.age_range && (
              <div>
                <p className="text-xs text-muted-foreground">Faixa etária</p>
                <p className="mt-0.5 font-semibold">{customer.age_range}</p>
              </div>
            )}
            {customer.profession && (
              <div>
                <p className="text-xs text-muted-foreground">Profissão</p>
                <p className="mt-0.5 font-semibold">{customer.profession}</p>
              </div>
            )}
            {customer.favorite_music_genre && (
              <div>
                <p className="text-xs text-muted-foreground">Gênero musical</p>
                <p className="mt-0.5 font-semibold">{customer.favorite_music_genre}</p>
              </div>
            )}
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            {customer.marketing_opt_in
              ? "✓ Aceita receber promoções por WhatsApp/Instagram"
              : "✗ Não aceita receber promoções"}
          </p>
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
