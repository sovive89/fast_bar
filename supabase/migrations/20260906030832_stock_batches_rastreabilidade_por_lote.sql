-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Camada de LOTE do estoque.
--
-- Por que uma tabela nova e não colunas em fastbar_products: um produto tem VÁRIOS lotes vivos ao
-- mesmo tempo (duas remessas da mesma cerveja, validades e custos diferentes). Lote é uma linha
-- por remessa recebida, não um atributo do produto.
--
-- Por que campos de fornecedor/documento aparecem "duplicados" aqui: são fotografia do momento da
-- entrada. Se o fornecedor for renomeado ou desativado depois, o registro do lote continua dizendo
-- de quem veio aquela mercadoria — que é justamente o que rastreabilidade significa.
--
-- fastbar_products.stock_quantity continua sendo o saldo que autoriza a venda. Esta tabela ainda
-- NÃO faz a baixa por lote (FEFO); ela registra o que entrou. A baixa por lote é o passo seguinte.
create table if not exists public.fastbar_stock_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default fastbar_default_tenant_id() references public.fastbar_tenants(id),
  product_id uuid not null references public.fastbar_products(id) on delete cascade,

  -- Identificação do lote. Nulo é legítimo: muita compra de bar (feira, distribuidor pequeno) não
  -- vem com lote impresso. Fica nulo em vez de virar "SEM LOTE", pra não inventar dado.
  lote text,
  validade date,
  fabricacao date,

  -- Quantidade na MESma unidade de venda do produto (fastbar_products.unit), pra poder somar com
  -- stock_quantity sem conversão escondida.
  quantidade_recebida numeric not null check (quantidade_recebida > 0),
  quantidade_restante numeric not null check (quantidade_restante >= 0),
  unidade text not null default 'un',
  custo_unitario numeric not null default 0 check (custo_unitario >= 0),

  -- Fornecedor: vínculo + fotografia (ver comentário do topo).
  fornecedor_id uuid references public.fastbar_suppliers(id) on delete set null,
  fornecedor_nome text,
  fornecedor_documento text,

  -- Documento de origem. entrada_manual é documento interno gerado pelo próprio sistema quando
  -- não houve nota — nunca é tratado como NF-e.
  documento_tipo text not null default 'entrada_manual'
    check (documento_tipo in ('nfe','nfce','danfe','cupom','comprovante','entrada_manual','outro')),
  documento_numero text,
  documento_serie text,
  chave_acesso text,
  documento_emissao date,
  -- Motivo obrigatório na entrada sem nota, pra auditoria conseguir explicar de onde veio o saldo.
  motivo text,

  data_entrada timestamptz not null default now(),
  -- Identidade genérica da equipe: este app não tem login individual, e gravar um nome falso de
  -- usuário seria pior que assumir "equipe".
  registrado_por text not null default 'equipe',
  observacao text,

  status text not null default 'ativo'
    check (status in ('ativo','esgotado','descartado','bloqueado')),

  created_at timestamptz not null default now(),

  constraint fastbar_stock_batches_restante_lte_recebida
    check (quantidade_restante <= quantidade_recebida)
);

-- Consulta quente do card de estoque: lotes vivos de um produto, o mais perto de vencer primeiro
-- (ordem FEFO, que é a que o bar deve consumir).
create index if not exists fastbar_stock_batches_produto_fefo_idx
  on public.fastbar_stock_batches (product_id, validade nulls last, data_entrada)
  where status = 'ativo';

-- Painel de vencimento: "o que vence nos próximos N dias", sem varrer lote esgotado.
create index if not exists fastbar_stock_batches_validade_idx
  on public.fastbar_stock_batches (tenant_id, validade)
  where status = 'ativo' and validade is not null;

create index if not exists fastbar_stock_batches_chave_idx
  on public.fastbar_stock_batches (tenant_id, chave_acesso)
  where chave_acesso is not null;

alter table public.fastbar_stock_batches enable row level security;

create policy tenant_isolation on public.fastbar_stock_batches
  for all
  using (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
