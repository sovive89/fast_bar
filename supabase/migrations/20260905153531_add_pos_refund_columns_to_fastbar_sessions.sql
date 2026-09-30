-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

alter table fastbar_sessions
  add column if not exists pos_paid_order_id text,
  add column if not exists pos_refunded_at timestamptz;
