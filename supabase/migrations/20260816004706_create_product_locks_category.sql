-- Fecha a mesma classe de corrida já fechada nas funções de exclusão: sem isso, criar produto
-- podia ler a categoria como existente e só inserir depois, dando tempo pra exclusão da categoria
-- (que também confere e trava) acontecer no meio, deixando o produto com um texto de categoria
-- que não existe mais em fastbar_product_categories. Trava a linha da categoria aqui também, no
-- mesmo select for update usado no delete, então as duas operações disputam o mesmo lock.
create or replace function public.fastbar_create_product(
  p_name text,
  p_price numeric,
  p_category text,
  p_unit text,
  p_package_type text,
  p_image_url text,
  p_initial_stock integer
) returns jsonb
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
  where lower(name) = lower(p_category)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'category_not_found');
  end if;

  insert into public.fastbar_products (
    name, category, price, unit, package_type, image_url, stock_quantity
  ) values (
    p_name, v_category_name, p_price, p_unit, p_package_type, p_image_url,
    greatest(coalesce(p_initial_stock, 0), 0)
  )
  returning id into v_product_id;

  if coalesce(p_initial_stock, 0) > 0 then
    insert into public.fastbar_stock_movements (product_id, quantity, movement_type, note)
    values (v_product_id, p_initial_stock, 'in', 'Estoque inicial no cadastro');
  end if;

  return jsonb_build_object('ok', true, 'product_id', v_product_id);
end;
$$;

revoke all on function public.fastbar_create_product(text, numeric, text, text, text, text, integer) from public;
revoke all on function public.fastbar_create_product(text, numeric, text, text, text, text, integer) from anon;
revoke all on function public.fastbar_create_product(text, numeric, text, text, text, text, integer) from authenticated;
grant execute on function public.fastbar_create_product(text, numeric, text, text, text, text, integer) to service_role;
