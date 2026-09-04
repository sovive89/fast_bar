-- Fluxo invertido de cadastro: cardápio primeiro, ficha técnica depois, estoque nasce da ficha.
--
-- 1) A categoria do cardápio passa a dizer se os itens dela são montados a partir de insumos
--    (drinks, cozinha). Produto numa categoria assim e sem ficha técnica fica "pendente" — é o
--    sistema apontando a necessidade da ficha, em vez de deixar o item vender sem baixar nada.
alter table public.fastbar_product_categories
  add column if not exists needs_recipe boolean not null default false;

-- 2) Insumo de cozinha é o mesmo conceito de ingrediente de drink: nunca é vendido sozinho, só
--    existe pra entrar numa ficha e baixar na venda. Por isso vira um `kind` na mesma tabela em
--    vez de uma terceira tabela — toda a baixa automática (fastbar_add_tab_item), fichas,
--    relatórios e nota fiscal continuam funcionando sem alteração. A separação é só de tela.
alter table public.fastbar_drink_ingredients
  add column if not exists kind text not null default 'drink';

alter table public.fastbar_drink_ingredients
  drop constraint if exists fastbar_drink_ingredients_kind_check;
alter table public.fastbar_drink_ingredients
  add constraint fastbar_drink_ingredients_kind_check check (kind in ('drink', 'cozinha'));

create index if not exists fastbar_drink_ingredients_kind_idx
  on public.fastbar_drink_ingredients (kind);
