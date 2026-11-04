-- Produção (item 5 do roadmap, seção 5.5 da documentação funcional): transformar ingredientes e
-- bebidas base em um ITEM PRODUZIDO (xarope, polpa, molho, lote de drink). Três peças:
--
--   * itens produzidos  (fastbar_produced_items): o que sai da produção, com saldo e custo médio;
--   * fichas de produção (fastbar_production_recipes + _items): rendimento, perda prevista e
--     quanto de cada componente entra numa receita;
--   * ordens de produção (fastbar_production_orders + _items): cada vez que a equipe produz, com a
--     baixa dos componentes registrada linha a linha (trilha de auditoria).
--
-- Itens produzidos ficam em tabela PRÓPRIA, separada de bebidas base/ingredientes. Nesta entrega
-- eles só acumulam saldo e custo; usá-los em fichas de drink ou no cardápio é um passo seguinte.

create table if not exists public.fastbar_produced_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  name text not null check (length(trim(name)) > 0),
  unit text not null default 'un',
  current_stock numeric not null default 0 check (current_stock >= 0),
  -- Custo médio por unidade, ponderado pelo saldo. Nulo até existir uma produção com custo
  -- completo: não inventa custo quando falta preço de algum componente.
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fastbar_production_recipes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  produced_item_id uuid not null references public.fastbar_produced_items(id) on delete cascade,
  -- Quanto UMA receita rende, na unidade do item produzido, antes da perda.
  yield_quantity numeric not null check (yield_quantity > 0),
  -- Perda prevista (%) sobre o rendimento: 10 = de cada 100 só 90 viram saldo.
  loss_percent numeric not null default 0 check (loss_percent >= 0 and loss_percent < 100),
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint fastbar_production_recipes_item_key unique (produced_item_id)
);

create table if not exists public.fastbar_production_recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.fastbar_production_recipes(id) on delete cascade,
  component_kind text not null check (component_kind in ('base_drink', 'ingredient')),
  component_id uuid not null,
  -- Na unidade do próprio componente, por UMA receita.
  quantity numeric not null check (quantity > 0),
  constraint fastbar_production_recipe_items_unique unique (recipe_id, component_kind, component_id)
);

create table if not exists public.fastbar_production_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  recipe_id uuid references public.fastbar_production_recipes(id) on delete set null,
  produced_item_id uuid references public.fastbar_produced_items(id) on delete set null,
  -- Nome congelado: apagar o item não pode apagar o histórico de que ele foi produzido.
  produced_item_name text not null,
  batches numeric not null check (batches > 0),
  quantity_produced numeric not null check (quantity_produced >= 0),
  cost_total numeric,
  unit_cost numeric,
  -- false = algum componente não tinha custo nos lotes; o custo acima é parcial e não entrou no
  -- custo médio do item.
  cost_complete boolean not null default true,
  realizado_por text not null default 'equipe',
  created_at timestamptz not null default now()
);

create table if not exists public.fastbar_production_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.fastbar_production_orders(id) on delete cascade,
  component_kind text not null,
  component_id uuid not null,
  component_name text not null,
  quantity numeric not null,
  cost numeric
);

create index if not exists fastbar_production_orders_created_at_idx
  on public.fastbar_production_orders (created_at desc);
create index if not exists fastbar_production_order_items_order_idx
  on public.fastbar_production_order_items (order_id);

-- Mesmo padrão de toda tabela nova: só o service_role (servidor) lê e escreve.
alter table public.fastbar_produced_items enable row level security;
alter table public.fastbar_production_recipes enable row level security;
alter table public.fastbar_production_recipe_items enable row level security;
alter table public.fastbar_production_orders enable row level security;
alter table public.fastbar_production_order_items enable row level security;

create policy "service role full access" on public.fastbar_produced_items
  for all to service_role using (true) with check (true);
create policy "service role full access" on public.fastbar_production_recipes
  for all to service_role using (true) with check (true);
create policy "service role full access" on public.fastbar_production_recipe_items
  for all to service_role using (true) with check (true);
create policy "service role full access" on public.fastbar_production_orders
  for all to service_role using (true) with check (true);
create policy "service role full access" on public.fastbar_production_order_items
  for all to service_role using (true) with check (true);

revoke all on public.fastbar_produced_items from anon, authenticated;
revoke all on public.fastbar_production_recipes from anon, authenticated;
revoke all on public.fastbar_production_recipe_items from anon, authenticated;
revoke all on public.fastbar_production_orders from anon, authenticated;
revoke all on public.fastbar_production_order_items from anon, authenticated;

/**
 * Registra uma ordem de produção de forma atômica (uma transação): confere o saldo de TODOS os
 * componentes antes de baixar qualquer um, baixa os lotes (FEFO / menor custo, a regra de cada
 * componente), desconta o saldo, e soma o produzido ao item. Mesmo padrão de fastbar_add_tab_item:
 * trava as linhas em ordem fixa para duas produções simultâneas não esperarem uma pela outra.
 *
 * Retorna jsonb { ok, code?, component?, order_id?, produced?, cost_total?, unit_cost?,
 * cost_complete? }. 'insufficient_stock' diz qual componente faltou.
 */
