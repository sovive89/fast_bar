-- Crédito pela maquininha (item 3 do roadmap): a mesma cobrança do Mercado Pago Point agora pode
-- ter dois propósitos — pagar a comanda (o que sempre foi) ou adicionar CRÉDITO a ela.
-- pos_purpose diz qual: nulo/'pagamento' = quitar a conta; 'credito' = entrada de crédito.
alter table public.fastbar_sessions
  add column if not exists pos_purpose text
  check (pos_purpose is null or pos_purpose in ('pagamento', 'credito'));

comment on column public.fastbar_sessions.pos_purpose is
  'Propósito da cobrança em andamento na maquininha (pos_order_id): pagamento ou credito.';

-- Qual pedido do Mercado Pago gerou esta entrada de crédito. O índice único impede que um webhook
-- duplicado (ou o botão "Verificar agora" junto com o webhook) credite o mesmo pagamento duas vezes.
alter table public.fastbar_session_credits add column if not exists pos_order_id text;
create unique index if not exists fastbar_session_credits_pos_order_id_key
  on public.fastbar_session_credits (pos_order_id) where pos_order_id is not null;
