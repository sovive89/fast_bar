-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

alter table public.fastbar_integrations drop constraint if exists fastbar_integrations_key_check;

delete from public.fastbar_integrations where key = 'pdv';

alter table public.fastbar_integrations add constraint fastbar_integrations_key_check
  check (key in ('whatsapp', 'instagram', 'mercado_pago', 'twilio', 'printer', 'branding'));

insert into public.fastbar_integrations (key, enabled, config)
values
  ('whatsapp', false, '{}'::jsonb),
  ('instagram', false, '{}'::jsonb),
  ('mercado_pago', false, '{}'::jsonb),
  ('twilio', false, '{}'::jsonb)
on conflict (key) do nothing;
