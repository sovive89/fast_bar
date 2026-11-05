-- Preparação para multi-tenant e unidades. NADA é aplicado agora: o piloto segue como está, com a
-- mesma senha da equipe. As colunas abaixo ficam vazias até o produto cobrar mensalidade e ter
-- mais de uma unidade por empresa.
create table public.fastbar_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fastbar_tenants(id),
  name text not null check (length(trim(name)) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index fastbar_units_name_unique on public.fastbar_units(tenant_id, lower(trim(name)));
alter table public.fastbar_units enable row level security;
create policy units_server_only on public.fastbar_units for all to service_role using (true) with check (true);
revoke all on public.fastbar_units from public, anon, authenticated;
grant select, insert, update, delete on public.fastbar_units to service_role;

-- Unidade do funcionário e do login (nula = empresa inteira / unidade única).
alter table public.fastbar_staff_users add column if not exists unit_id uuid references public.fastbar_units(id);
alter table public.fastbar_staff_logins add column if not exists unit_id uuid references public.fastbar_units(id);

-- Fim da vigência paga do tenant (nulo = sem vencimento, como no piloto). A regra "vencida, não
-- acessa" ainda NÃO existe: só o campo, para ligar depois sem nova migration estrutural.
alter table public.fastbar_tenants add column if not exists valid_until timestamptz;
