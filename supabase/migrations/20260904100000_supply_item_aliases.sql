-- "IA para aprender": toda vez que a equipe confirma qual insumo do estoque corresponde a uma
-- descrição de item vinda de fora (nota fiscal por QR, foto, planilha), essa correspondência é
-- guardada aqui. Da próxima vez que a mesma descrição aparecer -- de qualquer fonte -- a sugestão
-- já vem pronta, sem repetir o trabalho de casar o texto com o insumo certo.
create table if not exists public.fastbar_supply_item_aliases (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  raw_text_normalized text generated always as (lower(trim(raw_text))) stored,
  component_kind text not null check (component_kind in ('base_drink', 'ingredient')),
  component_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (raw_text_normalized)
);

create index if not exists fastbar_supply_item_aliases_component_idx
  on public.fastbar_supply_item_aliases (component_kind, component_id);
