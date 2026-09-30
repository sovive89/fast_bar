-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

alter table fastbar_sessions
  add column verification_code text,
  add column verification_code_expires_at timestamptz,
  add column verification_attempts integer not null default 0;

alter table fastbar_sessions drop constraint fastbar_sessions_status_check;
alter table fastbar_sessions add constraint fastbar_sessions_status_check
  check (status = any (array['unverified','pending','open','closed','paid','cancelled']));
