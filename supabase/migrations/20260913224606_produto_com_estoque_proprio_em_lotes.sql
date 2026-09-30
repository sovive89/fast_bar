-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Base para o construtor de cardápio unificado: um produto pode ter estoque PRÓPRIO rastreado por
-- lote (igual bebida base/ingrediente), em vez do saldo solto sem lote que existia até aqui
-- (fastbar_add_product_entry / fastbar_restock_product). "Puxar direto de um insumo" ou "ficha
-- técnica com vários insumos" continuam sendo fastbar_recipe_items com 1 ou N linhas -- isso já
-- existia e não muda.

-- Regra de baixa (FEFO / menor custo) também pro estoque próprio do produto, mesmo default dos
-- componentes.
alter table public.fastbar_products
  add column if not exists depletion_rule text not null default 'fefo';
alter table public.fastbar_products
  drop constraint if exists fastbar_products_depletion_rule_check;
alter table public.fastbar_products
  add constraint fastbar_products_depletion_rule_check
  check (depletion_rule in ('fefo','lowest_cost'));

alter table public.fastbar_stock_lots
  drop constraint if exists fastbar_stock_lots_component_kind_check;
alter table public.fastbar_stock_lots
  add constraint fastbar_stock_lots_component_kind_check
  check (component_kind in ('base_drink','ingredient','product'));

