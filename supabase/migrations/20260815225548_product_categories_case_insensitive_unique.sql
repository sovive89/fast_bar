-- O unique(name) original é sensível a maiúscula/minúscula — "Doses" e "doses" passavam como
-- categorias diferentes, exatamente o problema que a entidade própria deveria evitar.
alter table public.fastbar_product_categories drop constraint if exists fastbar_product_categories_name_key;
create unique index if not exists fastbar_product_categories_name_ci_key
  on public.fastbar_product_categories (lower(name));
