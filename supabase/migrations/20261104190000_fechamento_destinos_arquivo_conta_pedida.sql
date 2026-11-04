-- Fechamento de operação com seleção em massa (decisão do dono em 04/11/2026, ver docs/DECISOES.md):
-- os destinos passam a ser cinco, cada um com um sentido só.
--
--   arquivo        comanda SEM saldo devido vai para o Histórico (a aplicação recusa se ainda deve)
--   cortesia       comanda com saldo que o bar decide não cobrar (motivo obrigatório)
--   inadimplencia  comanda com saldo que o cliente paga depois; reabre quando ele voltar
--   conta_pedida   ação parcial: fecha a conta (aguardando pagamento) e volta nos próximos fechamentos
--   mantida_aberta comanda desta operação que continua em uso
--
-- Só amplia o que já existia: os três destinos antigos continuam valendo do mesmo jeito, e nenhuma
-- linha já gravada deixa de passar nas regras novas.

alter table public.fastbar_operation_closures
  drop constraint if exists fastbar_operation_closures_destino_check;
alter table public.fastbar_operation_closures
  add constraint fastbar_operation_closures_destino_check
  check (destino in ('arquivo', 'cortesia', 'inadimplencia', 'conta_pedida', 'mantida_aberta'));

-- Motivo continua obrigatório onde há dinheiro em jogo (perdoar ou deixar dívida). Arquivo só
-- aceita comanda quitada e conta pedida não perdoa nada, então não pedem motivo.
alter table public.fastbar_operation_closures
  drop constraint if exists fastbar_operation_closures_motivo_required;
alter table public.fastbar_operation_closures
  add constraint fastbar_operation_closures_motivo_required
  check (
    destino not in ('cortesia', 'inadimplencia')
    or (motivo is not null and length(trim(motivo)) >= 5)
  );

-- Reabertura de comanda inadimplente quando o cliente volta (pelo QR ou pela equipe). Uma linha por
-- reabertura: é a trilha de auditoria da regra "reabrir não pode apagar a dívida" — a comanda volta
-- com os itens e o livro de pagamentos intactos, e aqui fica quando, em qual operação, por quem e
-- quanto ela devia na hora.
create table if not exists public.fastbar_session_reopenings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  session_id uuid references public.fastbar_sessions(id) on delete set null,
  operacao_id uuid references public.fastbar_operations(id),
  status_anterior text not null,
  saldo numeric not null,
  motivo text not null,
  realizado_por text not null default 'equipe',
  created_at timestamptz not null default now()
);

create index if not exists fastbar_session_reopenings_session_id_idx
  on public.fastbar_session_reopenings (session_id);

alter table public.fastbar_session_reopenings enable row level security;
create policy "service role full access" on public.fastbar_session_reopenings
  for all to service_role using (true) with check (true);
revoke all on public.fastbar_session_reopenings from anon, authenticated;
