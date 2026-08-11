import { createServerFn } from "@tanstack/react-start";

export const getCustomersOverview = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { data: customers } = await admin()
    .from("fastbar_customers")
    .select("id, name, phone, total_visits, total_spent, first_seen_at, last_seen_at")
    .order("total_spent", { ascending: false });
  return { customers: customers ?? [] };
});

export const getCustomerDetail = createServerFn({ method: "POST" })
  .inputValidator((data: { customerId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
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
          .select("session_id, unit_price, quantity")
          .in("session_id", sessionIds)
      : { data: [] as never[] };

    const totalBySession = new Map<string, number>();
    for (const item of items ?? []) {
      totalBySession.set(
        item.session_id,
        (totalBySession.get(item.session_id) ?? 0) + Number(item.unit_price) * item.quantity,
      );
    }

    const visits = (sessions ?? []).map((session) => ({
      ...session,
      total: totalBySession.get(session.id) ?? 0,
    }));

    return { customer: customer ?? null, visits };
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
