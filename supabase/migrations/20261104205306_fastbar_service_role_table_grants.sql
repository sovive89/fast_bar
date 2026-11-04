-- Projetos novos não dão privilégios de tabela automaticamente ao service_role.
-- O servidor do Fastbar usa esse papel; BYPASSRLS não substitui privilégios SQL.
-- A lista é explícita e não concede acesso a anon ou authenticated.
grant select, insert, update, delete on table
  public.fastbar_bill_requests,
  public.fastbar_consumable_movements,
  public.fastbar_consumables,
  public.fastbar_notas_importadas,
  public.fastbar_operation_closures,
  public.fastbar_operations,
  public.fastbar_produced_items,
  public.fastbar_product_categories,
  public.fastbar_production_order_items,
  public.fastbar_production_orders,
  public.fastbar_production_recipe_items,
  public.fastbar_production_recipes,
  public.fastbar_push_subscriptions,
  public.fastbar_session_credits,
  public.fastbar_session_payments,
  public.fastbar_session_reopenings,
  public.fastbar_stock_count_items,
  public.fastbar_stock_counts,
  public.fastbar_stock_lots,
  public.fastbar_supply_item_aliases,
  public.fastbar_tenant_admins
to service_role;
