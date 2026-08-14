-- Cancelar comanda inteira (distinto de "fechar"): nunca vira "paid", então nunca entra no
-- faturamento/relatório.
-- O DROP cobre os dois nomes possíveis do constraint: o banco de produção usa
-- fastbar_sessions_status_check, mas migrations antigas criaram bar_sessions_status_check
-- (nome de antes da tabela ser renomeada). Sem os dois, o constraint velho sobreviveria e
-- continuaria rejeitando 'cancelled'.
ALTER TABLE public.fastbar_sessions
  DROP CONSTRAINT IF EXISTS fastbar_sessions_status_check;

ALTER TABLE public.fastbar_sessions
  DROP CONSTRAINT IF EXISTS bar_sessions_status_check;

ALTER TABLE public.fastbar_sessions
  ADD CONSTRAINT fastbar_sessions_status_check
  CHECK (status IN ('pending', 'open', 'closed', 'paid', 'cancelled'));
