-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Troca OTP manual (código gerado/guardado por nós) pelo Twilio Verify: o provedor passa a
-- cuidar de gerar, expirar e limitar tentativas — a gente nunca guarda o código.
alter table fastbar_sessions
  drop column verification_code,
  drop column verification_code_expires_at,
  drop column verification_attempts;

-- Cliente que já verificou o celular uma vez não precisa verificar de novo em visitas futuras.
alter table fastbar_customers
  add column phone_verified boolean not null default false,
  add column phone_verified_at timestamptz;
