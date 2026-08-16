-- Exclusão definitiva do produto do cardápio. O número de estoque nunca bloqueia — a trava real é
-- ter histórico de verdade: movimento de estoque ou lançamento numa comanda. Isso protege
-- faturamento e relatórios de sumirem, mas deixa apagar de vez um cadastro feito por engano (ex.:
-- o produto "DOSES" criado quando "nova categoria" e "novo produto" ainda eram o mesmo formulário)
-- mesmo que o campo stock_quantity dele não esteja zerado.
create or replace function public.fastbar_delete_product(p_product_id uuid)
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
  select count(*) into v_movements
  from public.fastbar_stock_movements where product_id = p_product_id;
  select count(*) into v_tab_items
  from public.fastbar_tab_items where product_id = p_product_id;

  if v_movements > 0 or v_tab_items > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_history');
  end if;

  -- A ficha técnica é configuração, não histórico: apagar o produto some com a ficha junto, sem
  -- perda real (nenhuma venda passou por ela, já que não há tab_items).
  delete from public.fastbar_recipe_items where product_id = p_product_id;

  delete from public.fastbar_products where id = p_product_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'product_not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fastbar_delete_product(uuid) from public;
revoke all on function public.fastbar_delete_product(uuid) from anon;
revoke all on function public.fastbar_delete_product(uuid) from authenticated;
grant execute on function public.fastbar_delete_product(uuid) to service_role;
