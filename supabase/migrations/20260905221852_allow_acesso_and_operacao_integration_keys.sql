-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- 'acesso' guarda o hash da senha da equipe por tenant (multi-tenant: cada bar com a sua, em vez
-- da variável de ambiente BAR_PANEL_PASSWORD compartilhada por todos os deploys).
-- 'operacao' guarda início/virada/timezone do expediente (já lido por loadOperationConfig, que até
-- agora só conseguia cair nos defaults de código porque a linha nem podia ser criada).
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
    'operacao'::text
  ]));
