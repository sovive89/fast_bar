-- Dados complementares do cliente, coletados numa tela separada da abertura da comanda: o
-- consentimento de marketing precisa ser um ato próprio e distinto do fluxo operacional, não algo
-- que a pessoa aceita sem perceber enquanto abre a conta.
alter table public.fastbar_customers
  add column if not exists full_name text,
  -- Aniversário sem o ano de propósito: serve pra campanha de aniversário e nada mais, então
  -- guardar o ano só criaria um dado de nascimento completo sem necessidade nenhuma.
  add column if not exists birthday_day smallint,
  add column if not exists birthday_month smallint,
  add column if not exists administrative_region text,
  add column if not exists how_found_out text,
  -- Faixa, não idade exata: a faixa responde tudo que campanha precisa saber.
  add column if not exists age_range text,
  add column if not exists profession text,
  add column if not exists favorite_music_genre text,
  -- Sem nulo: a resposta é obrigatória na tela, então "não respondeu" não é um estado válido.
  -- O default false vale pros clientes que já existiam antes da tela — sem consentimento
  -- registrado, ninguém entra em disparo de campanha.
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists profile_completed_at timestamptz;

alter table public.fastbar_customers
  drop constraint if exists fastbar_customers_birthday_day_valid;
alter table public.fastbar_customers
  add constraint fastbar_customers_birthday_day_valid
  check (birthday_day is null or (birthday_day between 1 and 31));

alter table public.fastbar_customers
  drop constraint if exists fastbar_customers_birthday_month_valid;
alter table public.fastbar_customers
  add constraint fastbar_customers_birthday_month_valid
  check (birthday_month is null or (birthday_month between 1 and 12));

-- Dia e mês andam juntos: um sem o outro não serve pra disparar campanha de aniversário e só
-- deixaria um dado pela metade no cadastro.
alter table public.fastbar_customers
  drop constraint if exists fastbar_customers_birthday_complete;
alter table public.fastbar_customers
  add constraint fastbar_customers_birthday_complete
  check ((birthday_day is null) = (birthday_month is null));

-- Índice pra campanha de aniversário do dia, que é a consulta que essa coluna existe pra servir.
create index if not exists fastbar_customers_birthday_idx
  on public.fastbar_customers (birthday_month, birthday_day)
  where birthday_month is not null;

-- Índice pro filtro que todo disparo de marketing tem que fazer antes de enviar.
create index if not exists fastbar_customers_marketing_opt_in_idx
  on public.fastbar_customers (marketing_opt_in)
  where marketing_opt_in = true;
