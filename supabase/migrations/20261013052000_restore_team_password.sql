-- Versão histórica preservada no ledger. Era uma reparação manual de credencial
-- para um ambiente específico, sem mudança de schema. Não deve ser reaplicada
-- em um Preview limpo nem sobrescrever credenciais em um banco existente.
-- Configure a senha da equipe no ambiente de destino pelo fluxo do aplicativo.
do $$
begin
  null;
end $$;
