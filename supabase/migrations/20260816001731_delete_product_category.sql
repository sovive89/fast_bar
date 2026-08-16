-- Exclusão de categoria. Mesmo critério de tudo mais nesta sessão: uso real bloqueia (algum
-- produto ainda estar nela), não o fato de ela ter sido a categoria padrão inicial.
create or replace function public.fastbar_delete_product_category(p_id uuid)
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
  select name into v_name from public.fastbar_product_categories where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select count(*) into v_in_use
  from public.fastbar_products
  where lower(category) = lower(v_name);

  if v_in_use > 0 then
    return jsonb_build_object('ok', false, 'code', 'in_use', 'count', v_in_use);
  end if;

  delete from public.fastbar_product_categories where id = p_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fastbar_delete_product_category(uuid) from public;
revoke all on function public.fastbar_delete_product_category(uuid) from anon;
revoke all on function public.fastbar_delete_product_category(uuid) from authenticated;
grant execute on function public.fastbar_delete_product_category(uuid) to service_role;
