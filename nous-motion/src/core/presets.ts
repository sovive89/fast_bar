import { createRegistry, type MotionRegistry } from "./registry";
import { validateParameters } from "./validate";
import { loaderDefinition } from "../components/loader/loader.templates";
import { buttonDefinition } from "../components/button/button.templates";
import { transitionDefinition } from "../components/transitions/transition.templates";
import type { MotionComponent, MotionPreset, ValidationResult } from "./types";

/** Registro com os três componentes. Só importado por presets/editor (não pelo núcleo de cada componente). */
export const defaultRegistry: MotionRegistry = createRegistry([
  loaderDefinition,
  buttonDefinition,
  transitionDefinition,
]);

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const COMPONENTS: readonly MotionComponent[] = ["loader", "button", "transition"];

/**
 * Valida um preset vindo de qualquer lugar (JSON, banco, IA). Devolve um preset NOVO,
 * reconstruído só com campos conhecidos e parâmetros validados; nunca executa nada.
 */
export function validatePreset(
  input: unknown,
  registry: MotionRegistry = defaultRegistry,
): ValidationResult<MotionPreset | null> {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, value: null, errors: ["preset deve ser um objeto"] };
  }
  const p = input as Record<string, unknown>;
  if (typeof p["id"] !== "string" || !ID_RE.test(p["id"])) errors.push("id inválido");
  if (p["version"] !== 1) errors.push("version deve ser 1");
  const component = p["component"];
  if (typeof component !== "string" || !COMPONENTS.includes(component as MotionComponent)) {
    errors.push("component inválido");
    return { ok: false, value: null, errors };
  }
  const def = registry.get(component as MotionComponent);
  if (!def) return { ok: false, value: null, errors: [...errors, "component não registrado"] };
  if (typeof p["template"] !== "string" || !registry.hasTemplate(def.component, p["template"])) {
    errors.push("template inexistente para este componente");
  }
  const params = validateParameters(def.params, p["parameters"] ?? {});
  errors.push(...params.errors);
  if (errors.length) return { ok: false, value: null, errors };
  return {
    ok: true,
    errors: [],
    value: {
      id: p["id"] as string,
      component: def.component,
      template: p["template"] as string,
      version: 1,
      parameters: params.value,
    },
  };
}

/** Lê JSON de texto e valida; JSON malformado vira erro, não exceção. */
export function parsePresetJson(text: string, registry?: MotionRegistry): ValidationResult<MotionPreset | null> {
  try {
    return validatePreset(JSON.parse(text), registry);
  } catch {
    return { ok: false, value: null, errors: ["JSON inválido"] };
  }
}

export const BUILT_IN_PRESETS: readonly MotionPreset[] = [
  { id: "loader-orbit-orange", component: "loader", template: "orbit", version: 1, parameters: { primaryColor: "#f97316", size: 48 } },
  { id: "loader-wave-neutral", component: "loader", template: "wave", version: 1, parameters: { primaryColor: "#64748b", size: 40 } },
  { id: "button-ripple-orange", component: "button", template: "ripple", version: 1, parameters: { primaryColor: "#f97316" } },
  { id: "button-alert-red", component: "button", template: "alert", version: 1, parameters: { primaryColor: "#dc2626", shadow: true } },
  { id: "transition-fade-soft", component: "transition", template: "fade", version: 1, parameters: { duration: 0.4 } },
];
