-- "reason" era texto livre, sem nenhum valor além de compra/venda registrado até hoje — não dava
-- pra identificar desperdício porque a ação de registrar perda nunca existiu na UI. Trava os
-- valores válidos pra impedir grafia solta (perda/Perda/quebra) fragmentando o relatório no futuro.
alter table public.fastbar_base_drink_movements
  drop constraint if exists fastbar_base_drink_movements_reason_check;
alter table public.fastbar_base_drink_movements
  add constraint fastbar_base_drink_movements_reason_check
  check (reason in ('compra', 'venda', 'perda', 'ajuste'));

alter table public.fastbar_drink_ingredient_movements
  drop constraint if exists fastbar_drink_ingredient_movements_reason_check;
alter table public.fastbar_drink_ingredient_movements
  add constraint fastbar_drink_ingredient_movements_reason_check
  check (reason in ('compra', 'venda', 'perda', 'ajuste'));
