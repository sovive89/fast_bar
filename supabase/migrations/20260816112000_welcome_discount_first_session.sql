-- Desconto de boas-vindas: 10% na primeira comanda pra quem preenche o cadastro completo e aceita
-- receber promoções. Fica na sessão, não no cliente, porque é a comanda daquele momento que ganha
-- o abatimento — e porque o valor precisa ficar congelado no histórico do que foi realmente pago.
alter table public.fastbar_sessions
  add column if not exists discount_percent numeric(5,2) not null default 0;

alter table public.fastbar_sessions
  drop constraint if exists fastbar_sessions_discount_percent_valid;
alter table public.fastbar_sessions
  add constraint fastbar_sessions_discount_percent_valid
  check (discount_percent >= 0 and discount_percent <= 100);

-- Marca que o cliente já resgatou o benefício, pra não conceder de novo caso ele volte a passar
-- pela tela de perfil por qualquer caminho futuro.
alter table public.fastbar_customers
  add column if not exists welcome_discount_earned_at timestamptz;
