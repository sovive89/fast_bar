-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Abertura manual sem celular: cliente pode ser identificado por CPF ou RG em vez de celular.
-- Celular deixa de ser obrigatório, mas toda comanda/cliente continua exigindo pelo menos um
-- identificador — sem isso não daria pra achar a comanda de novo nem reconhecer o cliente que já
-- volta (dedupe, CRM). "document" guarda só dígitos; "document_type" diz se é cpf ou rg.

alter table public.fastbar_sessions
  alter column phone drop not null,
  add column if not exists document text,
  add column if not exists document_type text check (document_type in ('cpf', 'rg'));

alter table public.fastbar_customers
  alter column phone drop not null,
  add column if not exists document text,
  add column if not exists document_type text check (document_type in ('cpf', 'rg'));

alter table public.fastbar_sessions
  add constraint fastbar_sessions_identifier_check
  check (phone is not null or document is not null);

alter table public.fastbar_customers
  add constraint fastbar_customers_identifier_check
  check (phone is not null or document is not null);

create index if not exists idx_fastbar_sessions_document on public.fastbar_sessions (document);
create index if not exists idx_fastbar_customers_document on public.fastbar_customers (document);
