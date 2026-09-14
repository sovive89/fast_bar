import { createServerFn } from "@tanstack/react-start";

/**
 * CARDÁPIO DO CLIENTE — disponibilidade calculada no servidor.
 *
 * Duas coisas erradas que isto conserta de uma vez:
 *
 * 1. TODO DRINK APARECIA COMO "ESGOTADO". A tela do cliente decidia esgotado por
 *    `fastbar_products.stock_quantity <= 0`. Só que produto feito por ficha técnica NÃO tem saldo
 *    próprio — quem tem saldo é a cachaça e o limão. O campo é zero por desenho, e a tela lia esse
 *    zero como "acabou". Resultado: drink com a garrafa cheia aparecia esgotado pro cliente, o que
 *    escondia metade do cardápio de quem escaneia o QR. Item marcado como "nunca esgota" (ficha de
 *    sinuca, taxa) caía na mesma armadilha, porque a consulta nem lia esse campo.
 *
 * 2. O SALDO IA PARA O NAVEGADOR DO CLIENTE. A consulta antiga trazia `stock_quantity` pro
 *    dispositivo de quem está na mesa. A tela não mostrava o número, mas ele viajava — e bastava
 *    abrir o inspetor pra ver quanto tem de cada coisa no estoque. Aqui o número não sai do
 *    servidor: o cliente recebe só `disponivel: true/false`.
 *
 * A regra de disponibilidade é a MESMA que a venda no caixa já aplica (fastbar_add_tab_item), e
 * isso não é coincidência — se as duas divergirem, o cliente vê no cardápio uma coisa que o caixa
 * recusa lançar, que é pior do que não mostrar nada:
 *
 *   - "nunca esgota"        -> sempre disponível;
 *   - tem ficha técnica     -> disponível se CADA componente tem saldo pra pelo menos uma unidade;
 *   - senão                 -> disponível se o saldo próprio do produto for maior que zero.
 *
 * Sem gate de senha de propósito: o cardápio é público, é o que o cliente lê pelo QR. Por isso
 * mesmo a resposta carrega só o que a vitrine precisa — nome, preço, foto, categoria e o booleano.
 */

export type ItemCardapioCliente = {
  id: string;
  name: string;
  price: number;
  category: string;
  image_url: string | null;
  disponivel: boolean;
};

export const getCardapioCliente = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ itens: ItemCardapioCliente[] }> => {
    const { admin } = await import("./fastbar.server");

    const [{ data: produtos }, { data: fichas }, { data: bebidas }, { data: ingredientes }] =
      await Promise.all([
        admin()
          .from("fastbar_products")
          .select("id, name, price, category, image_url, stock_quantity, unlimited_stock")
          .eq("is_active", true)
          .order("category")
          .order("name"),
        admin()
          .from("fastbar_recipe_items")
          .select("product_id, base_drink_id, ingredient_id, quantity"),
        admin().from("fastbar_base_drinks").select("id, current_stock"),
        admin().from("fastbar_drink_ingredients").select("id, current_stock"),
      ]);

    const saldoBebida = new Map((bebidas ?? []).map((b) => [b.id, Number(b.current_stock)]));
    const saldoIngrediente = new Map(
      (ingredientes ?? []).map((i) => [i.id, Number(i.current_stock)]),
    );

    // Agrupa a ficha por produto uma vez só, em vez de varrer a lista inteira por produto — com
    // cardápio grande isso vira O(produtos × linhas de ficha) à toa, numa rota que o cliente
    // recarrega a cada 15 segundos.
    const fichaPorProduto = new Map<string, Array<{ componenteId: string; kind: "base_drink" | "ingredient"; quantidade: number }>>();
    for (const linha of fichas ?? []) {
      const lista = fichaPorProduto.get(linha.product_id) ?? [];
      if (linha.base_drink_id) {
        lista.push({
          componenteId: linha.base_drink_id,
          kind: "base_drink",
          quantidade: Number(linha.quantity),
        });
      } else if (linha.ingredient_id) {
        lista.push({
          componenteId: linha.ingredient_id,
          kind: "ingredient",
          quantidade: Number(linha.quantity),
        });
      }
      fichaPorProduto.set(linha.product_id, lista);
    }

    const itens: ItemCardapioCliente[] = (produtos ?? []).map((produto) => {
      const ficha = fichaPorProduto.get(produto.id);

      let disponivel: boolean;
      if (produto.unlimited_stock) {
        disponivel = true;
      } else if (ficha && ficha.length > 0) {
        // Uma unidade do produto só sai se TODO componente cobre a sua parte da receita — é a
        // mesma checagem componente a componente que a venda faz antes de lançar na comanda.
        disponivel = ficha.every((componente) => {
          const saldo =
            componente.kind === "base_drink"
              ? (saldoBebida.get(componente.componenteId) ?? 0)
              : (saldoIngrediente.get(componente.componenteId) ?? 0);
          return saldo >= componente.quantidade;
        });
      } else {
        disponivel = Number(produto.stock_quantity) > 0;
      }

      return {
        id: produto.id,
        name: produto.name,
        price: Number(produto.price),
        category: produto.category,
        image_url: produto.image_url,
        disponivel,
      };
    });

    return { itens };
  },
);
