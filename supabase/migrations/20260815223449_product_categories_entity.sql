-- Categoria vira uma entidade própria, com cadastro que só pede nome — separado do formulário de
-- produto. Antes, "criar categoria" era um campo de texto dentro do formulário de produto: dava
-- pra confundir as duas coisas e acabar criando um produto vazio (nome=categoria, preço R$0) só
-- pra registrar uma divisão nova.
create table if not exists public.fastbar_product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.fastbar_product_categories enable row level security;

-- Mesmo padrão de leitura/escrita das outras tabelas do domínio do caixa: acesso só via service
-- role (as server functions já ficam atrás de assertRegisterAccess).
drop policy if exists "service role only" on public.fastbar_product_categories;
create policy "service role only" on public.fastbar_product_categories
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Popula com as categorias que já existem em produtos cadastrados, pra ninguém perder o que já
-- estava em uso. Dedupe por lower(name): esta migration roda antes do índice único
-- case-insensitive (na migration seguinte), então se o banco já tivesse "Doses" e "doses" como
-- categorias distintas, o unique(name) original deixaria as duas entrarem aqui — e a criação do
-- índice case-insensitive na migration seguinte falharia por causa dessa duplicata. Mantém a
-- primeira grafia encontrada (ordem alfabética) de cada nome, ignorando maiúscula/minúscula.
insert into public.fastbar_product_categories (name)
select distinct on (lower(category)) category
from public.fastbar_products
where category is not null and trim(category) <> ''
order by lower(category), category
on conflict (name) do nothing;

-- Garante que sempre exista pelo menos uma opção no seletor, mesmo em banco novo/vazio.
insert into public.fastbar_product_categories (name)
values ('Bebidas')
on conflict (name) do nothing;
