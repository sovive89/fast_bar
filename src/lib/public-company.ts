/** Public whitelist of company data. Never return the full settings/integration configuration. */
export interface PublicCompany {
  tradeName: string | null;
  address: string | null;
  phone: string | null;
  cnpj: string | null;
}

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" ? value.trim().slice(0, max) || null : null;

/** Numeric and July 2026 alphanumeric CNPJ use mod11 (ASCII − 48). CPF stays private. */
export function publicCnpj(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9./\-\s]+$/.test(value)) return null;
  const digits = value.toUpperCase().replace(/[./\-\s]/g, "");
  if (!/^[A-Z0-9]{12}\d{2}$/.test(digits) || /^(\d)\1+$/.test(digits)) return null;
  const check = (base: string) => {
    let weight = base.length - 7;
    let sum = 0;
    for (const digit of base) {
      sum += (digit.charCodeAt(0) - 48) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  if (check(digits.slice(0, 12)) !== Number(digits[12])) return null;
  if (check(digits.slice(0, 13)) !== Number(digits[13])) return null;
  return digits.replace(
    /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

export function publicCompany(config: unknown): PublicCompany {
  const raw =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  const phoneRaw = text(raw["phone"], 40);
  const digits = phoneRaw?.replace(/\D/g, "") ?? "";
  const phone = /^\d{10,11}$/.test(digits)
    ? `+55${digits}`
    : /^55\d{10,11}$/.test(digits)
      ? `+${digits}`
      : null;
  return {
    tradeName: text(raw["tradeName"], 120),
    address: text(raw["address"], 500),
    phone,
    cnpj: publicCnpj(raw["document"]),
  };
}
