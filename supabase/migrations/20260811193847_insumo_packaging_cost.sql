-- Fase 1 (spec de evolução): compra-se numa unidade (caixa, garrafa) e consome-se em outra (ml, g, un).
-- Guarda como cada insumo é comprado para que o custo por unidade de consumo seja sempre calculado,
-- nunca digitado à mão.
ALTER TABLE public.fastbar_base_drinks
  ADD COLUMN IF NOT EXISTS purchase_unit text,
  ADD COLUMN IF NOT EXISTS units_per_pack integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_amount numeric NOT NULL DEFAULT 1;

ALTER TABLE public.fastbar_drink_ingredients
  ADD COLUMN IF NOT EXISTS purchase_unit text,
  ADD COLUMN IF NOT EXISTS units_per_pack integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_amount numeric NOT NULL DEFAULT 1;

-- content_amount = quantidade em `unit` (ml/g/un) por subunidade de compra.
-- Ex.: garrafa (purchase_unit) de cachaça com 1000 ml (content_amount) de conteúdo, unit = 'ml'.
-- Ex.: caixa (purchase_unit) com units_per_pack = 12 latas de 350 ml cada (content_amount).
-- Custo por `unit` = purchase_cost / (units_per_pack * content_amount) — calculado na aplicação,
-- nunca digitado diretamente.
