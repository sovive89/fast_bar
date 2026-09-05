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
    // Mesma checagem das ações destrutivas (senha do tenant no banco, com a variável de ambiente
    // só como fallback) — antes o login lia BAR_PANEL_PASSWORD direto, o que faria a senha nova do
    // bar valer nos botões do caixa mas não na tela de entrada.
    const { sessionConfig, teamPasswordMatches } = await import("./bar-gate.server");
    if (!(await teamPasswordMatches(data.password))) {
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
