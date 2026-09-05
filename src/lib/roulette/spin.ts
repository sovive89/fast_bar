import { parseRouletteConfig } from "./config";
import {
  countOptionalFilled,
  drawFromWheel,
  resolveLevel,
  secureRandom,
  type OptionalFieldsFilled,
  type Prize,
  type RouletteLevel,
} from "./prizes";

/**
 * O giro em si.
 *
 * Roda **no servidor**, no momento em que o cadastro é salvo. A roleta que o cliente vê girando é
 * só animação: se o sorteio acontecesse no navegador, bastaria recarregar a página e girar de novo
 * até sair o prêmio bom. Pelo mesmo motivo o nível vem dos campos realmente gravados, não do que o
 * navegador afirma ter preenchido.
 */

export interface SpinResult {
  prize: Prize;
  /** Fatia sorteada — a animação para o ponteiro aqui. */
  sliceIndex: number;
  /** As 12 fatias que o cliente deve ver desenhadas (é a roleta do nível dele). */
  wheel: string[];
  level: RouletteLevel;
  optionalFilled: number;
}

export interface SpinInput {
  optional: OptionalFieldsFilled;
  marketingOptIn: boolean;
  /** Config do tenant (jsonb). Ausente ou inválida → roleta padrão. */
  rawConfig?: unknown;
  /** Injetável pra teste; em produção é o gerador criptográfico. */
  random?: () => number;
}

export function spin(input: SpinInput): SpinResult | null {
  const config = parseRouletteConfig(input.rawConfig);
  if (!config.enabled) return null;

  const optionalFilled = countOptionalFilled(input.optional);
  const level = resolveLevel(optionalFilled, input.marketingOptIn);
  const wheel = config.wheels[level];
  const { prize, sliceIndex } = drawFromWheel(wheel, (input.random ?? secureRandom)());

  // A cerveja é a única cujo rótulo o bar personaliza (cada casa escolhe qual comporta ser
  // cortesia, conforme a margem) — os demais prêmios são iguais em todo tenant.
  const labeled: Prize =
    prize.key === "cerveja" ? { ...prize, label: config.cervejaLabel } : prize;

  return { prize: labeled, sliceIndex, wheel, level, optionalFilled };
}
