/**
 * Roleta de prêmios do cadastro.
 *
 * Regra de negócio: quem preenche o formulário gira uma roleta de 12 fatias. Quanto mais campos
 * OPCIONAIS preencher (e aceitando campanhas), melhores os prêmios — mas o cliente nunca vê nível,
 * tabela nem barra de progresso. Na tela existe só a frase "quanto mais campos preenchidos, maior
 * a chance de ganhar prêmios melhores"; a mecânica abaixo fica escondida.
 *
 * A roleta é sempre a mesma visualmente (12 fatias). O que muda por baixo é QUAIS prêmios ocupam
 * essas fatias.
 *
 * Este arquivo é de propósito sem dependência de banco, rede ou React: é lógica pura, fácil de
 * conferir e de testar. Quem persiste o resultado é client-session.functions.ts.
 */

export type PrizeKey = "ficha_1" | "ficha_2" | "ficha_3" | "desconto_5" | "cerveja";

export interface Prize {
  key: PrizeKey;
  /** Texto mostrado pro cliente quando a roleta para. */
  label: string;
  /** Desconto aplicado na comanda, quando o prêmio for desconto. 5% é o teto — nunca mais que isso. */
  discountPercent: number;
  /** Quantas fichas de sinuca a equipe entrega. */
  fichas: number;
  /** Prêmio que a equipe entrega na mão (cerveja, fichas) — aparece na comanda pro caixa saber. */
  requiresStaff: boolean;
}

export const PRIZES: Record<PrizeKey, Prize> = {
  ficha_1: {
    key: "ficha_1",
    label: "1 ficha de sinuca",
    discountPercent: 0,
    fichas: 1,
    requiresStaff: true,
  },
  ficha_2: {
    key: "ficha_2",
    label: "2 fichas de sinuca",
    discountPercent: 0,
    fichas: 2,
    requiresStaff: true,
  },
  ficha_3: {
    key: "ficha_3",
    label: "3 fichas de sinuca",
    discountPercent: 0,
    fichas: 3,
    requiresStaff: true,
  },
  desconto_5: {
    key: "desconto_5",
    label: "5% de desconto na comanda",
    discountPercent: 5,
    fichas: 0,
    requiresStaff: false,
  },
  cerveja: {
    key: "cerveja",
    label: "Uma cerveja por conta da casa",
    discountPercent: 0,
    fichas: 0,
    requiresStaff: true,
  },
};

export type RouletteLevel = 1 | 2 | 3;

/**
 * As 12 fatias de cada nível. A soma de cada lista é sempre 12 — é isso que faz a roleta desenhada
 * na tela bater com o sorteio; `assertWheelsAreValid()` abaixo garante que ninguém quebre isso sem
 * perceber ao editar as listas.
 *
 * Progressão: a fatia do prêmio mais fraco (1 ficha) encolhe de 5 → 4 → 3, e as boas (3 fichas,
 * cerveja) sobem. Nenhum prêmio some entre níveis — só fica mais ou menos provável. E não existe
 * casa vazia: toda fatia ganha alguma coisa, senão o cliente não teria motivo pra preencher.
 */
export const WHEELS: Record<RouletteLevel, PrizeKey[]> = {
  1: [
    "ficha_1", "ficha_1", "ficha_1", "ficha_1", "ficha_1",
    "ficha_2", "ficha_2", "ficha_2",
    "ficha_3",
    "desconto_5", "desconto_5",
    "cerveja",
  ],
  2: [
    "ficha_1", "ficha_1", "ficha_1", "ficha_1",
    "ficha_2", "ficha_2", "ficha_2",
    "ficha_3", "ficha_3",
    "desconto_5", "desconto_5",
    "cerveja",
  ],
  3: [
    "ficha_1", "ficha_1", "ficha_1",
    "ficha_2", "ficha_2", "ficha_2",
    "ficha_3", "ficha_3",
    "desconto_5", "desconto_5",
    "cerveja", "cerveja",
  ],
};

export const WHEEL_SLICES = 12;

/** Estoura já na importação se alguma roleta sair de 12 fatias — erro que passaria despercebido
 * na revisão e só apareceria como roleta desenhada diferente do sorteio. */
export function assertWheelsAreValid(): void {
  for (const [level, wheel] of Object.entries(WHEELS)) {
    if (wheel.length !== WHEEL_SLICES) {
      throw new Error(
        `Roleta do nível ${level} tem ${wheel.length} fatias — precisa ter ${WHEEL_SLICES}.`,
      );
    }
  }
}
assertWheelsAreValid();

/** Campos opcionais do formulário: são eles que determinam o nível. Os obrigatórios (nome,
 * bairro/RA e faixa etária) só colocam o cliente na roleta — não sobem nível. */
export interface OptionalFieldsFilled {
  birthday: boolean;
  howFoundOut: boolean;
  musicGenres: boolean;
  profession: boolean;
}

export function countOptionalFilled(fields: OptionalFieldsFilled): number {
  return Object.values(fields).filter(Boolean).length;
}

/**
 * Nível a partir do que foi realmente preenchido.
 *
 * - Nível 1: só os obrigatórios.
 * - Nível 2: 1 ou 2 opcionais.
 * - Nível 3: 3 ou 4 opcionais **e** aceite de campanhas — o aceite é parte do topo, não substitui
 *   o preenchimento. Quem preenche tudo mas não autoriza campanhas fica no nível 2, sem perder
 *   nada do que já tinha.
 */
export function resolveLevel(optionalFilled: number, marketingOptIn: boolean): RouletteLevel {
  if (optionalFilled >= 3 && marketingOptIn) return 3;
  if (optionalFilled >= 1) return 2;
  return 1;
}

/**
 * Sorteia uma fatia. `random` recebe um número em [0, 1) — em produção vem de crypto, e nos testes
 * dá pra passar um valor fixo pra conferir cada fatia sem depender de sorte.
 */
export function drawPrize(level: RouletteLevel, random: number): { prize: Prize; sliceIndex: number } {
  return drawFromWheel(WHEELS[level], random);
}

/**
 * Mesma coisa, mas sobre uma roleta arbitrária — é esta que o servidor usa de verdade, porque as
 * fatias podem vir da configuração do tenant e não do padrão.
 *
 * Devolve também o índice da fatia: é ele que a animação no navegador usa pra parar o ponteiro no
 * lugar certo. A animação não sorteia nada — ela só encena um resultado que o servidor já decidiu.
 */
export function drawFromWheel(
  wheel: PrizeKey[],
  random: number,
): { prize: Prize; sliceIndex: number } {
  const clamped = Math.min(Math.max(random, 0), 0.999999);
  const sliceIndex = Math.floor(clamped * wheel.length);
  const key = wheel[sliceIndex] ?? wheel[0]!;
  return { prize: PRIZES[key], sliceIndex };
}

/**
 * Número aleatório criptográfico em [0, 1). Math.random não serve aqui: o resultado vira desconto
 * e cortesia de verdade, e uma sequência previsível seria explorável por quem conhecesse o app.
 */
export function secureRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]! / 2 ** 32;
}
