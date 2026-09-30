-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Rastreabilidade do lote: de onde a mercadoria veio e por qual documento entrou.
--
-- Tudo aqui é anulável de propósito. Compra de bar real vem de tudo quanto é jeito — distribuidor
-- com NF-e, mercado com cupom, feira sem papel nenhum. Exigir lote/validade em coluna NOT NULL
-- transformaria a entrada num formulário que a equipe aprende a preencher com lixo ("SEM LOTE",
-- validade 31/12/2099), e dado inventado é pior que campo vazio: some a chance de auditar.
alter table public.fastbar_stock_lots
  -- Número do lote impresso na embalagem. É ele que permite recolher um lote específico.
  add column if not exists lote text,
  add column if not exists fabricacao date,

  -- Fotografia do fornecedor no momento da entrada. supplier_id continua sendo o vínculo vivo;
  -- estes dois guardam quem era na data, pra que renomear ou desativar o cadastro depois não
  -- apague de quem veio a mercadoria que já está no estoque.
  add column if not exists fornecedor_nome text,
  add column if not exists fornecedor_documento text,

  -- Documento de origem. entrada_manual é o documento INTERNO que o sistema gera quando não houve
  -- nota; ele nunca é tratado nem exibido como NF-e.
  add column if not exists documento_tipo text not null default 'entrada_manual',
  add column if not exists documento_numero text,
  add column if not exists documento_serie text,
  add column if not exists chave_acesso text,
  add column if not exists documento_emissao date,
  -- Obrigatório na prática pra entrada sem nota: é o que explica pra auditoria de onde saiu saldo
  -- que não tem documento fiscal atrás.
  add column if not exists motivo text,

  -- Este app não tem login individual; gravar nome de usuário aqui seria inventar identidade.
  add column if not exists registrado_por text not null default 'equipe',
  add column if not exists status text not null default 'ativo';

alter table public.fastbar_stock_lots
  drop constraint if exists fastbar_stock_lots_documento_tipo_check;
alter table public.fastbar_stock_lots
  add constraint fastbar_stock_lots_documento_tipo_check
  check (documento_tipo in ('nfe','nfce','danfe','cupom','comprovante','entrada_manual','outro'));

alter table public.fastbar_stock_lots
  drop constraint if exists fastbar_stock_lots_status_check;
alter table public.fastbar_stock_lots
  add constraint fastbar_stock_lots_status_check
  check (status in ('ativo','esgotado','descartado','bloqueado'));

-- Painel de vencimento ("o que vence nos próximos N dias") sem varrer lote já esgotado.
create index if not exists fastbar_stock_lots_validade_idx
  on public.fastbar_stock_lots (tenant_id, expires_on)
  where expires_on is not null and quantity_remaining > 0;

-- Consulta de duplicidade por chave de acesso e a busca "que lotes vieram nesta nota".
create index if not exists fastbar_stock_lots_chave_idx
  on public.fastbar_stock_lots (tenant_id, chave_acesso)
  where chave_acesso is not null;
