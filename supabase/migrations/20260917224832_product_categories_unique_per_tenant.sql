-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- O índice único de nome de categoria era GLOBAL (lower(name)), não por tenant: duas empresas
-- diferentes não conseguiam ter, cada uma, uma categoria "Bebidas" — a segunda batia na mesma
-- trava "já existe uma categoria com esse nome" que motivou a correção do início desta tarefa.
drop index if exists fastbar_product_categories_name_ci_key;
create unique index if not exists fastbar_product_categories_tenant_name_ci_key
  on public.fastbar_product_categories (tenant_id, lower(name));
