-- Conferência de estoque passa a cobrir bebidas base e ingredientes, não só produtos de revenda.
-- A primeira versão (20261104093000_stock_counts_abertura_operacao.sql) só registrava
-- fastbar_products, e na prática a conferência saía vazia: o estoque do bar fica quase todo em
-- fastbar_base_drinks / fastbar_drink_ingredients.
--
-- Os três tipos moram em tabelas diferentes, então o item conferido passa a ser identificado por
-- item_kind + item_id. product_id continua existindo (com a FK) e preenchido só para produto —
-- nada do que já foi gravado muda de sentido. Sem FK em item_id: ele aponta para três tabelas, e
-- apagar uma bebida base nunca pode apagar o histórico da conferência (o nome fica congelado em
-- product_name, como já era).

alter table public.fastbar_stock_count_items
  add column if not exists item_kind text not null default 'product',
  add column if not exists item_id uuid;

update public.fastbar_stock_count_items
  set item_id = product_id
  where item_id is null and product_id is not null;

alter table public.fastbar_stock_count_items
  drop constraint if exists fastbar_stock_count_items_item_kind_check;
alter table public.fastbar_stock_count_items
  add constraint fastbar_stock_count_items_item_kind_check
  check (item_kind in ('product', 'base_drink', 'ingredient'));
