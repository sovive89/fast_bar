-- O FOR UPDATE do delete só travava a linha do produto NO delete — o lado da venda
-- (fastbar_add_tab_item) inseria em fastbar_tab_items antes de qualquer UPDATE na linha do
-- produto, dependendo implicitamente do lock de chave estrangeira pra ficar seguro contra uma
-- exclusão concorrente. Funciona na prática, mas é frágil: depende de um efeito colateral do FK,
-- não de uma trava explícita. Trava a linha do produto aqui também, no mesmo ponto que o delete
-- trava, deixando as duas pontas simétricas e a garantia auditável sem depender de detalhe do FK.
create or replace function public.fastbar_add_tab_item(
  p_session_id uuid,
  p_product_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_name text;
  v_price numeric;
  v_configured boolean;
begin
  select status into v_status
  from public.fastbar_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'session_not_found');
  end if;
  if v_status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'session_not_open');
  end if;

  select name, price into v_name, v_price
  from public.fastbar_products
  where id = p_product_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'product_unavailable');
  end if;

  select
    exists(select 1 from public.fastbar_recipe_items where product_id = p_product_id)
    or exists(select 1 from public.fastbar_stock_movements where product_id = p_product_id)
  into v_configured;

  if not v_configured then
    return jsonb_build_object('ok', false, 'code', 'product_not_configured');
  end if;

  insert into public.fastbar_tab_items (session_id, product_id, name, unit_price, quantity)
  values (p_session_id, p_product_id, v_name, v_price, 1);

  perform public.fastbar_apply_sale_stock(p_product_id, p_session_id, 1);

  return jsonb_build_object('ok', true);
end;
$$;
