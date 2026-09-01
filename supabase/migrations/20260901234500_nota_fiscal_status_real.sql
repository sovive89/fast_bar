-- A trava de chave_acesso só provava que ALGUMA tentativa de importação existia, não que todos os
-- itens tinham sido lançados com sucesso. Isso deixava o app cliente (fluxo de reconciliação de
-- rede em confirmarNotaFiscal) reportar "estoque atualizado" pra uma nota parcialmente lançada,
-- porque o único sinal disponível era "a linha existe" -- sem distinguir sucesso total, sucesso
-- parcial ou processamento ainda em andamento.
--
-- todos_itens_ok fica null enquanto a confirmação ainda está rodando (linha inserida antes do
-- loop de itens), e só vira true/false depois que o loop termina -- assim um cliente que colide
-- com a trava consegue diferenciar "ainda processando" de "terminou parcialmente" de "terminou
-- tudo certo", em vez de assumir sucesso total pela mera existência da linha.
alter table public.fastbar_notas_importadas
  add column if not exists todos_itens_ok boolean;

comment on column public.fastbar_notas_importadas.todos_itens_ok is
  'null = confirmação ainda em andamento; true = todos os itens lançados; false = lançamento parcial (ver itens_importados vs. total submetido).';
