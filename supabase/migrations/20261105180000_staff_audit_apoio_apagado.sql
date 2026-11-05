-- Permite registrar na trilha de auditoria que um atendimento de apoio foi apagado. A linha guarda
-- só quem apagou, quando e o id do registro apagado: nenhum dado da pessoa atendida.
alter table public.fastbar_staff_audit drop constraint if exists fastbar_staff_audit_action_check;
alter table public.fastbar_staff_audit add constraint fastbar_staff_audit_action_check
  check (action in ('cadastro','aprovacao','desativacao','reativacao','login_bloqueado','apoio_apagado'));
