-- Apoio voluntário: sem gênero/adesão no CRM. Dados acessíveis somente ao servidor.
-- A autorização do cliente usa o link UUID da comanda, como os outros fluxos do app.
-- Não usar Supabase Realtime nem entregar estas tabelas à chave pública.
create table public.fastbar_support_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fastbar_tenants(id),
  session_id uuid not null references public.fastbar_sessions(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'attending', 'completed')),
  escalated boolean not null default false,
  created_at timestamptz not null default now(),
  attended_at timestamptz,
  attended_by text check (attended_by is null or length(trim(attended_by)) between 2 and 80),
  completed_at timestamptz,
  completed_by text check (completed_by is null or length(trim(completed_by)) between 2 and 80),
  completion_note text check (completion_note is null or length(trim(completion_note)) between 6 and 2000),
  check (status <> 'attending' or (attended_at is not null and attended_by is not null)),
  check (status <> 'completed' or (attended_at is not null and attended_by is not null and completed_at is not null and completed_by is not null and completion_note is not null))
);
create unique index fastbar_support_one_active on public.fastbar_support_requests(tenant_id, session_id)
  where status in ('requested','attending');
create index fastbar_support_queue on public.fastbar_support_requests(tenant_id, status, created_at);
create index fastbar_support_session on public.fastbar_support_requests(tenant_id, session_id, created_at desc);
create index fastbar_support_retention on public.fastbar_support_requests(completed_at) where status = 'completed';

create table public.fastbar_support_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fastbar_tenants(id),
  request_id uuid not null references public.fastbar_support_requests(id) on delete cascade,
  sender text not null check (sender in ('customer','staff')),
  body text not null check (length(trim(body)) between 1 and 1000),
  -- Nome declarado sob o acesso compartilhado da equipe: não é identidade autenticada individual.
  staff_name text check (staff_name is null or length(trim(staff_name)) between 2 and 80),
  created_at timestamptz not null default clock_timestamp(),
  check ((sender = 'staff' and staff_name is not null) or (sender = 'customer' and staff_name is null))
);
create index fastbar_support_messages_request on public.fastbar_support_messages(tenant_id, request_id, created_at desc);

alter table public.fastbar_support_requests enable row level security;
alter table public.fastbar_support_messages enable row level security;
create policy support_server_only on public.fastbar_support_requests for all to service_role using (true) with check (true);
create policy support_messages_server_only on public.fastbar_support_messages for all to service_role using (true) with check (true);
revoke all on public.fastbar_support_requests, public.fastbar_support_messages from public, anon, authenticated;
grant select, insert, update, delete on public.fastbar_support_requests, public.fastbar_support_messages to service_role;

-- Locks the session for duplicate suppression and escalation counting under concurrent requests.
-- INVOKER and EXECUTE only for service_role: no public RPC can bypass the application gate.
create function public.fastbar_request_support(p_tenant_id uuid, p_session_id uuid, p_opted_in boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_status text;
  v_request public.fastbar_support_requests%rowtype;
  v_escalated boolean;
begin
  if p_opted_in is distinct from true then
    return jsonb_build_object('ok',false,'message','Ative o recurso de apoio antes de enviar.');
  end if;
  select s.status into v_status from public.fastbar_sessions s
    where s.id = p_session_id and s.tenant_id = p_tenant_id for update;
  if v_status is null or v_status in ('unverified','pending') or (v_status not in ('open','closed') and not exists(select 1 from public.fastbar_support_requests where tenant_id=p_tenant_id and session_id=p_session_id)) then
    return jsonb_build_object('ok',false,'message','O apoio está disponível na comanda confirmada pela equipe.');
  end if;
  select * into v_request from public.fastbar_support_requests
    where tenant_id=p_tenant_id and session_id=p_session_id and status in ('requested','attending');
  if found then
    return jsonb_build_object('ok',true,'id',v_request.id,'status',v_request.status,'escalated',v_request.escalated,'alreadyRequested',true);
  end if;
  select exists(select 1 from public.fastbar_support_requests where tenant_id=p_tenant_id and session_id=p_session_id)
    into v_escalated;
  insert into public.fastbar_support_requests(tenant_id,session_id,escalated)
    values(p_tenant_id,p_session_id,v_escalated) returning * into v_request;
  return jsonb_build_object('ok',true,'id',v_request.id,'status',v_request.status,'escalated',v_request.escalated,'alreadyRequested',false);
end $$;
revoke all on function public.fastbar_request_support(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.fastbar_request_support(uuid,uuid,boolean) to service_role;

-- One message per sender per second and per-incident lock: no race with staff completion.
create function public.fastbar_send_support_message(
  p_tenant_id uuid, p_request_id uuid, p_session_id uuid, p_sender text, p_body text, p_staff_name text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.fastbar_support_requests%rowtype;
  v_recent timestamptz;
begin
  if p_sender not in ('customer','staff') or p_sender is null or p_body is null or length(trim(p_body)) not between 1 and 1000 then
    return jsonb_build_object('ok',false,'message','Escreva uma mensagem de até 1000 caracteres.');
  end if;
  if p_sender='staff' and (p_staff_name is null or length(trim(p_staff_name)) not between 2 and 80) then
    return jsonb_build_object('ok',false,'message','Informe seu nome (2 a 80 caracteres).');
  end if;
  select * into v_request from public.fastbar_support_requests
    where id=p_request_id and tenant_id=p_tenant_id for update;
  if not found or v_request.status='completed' then
    return jsonb_build_object('ok',false,'message','Esse atendimento não está disponível para mensagens.');
  end if;
  if p_sender='customer' then
    if p_session_id is distinct from v_request.session_id or not exists(
      select 1 from public.fastbar_sessions s where s.id=p_session_id and s.tenant_id=p_tenant_id and s.status not in ('unverified','pending')
    ) then
      return jsonb_build_object('ok',false,'message','Atendimento não encontrado.');
    end if;
  end if;
  select max(created_at) into v_recent from public.fastbar_support_messages
    where request_id=p_request_id and tenant_id=p_tenant_id and sender=p_sender;
  if v_recent > clock_timestamp() - interval '1 second' then
    return jsonb_build_object('ok',false,'message','Aguarde um segundo antes de enviar outra mensagem.');
  end if;
  insert into public.fastbar_support_messages(tenant_id,request_id,sender,body,staff_name)
    values(p_tenant_id,p_request_id,p_sender,trim(p_body),case when p_sender='staff' then trim(p_staff_name) else null end);
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.fastbar_send_support_message(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fastbar_send_support_message(uuid,uuid,uuid,text,text,text) to service_role;
