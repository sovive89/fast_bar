-- Reports module: track how each comanda was paid so revenue can be broken down by method.
ALTER TABLE public.fastbar_sessions
  ADD COLUMN IF NOT EXISTS payment_method text;

-- CRM module: free-text notes staff can keep per customer (preferences, allergies, etc.).
ALTER TABLE public.fastbar_customers
  ADD COLUMN IF NOT EXISTS notes text;

-- Both columns are read through the existing service-role admin client only, same as the
-- rest of fastbar_sessions/fastbar_customers, so no RLS/grant changes are needed.
