import type { CSSProperties } from "react";
import { pickForeground } from "./contrast";
import type { TenantBranding } from "./types";

/**
 * Gera os tokens CSS da marca a partir do branding do tenant — sobrescreve --primary/--ring só na
 * árvore onde é aplicado (nunca o :root global, que continua sendo o laranja do Pop9Bar nas telas
 * da equipe). Sem cor configurada, a árvore herda o --primary padrão normalmente.
 */
export function brandingStyle(
  branding: Pick<TenantBranding, "primaryColor"> | null | undefined,
): CSSProperties {
  const primaryColor = branding?.primaryColor;
  if (!primaryColor) return {};
  return {
    "--primary": primaryColor,
    "--primary-foreground": pickForeground(primaryColor),
    "--ring": primaryColor,
  } as CSSProperties;
}
