-- Configuração opcional do normalizador OCR por tenant.
-- Segredos ficam em config e nunca são devolvidos pela função getIntegrations.
alter table public.fastbar_integrations drop constraint if exists fastbar_integrations_key_check;

alter table public.fastbar_integrations add constraint fastbar_integrations_key_check
  check (key = any (array[
    'whatsapp'::text,
    'instagram'::text,
    'mercado_pago'::text,
    'twilio'::text,
    'printer'::text,
    'ocr_ai'::text,
    'branding'::text,
    'acesso'::text,
    'operacao'::text,
    'estabelecimento'::text,
    'taxa_servico'::text
  ]));
