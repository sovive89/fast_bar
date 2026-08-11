import { createServerFn } from "@tanstack/react-start";

export type ReportsRange = { from: string; to: string };

export const getReportsOverview = createServerFn({ method: "POST" })
  .inputValidator((data: ReportsRange) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const { data: sessions } = await admin()
      .from("fastbar_sessions")
      .select("id, paid_at, payment_method")
      .eq("status", "paid")
      .gte("paid_at", data.from)
      .lte("paid_at", data.to);

    const sessionIds = (sessions ?? []).map((session) => session.id);

    const { data: items } = sessionIds.length
      ? await admin()
          .from("fastbar_tab_items")
          .select("session_id, product_id, name, unit_price, quantity")
          .in("session_id", sessionIds)
      : { data: [] as never[] };
    const { data: products } = await admin().from("fastbar_products").select("id, category");

    const categoryByProductId = new Map((products ?? []).map((p) => [p.id, p.category]));

    const revenueBySession = new Map<string, number>();
    for (const item of items ?? []) {
      const revenue = Number(item.unit_price) * item.quantity;
      revenueBySession.set(
        item.session_id,
        (revenueBySession.get(item.session_id) ?? 0) + revenue,
      );
    }

    const totalRevenue = Array.from(revenueBySession.values()).reduce((sum, v) => sum + v, 0);
    const paidSessionsCount = sessions?.length ?? 0;
    const averageTicket = paidSessionsCount > 0 ? totalRevenue / paidSessionsCount : 0;

    const byDay = new Map<string, number>();
    for (const session of sessions ?? []) {
      if (!session.paid_at) continue;
      const day = session.paid_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + (revenueBySession.get(session.id) ?? 0));
    }
    const revenueByDay = Array.from(byDay.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byMethod = new Map<string, number>();
    for (const session of sessions ?? []) {
      const method = session.payment_method ?? "Não informado";
      byMethod.set(method, (byMethod.get(method) ?? 0) + (revenueBySession.get(session.id) ?? 0));
    }
    const revenueByMethod = Array.from(byMethod.entries()).map(([method, revenue]) => ({
      method,
      revenue,
    }));

    const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
    const byCategory = new Map<string, number>();
    for (const item of items ?? []) {
      const key = item.product_id ?? item.name;
      const current = byProduct.get(key) ?? { name: item.name, quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += Number(item.unit_price) * item.quantity;
      byProduct.set(key, current);

      const category =
        (item.product_id && categoryByProductId.get(item.product_id)) || "Outros";
      byCategory.set(
        category,
        (byCategory.get(category) ?? 0) + Number(item.unit_price) * item.quantity,
      );
    }
    const topProducts = Array.from(byProduct.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    const revenueByCategory = Array.from(byCategory.entries())
      .map(([category, revenue]) => ({ category, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalRevenue,
      paidSessionsCount,
      averageTicket,
      revenueByDay,
      revenueByMethod,
      revenueByCategory,
      topProducts,
    };
  });
