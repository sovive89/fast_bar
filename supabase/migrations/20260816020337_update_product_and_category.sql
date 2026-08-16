-- Editar produto: mesmo padrão de fastbar_create_product — trava a linha do produto e a da
-- categoria (por nome, case-insensitive) antes de gravar, fechando a mesma corrida contra uma
-- exclusão concorrente de categoria ou de produto.
create or replace function public.fastbar_update_product(
  p_id uuid,
  p_name text,
  p_price numeric,
  p_category text,
  p_unit text,
  p_package_type text,
  p_image_url text,
  p_change_image boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_name text;
begin
  perform 1 from public.fastbar_products where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select name into v_category_name
  from public.fastbar_product_categories
  where lower(name) = lower(p_category)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'category_not_found');
  end if;

  update public.fastbar_products
  set name = p_name,
      price = p_price,
      category = v_category_name,
      unit = p_unit,
      package_type = p_package_type,
      image_url = case when p_change_image then p_image_url else image_url end,
      updated_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fastbar_update_product(uuid, text, numeric, text, text, text, text, boolean) from public;
revoke all on function public.fastbar_update_product(uuid, text, numeric, text, text, text, text, boolean) from anon;
revoke all on function public.fastbar_update_product(uuid, text, numeric, text, text, text, text, boolean) from authenticated;
grant execute on function public.fastbar_update_product(uuid, text, numeric, text, text, text, text, boolean) to service_role;

-- Renomear categoria: trava a linha (mesma trava usada por create/delete, então as três operações
-- disputam o mesmo lock e nunca correm por baixo umas das outras) e propaga o novo nome pros
-- produtos que estavam na categoria antiga — sem isso o texto em fastbar_products.category ficaria
-- órfão, apontando pra um nome que não existe mais na entidade própria.
create or replace function public.fastbar_update_product_category(
  p_id uuid,
  p_name text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_name text;
  v_new_name text := trim(p_name);
begin
  select name into v_old_name from public.fastbar_product_categories where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_new_name is null or length(v_new_name) < 2 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;

  if lower(v_new_name) <> lower(v_old_name) and exists (
    select 1 from public.fastbar_product_categories where lower(name) = lower(v_new_name)
  ) then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  end if;

  update public.fastbar_product_categories set name = v_new_name where id = p_id;
  update public.fastbar_products set category = v_new_name where lower(category) = lower(v_old_name);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fastbar_update_product_category(uuid, text) from public;
revoke all on function public.fastbar_update_product_category(uuid, text) from anon;
revoke all on function public.fastbar_update_product_category(uuid, text) from authenticated;
grant execute on function public.fastbar_update_product_category(uuid, text) to service_role;
