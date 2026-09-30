-- Exportada do banco de produção (supabase_migrations.schema_migrations) em 30/09/2026.
-- Já aplicada em produção; este arquivo só versiona o que está no banco.

-- Foto própria no item de estoque (bebida e ingrediente).
--
-- Até aqui só o produto do cardápio tinha foto. Quando o insumo é criado junto com o produto
-- (cerveja cadastrada no cardápio nasce como bebida no estoque), a foto escolhida ali é copiada
-- pra cá — é o "importar a mesma foto" pedido.
--
-- Coluna própria, e não referência ao produto, de propósito: um insumo pode alimentar vários
-- produtos (a mesma garrafa de cachaça vira "dose de cachaça" e "caipirinha"), então não existe
-- "o produto dono da foto". Copiando, a foto do estoque também pode ser trocada depois sem mexer
-- no cardápio, e vice-versa.
alter table public.fastbar_base_drinks add column if not exists image_url text;
alter table public.fastbar_drink_ingredients add column if not exists image_url text;
