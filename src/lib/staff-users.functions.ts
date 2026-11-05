import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const registerSchema = z.object({
  fullName: z.string().max(120),
  cpf: z.string().max(20),
  email: z.string().max(160),
  phone: z.string().max(30),
  password: z.string().max(200),
  role: z.string().max(20),
});

export const registerStaffFn = createServerFn({ method: "POST" })
  .inputValidator(registerSchema)
  .handler(async ({ data }) => {
    const { registerStaff } = await import("./staff-users.server");
    return registerStaff(data);
  });

export const loginStaffFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().max(160), password: z.string().max(200) }))
  .handler(async ({ data }) => {
    const { loginStaff } = await import("./staff-users.server");
    return loginStaff(data.email, data.password);
  });

export const listStaffFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listStaff } = await import("./staff-users.server");
  return listStaff();
});

export const setStaffStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      staffId: z.string().uuid(),
      action: z.enum(["aprovar", "desativar", "reativar"]),
    }),
  )
  .handler(async ({ data }) => {
    const { setStaffStatus } = await import("./staff-users.server");
    return setStaffStatus(data.staffId, data.action);
  });
