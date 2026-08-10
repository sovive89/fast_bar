import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import type { GateSession } from "./bar-gate.server";

export const checkBarAccess = createServerFn({ method: "GET" }).handler(async () => {
  const { sessionConfig } = await import("./bar-gate.server");
  const session = await useSession<GateSession>(sessionConfig());

  // Renew session expiry on each access by updating it with the same data.
  // This should reset the cookie's maxAge so the session remains active while in use.
  try {
    await session.update(session.data ?? {});
  } catch (err) {
    // ignore errors updating the session; we'll still return the current unlocked state
  }

  return { unlocked: session.data?.unlocked === true };
});

export const unlockBarPanel = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const { sessionConfig, passwordMatches } = await import("./bar-gate.server");
    const expected = process.env["BAR_PANEL_PASSWORD"];
    if (!expected) throw new Error("BAR_PANEL_PASSWORD is not set");
    if (typeof data.password !== "string" || !passwordMatches(data.password, expected)) {
      return { ok: false as const };
    }
    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockBarPanel = createServerFn({ method: "POST" }).handler(async () => {
  const { sessionConfig } = await import("./bar-gate.server");
  const session = await useSession<GateSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

// Optional helper to explicitly touch the session from the client (heartbeat)
export const keepBarAlive = createServerFn({ method: "POST" }).handler(async () => {
  const { sessionConfig } = await import("./bar-gate.server");
  const session = await useSession<GateSession>(sessionConfig());
  try {
    await session.update(session.data ?? {});
  } catch (err) {
    // ignore
  }
  return { ok: true as const };
});

// Alias for logout if you prefer a named endpoint
export const logoutBar = createServerFn({ method: "POST" }).handler(async () => {
  const { sessionConfig } = await import("./bar-gate.server");
  const session = await useSession<GateSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});
