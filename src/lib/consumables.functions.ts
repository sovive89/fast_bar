import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Camada createServerFn de materiais de consumo e utensílios; a lógica mora em consumables.server.ts. */
export const listConsumablesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listConsumables } = await import("./consumables.server");
  return listConsumables();
});

export const createConsumableFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().max(120),
      unit: z.string().max(20),
      minStock: z.union([z.string().max(20), z.number()]).optional(),
      sector: z.string().max(20),
      category: z.string().max(30),
    }),
  )
  .handler(async ({ data }) => {
    const { createConsumable } = await import("./consumables.server");
    return createConsumable(data);
  });

export const adjustConsumableFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      type: z.string().max(10),
      quantity: z.union([z.string().max(20), z.number()]),
      reason: z.string().max(20),
      note: z.string().max(400).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { adjustConsumable } = await import("./consumables.server");
    const { id, ...rest } = data;
    return adjustConsumable(id, rest);
  });
