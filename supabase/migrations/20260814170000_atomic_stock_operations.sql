-- Move as operações de estoque para dentro do banco, onde elas podem ser atômicas.
--
-- O motivo: em TypeScript, "ler o estoque, somar, gravar" perde atualizações quando dois pedidos
-- acontecem juntos — os dois leem 10, os dois gravam 12, e uma das baixas some. Isso já acontece
-- hoje em produção no caminho de venda, não só no de estorno. E encadear vários passos (apagar
-- item, devolver produto, devolver componentes da ficha técnica) sem transação deixa o estoque
-- pela metade se qualquer passo falhar no meio.
--
-- Cada função abaixo roda como uma transação única: ou tudo acontece, ou nada acontece. E toda
-- alteração de saldo usa `set x = x + n`, que o Postgres resolve sem intervalo entre ler e gravar.
--
-- Uma correção junto: o código atual grava reason = 'cancelamento' nos movimentos de bebida base e
-- ingrediente, mas o CHECK da coluna só aceita ('compra','venda','ajuste','perda'). Todo estorno de
-- produto com ficha técnica falhava por isso. Aqui o valor passa a ser 'ajuste'.

-- ---------------------------------------------------------------------------
-- Helpers de saldo (usados pelas funções públicas abaixo)
-- ---------------------------------------------------------------------------

/**
 * Devolve ao estoque o que um lançamento consumiu: o próprio produto e, se ele tiver ficha
 * técnica, cada bebida base e ingrediente da receita.
 */
create or replace function public.fastbar_revert_item_stock(
  p_product_id uuid,
  p_session_id uuid,
  p_quantity integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_amount numeric;
begin
  if p_product_id is null or coalesce(p_quantity, 0) <= 0 then
    return;
  end if;

  insert into public.fastbar_stock_movements (product_id, session_id, quantity, movement_type, note)
  values (p_product_id, p_session_id, p_quantity, 'in', 'Cancelamento de lançamento');

  update public.fastbar_products
  set stock_quantity = stock_quantity + p_quantity
  where id = p_product_id;

  -- Ordem fixa (bebidas base antes de ingredientes, por id) para que duas transações concorrentes
  -- travem as mesmas linhas na mesma sequência e não fiquem esperando uma pela outra.
  for r in
    select base_drink_id, ingredient_id, quantity
    from public.fastbar_recipe_items
    where product_id = p_product_id
    order by base_drink_id nulls last, ingredient_id nulls last
  loop
    v_amount := r.quantity * p_quantity;
    if v_amount <= 0 then
      continue; -- o CHECK dos movimentos exige quantidade positiva
    end if;

    if r.base_drink_id is not null then
      insert into public.fastbar_base_drink_movements (base_drink_id, type, quantity, reason, note)
      values (r.base_drink_id, 'entrada', v_amount, 'ajuste', 'Estorno por cancelamento de lançamento');

      update public.fastbar_base_drinks
      set current_stock = current_stock + v_amount
      where id = r.base_drink_id;

    elsif r.ingredient_id is not null then
      insert into public.fastbar_drink_ingredient_movements (ingredient_id, type, quantity, reason, note)
      values (r.ingredient_id, 'entrada', v_amount, 'ajuste', 'Estorno por cancelamento de lançamento');

      update public.fastbar_drink_ingredients
      set current_stock = current_stock + v_amount
      where id = r.ingredient_id;
    end if;
  end loop;
end;
$$;

/**
 * Baixa de estoque por venda: o inverso de fastbar_revert_item_stock.
 *
 * Sem trava em zero, de propósito: vender além do estoque físico deixa o saldo negativo e visível
 * para a equipe corrigir, em vez de esconder quanto saiu a mais. O estorno depois soma de volta
 * exatamente o que este lançamento tirou.
 */
create or replace function public.fastbar_apply_sale_stock(
  p_product_id uuid,
  p_session_id uuid,
  p_quantity integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_amount numeric;
begin
  if p_product_id is null or coalesce(p_quantity, 0) <= 0 then
    return;
  end if;

  insert into public.fastbar_stock_movements (product_id, session_id, quantity, movement_type, note)
  values (p_product_id, p_session_id, p_quantity, 'out', 'Lançamento na comanda');

  update public.fastbar_products
  set stock_quantity = stock_quantity - p_quantity
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
      values (r.base_drink_id, 'saida', v_amount, 'venda', 'Baixa automática por venda');

      update public.fastbar_base_drinks
      set current_stock = current_stock - v_amount
      where id = r.base_drink_id;

    elsif r.ingredient_id is not null then
      insert into public.fastbar_drink_ingredient_movements (ingredient_id, type, quantity, reason, note)
      values (r.ingredient_id, 'saida', v_amount, 'venda', 'Baixa automática por venda');

      update public.fastbar_drink_ingredients
      set current_stock = current_stock - v_amount
      where id = r.ingredient_id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operações da comanda
-- ---------------------------------------------------------------------------

/**
 * Lança um produto na comanda e dá a baixa de estoque no mesmo movimento.
 *
 * A trava na comanda é o que impede um lançamento de entrar depois que um cancelamento já
 * contou os itens: a inserção espera o cancelamento terminar e então vê a comanda fechada.
 */
create or replace function public.fastbar_add_tab_item(
  p_session_id uuid,
  p_product_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_name text;
  v_price numeric;
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

  select name, price into v_name, v_price
  from public.fastbar_products
  where id = p_product_id and is_active = true;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'product_unavailable');
  end if;

  insert into public.fastbar_tab_items (session_id, product_id, name, unit_price, quantity)
  values (p_session_id, p_product_id, v_name, v_price, 1);

  perform public.fastbar_apply_sale_stock(p_product_id, p_session_id, 1);

  return jsonb_build_object('ok', true);
end;
$$;

/** Cancela um lançamento e devolve o estoque, os dois ou nenhum. */
create or replace function public.fastbar_remove_tab_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_status text;
begin
  select id, product_id, session_id, quantity
  into v_item
  from public.fastbar_tab_items
  where id = p_item_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'item_not_found');
  end if;

  select status into v_status
  from public.fastbar_sessions
  where id = v_item.session_id;

  if v_status is distinct from 'open' then
    return jsonb_build_object('ok', false, 'code', 'session_not_open');
  end if;

  perform public.fastbar_revert_item_stock(v_item.product_id, v_item.session_id, v_item.quantity);
  delete from public.fastbar_tab_items where id = p_item_id;

  return jsonb_build_object('ok', true);
end;
$$;

/** Desfaz o último lançamento da comanda. */
create or replace function public.fastbar_undo_last_tab_item(p_session_id uuid)
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
  if v_status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'session_not_open');
  end if;

  select id, product_id, session_id, quantity
  into v_item
  from public.fastbar_tab_items
  where session_id = p_session_id
  order by added_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_items');
  end if;

  perform public.fastbar_revert_item_stock(v_item.product_id, v_item.session_id, v_item.quantity);
  delete from public.fastbar_tab_items where id = v_item.id;

  return jsonb_build_object('ok', true);
