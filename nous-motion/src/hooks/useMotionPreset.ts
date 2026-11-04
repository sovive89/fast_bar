import { useMemo } from "react";
import { validatePreset } from "../core/presets";
import type { MotionComponent, MotionParameters, MotionPreset } from "../core/types";

export interface UseMotionPresetResult {
  ok: boolean;
  errors: string[];
  component: MotionComponent | null;
  template: string | null;
  /** Só parâmetros já validados; espalhe direto no componente: <NousLoader {...props} /> */
  props: MotionParameters & { template?: string };
}

/** Valida um preset (objeto ou JSON) antes de usá-lo. Preset inválido → props vazias + erros. */
export function useMotionPreset(preset: MotionPreset | unknown): UseMotionPresetResult {
  return useMemo(() => {
    const r = validatePreset(preset);
    if (!r.ok || !r.value) return { ok: false, errors: r.errors, component: null, template: null, props: {} };
    return {
      ok: true,
      errors: [],
      component: r.value.component,
      template: r.value.template,
      props: { ...r.value.parameters, template: r.value.template },
    };
  }, [preset]);
}
