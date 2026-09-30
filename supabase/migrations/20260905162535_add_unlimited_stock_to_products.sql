-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

alter table public.fastbar_products
  add column if not exists unlimited_stock boolean not null default false;

comment on column public.fastbar_products.unlimited_stock is
  'Produto/serviço que nunca esgota (ex.: ficha de sinuca, taxa de serviço) — não passa pela checagem de estoque nem pela baixa automática ao ser lançado na comanda.';
