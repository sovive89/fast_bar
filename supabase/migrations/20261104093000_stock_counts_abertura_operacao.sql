-- Conferência de estoque na abertura da operação (P1.1-4 do CLAUDE.md / seção 3 da
-- documentação funcional): antes de abrir comandas, a equipe confere o estoque teórico contra a
-- contagem física. Toda diferença precisa de motivo padronizado + observação — nunca fica "solta"
-- como só um número. A conferência também pode ser pulada, mas só com senha + motivo, e isso fica
-- registrado do mesmo jeito (a mesma tabela, só com status diferente).
--
-- Importante: esta conferência é um REGISTRO, não um ajuste automático de estoque. Ela não altera
-- fastbar_products.stock_quantity nem fastbar_stock_lots — corrigir o saldo a partir de uma
-- divergência é uma ação deliberada à parte (entrada/perda em Estoque), igual o prompt pede
-- ("O skip não elimina o estoque teórico... apenas permite a abertura controlada do dia").

create table if not exists public.fastbar_stock_counts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  operacao_id uuid not null references public.fastbar_operations(id),
  status text not null check (status in ('CONCLUIDA', 'PULADA')),
  motivo_pulo text,
  realizado_por text not null default 'equipe',
  created_at timestamptz not null default now(),
  -- PULADA sempre tem motivo; CONCLUIDA não usa este campo (o detalhe fica nos itens).
  constraint fastbar_stock_counts_motivo_pulo_check
    check (status = 'CONCLUIDA' or (motivo_pulo is not null and length(trim(motivo_pulo)) >= 5))
);

-- Uma conferência por operação — igual o índice que já garante uma única operação ABERTA por vez.
create unique index if not exists fastbar_stock_counts_operacao_id_key
  on public.fastbar_stock_counts (operacao_id);

alter table public.fastbar_stock_counts enable row level security;
create policy "service role full access" on public.fastbar_stock_counts
  for all using (true) with check (true);

create table if not exists public.fastbar_stock_count_items (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references public.fastbar_stock_counts(id) on delete cascade,
  -- on delete set null + nome congelado: apagar um produto nunca pode apagar o histórico da
  -- conferência, e o nome continua legível mesmo que o produto não exista mais depois.
  product_id uuid references public.fastbar_products(id) on delete set null,
  product_name text not null,
  unit text not null,
  quantidade_esperada numeric not null,
  quantidade_contada numeric not null,
  divergencia numeric generated always as (quantidade_contada - quantidade_esperada) stored,
  -- Motivos padronizados (seção 3.2 da documentação funcional): toda diferença precisa de uma
  -- classificação explícita, nunca fica "perda" por padrão. "divergencia_nao_identificada" é o
  -- catch-all quando ninguém sabe a causa — mas ainda é uma escolha deliberada, não o default.
  motivo text check (
    motivo is null or motivo in (
      'perda_quebra', 'vencimento', 'consumo_interno', 'lancamento_incorreto',
      'divergencia_nao_identificada'
    )
  ),
  observacao text,
  created_at timestamptz not null default now(),
  constraint fastbar_stock_count_items_motivo_required_on_divergence
    check (quantidade_contada = quantidade_esperada or motivo is not null)
);

create index if not exists fastbar_stock_count_items_stock_count_id_idx
  on public.fastbar_stock_count_items (stock_count_id);

alter table public.fastbar_stock_count_items enable row level security;
create policy "service role full access" on public.fastbar_stock_count_items
  for all using (true) with check (true);
