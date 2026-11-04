/** Public brand background must be an HTTPS image URL, never executable or a CSS expression. */
export function sanitizeBrandBackground(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
export function sanitizeCardOpacity(value: unknown): number {
  if (value === "" || value === null || value === undefined) return 0.82;
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0.6, opacity)) : 0.82;
}
