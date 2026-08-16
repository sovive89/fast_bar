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
    const { data: items } = sessionIds.length
      ? await admin()
          .from("fastbar_tab_items")
          .select("session_id, name, unit_price, quantity")
          .in("session_id", sessionIds)
      : { data: [] as never[] };

    const totalBySession = new Map<string, number>();
    // O que ele consome, pra conversa no balcão e pra escolher a promoção que faz sentido pra ele.
    const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const item of items ?? []) {
      totalBySession.set(
        item.session_id,
        (totalBySession.get(item.session_id) ?? 0) + Number(item.unit_price) * item.quantity,
      );
      const current = byProduct.get(item.name) ?? { name: item.name, quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += Number(item.unit_price) * item.quantity;
      byProduct.set(item.name, current);
    }

    const visits = (sessions ?? []).map((session) => ({
      ...session,
      total: totalBySession.get(session.id) ?? 0,
    }));

    const favorites = Array.from(byProduct.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // O corte de VIP é relativo à base inteira, então a ficha precisa consultar todos os clientes
    // — senão o mesmo cliente apareceria com um segmento aqui e outro na lista.
    const { data: allCustomers } = await admin()
      .from("fastbar_customers")
      .select("total_spent");
    const threshold = vipSpendThreshold(allCustomers ?? []);
    const now = Date.now();

    return {
      customer: customer ?? null,
      visits,
      favorites,
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
