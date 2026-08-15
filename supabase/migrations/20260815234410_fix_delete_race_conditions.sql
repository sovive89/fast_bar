-- As três funções de exclusão definitiva contavam histórico e só depois apagavam, sem travar a
-- linha entre as duas coisas. Uma venda ou entrada podia entrar bem no meio: passava pela contagem
-- (zero histórico), e a exclusão seguia em frente apagando algo que acabou de ganhar histórico de
-- verdade. `select ... for update` no início serializa contra qualquer UPDATE concorrente na mesma
-- linha (é isso que fastbar_apply_sale_stock e fastbar_add_product_entry fazem) — a venda espera a
-- exclusão terminar, ou a exclusão espera a venda terminar; nunca os dois ao mesmo tempo.

create or replace function public.fastbar_delete_product(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movements integer;
  v_tab_items integer;
  v_deleted integer;
begin
  perform 1 from public.fastbar_products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;

  select count(*) into v_movements
  from public.fastbar_stock_movements where product_id = p_product_id;
  select count(*) into v_tab_items
  from public.fastbar_tab_items where product_id = p_product_id;

  if v_movements > 0 or v_tab_items > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_history');
  end if;

  delete from public.fastbar_recipe_items where product_id = p_product_id;
  delete from public.fastbar_products where id = p_product_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fastbar_delete_base_drink(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipes integer;
  v_sales integer;
  v_deleted integer;
begin
  perform 1 from public.fastbar_base_drinks where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select count(*) into v_recipes
  from public.fastbar_recipe_items where base_drink_id = p_id;
  select count(*) into v_sales
  from public.fastbar_base_drink_movements where base_drink_id = p_id and reason = 'venda';

  if v_recipes > 0 then
    return jsonb_build_object('ok', false, 'code', 'in_use_by_recipe');
  end if;
  if v_sales > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_sales_history');
  end if;

  delete from public.fastbar_base_drink_movements where base_drink_id = p_id;
  delete from public.fastbar_base_drinks where id = p_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fastbar_delete_ingredient(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipes integer;
  v_sales integer;
  v_deleted integer;
begin
  perform 1 from public.fastbar_drink_ingredients where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select count(*) into v_recipes
  from public.fastbar_recipe_items where ingredient_id = p_id;
  select count(*) into v_sales
  from public.fastbar_drink_ingredient_movements where ingredient_id = p_id and reason = 'venda';

  if v_recipes > 0 then
    return jsonb_build_object('ok', false, 'code', 'in_use_by_recipe');
  end if;
  if v_sales > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_sales_history');
  end if;

  delete from public.fastbar_drink_ingredient_movements where ingredient_id = p_id;
  delete from public.fastbar_drink_ingredients where id = p_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
