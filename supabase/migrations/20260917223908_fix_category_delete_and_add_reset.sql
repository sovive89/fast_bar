-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- BUG: "zerar cardápio" parecia funcionar (produto some da tela) mas o banco continuava
-- recusando recriação com "já existe uma categoria com esse nome".
--
-- Causa raiz: "Remover" (deactivateProduct) é soft-delete — só marca is_active=false.
-- A tela do cardápio e o cardápio do cliente filtram por is_active=true, então a interface
-- parece vazia. Mas fastbar_delete_product_category contava QUALQUER produto com aquela
-- categoria (ativo ou não) como "em uso", bloqueando a exclusão da categoria. Como
-- fastbar_product_categories.name tem índice único (case-insensitive), recriar a categoria
-- batia nesse índice e devolvia "Já existe uma categoria com esse nome".
--
-- Correção: produto inativo (removido) não conta mais como "em uso" pra bloquear a categoria.
create or replace function public.fastbar_delete_product_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_in_use integer;
  v_deleted integer;
begin
  select name into v_name from public.fastbar_product_categories where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select count(*) into v_in_use
  from public.fastbar_products
  where lower(category) = lower(v_name) and is_active = true;

  if v_in_use > 0 then
    return jsonb_build_object('ok', false, 'code', 'in_use', 'count', v_in_use);
  end if;

  delete from public.fastbar_product_categories where id = p_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fastbar_reset_catalog_and_stock(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_items integer;
  v_stock_movements integer;
  v_stock_lots integer;
  v_products integer;
  v_base_drink_movements integer;
  v_base_drinks integer;
  v_ingredient_movements integer;
  v_ingredients integer;
  v_categories integer;
  v_aliases integer;
  v_notas integer;
begin
  delete from public.fastbar_recipe_items where tenant_id = p_tenant_id;
  get diagnostics v_recipe_items = row_count;

  delete from public.fastbar_stock_movements where tenant_id = p_tenant_id;
  get diagnostics v_stock_movements = row_count;

  delete from public.fastbar_stock_lots where tenant_id = p_tenant_id;
  get diagnostics v_stock_lots = row_count;

  delete from public.fastbar_products where tenant_id = p_tenant_id;
  get diagnostics v_products = row_count;

  delete from public.fastbar_base_drink_movements where tenant_id = p_tenant_id;
  get diagnostics v_base_drink_movements = row_count;

  delete from public.fastbar_base_drinks where tenant_id = p_tenant_id;
  get diagnostics v_base_drinks = row_count;

  delete from public.fastbar_drink_ingredient_movements where tenant_id = p_tenant_id;
  get diagnostics v_ingredient_movements = row_count;

  delete from public.fastbar_drink_ingredients where tenant_id = p_tenant_id;
  get diagnostics v_ingredients = row_count;

  delete from public.fastbar_supply_item_aliases where tenant_id = p_tenant_id;
  get diagnostics v_aliases = row_count;

  delete from public.fastbar_notas_importadas where tenant_id = p_tenant_id;
  get diagnostics v_notas = row_count;

  delete from public.fastbar_product_categories where tenant_id = p_tenant_id;
  get diagnostics v_categories = row_count;

  return jsonb_build_object(
    'ok', true,
    'recipe_items', v_recipe_items,
    'stock_movements', v_stock_movements,
    'stock_lots', v_stock_lots,
    'products', v_products,
    'base_drink_movements', v_base_drink_movements,
    'base_drinks', v_base_drinks,
    'ingredient_movements', v_ingredient_movements,
    'ingredients', v_ingredients,
    'categories', v_categories,
    'supply_item_aliases', v_aliases,
    'notas_importadas', v_notas
  );
end;
$$;

revoke all on function public.fastbar_reset_catalog_and_stock(uuid) from public;
revoke all on function public.fastbar_reset_catalog_and_stock(uuid) from anon;
revoke all on function public.fastbar_reset_catalog_and_stock(uuid) from authenticated;
grant execute on function public.fastbar_reset_catalog_and_stock(uuid) to service_role;
