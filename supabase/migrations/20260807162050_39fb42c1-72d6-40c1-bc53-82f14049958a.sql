DROP TABLE IF EXISTS public.stock_movements;
DROP TABLE IF EXISTS public.bar_tab_items;
DROP TABLE IF EXISTS public.bar_sessions;
DROP TABLE IF EXISTS public.bar_products;
DROP TABLE IF EXISTS public.tab_items;
DROP TABLE IF EXISTS public.tabs;
DROP TABLE IF EXISTS public.menu_items;

CREATE TABLE public.bar_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'Bebidas',
  is_active boolean NOT NULL DEFAULT true,
  stock_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bar_products TO anon, authenticated;
GRANT ALL ON public.bar_products TO service_role;
ALTER TABLE public.bar_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products readable by everyone" ON public.bar_products FOR SELECT USING (true);

CREATE TABLE public.bar_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  verification_code text,
  code_expires_at timestamptz,
  verified_at timestamptz,
  started_at timestamptz,
  closed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bar_sessions_status_check CHECK (status IN ('pending', 'open', 'closed', 'paid'))
);
CREATE INDEX bar_sessions_phone_idx ON public.bar_sessions (phone);
CREATE INDEX bar_sessions_status_idx ON public.bar_sessions (status);
GRANT ALL ON public.bar_sessions TO service_role;
ALTER TABLE public.bar_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bar_tab_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.bar_sessions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.bar_products(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bar_tab_items_session_idx ON public.bar_tab_items (session_id);
GRANT ALL ON public.bar_tab_items TO service_role;
ALTER TABLE public.bar_tab_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.stock_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.bar_products(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.bar_sessions(id) ON DELETE SET NULL,
  quantity integer NOT NULL,
  movement_type text NOT NULL DEFAULT 'out',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_type_check CHECK (movement_type IN ('in', 'out', 'adjustment'))
);
CREATE INDEX stock_movements_product_idx ON public.stock_movements (product_id);
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_bar_products_updated_at BEFORE UPDATE ON public.bar_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bar_sessions_updated_at BEFORE UPDATE ON public.bar_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.bar_products (name, price, category, stock_quantity) VALUES
  ('Chopp 300ml', 12.00, 'Chopp', 200),
  ('Chopp 500ml', 18.00, 'Chopp', 200),
  ('Cerveja long neck', 14.00, 'Cerveja', 150),
  ('Cerveja lata 350ml', 10.00, 'Cerveja', 150),
  ('Caipirinha', 24.00, 'Drinks', 100),
  ('Gin tônica', 32.00, 'Drinks', 100),
  ('Whisky dose', 28.00, 'Destilados', 80),
  ('Refrigerante lata', 8.00, 'Sem álcool', 120),
  ('Água mineral', 6.00, 'Sem álcool', 120),
  ('Suco natural', 12.00, 'Sem álcool', 60),
  ('Porção de batata', 32.00, 'Porções', 40),
  ('Porção de calabresa', 38.00, 'Porções', 40);