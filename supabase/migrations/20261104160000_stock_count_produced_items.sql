-- Itens produzidos (Produção, migration 20261104150000) passam a entrar na conferência de estoque da
-- abertura da operação. O tipo do item conferido ganha 'produced_item'; o vínculo continua em
-- item_kind + item_id (product_id fica nulo, como já é para bebida base e ingrediente).
alter table public.fastbar_stock_count_items
  drop constraint if exists fastbar_stock_count_items_item_kind_check;
alter table public.fastbar_stock_count_items
  add constraint fastbar_stock_count_items_item_kind_check
  check (item_kind in ('product', 'base_drink', 'ingredient', 'produced_item'));
