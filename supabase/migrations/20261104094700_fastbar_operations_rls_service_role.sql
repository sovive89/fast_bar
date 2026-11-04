-- Corrige a RLS de fastbar_operations: a policy criada em
-- supabase/migrations/20260905220040_create_fastbar_operations.sql é
-- `for all using (true) with check (true)` sem `to service_role`, então vale pra QUALQUER papel
-- — inclusive anon/authenticated, que já têm grant padrão do PostgREST na tabela. Com a chave
-- pública do app (VITE_SUPABASE_PUBLISHABLE_KEY, que todo navegador carrega), dava pra ler, abrir,
-- fechar ou apagar operações direto pela API REST do Supabase, sem passar pela senha da equipe.
--
-- Mesmo achado (e mesma correção) que o github-advanced-security apontou no PR #48 para
-- fastbar_stock_counts/fastbar_stock_count_items — aqui é a mesma causa, só numa tabela que já
-- estava em produção antes dessa correção existir, então não dá pra editar a migration antiga
-- (já aplicada): precisa de uma nova que ajusta a policy existente.

drop policy if exists "service role full access" on public.fastbar_operations;
create policy "service role full access" on public.fastbar_operations
  for all to service_role using (true) with check (true);
revoke all on public.fastbar_operations from anon, authenticated;
