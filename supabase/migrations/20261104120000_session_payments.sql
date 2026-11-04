-- Livro de pagamentos da comanda (item 3 do roadmap, "pagamento parcial"): até aqui a comanda só
-- sabia "paga" ou "não paga" (fastbar_sessions.status + payment_method), sem registrar QUANTO
-- entrou. Cada recebimento agora vira uma linha aqui; o saldo da comanda é sempre
-- total dos itens (com desconto e taxa) menos a soma destas linhas — nunca um número guardado
-- que possa sair de sincronia.
--
-- Pagamento parcial NÃO é desconto: o que faltou continua sendo dívida (a comanda vai para
-- 'inadimplente' e o saldo segue calculável). Reabrir a comanda não apaga estas linhas, então
-- reabrir também não apaga a dívida.
create table if not exists public.fastbar_session_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  -- on delete set null: o recebimento é registro financeiro e não some junto com a comanda.
  session_id uuid references public.fastbar_sessions(id) on delete set null,
  operacao_id uuid references public.fastbar_operations(id),
  amount numeric not null check (amount > 0),
  method text not null check (method in ('dinheiro', 'cartao', 'pix', 'maquininha')),
  -- Saldo que sobrou logo depois deste recebimento (0 = quitou). Congelado aqui para a auditoria
  -- não depender de recalcular itens que podem mudar depois.
  saldo_apos numeric not null check (saldo_apos >= 0),
  -- Obrigatório quando o recebimento deixa saldo (pagamento parcial): quem autorizou e por quê.
  motivo text,
  realizado_por text not null default 'equipe',
  created_at timestamptz not null default now(),
  constraint fastbar_session_payments_motivo_required
    check (saldo_apos = 0 or (motivo is not null and length(trim(motivo)) >= 5))
);

create index if not exists fastbar_session_payments_session_id_idx
  on public.fastbar_session_payments (session_id);

alter table public.fastbar_session_payments enable row level security;
create policy "service role full access" on public.fastbar_session_payments
  for all to service_role using (true) with check (true);
revoke all on public.fastbar_session_payments from anon, authenticated;
