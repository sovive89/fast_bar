-- Crédito pré-pago da comanda (item 3 do roadmap, P2 do CLAUDE.md): o atendente recebe um valor
-- adiantado e o cliente consome esse saldo conforme pede. O crédito pertence à COMANDA (não ao
-- cliente), então reabrir a comanda recupera o saldo sem nenhuma operação extra.
--
-- Esta tabela guarda só as ENTRADAS de crédito (dinheiro que o cliente adiantou). O consumo não é
-- gravado: é sempre derivado dos itens — crédito usado = menor entre o crédito recebido e o total
-- da comanda. Assim, lançar um item reduz o saldo na hora, e remover/desfazer um item devolve o
-- crédito sozinho, sem tocar nas funções de lançamento/estoque.
create table if not exists public.fastbar_session_credits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  -- on delete set null: é registro financeiro e não some junto com a comanda.
  session_id uuid references public.fastbar_sessions(id) on delete set null,
  operacao_id uuid references public.fastbar_operations(id),
  amount numeric not null check (amount > 0),
  method text not null check (method in ('dinheiro', 'cartao', 'pix', 'maquininha')),
  realizado_por text not null default 'equipe',
  created_at timestamptz not null default now()
);

create index if not exists fastbar_session_credits_session_id_idx
  on public.fastbar_session_credits (session_id);

alter table public.fastbar_session_credits enable row level security;
create policy "service role full access" on public.fastbar_session_credits
  for all to service_role using (true) with check (true);
revoke all on public.fastbar_session_credits from anon, authenticated;
