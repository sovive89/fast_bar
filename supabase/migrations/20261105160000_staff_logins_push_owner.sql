-- Registro de logins da equipe (quem entrou, quando, e se foi pela Wi-Fi do bar) e dono do aparelho
-- de push, para avisar só os administradores. O IP em si NÃO é guardado: só "na rede do bar" sim/não.
create table public.fastbar_staff_logins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fastbar_tenants(id),
  staff_id uuid not null references public.fastbar_staff_users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  -- true/false: comparado com a rede do bar cadastrada; null: rede do bar ainda não cadastrada.
  on_bar_network boolean
);
create index fastbar_staff_logins_recent on public.fastbar_staff_logins(tenant_id, logged_at desc);
create index fastbar_staff_logins_staff on public.fastbar_staff_logins(staff_id, logged_at desc);
alter table public.fastbar_staff_logins enable row level security;
create policy staff_logins_server_only on public.fastbar_staff_logins for all to service_role using (true) with check (true);
revoke all on public.fastbar_staff_logins from public, anon, authenticated;
grant select, insert, update, delete on public.fastbar_staff_logins to service_role;

alter table public.fastbar_push_subscriptions
  add column if not exists staff_id uuid references public.fastbar_staff_users(id) on delete set null;
create index if not exists fastbar_push_subscriptions_staff on public.fastbar_push_subscriptions(staff_id);
