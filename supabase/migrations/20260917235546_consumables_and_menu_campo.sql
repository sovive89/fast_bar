-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Terceiro "campo" de estoque pedido: Materiais de Consumo (óleo, gás, material de limpeza e
-- afins) — nunca aparece no cardápio, nunca é vendido, nunca entra em ficha técnica. É consumido
-- direto pela operação (uma baixa manual registra o gasto), não pela venda de um produto.
-- Mesma estrutura de fastbar_drink_ingredients/fastbar_drink_ingredient_movements, sem o que não
-- se aplica aqui (kind, uso em receita).

create table public.fastbar_consumables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.fastbar_default_tenant_id() references public.fastbar_tenants(id),
  name text not null,
  unit text not null default 'un',
  current_stock numeric not null default 0,
  min_stock numeric not null default 0,
  average_cost numeric not null default 0,
  active boolean not null default true,
  purchase_unit text,
  units_per_pack integer not null default 1,
  content_amount numeric not null default 1,
  depletion_rule text not null default 'fefo',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fastbar_consumables_units_per_pack_positive check (units_per_pack > 0),
  constraint fastbar_consumables_content_amount_positive check (content_amount > 0),
  constraint fastbar_consumables_depletion_rule_check check (depletion_rule in ('fefo', 'lowest_cost'))
);

create index idx_fastbar_consumables_tenant_id on public.fastbar_consumables (tenant_id);
create unique index fastbar_consumables_tenant_name_ci_key on public.fastbar_consumables (tenant_id, lower(name));

alter table public.fastbar_consumables enable row level security;
create policy tenant_isolation on public.fastbar_consumables for all to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

create table public.fastbar_consumable_movements (
  id uuid primary key default gen_random_uuid(),
  consumable_id uuid not null references public.fastbar_consumables(id),
  tenant_id uuid not null default public.fastbar_default_tenant_id(),
  type text not null,
  quantity numeric not null,
  reason text not null default 'compra',
  supplier_id uuid references public.fastbar_suppliers(id),
  unit_cost numeric,
  note text,
  created_at timestamptz not null default now(),
  constraint fastbar_consumable_movements_type_check check (type in ('entrada', 'saida'))
);

create index idx_fastbar_consumable_movements_consumable_id on public.fastbar_consumable_movements (consumable_id);
create index idx_fastbar_consumable_movements_tenant_id on public.fastbar_consumable_movements (tenant_id);

alter table public.fastbar_consumable_movements enable row level security;
create policy tenant_isolation on public.fastbar_consumable_movements for all to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

-- fastbar_stock_lots já rastreia lote por component_kind — só falta o quarto valor possível.
alter table public.fastbar_stock_lots drop constraint fastbar_stock_lots_component_kind_check;
alter table public.fastbar_stock_lots add constraint fastbar_stock_lots_component_kind_check
  check (component_kind = any (array['base_drink'::text, 'ingredient'::text, 'product'::text, 'consumable'::text]));

-- Apagar de vez: bloqueia se já tem qualquer movimentação (entrada ou baixa) — mesmo critério de
-- fastbar_delete_ingredient (histórico real trava, número de saldo solto não).
create or replace function public.fastbar_delete_consumable(p_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_movements integer;
  v_deleted integer;
begin
  perform 1 from public.fastbar_consumables where id = p_id and tenant_id = p_tenant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select count(*) into v_movements
  from public.fastbar_consumable_movements where consumable_id = p_id and tenant_id = p_tenant_id;
  if v_movements > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_history');
  end if;

  delete from public.fastbar_consumables where id = p_id and tenant_id = p_tenant_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.fastbar_delete_consumable(uuid, uuid) to service_role;

-- Campo de estoque do produto do cardápio SEM ficha técnica: define em qual dos dois campos
-- vendáveis (Bebidas ou Insumos) o lançamento de estoque desse produto aparece — a mesma aba/lista
-- onde já aparecem bebida base e ingrediente, em vez de ficar isolado só na tela de Cardápio. Nulo
-- pra produto com ficha técnica (quem sofre baixa ali são os insumos da receita, o produto em si
-- não tem lançamento próprio) e para produtos legados ainda não classificados.
alter table public.fastbar_products add column campo_estoque text;
alter table public.fastbar_products add constraint fastbar_products_campo_estoque_check
  check (campo_estoque is null or campo_estoque in ('bebida', 'insumo'));

drop function if exists public.fastbar_create_product(text, numeric, text, text, text, text, integer, uuid);

create or replace function public.fastbar_create_product(
  p_name text, p_price numeric, p_category text, p_unit text, p_package_type text, p_image_url text,
  p_initial_stock integer, p_tenant_id uuid, p_campo_estoque text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_category_name text;
  v_product_id uuid;
begin
  if p_campo_estoque is not null and p_campo_estoque not in ('bebida', 'insumo') then
    return jsonb_build_object('ok', false, 'code', 'invalid_campo_estoque');
  end if;

  select name into v_category_name
  from public.fastbar_product_categories
  where lower(name) = lower(p_category) and tenant_id = p_tenant_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'category_not_found');
  end if;

  insert into public.fastbar_products (
    name, category, price, unit, package_type, image_url, stock_quantity, tenant_id, campo_estoque
  ) values (
    p_name, v_category_name, p_price, p_unit, p_package_type, p_image_url,
    greatest(coalesce(p_initial_stock, 0), 0), p_tenant_id, p_campo_estoque
  )
  returning id into v_product_id;

  if coalesce(p_initial_stock, 0) > 0 then
    insert into public.fastbar_stock_movements (product_id, quantity, movement_type, note, tenant_id)
    values (v_product_id, p_initial_stock, 'in', 'Estoque inicial no cadastro', p_tenant_id);
  end if;

  return jsonb_build_object('ok', true, 'product_id', v_product_id);
end;
$function$;

grant execute on function public.fastbar_create_product(text, numeric, text, text, text, text, integer, uuid, text) to service_role;

-- fastbar_update_product ainda não é tenant-scoped (gap já conhecido, fora do escopo desta
-- migration) — só adiciona o parâmetro novo, sem mexer nesse ponto.
drop function if exists public.fastbar_update_product(uuid, text, numeric, text, text, text, text, boolean);

create or replace function public.fastbar_update_product(
  p_id uuid, p_name text, p_price numeric, p_category text, p_unit text, p_package_type text,
  p_image_url text, p_change_image boolean, p_campo_estoque text, p_change_campo_estoque boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_category_name text;
begin
  if p_campo_estoque is not null and p_campo_estoque not in ('bebida', 'insumo') then
    return jsonb_build_object('ok', false, 'code', 'invalid_campo_estoque');
  end if;

  select name into v_category_name
  from public.fastbar_product_categories
  where lower(name) = lower(p_category)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'category_not_found');
  end if;

  perform 1 from public.fastbar_products where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  update public.fastbar_products
  set name = p_name,
      price = p_price,
      category = v_category_name,
      unit = p_unit,
      package_type = p_package_type,
      image_url = case when p_change_image then p_image_url else image_url end,
      campo_estoque = case when p_change_campo_estoque then p_campo_estoque else campo_estoque end,
      updated_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.fastbar_update_product(uuid, text, numeric, text, text, text, text, boolean, text, boolean) to service_role;
