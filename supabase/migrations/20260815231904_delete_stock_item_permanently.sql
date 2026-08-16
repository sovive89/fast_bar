-- Exclusão definitiva de bebida base ou ingrediente. Mesmo critério do produto: o número de
-- estoque nunca bloqueia (uma "garrafa" cadastrada com conteúdo errado, como aconteceu com Jack
-- Daniel's, precisa poder ser apagada e recriada certa). O que bloqueia é uso real: alguma receita
-- ainda apontar pra ela, ou já ter saído por venda de verdade (reason='venda'). Uma entrada de
-- compra errada sozinha (reason='compra'/'ajuste', sem venda) não impede apagar.
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

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.fastbar_delete_base_drink(uuid)',
    'public.fastbar_delete_ingredient(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
