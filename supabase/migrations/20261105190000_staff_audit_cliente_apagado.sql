-- Permite registrar na auditoria que os dados pessoais de um cliente foram apagados do CRM.
-- A linha guarda só quem apagou, quando e o id interno (que deixa de existir): nenhum dado do cliente.
alter table public.fastbar_staff_audit drop constraint if exists fastbar_staff_audit_action_check;
alter table public.fastbar_staff_audit add constraint fastbar_staff_audit_action_check
  check (action in ('cadastro','aprovacao','desativacao','reativacao','login_bloqueado','apoio_apagado','cliente_apagado'));
