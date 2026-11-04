# Divisão de tarefas entre agentes (Claude Code × Codex)

Atualizado em 04/11/2026 (fim do dia). Dois agentes trabalham neste repositório ao mesmo tempo. Esta divisão
existe para que os dois não editem os mesmos arquivos em paralelo, o que gera conflito de merge e
retrabalho. Leia também o `CLAUDE.md` (contexto de produto) e o `AGENTS.md` (regras de git do
Lovable).

## Critério da divisão

- **Codex tem acesso ao Supabase de produção** (MCP em `.codex/config.toml`). O Claude Code, na
  sessão em nuvem, não alcança o site no Amplify e só alcança o banco quando a sessão tem o
  conector do Supabase ligado. Em 04/11 o Codex parou e o conector estava ligado, então o Claude
  Code aplicou as migrations (item 1 abaixo). Regra: quem vir o conector funcionando pode aplicar,
  mas antes **confere o que já foi aplicado** (`list_migrations`) e registra aqui.
- **Cada agente fica com áreas de código diferentes.** O Codex já fez o OCR e a entrada de estoque
  por foto, então continua no estoque. O Claude Code fez abertura/fechamento de operação e
  comandas, então continua no fluxo de comanda e pagamento.

## Codex

1. ~~**Aplicar em produção as migrations novas**~~ — **feito em 04/11/2026** (projeto Supabase
   "Fastbar", `evjoxkllaaxgxdaupees`), pelo Claude Code, na ordem e conferido com os advisors de
   segurança:
   - `20261104093000_stock_counts_abertura_operacao.sql`
   - `20261104094700_fastbar_operations_rls_service_role.sql` (o editor do Supabase exige
     aprovação humana do `drop policy`; o dono rodou o SQL à mão no SQL Editor)
   - `20261104102500_fechamento_operacao.sql`
   - `20261104110000_stock_count_items_kinds.sql`
   - `20261104120000_session_payments.sql`
   - `20261104130000_session_credits.sql`
   - `20261104140000_pos_credit_charge.sql`
   - `20261104150000_producao_fichas_ordens.sql`

   Além disso, uma migration só no banco (não está no repositório): revogou o `EXECUTE` do
   público (`anon`/`authenticated`) em `fastbar_create_product`, `fastbar_update_product`,
   `fastbar_delete_consumable` e `rls_auto_enable`, que o app só chama pelo servidor.

   **Atenção:** as migrations foram aplicadas pelo conector, que registra a versão com a data/hora
   da aplicação e o nome sem o prefixo de data (ex.: `session_payments`), diferente dos arquivos do
   repositório (`20261104120000_session_payments`). O esquema está igual; só o histórico
   (`supabase_migrations.schema_migrations`) tem versões diferentes das do repositório. Quem for
   mexer em migrations deve conferir as tabelas, não só a lista de versões, e **não reaplicar** estas.

   **Alertas de segurança que sobraram** (não são das mudanças de 04/11), para o Codex ou quem
   pegar: `fastbar_default_tenant_id` executável pelo público (é o valor padrão do `tenant_id` em
   18 tabelas; antes de revogar, confirmar que nenhum fluxo grava com a chave pública),
   `update_updated_at` sem `search_path` fixo, e `fastbar_tenants` com RLS ligada e sem política.
2. **Testar o fluxo real** no app (roteiro em `docs/ROTEIRO_TESTE_OPERACAO.md`, quando existir):
   abrir operação com conferência, lançar numa comanda, encerrar com os três destinos.
3. **Baseline do esquema — Codex, em revisão**: `fastbar_sessions` (e outras tabelas base) nunca foi criada por
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
3. ~~Separar "Fechadas nesta operação" de "Histórico" na lista de comandas~~ (feito).
4. Item 3 do roadmap (crédito e pagamento), em PRs separados:
   - ~~Livro de pagamentos + pagamento parcial vira pendência~~ (feito neste PR).
   - ~~Crédito da comanda, consumido item a item~~ (feito: entradas em `fastbar_session_credits`, consumo derivado dos itens).
   - ~~Crédito pela maquininha~~ (feito; só o teste no terminal real fica com o dono) e recuperação ao reabrir (já vem de graça: o crédito é da comanda).
   - Pendente: devolver o crédito que sobrar (estorno) e mostrar o crédito na tela do cliente.
5. Item 5 do roadmap (Produção), em PRs separados:
   - ~~Itens produzidos + fichas de produção + ordens de produção~~ (feito; tela `/caixa/producao`).
   - Próximos: usar o item produzido em fichas de drink / cardápio, incluí-lo na conferência de estoque (`listCountableItems`), lote e validade do item produzido, Cozinha/KDS, sugestão do chef.

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
