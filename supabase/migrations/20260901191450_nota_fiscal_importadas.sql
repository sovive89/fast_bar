-- Controle de notas fiscais (NFC-e) já importadas via leitura de QR code, pra não deixar a
-- mesma nota ser lançada duas vezes no estoque por engano (câmera lendo o mesmo QR de novo, ou
-- duas pessoas confirmando a mesma nota ao mesmo tempo).
create table if not exists public.fastbar_notas_importadas (
  id uuid primary key default gen_random_uuid(),
  chave_acesso text not null unique,
  uf text,
  emitente_nome text,
  emitente_documento text,
  valor_total numeric,
  itens_importados integer not null default 0,
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['fastbar_notas_importadas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service role only" on public.%I', t);
    execute format(
      'create policy "service role only" on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')',
      t
    );
  end loop;
end $$;
