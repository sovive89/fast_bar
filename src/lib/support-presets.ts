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
] as const;

export const STAFF_SUPPORT_PRESETS = [
  "Recebemos seu pedido. Como podemos ajudar?",
  "Estamos indo até você.",
  "Você consegue vir até o balcão com segurança?",
  "Um minuto, já chegamos.",
  "Você está seguro(a) com a gente.",
] as const;

export function isSupportPreset(sender: "customer" | "staff", body: string): boolean {
  const list: readonly string[] =
    sender === "customer" ? CUSTOMER_SUPPORT_PRESETS : STAFF_SUPPORT_PRESETS;
  return list.includes(body);
}