-- fastbar_deplete_lots / fastbar_replenish_lots ganham o ramo 'product', lendo a regra de baixa
-- de fastbar_products em vez de fastbar_base_drinks/fastbar_drink_ingredients. Resto idêntico.
create or replace function public.fastbar_deplete_lots(p_component_kind text, p_component_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rule text;
  r record;
  v_remaining numeric := p_quantity;
  v_take numeric;
begin
  if p_component_id is null or coalesce(p_quantity, 0) <= 0 then
    return;
  end if;

  if p_component_kind = 'base_drink' then
    select depletion_rule into v_rule from public.fastbar_base_drinks where id = p_component_id;
  elsif p_component_kind = 'ingredient' then
    select depletion_rule into v_rule from public.fastbar_drink_ingredients where id = p_component_id;
  elsif p_component_kind = 'product' then
    select depletion_rule into v_rule from public.fastbar_products where id = p_component_id;
  else
    return;
  end if;

  for r in
    select id, quantity_remaining
    from public.fastbar_stock_lots
    where component_kind = p_component_kind
      and component_id = p_component_id
      and quantity_remaining > 0
    order by
      case when v_rule = 'lowest_cost' then unit_cost end asc nulls last,
      case when v_rule is distinct from 'lowest_cost' then expires_on end asc nulls last,
      received_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(r.quantity_remaining, v_remaining);
    update public.fastbar_stock_lots
    set quantity_remaining = quantity_remaining - v_take
    where id = r.id;
    v_remaining := v_remaining - v_take;
  end loop;
end;
$function$;

create or replace function public.fastbar_replenish_lots(p_component_kind text, p_component_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rule text;
  r record;
  v_remaining numeric := p_quantity;
  v_give numeric;
begin
  if p_component_id is null or coalesce(p_quantity, 0) <= 0 then
    return;
  end if;

  if p_component_kind = 'base_drink' then
    select depletion_rule into v_rule from public.fastbar_base_drinks where id = p_component_id;
  elsif p_component_kind = 'ingredient' then
    select depletion_rule into v_rule from public.fastbar_drink_ingredients where id = p_component_id;
  elsif p_component_kind = 'product' then
    select depletion_rule into v_rule from public.fastbar_products where id = p_component_id;
  else
    return;
  end if;

  for r in
    select id, quantity_received, quantity_remaining
    from public.fastbar_stock_lots
    where component_kind = p_component_kind
      and component_id = p_component_id
      and quantity_remaining < quantity_received
    order by
      case when v_rule = 'lowest_cost' then unit_cost end desc nulls last,
      case when v_rule is distinct from 'lowest_cost' then expires_on end desc nulls last,
      received_at desc
    for update
  loop
    exit when v_remaining <= 0;
    v_give := least(r.quantity_received - r.quantity_remaining, v_remaining);
    update public.fastbar_stock_lots
    set quantity_remaining = quantity_remaining + v_give
    where id = r.id;
    v_remaining := v_remaining - v_give;
  end loop;
end;
$function$;

-- fastbar_apply_sale_stock / fastbar_revert_item_stock passam a bater também nos lotes PRÓPRIOS
-- do produto (kind='product'), no mesmo passo em que já mexem em stock_quantity -- incondicional,
-- igual o stock_quantity já era, então produto com ficha técnica (sem lote próprio) só roda um
-- loop vazio, sem efeito.
create or replace function public.fastbar_apply_sale_stock(p_product_id uuid, p_session_id uuid, p_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_amount numeric;
begin
  if p_product_id is null or coalesce(p_quantity, 0) <= 0 then
    return;
  end if;

  insert into public.fastbar_stock_movements (product_id, session_id, quantity, movement_type, note)
  values (p_product_id, p_session_id, p_quantity, 'out', 'Lançamento na comanda');

  update public.fastbar_products
  set stock_quantity = stock_quantity - p_quantity
  where id = p_product_id;

  perform public.fastbar_deplete_lots('product', p_product_id, p_quantity);

  for r in
    select base_drink_id, ingredient_id, quantity
    from public.fastbar_recipe_items
    where product_id = p_product_id
    order by base_drink_id nulls last, ingredient_id nulls last
  loop
    v_amount := r.quantity * p_quantity;
    if v_amount <= 0 then
      continue;
    end if;

    if r.base_drink_id is not null then
      insert into public.fastbar_base_drink_movements (base_drink_id, type, quantity, reason, note)
      values (r.base_drink_id, 'saida', v_amount, 'venda', 'Baixa automática por venda');

      update public.fastbar_base_drinks
      set current_stock = current_stock - v_amount
      where id = r.base_drink_id;

      perform public.fastbar_deplete_lots('base_drink', r.base_drink_id, v_amount);

    elsif r.ingredient_id is not null then
      insert into public.fastbar_drink_ingredient_movements (ingredient_id, type, quantity, reason, note)
      values (r.ingredient_id, 'saida', v_amount, 'venda', 'Baixa automática por venda');

      update public.fastbar_drink_ingredients
      set current_stock = current_stock - v_amount
      where id = r.ingredient_id;

      perform public.fastbar_deplete_lots('ingredient', r.ingredient_id, v_amount);
    end if;
  end loop;
end;
$function$;

create or replace function public.fastbar_revert_item_stock(p_product_id uuid, p_session_id uuid, p_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_amount numeric;
  v_unlimited boolean;
begin
  if p_product_id is null or coalesce(p_quantity, 0) <= 0 then
    return;
  end if;

  select unlimited_stock into v_unlimited
  from public.fastbar_products
  where id = p_product_id;

  if coalesce(v_unlimited, false) then
    return;
  end if;

  insert into public.fastbar_stock_movements (product_id, session_id, quantity, movement_type, note)
  values (p_product_id, p_session_id, p_quantity, 'in', 'Cancelamento de lançamento');

  update public.fastbar_products
  set stock_quantity = stock_quantity + p_quantity
  where id = p_product_id;

  perform public.fastbar_replenish_lots('product', p_product_id, p_quantity);

  for r in
    select base_drink_id, ingredient_id, quantity
    from public.fastbar_recipe_items
    where product_id = p_product_id
    order by base_drink_id nulls last, ingredient_id nulls last
  loop
    v_amount := r.quantity * p_quantity;
    if v_amount <= 0 then
      continue;
    end if;

    if r.base_drink_id is not null then
      insert into public.fastbar_base_drink_movements (base_drink_id, type, quantity, reason, note)
      values (r.base_drink_id, 'entrada', v_amount, 'ajuste', 'Estorno por cancelamento de lançamento');

      update public.fastbar_base_drinks
      set current_stock = current_stock + v_amount
      where id = r.base_drink_id;

      perform public.fastbar_replenish_lots('base_drink', r.base_drink_id, v_amount);

    elsif r.ingredient_id is not null then
      insert into public.fastbar_drink_ingredient_movements (ingredient_id, type, quantity, reason, note)
      values (r.ingredient_id, 'entrada', v_amount, 'ajuste', 'Estorno por cancelamento de lançamento');

      update public.fastbar_drink_ingredients
      set current_stock = current_stock + v_amount
      where id = r.ingredient_id;

      perform public.fastbar_replenish_lots('ingredient', r.ingredient_id, v_amount);
    end if;
  end loop;
end;
$function$;
