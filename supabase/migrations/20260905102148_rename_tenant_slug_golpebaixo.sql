-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

update public.fastbar_tenants set slug = 'golpebaixo' where slug = 'golpe-baixo';

create or replace function public.fastbar_default_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.fastbar_tenants where slug = 'golpebaixo' limit 1;
$$;
