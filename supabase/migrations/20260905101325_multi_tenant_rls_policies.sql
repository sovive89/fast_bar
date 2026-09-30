-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Política de isolamento por tenant, pronta pra quando o app passar a usar Supabase Auth
-- diretamente do cliente (hoje tudo passa pelo service_role, que ignora RLS — isso aqui é
-- defesa em profundidade pro dia em que existir acesso autenticado direto por tenant).
-- Convenção: o JWT do usuário carrega um claim "tenant_id" (custom claim), e cada linha só
-- é visível/editável por quem tem esse claim batendo com o tenant_id da linha.
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
    execute format('drop policy if exists tenant_isolation on public.%I', v_table);
    execute format(
      $p$create policy tenant_isolation on public.%I
        for all
        to authenticated
        using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
        with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)$p$,
      v_table
    );
  end loop;
end $$;
