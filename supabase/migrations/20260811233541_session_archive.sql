-- Arquivar comanda = tirar da tela do caixa sem apagar nada. O histórico continua inteiro para
-- faturamento e relatórios; só deixa de poluir a lista do dia a dia.
ALTER TABLE public.fastbar_sessions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS fastbar_sessions_archived_at_idx
  ON public.fastbar_sessions (archived_at);
