-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

create table if not exists public.fastbar_tenant_admins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fastbar_tenants(id),
  name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists fastbar_tenant_admins_email_key
  on public.fastbar_tenant_admins (lower(email));

create index if not exists fastbar_tenant_admins_tenant_id_idx
  on public.fastbar_tenant_admins (tenant_id);

alter table public.fastbar_tenant_admins enable row level security;

drop policy if exists "service role only" on public.fastbar_tenant_admins;
create policy "service role only" on public.fastbar_tenant_admins
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.fastbar_tenants
  add column if not exists trade_name text,
  add column if not exists cnpj text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists fastbar_tenants_cnpj_key
  on public.fastbar_tenants (cnpj) where cnpj is not null;

create or replace function public.fastbar_delete_product(p_product_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movements integer;
  v_tab_items integer;
  v_deleted integer;
begin
  perform 1 from public.fastbar_products
    where id = p_product_id and tenant_id = p_tenant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;

  select count(*) into v_movements
  from public.fastbar_stock_movements where product_id = p_product_id and tenant_id = p_tenant_id;
  select count(*) into v_tab_items
  from public.fastbar_tab_items where product_id = p_product_id and tenant_id = p_tenant_id;

  if v_movements > 0 or v_tab_items > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_history');
  end if;

  delete from public.fastbar_recipe_items where product_id = p_product_id and tenant_id = p_tenant_id;
  delete from public.fastbar_products where id = p_product_id and tenant_id = p_tenant_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fastbar_delete_base_drink(p_id uuid, p_tenant_id uuid)
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
  perform 1 from public.fastbar_base_drinks
    where id = p_id and tenant_id = p_tenant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select count(*) into v_recipes
  from public.fastbar_recipe_items where base_drink_id = p_id and tenant_id = p_tenant_id;
  select count(*) into v_sales
  from public.fastbar_base_drink_movements
    where base_drink_id = p_id and reason = 'venda' and tenant_id = p_tenant_id;

  if v_recipes > 0 then
    return jsonb_build_object('ok', false, 'code', 'in_use_by_recipe');
  end if;
  if v_sales > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_sales_history');
  end if;

  delete from public.fastbar_base_drink_movements where base_drink_id = p_id and tenant_id = p_tenant_id;
  delete from public.fastbar_base_drinks where id = p_id and tenant_id = p_tenant_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fastbar_delete_ingredient(p_id uuid, p_tenant_id uuid)
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
  perform 1 from public.fastbar_drink_ingredients
    where id = p_id and tenant_id = p_tenant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select count(*) into v_recipes
  from public.fastbar_recipe_items where ingredient_id = p_id and tenant_id = p_tenant_id;
  select count(*) into v_sales
  from public.fastbar_drink_ingredient_movements
    where ingredient_id = p_id and reason = 'venda' and tenant_id = p_tenant_id;

  if v_recipes > 0 then
    return jsonb_build_object('ok', false, 'code', 'in_use_by_recipe');
  end if;
  if v_sales > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_sales_history');
  end if;

  delete from public.fastbar_drink_ingredient_movements where ingredient_id = p_id and tenant_id = p_tenant_id;
  delete from public.fastbar_drink_ingredients where id = p_id and tenant_id = p_tenant_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fastbar_delete_product_category(p_id uuid, p_tenant_id uuid)
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
  select name into v_name from public.fastbar_product_categories
    where id = p_id and tenant_id = p_tenant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select count(*) into v_in_use
  from public.fastbar_products
  where lower(category) = lower(v_name) and is_active = true and tenant_id = p_tenant_id;

  if v_in_use > 0 then
    return jsonb_build_object('ok', false, 'code', 'in_use', 'count', v_in_use);
  end if;

  delete from public.fastbar_product_categories where id = p_id and tenant_id = p_tenant_id;
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
    'public.fastbar_delete_product(uuid,uuid)',
    'public.fastbar_delete_base_drink(uuid,uuid)',
    'public.fastbar_delete_ingredient(uuid,uuid)',
    'public.fastbar_delete_product_category(uuid,uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

drop function if exists public.fastbar_delete_product(uuid);
drop function if exists public.fastbar_delete_base_drink(uuid);
drop function if exists public.fastbar_delete_ingredient(uuid);
drop function if exists public.fastbar_delete_product_category(uuid);
