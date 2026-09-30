-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

create table if not exists public.fastbar_integrations (
  key text primary key check (key in ('whatsapp', 'pdv', 'printer', 'branding')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.fastbar_integrations enable row level security;

revoke all on public.fastbar_integrations from anon, authenticated;
grant select, insert, update on public.fastbar_integrations to service_role;

-- Semeia as 4 linhas fixas (uma por integração conhecida) pra sempre existir uma pra dar upsert/update.
insert into public.fastbar_integrations (key, enabled, config)
values
  ('whatsapp', false, '{}'::jsonb),
  ('pdv', false, '{}'::jsonb),
  ('printer', false, '{}'::jsonb),
  ('branding', true, '{}'::jsonb)
on conflict (key) do nothing;
