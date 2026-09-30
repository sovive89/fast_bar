-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.


create table if not exists fastbar_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  data_operacional date not null,
  inicio_operacional timestamptz not null,
  fim_operacional timestamptz,
  status text not null default 'ABERTA' check (status in ('ABERTA','FECHADA')),
  aberto_em timestamptz not null default now(),
  aberto_por text not null default 'equipe',
  fechado_em timestamptz,
  fechado_por text,
  created_at timestamptz not null default now()
);

-- Nunca duas operações abertas ao mesmo tempo pro mesmo tenant (partial unique index — só entre
-- as linhas ABERTA; depois de FECHADA a mesma data_operacional pode, em tese, voltar a existir
-- numa reabertura futura sem violar nada).
create unique index if not exists fastbar_operations_one_open_per_tenant
  on fastbar_operations (tenant_id)
  where status = 'ABERTA';

alter table fastbar_operations enable row level security;
create policy "service role full access" on fastbar_operations for all using (true) with check (true);

-- Comanda carrega a qual operação pertence (definida no momento em que é aberta) e a data
-- operacional correspondente, pra relatórios não dependerem de DATE(created_at)/paid_at.
alter table fastbar_sessions add column if not exists operacao_id uuid references fastbar_operations(id);
alter table fastbar_sessions add column if not exists data_operacional date;

create index if not exists fastbar_sessions_operacao_id_idx on fastbar_sessions (operacao_id);
create index if not exists fastbar_sessions_data_operacional_idx on fastbar_sessions (data_operacional);
