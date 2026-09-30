-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

insert into storage.buckets (id, name, public)
values ('fastbar-branding', 'fastbar-branding', true)
on conflict (id) do nothing;
