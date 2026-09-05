import {
  Beer,
  CupSoda,
  GlassWater,
  Martini,
  Package,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";

/**
 * Categoria de cardápio é texto livre (o bar cria a que quiser em "+ Nova categoria"), então não
 * dá pra mapear por enum fixo — casa por palavra-chave no nome, sem acento e minúsculo, com um
 * ícone genérico de fallback pra categoria que não bate com nada conhecido.
 */
const KEYWORD_ICONS: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ["cerveja", "chopp", "chope"], icon: Beer },
  { keywords: ["dose", "drink", "coquetel", "cocktail"], icon: Martini },
  { keywords: ["garrafa", "vinho", "whisky", "whiskey", "vodka", "gin", "destilado"], icon: Wine },
  { keywords: ["petisco", "comida", "prato", "cozinha", "lanche"], icon: UtensilsCrossed },
  { keywords: ["refrigerante", "refri", "suco", "agua", "água", "energetico", "energético"], icon: CupSoda },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function categoryIcon(categoryName: string): LucideIcon {
  const normalized = normalize(categoryName);
  for (const entry of KEYWORD_ICONS) {
    if (entry.keywords.some((keyword) => normalized.includes(normalize(keyword)))) {
      return entry.icon;
    }
  }
  return GlassWater;
}

/** Ícone bem genérico pro botão "+ Nova categoria" e outros contextos sem nome de categoria ainda. */
export const GENERIC_CATEGORY_ICON: LucideIcon = Package;
