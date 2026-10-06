-- Separa de vez o banco do FastBar dos produtos Pop9.
--
-- Por quê: o banco "Fastbar" (evjoxkllaaxgxdaupees) guardava 29 tabelas e 21
-- funções pop9_fastbar_* do repositório pop9_fast (abandonado; migrations
-- pop9_01..pop9_08, 21/08–01/09) e as tabelas do MVP/Lovable sem prefixo
-- (menu_items, tabs, tab_items, bar_*, stock_movements). Nada do FastBar usa
-- essas tabelas: não há FK, view, trigger nem função fastbar_* apontando para
-- elas (conferido em 05/10/2026). Todas estavam vazias, exceto menu_items
-- (10 produtos de exemplo), salvo em docs/backups/2026-10-05_menu_items_lovable.json.
-- O SQL original das pop9_* continua em supabase_migrations.schema_migrations
-- e no repositório sovive89/pop9_fast.
--
-- A função update_updated_at() fica: é genérica e pode ser usada por outras tabelas.

do $$
declare r record;
begin
  -- 1) funções pop9_fastbar_* (todas as sobrecargas)
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'pop9\_fastbar\_%'
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;

  -- 2) tabelas pop9_fastbar_*
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'pop9\_fastbar\_%'
  loop
    execute format('drop table if exists public.%I cascade', r.relname);
  end loop;
end $$;

-- 3) sobras do MVP/Lovable sem prefixo
drop table if exists public.tab_items cascade;
drop table if exists public.tabs cascade;
drop table if exists public.menu_items cascade;
drop table if exists public.bar_tab_items cascade;
drop table if exists public.bar_sessions cascade;
drop table if exists public.bar_products cascade;
drop table if exists public.stock_movements cascade;
