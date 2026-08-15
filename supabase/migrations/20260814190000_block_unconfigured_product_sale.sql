-- Bloqueia a venda de item sem origem de estoque configurada: ou tem ficha técnica, ou já recebeu
-- ao menos uma entrada de estoque registrada. Implementa a seção 15 da spec de integração
-- Cardápio/Estoque/Ficha Técnica — item não parametrizado não pode gerar baixa automática.
--
-- A checagem vive aqui, e não na tela, porque esta função é o único caminho que insere item na
-- comanda; validar só na UI seria contornável.
--
-- Nota de histórico: esta alteração foi aplicada direto no banco de produção junto com o commit
-- 9c5d3d8 (que trouxe o aviso visual no Cardápio), mas o arquivo de migration correspondente não
-- foi versionado na ocasião. O repositório ficou sem registro de uma mudança que já estava no ar.
-- Este arquivo fecha essa lacuna e reproduz exatamente a definição que está em produção, para que
-- um ambiente novo chegue ao mesmo estado.
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
  v_configured boolean;
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

  select
    exists(select 1 from public.fastbar_recipe_items where product_id = p_product_id)
    or exists(select 1 from public.fastbar_stock_movements where product_id = p_product_id)
  into v_configured;

  if not v_configured then
    return jsonb_build_object('ok', false, 'code', 'product_not_configured');
  end if;

  insert into public.fastbar_tab_items (session_id, product_id, name, unit_price, quantity)
  values (p_session_id, p_product_id, v_name, v_price, 1);

  perform public.fastbar_apply_sale_stock(p_product_id, p_session_id, 1);

  return jsonb_build_object('ok', true);
end;
$$;
