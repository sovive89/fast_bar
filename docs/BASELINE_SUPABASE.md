# Base do Supabase Preview

O Preview começa vazio. O histórico versionado criava tabelas do MVP, mas a primeira
migration de relatórios já dependia de `fastbar_sessions` e `fastbar_customers`,
que tinham sido criadas fora desse histórico.

A migration `20260811110619_fastbar_legacy_baseline.sql` cria as onze tabelas legadas
antes desse ponto. As definições foram conferidas no catálogo PostgreSQL do Fastbar.
Colunas e constraints introduzidas depois continuam nas migrations que as adicionam.
A base não contém registros de clientes, estoque, integrações ou credenciais.

- Banco novo: cria as tabelas, chaves, índices iniciais e ativa RLS. O acesso direto
  aos dados legados fica com o cliente administrativo usado pelo servidor.
- Banco com as onze tabelas: a base não modifica tabelas, dados ou permissões.
- Banco com parte das tabelas: a migration para para que o estado seja reconciliado.

A versão `20261013052000_restore_team_password.sql` foi preservada, sem reaplicar
o reparo antigo de senha. Ele era específico de um ambiente e usava um slug anterior
à renomeação. Configure a senha em cada ambiente pelo fluxo do aplicativo.

## Validação e aplicação

Use um Supabase local ou um Preview descartável e aplique o histórico desde um banco
vazio. Confira a existência de `fastbar_stock_counts`, `fastbar_stock_count_items`
e `fastbar_operation_closures`, a coluna `item_kind` e o acesso às quatro tabelas
operacionais: `service_role` deve conseguir ler e escrever; `anon` e
`authenticated` não devem ter acesso direto.

A base do Preview e a implantação da operação em produção são mudanças separadas.
Antes de aplicar as quatro migrations do [roteiro de operação](ROTEIRO_TESTE_OPERACAO.md),
confira a lista exata de versões pendentes e registre cada versão aplicada. Um
`db push --include-all` pode incluir outras migrations históricas quando há versões
divergentes entre o Git e o banco. Não use reset remoto.
