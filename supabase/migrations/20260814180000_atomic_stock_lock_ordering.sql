-- Ordem de travamento consistente: sempre a comanda antes dos itens.
--
-- fastbar_remove_tab_item travava o item e só depois lia a comanda, enquanto fastbar_cancel_session
-- travava a comanda e lia os itens sem travar. Com as ordens invertidas, um cancelamento de comanda
-- e a remoção de um item podiam estornar o mesmo lançamento duas vezes, creditando o estoque em
-- dobro. Travar sempre na mesma sequência faz uma esperar a outra.

create or replace function public.fastbar_remove_tab_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_status text;
  v_session_id uuid;
begin
  -- Descobre a comanda antes de travar qualquer coisa, para travar sempre comanda -> item.
  select session_id into v_session_id
  from public.fastbar_tab_items
  where id = p_item_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'item_not_found');
  end if;

  select status into v_status
  from public.fastbar_sessions
  where id = v_session_id
  for update;

  if v_status is distinct from 'open' then
    return jsonb_build_object('ok', false, 'code', 'session_not_open');
  end if;

  -- Só agora trava o item. Se um cancelamento da comanda passou na frente, ele já terá apagado
  -- esta linha e o select abaixo não encontra nada.
  select id, product_id, session_id, quantity
  into v_item
  from public.fastbar_tab_items
  where id = p_item_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'item_not_found');
  end if;

  perform public.fastbar_revert_item_stock(v_item.product_id, v_item.session_id, v_item.quantity);
  delete from public.fastbar_tab_items where id = p_item_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fastbar_clear_tab_items(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_item record;
  v_removed integer := 0;
begin
  select status into v_status
  from public.fastbar_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'session_not_found');
  end if;
  if v_status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'session_not_open');
  end if;

  for v_item in
    select id, product_id, session_id, quantity
    from public.fastbar_tab_items
    where session_id = p_session_id
    order by id
    for update
  loop
    perform public.fastbar_revert_item_stock(v_item.product_id, v_item.session_id, v_item.quantity);
    v_removed := v_removed + 1;
  end loop;

  delete from public.fastbar_tab_items where session_id = p_session_id;

  return jsonb_build_object('ok', true, 'removed', v_removed);
end;
$$;

create or replace function public.fastbar_cancel_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_item record;
begin
  select status into v_status
  from public.fastbar_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'session_not_found');
  end if;
  if v_status = 'paid' then
    return jsonb_build_object('ok', false, 'code', 'cannot_cancel');
  end if;

  if v_status <> 'cancelled' then
    update public.fastbar_sessions
    set status = 'cancelled',
        closed_at = coalesce(closed_at, now())
    where id = p_session_id;
  end if;

  for v_item in
    select id, product_id, session_id, quantity
    from public.fastbar_tab_items
    where session_id = p_session_id
    order by id
    for update
  loop
    perform public.fastbar_revert_item_stock(v_item.product_id, v_item.session_id, v_item.quantity);
  end loop;

  delete from public.fastbar_tab_items where session_id = p_session_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Atualiza o saldo primeiro: a inserção do movimento tem chave estrangeira para o produto, então
-- com id inexistente ela estourava antes de o código conseguir responder 'product_not_found'.
create or replace function public.fastbar_restock_product(
  p_product_id uuid,
  p_quantity integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new integer;
begin
  if coalesce(p_quantity, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
  end if;

  update public.fastbar_products
  set stock_quantity = stock_quantity + p_quantity
  where id = p_product_id
  returning stock_quantity into v_new;

  if v_new is null then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;

  insert into public.fastbar_stock_movements (product_id, quantity, movement_type, note)
  values (p_product_id, p_quantity, 'in', 'Reposição manual');

  return jsonb_build_object('ok', true, 'new_quantity', v_new);
end;
$$;
