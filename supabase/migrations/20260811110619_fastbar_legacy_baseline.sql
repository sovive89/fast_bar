-- Base de schema para Supabase Preview antes da primeira referência a fastbar_sessions.
-- Derivada do catálogo PostgreSQL do Fastbar: somente estrutura, sem dados ou credenciais.
-- As colunas/índices/constraints introduzidos pelas migrations seguintes ficam nelas.
-- Instalações com as onze tabelas presentes não sofrem alterações.

do $fastbar_legacy$
declare
  missing_tables text[];
begin
  select coalesce(array_agg(name order by name), '{}'::text[]) into missing_tables
  from unnest(array[
    'fastbar_suppliers',
    'fastbar_customers',
    'fastbar_products',
    'fastbar_base_drinks',
    'fastbar_drink_ingredients',
    'fastbar_sessions',
    'fastbar_tab_items',
    'fastbar_stock_movements',
    'fastbar_recipe_items',
    'fastbar_base_drink_movements',
    'fastbar_drink_ingredient_movements'
  ]) as legacy(name)
  where to_regclass(format('public.%I', name)) is null;

  if cardinality(missing_tables) = 0 then
    return;
  end if;
  if cardinality(missing_tables) <> 11 then
    raise exception 'Base legada Fastbar incompleta; tabelas ausentes: %', missing_tables;
  end if;

  create table public.fastbar_suppliers (
    id uuid default gen_random_uuid() not null,
    name text not null,
    document text,
    phone text,
    email text,
    active boolean default true not null,
    created_at timestamp with time zone default now() not null,
    constraint fastbar_suppliers_pkey PRIMARY KEY (id)
  );

  create table public.fastbar_customers (
    id uuid default gen_random_uuid() not null,
    name text not null,
    phone text,
    total_visits integer default 0 not null,
    total_spent numeric default 0 not null,
    first_seen_at timestamp with time zone default now() not null,
    last_seen_at timestamp with time zone default now() not null,
    created_at timestamp with time zone default now() not null,
    constraint fastbar_customers_pkey PRIMARY KEY (id),
    constraint fastbar_customers_phone_key UNIQUE (phone)
  );

  create table public.fastbar_products (
    id uuid default gen_random_uuid() not null,
    name text not null,
    price numeric default 0 not null,
    category text default 'Bebidas'::text not null,
    is_active boolean default true not null,
    stock_quantity integer default 0 not null,
    image_url text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint fastbar_products_pkey PRIMARY KEY (id)
  );

  create table public.fastbar_base_drinks (
    id uuid default gen_random_uuid() not null,
    name text not null,
    unit text default 'un'::text not null,
    current_stock numeric default 0 not null,
    min_stock numeric default 0 not null,
    average_cost numeric default 0 not null,
    active boolean default true not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint fastbar_base_drinks_unit_check CHECK ((unit = ANY (ARRAY['ml'::text, 'un'::text]))),
    constraint fastbar_base_drinks_pkey PRIMARY KEY (id)
  );

  create table public.fastbar_drink_ingredients (
    id uuid default gen_random_uuid() not null,
    name text not null,
    unit text default 'ml'::text not null,
    current_stock numeric default 0 not null,
    min_stock numeric default 0 not null,
    average_cost numeric default 0 not null,
    active boolean default true not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint fastbar_drink_ingredients_unit_check CHECK ((unit = ANY (ARRAY['ml'::text, 'un'::text, 'g'::text]))),
    constraint fastbar_drink_ingredients_pkey PRIMARY KEY (id)
  );

  create table public.fastbar_sessions (
    id uuid default gen_random_uuid() not null,
    customer_name text not null,
    phone text,
    status text default 'pending'::text not null,
    started_at timestamp with time zone,
    closed_at timestamp with time zone,
    paid_at timestamp with time zone,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    customer_id uuid,
    constraint fastbar_sessions_status_check CHECK ((status = ANY (ARRAY['unverified'::text, 'pending'::text, 'open'::text, 'closed'::text, 'paid'::text, 'cancelled'::text]))),
    constraint fastbar_sessions_pkey PRIMARY KEY (id)
  );

  create table public.fastbar_tab_items (
    id uuid default gen_random_uuid() not null,
    session_id uuid not null,
    product_id uuid,
    name text not null,
    unit_price numeric default 0 not null,
    quantity integer default 1 not null,
    added_at timestamp with time zone default now() not null,
    constraint fastbar_tab_items_pkey PRIMARY KEY (id)
  );

  create table public.fastbar_stock_movements (
    id uuid default gen_random_uuid() not null,
    product_id uuid not null,
    session_id uuid,
    quantity integer not null,
    movement_type text default 'out'::text not null,
    note text,
    created_at timestamp with time zone default now() not null,
    constraint fastbar_stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['in'::text, 'out'::text, 'adjustment'::text]))),
    constraint fastbar_stock_movements_pkey PRIMARY KEY (id)
  );

  create table public.fastbar_recipe_items (
    id uuid default gen_random_uuid() not null,
    product_id uuid not null,
    base_drink_id uuid,
    ingredient_id uuid,
    quantity numeric not null,
    constraint fastbar_recipe_items_check CHECK (((base_drink_id IS NOT NULL) <> (ingredient_id IS NOT NULL))),
    constraint fastbar_recipe_items_quantity_check CHECK ((quantity > (0)::numeric)),
    constraint fastbar_recipe_items_pkey PRIMARY KEY (id)
  );

  create table public.fastbar_base_drink_movements (
    id uuid default gen_random_uuid() not null,
    base_drink_id uuid not null,
    type text not null,
    quantity numeric not null,
    reason text default 'compra'::text not null,
    supplier_id uuid,
    unit_cost numeric,
    note text,
    created_at timestamp with time zone default now() not null,
    constraint fastbar_base_drink_movements_quantity_check CHECK ((quantity > (0)::numeric)),
    constraint fastbar_base_drink_movements_reason_check CHECK ((reason = ANY (ARRAY['compra'::text, 'venda'::text, 'perda'::text, 'ajuste'::text]))),
    constraint fastbar_base_drink_movements_type_check CHECK ((type = ANY (ARRAY['entrada'::text, 'saida'::text]))),
    constraint fastbar_base_drink_movements_pkey PRIMARY KEY (id)
  );

  create table public.fastbar_drink_ingredient_movements (
    id uuid default gen_random_uuid() not null,
    ingredient_id uuid not null,
    type text not null,
    quantity numeric not null,
    reason text default 'compra'::text not null,
    supplier_id uuid,
    unit_cost numeric,
    note text,
    created_at timestamp with time zone default now() not null,
    constraint fastbar_drink_ingredient_movements_quantity_check CHECK ((quantity > (0)::numeric)),
    constraint fastbar_drink_ingredient_movements_reason_check CHECK ((reason = ANY (ARRAY['compra'::text, 'venda'::text, 'perda'::text, 'ajuste'::text]))),
    constraint fastbar_drink_ingredient_movements_type_check CHECK ((type = ANY (ARRAY['entrada'::text, 'saida'::text]))),
    constraint fastbar_drink_ingredient_movements_pkey PRIMARY KEY (id)
  );

  alter table public.fastbar_base_drink_movements add constraint fastbar_base_drink_movements_base_drink_id_fkey FOREIGN KEY (base_drink_id) REFERENCES public.fastbar_base_drinks(id);
  alter table public.fastbar_base_drink_movements add constraint fastbar_base_drink_movements_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.fastbar_suppliers(id);
  alter table public.fastbar_drink_ingredient_movements add constraint fastbar_drink_ingredient_movements_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.fastbar_drink_ingredients(id);
  alter table public.fastbar_drink_ingredient_movements add constraint fastbar_drink_ingredient_movements_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.fastbar_suppliers(id);
  alter table public.fastbar_recipe_items add constraint fastbar_recipe_items_base_drink_id_fkey FOREIGN KEY (base_drink_id) REFERENCES public.fastbar_base_drinks(id);
  alter table public.fastbar_recipe_items add constraint fastbar_recipe_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.fastbar_drink_ingredients(id);
  alter table public.fastbar_recipe_items add constraint fastbar_recipe_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.fastbar_products(id) ON DELETE CASCADE;
  alter table public.fastbar_sessions add constraint fastbar_sessions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.fastbar_customers(id);
  alter table public.fastbar_stock_movements add constraint fastbar_stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.fastbar_products(id);
  alter table public.fastbar_stock_movements add constraint fastbar_stock_movements_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.fastbar_sessions(id);
  alter table public.fastbar_tab_items add constraint fastbar_tab_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.fastbar_products(id);
  alter table public.fastbar_tab_items add constraint fastbar_tab_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.fastbar_sessions(id);

  CREATE INDEX idx_fastbar_base_drink_movements_base_drink_id ON public.fastbar_base_drink_movements USING btree (base_drink_id);
  CREATE INDEX idx_fastbar_customers_phone ON public.fastbar_customers USING btree (phone);
  CREATE INDEX idx_fastbar_drink_ingredient_movements_ingredient_id ON public.fastbar_drink_ingredient_movements USING btree (ingredient_id);
  CREATE INDEX idx_fastbar_recipe_items_product_id ON public.fastbar_recipe_items USING btree (product_id);
  CREATE INDEX idx_fastbar_sessions_phone ON public.fastbar_sessions USING btree (phone);
  CREATE INDEX idx_fastbar_sessions_status ON public.fastbar_sessions USING btree (status);
  CREATE INDEX idx_fastbar_stock_movements_product_id ON public.fastbar_stock_movements USING btree (product_id);
  CREATE INDEX idx_fastbar_tab_items_session_id ON public.fastbar_tab_items USING btree (session_id);

  alter table public.fastbar_suppliers enable row level security;
  alter table public.fastbar_customers enable row level security;
  alter table public.fastbar_products enable row level security;
  alter table public.fastbar_base_drinks enable row level security;
  alter table public.fastbar_drink_ingredients enable row level security;
  alter table public.fastbar_sessions enable row level security;
  alter table public.fastbar_tab_items enable row level security;
  alter table public.fastbar_stock_movements enable row level security;
  alter table public.fastbar_recipe_items enable row level security;
  alter table public.fastbar_base_drink_movements enable row level security;
  alter table public.fastbar_drink_ingredient_movements enable row level security;

  -- O app acessa o catálogo legado com o cliente administrativo do servidor.
  -- Sem depender de grants implícitos de projetos antigos do Supabase.
  revoke all on public.fastbar_suppliers from public, anon, authenticated;
  revoke all on public.fastbar_customers from public, anon, authenticated;
  revoke all on public.fastbar_products from public, anon, authenticated;
  revoke all on public.fastbar_base_drinks from public, anon, authenticated;
  revoke all on public.fastbar_drink_ingredients from public, anon, authenticated;
  revoke all on public.fastbar_sessions from public, anon, authenticated;
  revoke all on public.fastbar_tab_items from public, anon, authenticated;
  revoke all on public.fastbar_stock_movements from public, anon, authenticated;
  revoke all on public.fastbar_recipe_items from public, anon, authenticated;
  revoke all on public.fastbar_base_drink_movements from public, anon, authenticated;
  revoke all on public.fastbar_drink_ingredient_movements from public, anon, authenticated;
  grant select, insert, update, delete on public.fastbar_suppliers to service_role;
  grant select, insert, update, delete on public.fastbar_customers to service_role;
  grant select, insert, update, delete on public.fastbar_products to service_role;
  grant select, insert, update, delete on public.fastbar_base_drinks to service_role;
  grant select, insert, update, delete on public.fastbar_drink_ingredients to service_role;
  grant select, insert, update, delete on public.fastbar_sessions to service_role;
  grant select, insert, update, delete on public.fastbar_tab_items to service_role;
  grant select, insert, update, delete on public.fastbar_stock_movements to service_role;
  grant select, insert, update, delete on public.fastbar_recipe_items to service_role;
  grant select, insert, update, delete on public.fastbar_base_drink_movements to service_role;
  grant select, insert, update, delete on public.fastbar_drink_ingredient_movements to service_role;
end;
$fastbar_legacy$;
