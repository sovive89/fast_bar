-- Estoque module: unit of measure and packaging type per product (e.g. "un" / "Lata", "ml" / "Garrafa").
ALTER TABLE public.fastbar_products
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'un';

ALTER TABLE public.fastbar_products
  ADD COLUMN IF NOT EXISTS package_type text;
