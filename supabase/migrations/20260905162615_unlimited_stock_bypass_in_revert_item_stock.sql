-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

create or replace function public.fastbar_revert_item_stock(p_product_id uuid, p_session_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Produto "nunca esgota" nunca sofreu baixa no lançamento (fastbar_add_tab_item pula isso pra
  -- ele) — estornar aqui só inflaria o saldo dele à toa.
  if coalesce(v_unlimited, false) then
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
