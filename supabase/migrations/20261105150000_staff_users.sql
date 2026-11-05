-- Equipe com usuário próprio (admin, atendimento, cozinha, freelancer). Dados pessoais só no
-- servidor (RLS service_role). A senha é guardada só como hash (scrypt); CPF/e-mail/telefone só
-- aparecem para o admin. A senha única da equipe continua valendo durante a transição.
create table public.fastbar_staff_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fastbar_tenants(id),
  role text not null check (role in ('admin','atendimento','cozinha','freelancer')),
  status text not null default 'pendente' check (status in ('pendente','ativo','inativo')),
  full_name text not null check (length(trim(full_name)) between 5 and 80),
  cpf text not null check (cpf ~ '^[0-9]{11}$'),
  email text not null check (length(email) <= 120 and email = lower(email)),
  phone text not null check (phone ~ '^[0-9]{10,11}$'),
  password_hash text not null,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.fastbar_staff_users(id),
  last_login_at timestamptz,
  check (status <> 'ativo' or approved_at is not null)
);
create unique index fastbar_staff_cpf_unique on public.fastbar_staff_users(tenant_id, cpf);
create unique index fastbar_staff_email_unique on public.fastbar_staff_users(tenant_id, email);
create index fastbar_staff_status on public.fastbar_staff_users(tenant_id, status, created_at);

-- Trilha de auditoria sem dados pessoais: quem fez o quê e quando.
create table public.fastbar_staff_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fastbar_tenants(id),
  actor text not null check (length(actor) between 1 and 80),
  action text not null check (action in ('cadastro','aprovacao','desativacao','reativacao','login_bloqueado')),
  target_id uuid,
  created_at timestamptz not null default now()
);
create index fastbar_staff_audit_tenant on public.fastbar_staff_audit(tenant_id, created_at desc);

alter table public.fastbar_staff_users enable row level security;
alter table public.fastbar_staff_audit enable row level security;
create policy staff_users_server_only on public.fastbar_staff_users for all to service_role using (true) with check (true);
create policy staff_audit_server_only on public.fastbar_staff_audit for all to service_role using (true) with check (true);
revoke all on public.fastbar_staff_users, public.fastbar_staff_audit from public, anon, authenticated;
grant select, insert, update, delete on public.fastbar_staff_users, public.fastbar_staff_audit to service_role;
