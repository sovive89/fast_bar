import { createHash, timingSafeEqual } from "node:crypto";

export type GateSession = { unlocked?: boolean };

export function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "bar-gate",
    // 30 days in seconds
    maxAge: 60 * 60 * 24 * 30,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Reautoriza uma ação destrutiva com a senha da equipe (a mesma do login do caixa, não uma senha
 * de admin à parte). Toda ação que apaga lançamento, cancela comanda ou tira produto do cardápio
 * passa por aqui — se uma delas esquecer, vira porta dos fundos para todas as outras.
 */
export function teamPasswordMatches(input: unknown): boolean {
  const expected = process.env["BAR_PANEL_PASSWORD"];
  if (!expected || typeof input !== "string" || input.length === 0) return false;
  return passwordMatches(input, expected);
}
