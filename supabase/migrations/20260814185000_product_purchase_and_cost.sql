-- Produto de revenda (cerveja em lata) é comprado e vendido como está: ele é o próprio item de
-- estoque, não precisa de um insumo espelho. Faltava a ele o que a bebida base já tinha — como é
-- comprado e quanto custou — e por isso a equipe acabava cadastrando a mesma cerveja duas vezes,
-- uma no cardápio e outra no estoque.
--
-- Nota de histórico: aplicada direto no banco de produção durante a implementação, sem o arquivo
-- de migration correspondente ter sido versionado na ocasião. Como o código já em produção lê
-- essas colunas e chama esta função, um ambiente novo montado só a partir do repositório quebraria.
-- Este arquivo reproduz exatamente o que está em produção.

alter table public.fastbar_products
  add column if not exists purchase_unit text,
  add column if not exists units_per_pack integer not null default 1,
  add column if not exists content_amount numeric not null default 1,
  add column if not exists average_cost numeric not null default 0;

alter table public.fastbar_products
  drop constraint if exists fastbar_products_units_per_pack_positive;
alter table public.fastbar_products
  add constraint fastbar_products_units_per_pack_positive check (units_per_pack > 0);

alter table public.fastbar_products
  drop constraint if exists fastbar_products_content_amount_positive;
alter table public.fastbar_products
  add constraint fastbar_products_content_amount_positive check (content_amount > 0);

-- Fornecedor e custo da compra, para o produto ter o mesmo rastro que o insumo já tem.
alter table public.fastbar_stock_movements
  add column if not exists supplier_id uuid references public.fastbar_suppliers(id),
  add column if not exists unit_cost numeric;

/**
 * Entrada de compra de um produto: soma o estoque e recalcula o custo médio, tudo numa transação.
 *
 * O custo por unidade nunca é digitado — sai do total pago dividido pelo que de fato entrou
 * (embalagens x itens por embalagem x conteúdo), pelo mesmo motivo que vale para os insumos:
 * quem digita custo unitário na mão erra, e o erro só aparece no fechamento do mês.
 */
create or replace function public.fastbar_add_product_entry(
  p_product_id uuid,
  p_packs integer,
  p_purchase_cost numeric default null,
  p_supplier_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prod record;
  v_qty integer;
  v_unit_cost numeric;
  v_new_stock integer;
begin
  if coalesce(p_packs, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
  end if;

  select id, stock_quantity, units_per_pack, content_amount, average_cost
  into v_prod
  from public.fastbar_products
  where id = p_product_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;

  v_qty := (p_packs * v_prod.units_per_pack * v_prod.content_amount)::integer;
  if v_qty <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
  end if;

  if p_purchase_cost is not null and p_purchase_cost > 0 then
    v_unit_cost := p_purchase_cost / v_qty;
  end if;

  insert into public.fastbar_stock_movements
    (product_id, quantity, movement_type, note, supplier_id, unit_cost)
  values (p_product_id, v_qty, 'in', 'Entrada de compra', p_supplier_id, v_unit_cost);

  -- Custo médio ponderado: mistura o que já havia com o que chegou, para o preço de venda poder
  -- ser conferido contra o custo real e não contra o da última compra.
  if v_unit_cost is not null then
    update public.fastbar_products
    set stock_quantity = stock_quantity + v_qty,
        average_cost = case
          when stock_quantity + v_qty <= 0 then v_unit_cost
          else ((average_cost * greatest(stock_quantity, 0)) + (v_unit_cost * v_qty))
               / (greatest(stock_quantity, 0) + v_qty)
        end
    where id = p_product_id
    returning stock_quantity into v_new_stock;
  else
    update public.fastbar_products
    set stock_quantity = stock_quantity + v_qty
    where id = p_product_id
    returning stock_quantity into v_new_stock;
  end if;

  return jsonb_build_object('ok', true, 'quantity', v_qty, 'new_stock', v_new_stock);
end;
$$;

revoke all on function public.fastbar_add_product_entry(uuid, integer, numeric, uuid) from public;
revoke all on function public.fastbar_add_product_entry(uuid, integer, numeric, uuid) from anon;
revoke all on function public.fastbar_add_product_entry(uuid, integer, numeric, uuid) from authenticated;
grant execute on function public.fastbar_add_product_entry(uuid, integer, numeric, uuid) to service_role;
