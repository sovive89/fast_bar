-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- fastbar_integrations tinha "key" como PK sozinha: dois tenants não conseguiam ter, cada um, uma
-- linha "acesso" (senha da equipe) ou "whatsapp" etc. — o segundo tenant colidia com o primeiro.
-- Chave composta (tenant_id, key): cada tenant tem sua própria config por integração, igual ao
-- resto do schema.
alter table public.fastbar_integrations drop constraint fastbar_integrations_pkey;
alter table public.fastbar_integrations add primary key (tenant_id, key);
