/** A fridge photo may include old stock. Only explicitly selected new merchandise is eligible. */
export function photoLinesForEntry<
  T extends { included: boolean; componentId: string; packs: string },
>(lines: T[]): T[] {
  const selected = lines.filter((line) => line.included);
  if (selected.length === 0) throw new Error("Selecione a mercadoria nova que deseja lançar.");
  for (const line of selected) {
    if (!line.componentId)
      throw new Error("Escolha o item do estoque para cada produto selecionado.");
    const count = Number(line.packs);
    if (!Number.isSafeInteger(count) || count <= 0)
      throw new Error("Confira a quantidade de embalagens novas de cada produto selecionado.");
  }
  return selected;
}
