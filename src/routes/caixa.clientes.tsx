import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { brl, digits, formatPhone } from "@/lib/format";
import { getCustomersOverview } from "@/lib/customers.functions";
import {
  SEGMENT_HINT,
  SEGMENT_LABEL,
  SEGMENT_STYLE,
  type LeadSegment,
} from "@/lib/crm";

type Customer = {
  id: string;
  name: string;
  phone: string;
  total_visits: number;
  total_spent: number;
  first_seen_at: string;
  last_seen_at: string;
  segment: LeadSegment;
  averageTicket: number;
  idleDays: number;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

/** Ordem de exibição dos filtros: primeiro quem sustenta a casa, depois quem precisa de resgate. */
const SEGMENT_ORDER: LeadSegment[] = ["vip", "fiel", "recorrente", "novo", "risco", "perdido"];

export const Route = createFileRoute("/caixa/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes (CRM) | FastBar" },
      {
        name: "description",
        content:
          "Clientes classificados por valor e recência: VIP, fiel, recorrente, novo, em risco e perdido.",
      },
    ],
  }),
  component: CustomersOverview,
});

function CustomersOverview() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<LeadSegment | "todos">("todos");
  const loadOverview = useServerFn(getCustomersOverview);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await loadOverview();
      if (!cancelled) setCustomers(result.customers as Customer[]);
    }
    void load();
    const poll = setInterval(() => void load(), 20000);
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
    // "Recompra" é o que diz se o bar fideliza ou só recebe gente de passagem: a fatia da base
    // que voltou pelo menos uma segunda vez.
    const returning = customers.filter((c) => c.total_visits >= 2).length;
    return {
      total: customers.length,
      ltv: withVisits.length > 0 ? totalSpent / withVisits.length : 0,
      returnRate: customers.length > 0 ? (returning / customers.length) * 100 : 0,
      atRisk: (counts.get("risco") ?? 0) + (counts.get("perdido") ?? 0),
    };
  }, [customers, counts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const termDigits = digits(search);
    return customers
      .filter((customer) => segment === "todos" || customer.segment === segment)
      .filter((customer) => {
        if (!term) return true;
        return (
          customer.name.toLowerCase().includes(term) ||
          (termDigits.length > 0 && customer.phone.includes(termDigits))
        );
      });
  }, [customers, search, segment]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Clientes (CRM)
        </p>
        <h1 className="mt-1 text-3xl font-bold">Base de clientes</h1>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <p className="text-xs text-muted-foreground">Sumidos</p>
          <p
            className={`mt-1 text-lg font-bold ${summary.atRisk > 0 ? "text-amber-500" : ""}`}
          >
            {summary.atRisk}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setSegment("todos")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${
            segment === "todos"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          Todos ({customers.length})
        </button>
        {SEGMENT_ORDER.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => (
          <button
            key={id}
            onClick={() => setSegment(id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${
              segment === id ? "bg-primary text-primary-foreground" : SEGMENT_STYLE[id]
            }`}
          >
            {SEGMENT_LABEL[id]} ({counts.get(id)})
          </button>
        ))}
      </div>

      {segment !== "todos" && (
        <p className="mt-2 text-xs text-muted-foreground">{SEGMENT_HINT[segment]}</p>
      )}

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nome ou celular"
        className="mt-4 h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
      />

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nenhum cliente encontrado.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {filtered.map((customer) => (
            <li key={customer.id}>
              <Link
                to="/caixa/clientes/$customerId"
                params={{ customerId: customer.id }}
                className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-ring"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{customer.name}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEGMENT_STYLE[customer.segment]}`}
                      >
                        {SEGMENT_LABEL[customer.segment]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatPhone(customer.phone)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{brl(customer.total_spent)}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.total_visits} {customer.total_visits === 1 ? "visita" : "visitas"}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ticket médio {brl(customer.averageTicket)} · última visita{" "}
                  {formatDate(customer.last_seen_at)}
                  {customer.idleDays > 0 ? ` (${customer.idleDays}d atrás)` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
