-- Restauração autorizada da senha da equipe do tenant Golpe Baixo.
-- A senha nunca é armazenada em texto: somente o SHA-256 é persistido.
do $$
declare
  v_tenant_id uuid;
begin
  select id into v_tenant_id
    from public.fastbar_tenants
   where slug = 'golpe-baixo';

  if v_tenant_id is null then
    raise exception 'Tenant golpe-baixo não encontrado';
  end if;

  insert into public.fastbar_integrations (tenant_id, key, enabled, config, updated_at)
  values (
    v_tenant_id,
    'acesso',
    true,
    jsonb_build_object('passwordHash', '6a551776eeaddabe5d552ea403fabaaa81825f6f05d7d945439ccd4e7dc09029'),
    now()
  )
  on conflict (tenant_id, key) do update
    set enabled = excluded.enabled,
        config = excluded.config,
        updated_at = excluded.updated_at;
end $$;