create or replace function public.fastbar_register_production_order(
  p_recipe_id uuid,
  p_batches numeric,
  p_realizado_por text default 'equipe'
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_recipe record;
  r record;
  v_available numeric;
  v_name text;
  v_need numeric;
  v_value_before numeric;
  v_value_after numeric;
  v_qty_before numeric;
  v_qty_after numeric;
  v_cost numeric;
  v_cost_total numeric := 0;
  v_complete boolean := true;
  v_produced numeric;
  v_order_id uuid;
  v_new_stock numeric;
  v_unit_result numeric;
begin
  if p_batches is null or p_batches <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_batches');
  end if;

  select rec.id as recipe_id, rec.yield_quantity, rec.loss_percent, rec.active as recipe_active,
         pi.id as item_id, pi.name as item_name, pi.current_stock as item_stock,
         pi.unit_cost as item_cost, pi.active as item_active
    into v_recipe
  from public.fastbar_production_recipes rec
  join public.fastbar_produced_items pi on pi.id = rec.produced_item_id
  where rec.id = p_recipe_id
  for update of pi;

  if not found or not v_recipe.recipe_active or not v_recipe.item_active then
    return jsonb_build_object('ok', false, 'code', 'recipe_not_found');
  end if;

  if not exists (
    select 1 from public.fastbar_production_recipe_items where recipe_id = p_recipe_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'recipe_empty');
  end if;

  -- Fase 1: trava e confere o saldo de todos os componentes, sem baixar nada ainda.
  for r in
    select component_kind, component_id, quantity
    from public.fastbar_production_recipe_items
    where recipe_id = p_recipe_id
    order by component_kind, component_id
  loop
    v_need := r.quantity * p_batches;
    if r.component_kind = 'base_drink' then
      select bd.current_stock, bd.name into v_available, v_name
      from public.fastbar_base_drinks bd where bd.id = r.component_id for update;
    else
      select di.current_stock, di.name into v_available, v_name
      from public.fastbar_drink_ingredients di where di.id = r.component_id for update;
    end if;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'component_not_found');
    end if;
    if coalesce(v_available, 0) < v_need then
      return jsonb_build_object('ok', false, 'code', 'insufficient_stock', 'component', v_name);
    end if;
  end loop;

  v_produced := v_recipe.yield_quantity * p_batches * (1 - v_recipe.loss_percent / 100);

  insert into public.fastbar_production_orders
    (recipe_id, produced_item_id, produced_item_name, batches, quantity_produced, realizado_por)
  values
    (p_recipe_id, v_recipe.item_id, v_recipe.item_name, p_batches, v_produced,
     coalesce(nullif(trim(p_realizado_por), ''), 'equipe'))
  returning id into v_order_id;

  -- Fase 2: baixa de verdade, registrando o custo de cada componente antes de consumir os lotes.
  for r in
    select component_kind, component_id, quantity
    from public.fastbar_production_recipe_items
    where recipe_id = p_recipe_id
    order by component_kind, component_id
  loop
    v_need := r.quantity * p_batches;

    -- Custo do que REALMENTE saiu: compara o valor dos lotes com preço antes e depois da baixa
    -- (assim respeita FEFO / menor custo sem repetir a regra aqui). Se a baixa pegou lote sem preço,
    -- ou saldo antigo sem lote nenhum, o custo deste componente fica desconhecido (incompleto).
    select coalesce(sum(l.unit_cost * l.quantity_remaining), 0), coalesce(sum(l.quantity_remaining), 0)
      into v_value_before, v_qty_before
    from public.fastbar_stock_lots l
    where l.component_kind = r.component_kind
      and l.component_id = r.component_id
      and l.unit_cost is not null;

    perform public.fastbar_deplete_lots(r.component_kind, r.component_id, v_need);

    select coalesce(sum(l.unit_cost * l.quantity_remaining), 0), coalesce(sum(l.quantity_remaining), 0)
      into v_value_after, v_qty_after
    from public.fastbar_stock_lots l
    where l.component_kind = r.component_kind
      and l.component_id = r.component_id
      and l.unit_cost is not null;

    if (v_qty_before - v_qty_after) >= v_need - 0.000001 then
      v_cost := v_value_before - v_value_after;
      v_cost_total := v_cost_total + v_cost;
    else
      v_cost := null;
      v_complete := false;
    end if;

    if r.component_kind = 'base_drink' then
      update public.fastbar_base_drinks
        set current_stock = current_stock - v_need
        where id = r.component_id
        returning name into v_name;
    else
      update public.fastbar_drink_ingredients
        set current_stock = current_stock - v_need
        where id = r.component_id
        returning name into v_name;
    end if;

    insert into public.fastbar_production_order_items
      (order_id, component_kind, component_id, component_name, quantity, cost)
    values (v_order_id, r.component_kind, r.component_id, v_name, v_need, v_cost);
  end loop;

  v_new_stock := coalesce(v_recipe.item_stock, 0) + v_produced;
  v_unit_result := case
    when v_complete and v_produced > 0 then v_cost_total / v_produced
    else null
  end;

  update public.fastbar_production_orders
    set cost_total = case when v_complete then v_cost_total else null end,
        unit_cost = v_unit_result,
        cost_complete = v_complete
    where id = v_order_id;

  -- Custo médio ponderado do item: só se atualiza com custo completo, para um preço faltando
  -- num componente não derrubar o custo do item para um valor menor do que o real.
  update public.fastbar_produced_items
    set current_stock = v_new_stock,
        unit_cost = case
          when v_unit_result is null then unit_cost
          when v_new_stock > 0 then
            (coalesce(v_recipe.item_stock, 0) * coalesce(v_recipe.item_cost, v_unit_result)
              + v_produced * v_unit_result) / v_new_stock
          else unit_cost
        end
    where id = v_recipe.item_id;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'produced', v_produced,
    'cost_total', case when v_complete then v_cost_total else null end,
    'unit_cost', v_unit_result,
    'cost_complete', v_complete
  );
end;
$function$;

revoke all on function public.fastbar_register_production_order(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.fastbar_register_production_order(uuid, numeric, text)
  to service_role;
