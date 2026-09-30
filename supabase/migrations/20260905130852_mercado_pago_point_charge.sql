-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

alter table fastbar_sessions
  add column if not exists pos_order_id text,
  add column if not exists pos_requested_at timestamptz,
  add column if not exists pos_amount numeric(10,2);

comment on column fastbar_sessions.pos_order_id is 'ID do pedido (order) criado no Mercado Pago Point enquanto aguarda pagamento na maquininha; null quando não há cobrança em andamento.';
comment on column fastbar_sessions.pos_requested_at is 'Quando a cobrança foi enviada pra maquininha.';
comment on column fastbar_sessions.pos_amount is 'Valor enviado pra maquininha nessa cobrança (referência/auditoria).';

create index if not exists fastbar_sessions_pos_order_id_idx on fastbar_sessions (pos_order_id) where pos_order_id is not null;
