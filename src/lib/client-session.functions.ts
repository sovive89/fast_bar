import { createServerFn } from "@tanstack/react-start";

export const openClientSession = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; phone: string }) => data)
  .handler(async ({ data }) => {
    const { admin, sanitizeName, sanitizePhone, upsertCustomer } = await import(
      "./fastbar.server"
    );

    const name = sanitizeName(data.name);
    const phone = sanitizePhone(data.phone);

    if (!name || !phone) {
      return { ok: false as const, message: "Informe nome completo e celular com DDD." };
    }

    // Mesmo celular já tem comanda em andamento: manda para ela em vez de criar outra.
    const { data: existing } = await admin()
      .from("fastbar_sessions")
      .select("id")
      .eq("phone", phone)
      .in("status", ["pending", "open"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { ok: true as const, sessionId: existing.id };
    }

    const customerId = await upsertCustomer(name, phone);

    const { data: inserted, error } = await admin()
      .from("fastbar_sessions")
      .insert({
        customer_name: name,
        phone,
        status: "pending",
        customer_id: customerId,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return { ok: false as const, message: "Não foi possível abrir a comanda." };
    }

    return { ok: true as const, sessionId: inserted.id };
  });
