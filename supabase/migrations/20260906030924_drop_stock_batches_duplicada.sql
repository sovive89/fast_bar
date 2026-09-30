-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Criada por engano: fastbar_stock_lots já é a camada de lote deste projeto, inclusive com baixa
-- FEFO (fastbar_deplete_lots). Manter as duas seria ter dois saldos por lote divergindo em
-- silêncio. Os campos de rastreabilidade vão para fastbar_stock_lots, na migration seguinte.
drop table if exists public.fastbar_stock_batches;