end;
$$;

/** Zera os lançamentos de uma comanda aberta, devolvendo tudo ao estoque. */
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
  loop
    perform public.fastbar_revert_item_stock(v_item.product_id, v_item.session_id, v_item.quantity);
    v_removed := v_removed + 1;
  end loop;

  delete from public.fastbar_tab_items where session_id = p_session_id;

  return jsonb_build_object('ok', true, 'removed', v_removed);
end;
$$;

/**
 * Cancela a comanda inteira: marca como cancelada e devolve ao estoque tudo que foi lançado.
 *
 * Comanda cancelada nunca vira 'paid', então nunca entra no faturamento. A trava na linha da
 * comanda impede que um pagamento entre no meio do cancelamento — ele espera e, ao seguir, não
 * encontra mais uma comanda pagável.
 */
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

  -- Já cancelada não é erro: é um cancelamento anterior que não terminou de estornar. Como tudo
  -- acontece numa transação só, isso na prática não deve sobrar — mas repetir continua seguro.
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
  loop
    perform public.fastbar_revert_item_stock(v_item.product_id, v_item.session_id, v_item.quantity);
  end loop;

  delete from public.fastbar_tab_items where session_id = p_session_id;

  return jsonb_build_object('ok', true);
end;
$$;

/** Reposição manual de estoque de um produto, sem intervalo entre ler e gravar o saldo. */
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

  insert into public.fastbar_stock_movements (product_id, quantity, movement_type, note)
  values (p_product_id, p_quantity, 'in', 'Reposição manual');

  update public.fastbar_products
  set stock_quantity = stock_quantity + p_quantity
  where id = p_product_id
  returning stock_quantity into v_new;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;

  return jsonb_build_object('ok', true, 'new_quantity', v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: estas funções mexem em estoque e ignoram RLS (security definer),
-- então só o backend pode chamá-las — nunca o cliente com chave anônima.
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.fastbar_revert_item_stock(uuid, uuid, integer)',
    'public.fastbar_apply_sale_stock(uuid, uuid, integer)',
    'public.fastbar_add_tab_item(uuid, uuid)',
    'public.fastbar_remove_tab_item(uuid)',
    'public.fastbar_undo_last_tab_item(uuid)',
    'public.fastbar_clear_tab_items(uuid)',
    'public.fastbar_cancel_session(uuid)',
    'public.fastbar_restock_product(uuid, integer)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
