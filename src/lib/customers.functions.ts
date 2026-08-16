import { createServerFn } from "@tanstack/react-start";

export const getCustomersOverview = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  const { classifyLead, vipSpendThreshold, averageTicket, daysSince } = await import("./crm");
  await assertRegisterAccess();
  const { data: customers } = await admin()
    .from("fastbar_customers")
    .select("id, name, phone, total_visits, total_spent, first_seen_at, last_seen_at")
    .order("total_spent", { ascending: false });

  // Classifica no servidor, não na tela: o corte de VIP é o 80º percentil da base inteira, então
  // depende de ver todos os clientes de uma vez. Feito no cliente, uma lista filtrada mudaria o
  // corte e o mesmo cliente trocaria de segmento conforme a busca digitada.
  const rows = customers ?? [];
  const threshold = vipSpendThreshold(rows);
  const now = Date.now();

  return {
    customers: rows.map((customer) => ({
      ...customer,
      segment: classifyLead(customer, threshold, now),
      averageTicket: averageTicket(customer),
      idleDays: daysSince(customer.last_seen_at, now),
    })),
  };
});

export const getCustomerDetail = createServerFn({ method: "POST" })
  .inputValidator((data: { customerId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { classifyLead, vipSpendThreshold, averageTicket, daysSince } = await import("./crm");
    await assertRegisterAccess();

    const [{ data: customer }, { data: sessions }] = await Promise.all([
      admin().from("fastbar_customers").select("*").eq("id", data.customerId).maybeSingle(),
      admin()
        .from("fastbar_sessions")
        .select("id, status, started_at, closed_at, paid_at, payment_method")
        .eq("customer_id", data.customerId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const sessionIds = (sessions ?? []).map((session) => session.id);
    const [{ data: items }, { data: products }] = await Promise.all([
      sessionIds.length
        ? admin()
            .from("fastbar_tab_items")
            .select("session_id, product_id, name, unit_price, quantity, added_at")
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [] as never[] }),
      admin().from("fastbar_products").select("id, category"),
    ]);
    const categoryByProductId = new Map((products ?? []).map((p) => [p.id, p.category]));

    const totalBySession = new Map<string, number>();
    // O que ele consome, pra conversa no balcão e pra escolher a promoção que faz sentido pra ele.
    const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
    const byCategory = new Map<string, number>();
    const byHour = new Map<number, number>();
    for (const item of items ?? []) {
      const revenue = Number(item.unit_price) * item.quantity;
      totalBySession.set(item.session_id, (totalBySession.get(item.session_id) ?? 0) + revenue);

      const current = byProduct.get(item.name) ?? { name: item.name, quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += revenue;
      byProduct.set(item.name, current);

      const category = (item.product_id && categoryByProductId.get(item.product_id)) || "Outros";
      byCategory.set(category, (byCategory.get(category) ?? 0) + item.quantity);

      if (item.added_at) {
        const hour = Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            hour12: false,
          }).format(new Date(item.added_at)),
        );
        if (Number.isFinite(hour)) byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
      }
    }

    const visits = (sessions ?? []).map((session) => ({
      ...session,
      total: totalBySession.get(session.id) ?? 0,
    }));

    const favorites = Array.from(byProduct.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const favoriteCategory =
      Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Forma de pagamento preferida: só entre visitas pagas, senão "pending"/"nunca pagou" contaria
    // como uma forma de pagamento.
    const paidVisits = visits.filter((v) => v.status === "paid" && v.payment_method);
    const byMethod = new Map<string, number>();
    for (const visit of paidVisits) {
      byMethod.set(visit.payment_method!, (byMethod.get(visit.payment_method!) ?? 0) + 1);
    }
    const preferredPaymentMethod =
      Array.from(byMethod.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Horário em que mais consome — pra saber se ele é de happy hour ou de virada de noite.
    const peakHour = Array.from(byHour.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Intervalo médio entre visitas: precisa de pelo menos duas com data de início pra ter uma
    // diferença. Cliente de visita única fica sem essa métrica, não com um zero enganoso.
    const startedDates = visits
      .map((v) => v.started_at)
      .filter((v): v is string => Boolean(v))
      .sort();
    let avgDaysBetweenVisits: number | null = null;
    if (startedDates.length >= 2) {
      const first = new Date(startedDates[0]!).getTime();
      const last = new Date(startedDates[startedDates.length - 1]!).getTime();
      avgDaysBetweenVisits = (last - first) / 86400000 / (startedDates.length - 1);
    }

    // O corte de VIP e a fatia do faturamento são relativos à base inteira, então a ficha precisa
    // consultar todos os clientes — senão o mesmo cliente apareceria com um segmento aqui e outro
    // na lista, ou uma fatia calculada contra o número errado.
    const { data: allCustomers } = await admin()
      .from("fastbar_customers")
      .select("total_spent");
    const threshold = vipSpendThreshold(allCustomers ?? []);
    const totalBaseSpend = (allCustomers ?? []).reduce((sum, c) => sum + Number(c.total_spent), 0);
    const now = Date.now();

    return {
      customer: customer ?? null,
      visits,
      favorites,
      favoriteCategory,
      preferredPaymentMethod,
      peakHour,
      avgDaysBetweenVisits,
      revenueShare:
        customer && totalBaseSpend > 0 ? Number(customer.total_spent) / totalBaseSpend : 0,
      segment: customer ? classifyLead(customer, threshold, now) : null,
      averageTicket: customer ? averageTicket(customer) : 0,
      idleDays: customer ? daysSince(customer.last_seen_at, now) : 0,
    };
  });

export const updateCustomerNotes = createServerFn({ method: "POST" })
  .inputValidator((data: { customerId: string; notes: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { error } = await admin()
      .from("fastbar_customers")
      .update({ notes: data.notes })
      .eq("id", data.customerId);
    if (error) return { ok: false as const, message: "Não foi possível salvar a nota." };
    return { ok: true as const };
  });
