CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'Bebidas',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_items TO anon;
GRANT SELECT, INSERT, UPDATE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menu readable by everyone" ON public.menu_items FOR SELECT USING (true);

CREATE TABLE public.tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tabs_status_idx ON public.tabs (status, started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.tabs TO anon;
GRANT SELECT, INSERT, UPDATE ON public.tabs TO authenticated;
GRANT ALL ON public.tabs TO service_role;
ALTER TABLE public.tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tabs readable" ON public.tabs FOR SELECT USING (true);
CREATE POLICY "tabs insertable" ON public.tabs FOR INSERT WITH CHECK (true);
CREATE POLICY "tabs updatable" ON public.tabs FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.tab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES public.tabs(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tab_items_tab_idx ON public.tab_items (tab_id, added_at);
GRANT SELECT, INSERT ON public.tab_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_items TO authenticated;
GRANT ALL ON public.tab_items TO service_role;
ALTER TABLE public.tab_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items readable" ON public.tab_items FOR SELECT USING (true);
CREATE POLICY "items insertable" ON public.tab_items FOR INSERT WITH CHECK (true);

INSERT INTO public.menu_items (name, price, category) VALUES
  ('Chopp 300ml', 12.00, 'Chopp'),
  ('Chopp 500ml', 18.00, 'Chopp'),
  ('Cerveja Long Neck', 10.00, 'Cerveja'),
  ('Cerveja 600ml', 16.00, 'Cerveja'),
  ('Caipirinha', 22.00, 'Drinks'),
  ('Gin Tônica', 28.00, 'Drinks'),
  ('Dose de Whisky', 25.00, 'Destilados'),
  ('Refrigerante', 8.00, 'Sem álcool'),
  ('Água mineral', 5.00, 'Sem álcool'),
  ('Porção de batata', 30.00, 'Petiscos');

ALTER PUBLICATION supabase_realtime ADD TABLE public.tabs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tab_items;