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
