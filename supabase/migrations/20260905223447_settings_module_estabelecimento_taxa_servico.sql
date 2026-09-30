-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Duas chaves novas de config por tenant, mesmo padrão das outras:
-- 'estabelecimento': dados cadastrais do negócio (razão social, CNPJ, endereço, contato). Fica
--   separado de 'branding' de propósito — branding é lido pela tela pública do cliente
--   (getPublicBranding), e CNPJ/endereço/telefone do responsável não têm por que trafegar pra lá.
-- 'taxa_servico': percentual e se entra ligada por padrão no fechamento.
alter table fastbar_integrations drop constraint fastbar_integrations_key_check;

alter table fastbar_integrations add constraint fastbar_integrations_key_check
  check (key = any (array[
    'whatsapp'::text,
    'instagram'::text,
    'mercado_pago'::text,
    'twilio'::text,
    'printer'::text,
    'branding'::text,
    'acesso'::text,
    'operacao'::text,
    'estabelecimento'::text,
    'taxa_servico'::text
  ]));

-- Percentual de taxa de serviço efetivamente cobrado NESTA comanda, gravado no fechamento.
-- Fica na comanda em vez de ser lido da config na hora do relatório: a taxa pode mudar de valor ou
-- ser desligada depois, e isso não pode reescrever o que já foi cobrado do cliente semana passada.
-- 0 = sem taxa (cliente recusou, ou o bar não cobra).
alter table fastbar_sessions
  add column if not exists service_fee_percent numeric not null default 0;
