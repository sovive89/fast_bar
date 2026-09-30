-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- HOTFIX 30/09: as migrations de 17/09 (tenant_admins_and_signup, tenant_scope_create_product_and_category_rpcs,
-- consumables_and_menu_campo) trocaram a assinatura de 7 RPCs, mas o código que as acompanha nunca foi para o
-- GitHub. O deploy de produção (master 17a21d7) chama o formato antigo e recebe 404 do PostgREST.
-- Estas funções recriam as assinaturas antigas, delegando para as novas com o tenant padrão.
-- Só ADICIONA funções; remover quando o código novo (tenant-aware) estiver no master.

create or replace function public.fastbar_create_product(
  p_name text, p_price numeric, p_category text, p_unit text, p_package_type text,
  p_image_url text, p_initial_stock integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.fastbar_create_product(p_name, p_price, p_category, p_unit, p_package_type,
    p_image_url, p_initial_stock, public.fastbar_default_tenant_id(), null::text);
end; $$;

create or replace function public.fastbar_update_product(
  p_id uuid, p_name text, p_price numeric, p_category text, p_unit text, p_package_type text,
  p_image_url text, p_change_image boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.fastbar_update_product(p_id, p_name, p_price, p_category, p_unit, p_package_type,
    p_image_url, p_change_image, null::text, false);
end; $$;

create or replace function public.fastbar_delete_product(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.fastbar_delete_product(p_product_id, public.fastbar_default_tenant_id());
end; $$;

create or replace function public.fastbar_delete_base_drink(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.fastbar_delete_base_drink(p_id, public.fastbar_default_tenant_id());
end; $$;

create or replace function public.fastbar_delete_ingredient(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.fastbar_delete_ingredient(p_id, public.fastbar_default_tenant_id());
end; $$;

create or replace function public.fastbar_delete_product_category(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.fastbar_delete_product_category(p_id, public.fastbar_default_tenant_id());
end; $$;

create or replace function public.fastbar_update_product_category(p_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.fastbar_update_product_category(p_id, p_name, public.fastbar_default_tenant_id());
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.fastbar_create_product(text, numeric, text, text, text, text, integer)',
    'public.fastbar_update_product(uuid, text, numeric, text, text, text, text, boolean)',
    'public.fastbar_delete_product(uuid)',
    'public.fastbar_delete_base_drink(uuid)',
    'public.fastbar_delete_ingredient(uuid)',
    'public.fastbar_delete_product_category(uuid)',
    'public.fastbar_update_product_category(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
