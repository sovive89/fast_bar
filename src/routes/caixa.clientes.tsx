import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { brl, digits, formatPhone } from "@/lib/format";
import { getCustomersOverview } from "@/lib/customers.functions";

type Customer = {
  id: string;
  name: string;
  phone: string;
  total_visits: number;
  total_spent: number;
  first_seen_at: string;
  last_seen_at: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

export const Route = createFileRoute("/caixa/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes | FastBar" },
      {
        name: "description",
        content: "Clientes cadastrados, número de visitas e total consumido.",
      },
    ],
  }),
  component: CustomersOverview,
});

function CustomersOverview() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const termDigits = digits(search);
    if (!term) return customers;
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        (termDigits.length > 0 && customer.phone.includes(termDigits)),
    );
  }, [customers, search]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Clientes</p>
        <h1 className="mt-1 text-3xl font-bold">CRM</h1>
      </div>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nome ou celular"
        className="mt-6 h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
      />

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nenhum cliente encontrado.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {filtered.map((customer) => (
            <li
              key={customer.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{customer.name}</p>
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
                Última visita: {formatDate(customer.last_seen_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
