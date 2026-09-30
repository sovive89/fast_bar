-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- fastbar_create_product resolvia categoria e inserava produto SEM checar tenant — o produto caía
-- sempre no tenant_id resolvido pelo DEFAULT da coluna (fastbar_default_tenant_id, fixo em
-- "golpebaixo"), não no tenant de quem estava logado. Corrigido: categoria é buscada dentro do
-- tenant, e tenant_id é gravado explicitamente no produto e no movimento de estoque inicial.
create or replace function public.fastbar_create_product(
  p_name text, p_price numeric, p_category text, p_unit text, p_package_type text,
  p_image_url text, p_initial_stock integer, p_tenant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_name text;
  v_product_id uuid;
begin
  select name into v_category_name
  from public.fastbar_product_categories
  where lower(name) = lower(p_category) and tenant_id = p_tenant_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'category_not_found');
  end if;

  insert into public.fastbar_products (
    name, category, price, unit, package_type, image_url, stock_quantity, tenant_id
  ) values (
    p_name, v_category_name, p_price, p_unit, p_package_type, p_image_url,
    greatest(coalesce(p_initial_stock, 0), 0), p_tenant_id
  )
  returning id into v_product_id;

  if coalesce(p_initial_stock, 0) > 0 then
    insert into public.fastbar_stock_movements (product_id, quantity, movement_type, note, tenant_id)
    values (v_product_id, p_initial_stock, 'in', 'Estoque inicial no cadastro', p_tenant_id);
  end if;

  return jsonb_build_object('ok', true, 'product_id', v_product_id);
end;
$$;

drop function if exists public.fastbar_create_product(text, numeric, text, text, text, text, integer);

do $$
begin
  execute 'revoke all on function public.fastbar_create_product(text, numeric, text, text, text, text, integer, uuid) from public, anon, authenticated';
  execute 'grant execute on function public.fastbar_create_product(text, numeric, text, text, text, text, integer, uuid) to service_role';
end $$;

-- fastbar_update_product_category: mesma falha (sem tenant) — renomear podia colidir/propagar
-- pra produtos de OUTRO tenant que por acaso tivessem categoria com o mesmo nome.
create or replace function public.fastbar_update_product_category(p_id uuid, p_name text, p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_name text;
  v_new_name text := trim(p_name);
begin
  select name into v_old_name from public.fastbar_product_categories
    where id = p_id and tenant_id = p_tenant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_new_name is null or length(v_new_name) < 2 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;

  if lower(v_new_name) <> lower(v_old_name) and exists (
    select 1 from public.fastbar_product_categories
    where lower(name) = lower(v_new_name) and tenant_id = p_tenant_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  end if;

  begin
    update public.fastbar_product_categories set name = v_new_name
      where id = p_id and tenant_id = p_tenant_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  end;

  update public.fastbar_products set category = v_new_name
    where lower(category) = lower(v_old_name) and tenant_id = p_tenant_id;

  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.fastbar_update_product_category(uuid, text);

do $$
begin
  execute 'revoke all on function public.fastbar_update_product_category(uuid, text, uuid) from public, anon, authenticated';
  execute 'grant execute on function public.fastbar_update_product_category(uuid, text, uuid) to service_role';
end $$;
