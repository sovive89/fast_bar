-- Pedido de conta pelo celular (P2 do CLAUDE.md): o cliente toca em "Pedir a conta" na própria
-- comanda e a equipe é avisada no caixa. O pedido SÓ AVISA — não fecha a comanda: quem fecha é a
-- equipe, pelo fluxo normal, para um toque sem querer não impedir o cliente de pedir mais uma
-- bebida.
--
-- Estados: 'pedida' (acabou de chegar) → 'em_atendimento' (a equipe assumiu) → 'concluida'.
-- Cada mudança fica registrada com horário e quem fez, para ter trilha de quanto a equipe demorou.
create table if not exists public.fastbar_bill_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  -- on delete cascade: o pedido não tem sentido sem a comanda.
  session_id uuid not null references public.fastbar_sessions(id) on delete cascade,
  status text not null default 'pedida' check (status in ('pedida', 'em_atendimento', 'concluida')),
  created_at timestamptz not null default now(),
  attended_at timestamptz,
  attended_by text,
  completed_at timestamptz,
  completed_by text
);

-- No máximo UM pedido ativo por comanda: o cliente que toca duas vezes não gera dois alertas.
create unique index if not exists fastbar_bill_requests_one_active_per_session
  on public.fastbar_bill_requests (session_id)
  where status in ('pedida', 'em_atendimento');

create index if not exists fastbar_bill_requests_active_idx
  on public.fastbar_bill_requests (created_at)
  where status in ('pedida', 'em_atendimento');

alter table public.fastbar_bill_requests enable row level security;
create policy "service role full access" on public.fastbar_bill_requests
  for all to service_role using (true) with check (true);
revoke all on public.fastbar_bill_requests from anon, authenticated;
