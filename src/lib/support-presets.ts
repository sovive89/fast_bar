/**
 * Mensagens do apoio: só frases prontas, nunca texto livre. Reduz exposição de dados sensíveis,
 * evita digitação sob pressão e deixa o histórico padronizado. O servidor rejeita qualquer outro
 * texto; a interface só oferece estes botões.
 */
export const CUSTOMER_SUPPORT_PRESETS = [
  "Preciso que alguém venha até mim.",
  "Não consigo falar agora.",
  "Quero ir para um local mais reservado.",
  "Posso encontrar a equipe no balcão.",
  "Ainda preciso de apoio.",
  "Estou em segurança agora, obrigado.",
  "Sim, está acontecendo algo.",
  "Foi engano, está tudo bem.",
  "Sim, preciso de ajuda.",
  "Não preciso de ajuda agora.",
  "Posso ir até o balcão.",
  "Não posso ir até o balcão.",
] as const;

/** Respostas do roteiro guiado (o sistema pergunta, a pessoa só toca). */
export const STEP_ANSWERS = {
  happening: "Sim, está acontecendo algo.",
  falseAlarm: "Foi engano, está tudo bem.",
  needHelp: "Sim, preciso de ajuda.",
  noHelp: "Não preciso de ajuda agora.",
  canCounter: "Posso ir até o balcão.",
  cannotCounter: "Não posso ir até o balcão.",
} as const;
export const PLACE_PREFIX = "Estou perto de: ";
export const MAX_SUPPORT_PLACES = 8;
export const MAX_PLACE_LENGTH = 40;

/** Lugares que o gestor cadastra (um por linha): lista curta, texto simples, sem repetição. */
export function sanitizeSupportPlaces(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [];
  const places: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const place = item.replace(/\s+/g, " ").trim();
    if (place && place.length <= MAX_PLACE_LENGTH && !places.includes(place)) places.push(place);
    if (places.length >= MAX_SUPPORT_PLACES) break;
  }
  return places;
}

export type SupportStep = "happening" | "needHelp" | "counter" | "place" | "done" | "falseAlarm";

/** Próxima pergunta do roteiro, deduzida das mensagens que a própria pessoa já enviou. */
export function nextSupportStep(
  customerBodies: readonly string[],
  hasPlaces: boolean,
): SupportStep {
  const said = (text: string) => customerBodies.includes(text);
  if (said(STEP_ANSWERS.falseAlarm)) return "falseAlarm";
  if (!said(STEP_ANSWERS.happening)) return "happening";
  if (said(STEP_ANSWERS.noHelp)) return "done";
  if (!said(STEP_ANSWERS.needHelp)) return "needHelp";
  if (said(STEP_ANSWERS.canCounter)) return "done";
  if (!said(STEP_ANSWERS.cannotCounter)) return "counter";
  if (hasPlaces && !customerBodies.some((body) => body.startsWith(PLACE_PREFIX))) return "place";
  return "done";
}

export const STAFF_SUPPORT_PRESETS = [
  "Recebemos seu pedido. Como podemos ajudar?",
  "Estamos indo até você.",
  "Você consegue vir até o balcão com segurança?",
  "Um minuto, já chegamos.",
  "Você está seguro(a) com a gente.",
] as const;

export function isSupportPreset(
  sender: "customer" | "staff",
  body: string,
  places: readonly string[] = [],
): boolean {
  if (sender === "customer" && body.startsWith(PLACE_PREFIX))
    return places.includes(body.slice(PLACE_PREFIX.length));
  const list: readonly string[] =
    sender === "customer" ? CUSTOMER_SUPPORT_PRESETS : STAFF_SUPPORT_PRESETS;
  return list.includes(body);
}
