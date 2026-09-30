-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Abre a estrutura do banco pra multi-tenant (SaaS): cada bar vira um "tenant" isolado por
-- tenant_id em toda tabela de dados do FastBar. O bar atual (Golpe Baixo) vira o tenant #1 —
-- nada muda pro usuário, os dados existentes só ganham o tenant_id preenchido.

create table if not exists public.fastbar_tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'trial')),
  created_at timestamptz not null default now()
);

alter table public.fastbar_tenants enable row level security;
revoke all on public.fastbar_tenants from anon, authenticated;
grant select, insert, update on public.fastbar_tenants to service_role;

-- Tenant #1: o bar atual, dono de todos os dados que já existem.
insert into public.fastbar_tenants (slug, name)
values ('golpe-baixo', 'Golpe Baixo')
on conflict (slug) do nothing;

-- Adiciona tenant_id (nullable), preenche com o tenant #1 em todas as linhas existentes, e só
-- depois torna obrigatório + com FK + índice — assim nenhuma tabela fica um instante sequer sem
-- dono em produção.
do $$
declare
  v_tenant_id uuid;
  v_table text;
  v_tables text[] := array[
    'fastbar_products',
    'fastbar_sessions',
    'fastbar_tab_items',
    'fastbar_customers',
    'fastbar_stock_movements',
    'fastbar_suppliers',
    'fastbar_base_drinks',
    'fastbar_base_drink_movements',
    'fastbar_drink_ingredients',
    'fastbar_drink_ingredient_movements',
    'fastbar_recipe_items',
    'fastbar_product_categories',
    'fastbar_notas_importadas',
    'fastbar_supply_item_aliases',
    'fastbar_stock_lots',
    'fastbar_integrations'
  ];
begin
  select id into v_tenant_id from public.fastbar_tenants where slug = 'golpe-baixo';

  foreach v_table in array v_tables loop
    execute format('alter table public.%I add column if not exists tenant_id uuid', v_table);
    execute format('update public.%I set tenant_id = $1 where tenant_id is null', v_table) using v_tenant_id;
    execute format('alter table public.%I alter column tenant_id set not null', v_table);
    execute format(
      'alter table public.%I add constraint %I foreign key (tenant_id) references public.fastbar_tenants(id)',
      v_table, v_table || '_tenant_id_fkey'
    );
    execute format('create index if not exists %I on public.%I (tenant_id)', 'idx_' || v_table || '_tenant_id', v_table);
  end loop;
end $$;
