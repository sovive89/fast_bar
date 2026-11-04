-- Fechamento de operação (P1.5-6 do CLAUDE.md / seção 3.4 da documentação funcional): antes de
-- encerrar a operação, toda comanda ainda em aberto (ou fechada aguardando pagamento) precisa
-- receber um destino — cortesia, inadimplência, ou manter aberta — com senha e, exceto para
-- "manter aberta", motivo obrigatório. "Não é possível terminar o fluxo sem revisar as comandas
-- abertas": é a aplicação (closeOperationWithReview, em operation-closure.server.ts) que recusa
-- fechar a operação enquanto sobrar alguma sem essa revisão — o banco só guarda o resultado.

-- Dois status novos em fastbar_sessions: 'cortesia' (fechada sem cobrança, motivo registrado) e
-- 'inadimplente' (fechada com saldo que ficou sem pagar — "área separada" de comandas abertas e do
-- histórico comum). Mesmo padrão da migration que adicionou 'cancelled': dropa e recria o
-- constraint com a lista completa.
alter table public.fastbar_sessions drop constraint if exists fastbar_sessions_status_check;
alter table public.fastbar_sessions add constraint fastbar_sessions_status_check
  check (status = any (array[
    'unverified', 'pending', 'open', 'closed', 'paid', 'cancelled', 'cortesia', 'inadimplente'
  ]));

-- Uma linha por comanda revisada no fechamento de uma operação — é a trilha de auditoria que o
-- CLAUDE.md pede ("cortesia, inadimplência e manutenção em aberto deixam evidência auditável") e
-- também é o que diz pra UI (e pro gate de fechar a operação) que aquela comanda já foi revisada:
-- "mantida_aberta" não muda o status da comanda, só grava que ela passou pela revisão desta
-- operação — sem essa linha, a comanda voltaria a aparecer pedindo destino de novo a cada reload.
create table if not exists public.fastbar_operation_closures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  operacao_id uuid not null references public.fastbar_operations(id),
  -- on delete set null + nome congelado: apagar uma comanda (se um dia existir essa ação) nunca
  -- pode apagar o histórico de que ela foi revisada no fechamento — mesmo padrão já usado na
  -- conferência de estoque (fastbar_stock_count_items.product_id).
  session_id uuid references public.fastbar_sessions(id) on delete set null,
  session_customer_name text not null,
  destino text not null check (destino in ('cortesia', 'inadimplencia', 'mantida_aberta')),
  motivo text,
  -- Valor perdoado (cortesia) ou saldo que ficou em aberto (inadimplência), no momento da decisão.
  -- Nulo para "mantida_aberta" (nada foi cobrado nem perdoado, a comanda segue como estava).
  valor numeric,
  realizado_por text not null default 'equipe',
  created_at timestamptz not null default now(),
  constraint fastbar_operation_closures_motivo_required
    check (destino = 'mantida_aberta' or (motivo is not null and length(trim(motivo)) >= 5))
);

-- Uma comanda não pode ser revisada duas vezes na mesma operação (o gate de fechamento depende
-- disso: existe linha = já foi revisada).
create unique index if not exists fastbar_operation_closures_operacao_session_key
  on public.fastbar_operation_closures (operacao_id, session_id)
  where session_id is not null;

create index if not exists fastbar_operation_closures_operacao_id_idx
  on public.fastbar_operation_closures (operacao_id);

alter table public.fastbar_operation_closures enable row level security;
-- "to service_role" + revoke, não uma policy aberta — mesma correção que fastbar_stock_counts e
-- fastbar_operations já tiveram (achado do github-advanced-security no PR #48).
create policy "service role full access" on public.fastbar_operation_closures
  for all to service_role using (true) with check (true);
revoke all on public.fastbar_operation_closures from anon, authenticated;
