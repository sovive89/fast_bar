# Divisão de tarefas entre agentes (Claude Code × Codex)

Atualizado em 04/11/2026. Dois agentes trabalham neste repositório ao mesmo tempo. Esta divisão
existe para que os dois não editem os mesmos arquivos em paralelo, o que gera conflito de merge e
retrabalho. Leia também o `CLAUDE.md` (contexto de produto) e o `AGENTS.md` (regras de git do
Lovable).

## Critério da divisão

- **Codex tem acesso ao Supabase de produção** (MCP em `.codex/config.toml`). O Claude Code, na
  sessão em nuvem, não alcança nem o banco nem o site no Amplify. Então tudo que precisa do banco
  real fica com o Codex.
- **Cada agente fica com áreas de código diferentes.** O Codex já fez o OCR e a entrada de estoque
  por foto, então continua no estoque. O Claude Code fez abertura/fechamento de operação e
  comandas, então continua no fluxo de comanda e pagamento.

## Codex

1. **Aplicar em produção as migrations novas**, em ordem, e conferir com os advisors de segurança
   do Supabase:
   - `20261104093000_stock_counts_abertura_operacao.sql`
   - `20261104094700_fastbar_operations_rls_service_role.sql`
   - `20261104102500_fechamento_operacao.sql`
   - `20261104110000_stock_count_items_kinds.sql`
2. **Testar o fluxo real** no app (roteiro em `docs/ROTEIRO_TESTE_OPERACAO.md`, quando existir):
   abrir operação com conferência, lançar numa comanda, encerrar com os três destinos.
3. **Baseline do esquema**: `fastbar_sessions` (e talvez outras tabelas base) nunca foi criada por
   uma migration do repositório, só existe no banco. Por isso o check "Supabase Preview" quebra em
   todo PR que mexe em `supabase/migrations/`. Gerar uma migration de baseline a partir do banco
   real.
4. **Testes do OCR**: `tests/ocr-*.test.ts` e `tests/stock-photo.test.ts` usam `node:test`, mas o
   `pnpm test` roda `vitest`, que não acha nada neles. Migrar para `vitest` ou excluí-los da config
   do `vitest` (eles já têm `pnpm test:ocr-model` e `pnpm test:stock-photo`).
5. **Item 4 do roadmap (estoque)**: separar bebidas, ingredientes, produção, suprimentos e
   utensílios. (A conferência de abertura já cobre bebida base e ingrediente — feito pelo Claude
   Code, porque na prática ela saía vazia.) Ao criar tabelas de estoque novas, incluí-las em
   `listCountableItems` (`src/lib/stock-count.server.ts`).
6. **Layout da tela Estoque no celular**: o nome do item some, "custo" fica por cima de "Editar"
   e os botões (Editar, + Entrada, − Perda, Apagar, Lotes) vazam para fora do cartão. Visto em
   04/11 num iPhone, em `master.d22ipucenoerv1.amplifyapp.com`.

## Claude Code

1. Testes automáticos de abertura e fechamento de operação (`tests/operacao-*.test.ts`).
2. Roteiro de teste manual (`docs/ROTEIRO_TESTE_OPERACAO.md`).
3. Separar "Fechadas nesta operação" de "Histórico" na lista de comandas (pendência do item 2).
4. Item 3 do roadmap (crédito e pagamento): crédito pela maquininha, pagamento parcial vira
   pendência, crédito recuperado ao reabrir comanda.

## Arquivos compartilhados (cuidado)

Estes arquivos são tocados pelos dois lados. Antes de editar, faça `git fetch` e parta do
`master` mais recente; mantenha o PR pequeno e mergeie logo, para o outro agente partir dele:

- `src/integrations/supabase/types.ts` (cada um acrescenta as próprias tabelas)
- `src/routeTree.gen.ts` (gerado pelo build; em conflito, rode `pnpm run build` e aceite o novo)
- `supabase/migrations/` (use timestamps novos; nunca edite uma migration já aplicada)
- `CLAUDE.md` e este arquivo

## Regras comuns

- Uma branch por agente, um PR por entrega. Nada de force-push em branch do outro.
- Toda tabela nova nasce com RLS `to service_role` + `revoke all ... from anon, authenticated`.
- Antes de começar um item, atualize este arquivo dizendo quem pegou.
