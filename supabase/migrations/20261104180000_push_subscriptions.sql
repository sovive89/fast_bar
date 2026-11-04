-- Notificação push da equipe (pedido de conta e, depois, alerta de apoio): cada celular/navegador da
-- equipe que ativa as notificações vira uma linha aqui. O endereço (endpoint) e as chaves são o que
-- o servidor precisa para mandar um aviso para aquele aparelho — por isso a tabela é só do servidor
-- (service_role) e nunca legível pela chave pública.
--
-- Quem se inscreve passou pela senha do caixa (a inscrição só é aceita por assertRegisterAccess).
-- O aparelho que o navegador/Apple/Google declara inválido (404/410) é apagado no próprio envio.
create table if not exists public.fastbar_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.fastbar_push_subscriptions enable row level security;
create policy "service role full access" on public.fastbar_push_subscriptions
  for all to service_role using (true) with check (true);
revoke all on public.fastbar_push_subscriptions from anon, authenticated;
