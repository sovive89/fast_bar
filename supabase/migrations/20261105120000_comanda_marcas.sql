-- Identificação da comanda pela equipe: etiqueta curta, cor e observação.
--
-- Serve para diferenciar uma comanda da outra no balcão (ex.: "aniversário", "mesa da sinuca",
-- cor laranja) e para deixar um recado ("alérgico a amendoim", "paga só o dele").
--
-- Fica numa tabela PRÓPRIA, só do servidor, e não em colunas de fastbar_sessions, por dois motivos:
--   1. observação sobre cliente é dado sensível (CLAUDE.md, regra 5): não pode herdar as permissões
--      da tabela de comandas, que o cliente lê por outros caminhos;
--   2. identificar a comanda não toca em pedido, pagamento nem estoque — nada financeiro muda.
-- A tela do cliente nunca lê esta tabela.
create table public.fastbar_session_marks (
  session_id uuid primary key references public.fastbar_sessions(id) on delete cascade,
  tenant_id uuid references public.fastbar_tenants(id),
  label text check (label is null or length(btrim(label)) between 1 and 24),
  -- Paleta fechada: cor livre quebraria o contraste nos temas claro e escuro.
  color text check (color is null or color in
    ('vermelho','laranja','amarelo','verde','azul','roxo','rosa','cinza')),
  note text check (note is null or length(btrim(note)) between 1 and 500),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'equipe',
  -- Linha vazia não existe: quando tudo é apagado, a linha some.
  check (label is not null or color is not null or note is not null)
);

alter table public.fastbar_session_marks enable row level security;
create policy "service role full access" on public.fastbar_session_marks
  for all to service_role using (true) with check (true);
revoke all on public.fastbar_session_marks from public, anon, authenticated;
grant select, insert, update, delete on public.fastbar_session_marks to service_role;
