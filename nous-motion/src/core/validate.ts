import type { MotionParameters, ParamSpec, ParamSpecs, ParamValue, ValidationResult } from "./types";

// Cores: hex, rgb()/hsl() simples ou var(--token). Nada de url(), expression(), ';' ou '{'.
const COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\(\s*[\d.%\s,/-]+\)|var\(--[a-zA-Z0-9_-]+\)|[a-zA-Z]{3,20})$/;
// Logo: https, caminho relativo ou imagem em data: (sem javascript:).
const URL_RE = /^(https:\/\/[^\s"'<>]+|\/[^\s"'<>]*|data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+)$/;

function checkOne(key: string, spec: ParamSpec, raw: unknown): { ok: true; value: ParamValue } | { ok: false; error: string } {
  switch (spec.type) {
    case "color":
      return typeof raw === "string" && COLOR_RE.test(raw.trim())
        ? { ok: true, value: raw.trim() }
        : { ok: false, error: `${key}: cor inválida` };
    case "number":
      return typeof raw === "number" && Number.isFinite(raw) && raw >= spec.min && raw <= spec.max
        ? { ok: true, value: raw }
        : { ok: false, error: `${key}: número fora de ${spec.min}–${spec.max}` };
    case "enum":
      return typeof raw === "string" && spec.options.includes(raw)
        ? { ok: true, value: raw }
        : { ok: false, error: `${key}: valor deve ser um de ${spec.options.join(", ")}` };
    case "boolean":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, error: `${key}: deve ser booleano` };
    case "text":
      return typeof raw === "string" && raw.length <= spec.maxLength
        ? { ok: true, value: raw }
        : { ok: false, error: `${key}: texto inválido (máx. ${spec.maxLength})` };
    case "url":
      return typeof raw === "string" && (raw === "" || URL_RE.test(raw))
        ? { ok: true, value: raw }
        : { ok: false, error: `${key}: URL não permitida` };
  }
}

/**
 * Valida contra o esquema. Chaves desconhecidas são ERRO e descartadas; valores inválidos
 * caem no padrão. O resultado só contém valores já validados.
 */
export function validateParameters(specs: ParamSpecs, input: unknown): ValidationResult<MotionParameters> {
  const errors: string[] = [];
  const value: MotionParameters = {};
  const obj: Record<string, unknown> =
    input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  if (obj !== input) errors.push("parameters deve ser um objeto");
  for (const key of Object.keys(obj)) {
    if (!Object.prototype.hasOwnProperty.call(specs, key)) errors.push(`${key}: parâmetro desconhecido`);
  }
  for (const [key, spec] of Object.entries(specs)) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const r = checkOne(key, spec, obj[key]);
    if (r.ok) value[key] = r.value;
    else errors.push(r.error);
  }
  return { ok: errors.length === 0, value, errors };
}

export function defaultsOf(specs: ParamSpecs): MotionParameters {
  const out: MotionParameters = {};
  for (const [k, s] of Object.entries(specs)) out[k] = s.default;
  return out;
}
