-- Corrige duas coisas apontadas pelo revisor:
--
-- 1) Deadlock: fastbar_update_product travava o produto e só depois a categoria. Mas
--    fastbar_update_product_category trava a categoria e, na sequência, o UPDATE em massa que
--    propaga o novo nome pros produtos também precisa travar essas linhas de produto. Editar um
--    produto e renomear a categoria dele ao mesmo tempo podia travar em ordem cruzada — um
--    segurando o produto e querendo a categoria, o outro segurando a categoria e querendo o
--    produto — e o Postgres aborta uma das duas transações com deadlock. Agora as duas funções
--    travam categoria primeiro, produto depois, sempre na mesma ordem.
--
-- 2) Corrida de nome duplicado: duas renomeações concorrentes escolhendo o mesmo nome novo
--    passavam ambas pelo EXISTS (que não vê a outra transação em andamento) e uma delas quebrava
--    com erro de violação de unicidade em vez do código 'duplicate' já documentado. Captura esse
--    erro específico e devolve a mesma resposta que o EXISTS já devolveria.
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
      updated_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

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

  begin
    update public.fastbar_product_categories set name = v_new_name where id = p_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  end;

  update public.fastbar_products set category = v_new_name where lower(category) = lower(v_old_name);

  return jsonb_build_object('ok', true);
end;
$$;
