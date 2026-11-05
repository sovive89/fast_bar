-- Materiais de consumo e utensílios: separar por SETOR (bar, cozinha, geral) e por TIPO
-- (material de consumo: limpeza, descartáveis, gás, óleo; utensílio: copos, pratos, talheres).
-- Aditiva: itens que já existissem viram "geral" + "material de consumo". A tabela estava vazia.
alter table public.fastbar_consumables
  add column if not exists sector text not null default 'geral'
    check (sector in ('bar','cozinha','geral')),
  add column if not exists category text not null default 'material_consumo'
    check (category in ('material_consumo','utensilio'));
create index if not exists fastbar_consumables_sector_category
  on public.fastbar_consumables (tenant_id, sector, category);
