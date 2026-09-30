-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

create or replace function public.fastbar_default_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.fastbar_tenants where slug = 'golpe-baixo' limit 1;
$$;

revoke all on function public.fastbar_default_tenant_id() from anon, authenticated;
grant execute on function public.fastbar_default_tenant_id() to service_role;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'fastbar_products',
    'fastbar_sessions',
    'fastbar_tab_items',
    'fastbar_customers',
    'fastbar_stock_movements',
    'fastbar_suppliers',
    'fastbar_base_drinks',
    'fastbar_base_drink_movements',
    'fastbar_drink_ingredients',
    'fastbar_drink_ingredient_movements',
    'fastbar_recipe_items',
    'fastbar_product_categories',
    'fastbar_notas_importadas',
    'fastbar_supply_item_aliases',
    'fastbar_stock_lots',
    'fastbar_integrations'
  ];
begin
  foreach v_table in array v_tables loop
    execute format(
      'alter table public.%I alter column tenant_id set default public.fastbar_default_tenant_id()',
      v_table
    );
  end loop;
end $$;
