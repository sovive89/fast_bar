-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Estoque por lote: cada entrada (compra) vira um lote próprio, com sua data, preço e fornecedor —
-- em vez de só engordar um saldo único com custo médio ponderado. current_stock e average_cost
-- continuam existindo e sendo a fonte de verdade pro saldo total e pro custo médio exibido (nada
-- que já depende deles muda); os lotes são uma camada adicional de rastreabilidade e servem pra
-- decidir qual comprado primeiro sai do estoque quando a comanda vende.

create table if not exists public.fastbar_stock_lots (
  id uuid primary key default gen_random_uuid(),
  component_kind text not null check (component_kind in ('base_drink', 'ingredient')),
  component_id uuid not null,
  supplier_id uuid references public.fastbar_suppliers(id) on delete set null,
  unit_cost numeric,
  quantity_received numeric not null check (quantity_received > 0),
  quantity_remaining numeric not null default 0 check (quantity_remaining >= 0),
  expires_on date,
  received_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists fastbar_stock_lots_component_idx
  on public.fastbar_stock_lots (component_kind, component_id, quantity_remaining);

-- Regra de dedução por item: "fefo" (primeiro a vencer, primeiro a sair) ou "lowest_cost" (o lote
-- mais barato sai primeiro, o que maximiza a margem registrada). Cada insumo escolhe a sua.
alter table public.fastbar_base_drinks
  add column if not exists depletion_rule text not null default 'fefo'
  check (depletion_rule in ('fefo', 'lowest_cost'));

alter table public.fastbar_drink_ingredients
  add column if not exists depletion_rule text not null default 'fefo'
  check (depletion_rule in ('fefo', 'lowest_cost'));

/**
 * Baixa lotes em ordem (validade ou custo, conforme a regra do item) até cobrir a quantidade
 * vendida. Best-effort: se os lotes registrados não cobrem tudo (ex.: saldo antigo de antes dessa
 * feature existir, sem lote nenhum), não erra — current_stock continua sendo o saldo real; lote é
 * só rastreabilidade e escolha de qual custo/validade sai primeiro, nunca trava uma venda.
 */
create or replace function public.fastbar_deplete_lots(
  p_component_kind text,
  p_component_id uuid,
  p_quantity numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

/**
 * Devolve ao(s) lote(s) o que um estorno/cancelamento está devolvendo ao estoque — aproximação
 * best-effort na ordem inversa da baixa (o lote mais "recém-esvaziado" pela regra recebe primeiro),
 * já que não guardamos de qual lote exato cada venda individual saiu.
 */
create or replace function public.fastbar_replenish_lots(
  p_component_kind text,
  p_component_id uuid,
  p_quantity numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Encaixa a baixa/devolução de lote no mesmo ponto em que current_stock já muda por venda/estorno,
-- então toda venda e todo cancelamento passam a manter os lotes em dia sem precisar tocar em
-- fastbar_add_tab_item nem nas funções que já lidam com trava/ordem de concorrência.
create or replace function public.fastbar_revert_item_stock(
  p_product_id uuid,
  p_session_id uuid,
  p_quantity integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_amount numeric;
begin
  if p_product_id is null or coalesce(p_quantity, 0) <= 0 then
    return;
  end if;

  insert into public.fastbar_stock_movements (product_id, session_id, quantity, movement_type, note)
  values (p_product_id, p_session_id, p_quantity, 'in', 'Cancelamento de lançamento');

  update public.fastbar_products
  set stock_quantity = stock_quantity + p_quantity
  where id = p_product_id;

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
$$;

create or replace function public.fastbar_apply_sale_stock(
  p_product_id uuid,
  p_session_id uuid,
  p_quantity integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.fastbar_deplete_lots(text, uuid, numeric)',
    'public.fastbar_replenish_lots(text, uuid, numeric)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
