import { validatePreset } from "./presets";
import type { MotionComponent, MotionPreset, ValidationResult } from "./types";

/**
 * Ponto de extensão para IA futura. Uma implementação devolve DADOS (objeto JSON), nunca código.
 * Nenhuma integração com provedor existe nesta versão.
 */
export interface MotionSuggester {
  suggest(prompt: string, context: { component: MotionComponent; template?: string }): Promise<unknown>;
}

/** Passa a sugestão pelo mesmo validador dos presets: o que não passa, não é aplicado. */
export async function acceptSuggestion(
  suggester: MotionSuggester,
  prompt: string,
  context: { component: MotionComponent; template?: string },
): Promise<ValidationResult<MotionPreset | null>> {
  return validatePreset(await suggester.suggest(prompt, context));
}
