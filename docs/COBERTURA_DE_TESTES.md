# Cobertura de testes — FastBar

**Atualizado em:** 04/11/2026

**Base analisada:** `5ffdfda` (`master`) e estado de trabalho local no momento da análise. Este relatório descreve a cobertura observada no código; não representa um percentual de cobertura de linhas ou branches.

> **Estado do checkout:** há alterações locais ainda não commitadas de PWA/branding, suporte, autocomplete por telefone e configuração dos runners. Os números e conclusões abaixo correspondem ao estado de trabalho efetivamente testado; confirme que essas mudanças acompanham a documentação quando forem integradas.

## Resumo executivo

A suíte cobre regras de operação e estoque, produção, reabertura de inadimplência, pagamentos, crédito, pedido de conta, suporte ao cliente, notificações, configurações públicas, OCR, leitura de fotos de estoque e utilitários de comanda. Os testes TypeScript de aplicação são predominantemente unitários: substituem Supabase, integrações ou APIs do navegador por doubles, mocks e spies. Há também um runner de integração que aplica a migration de apoio a um PostgreSQL 17 descartável e executa assertions próprias.

A execução completa reportou **184 casos Vitest** e **42 testes Node** (30 de OCR e 12 de fotos de estoque), todos aprovados por `pnpm test`. O `vitest.config.ts` exclui os cinco arquivos `node:test` da descoberta Vitest; `pnpm test` encadeia o Vitest e os runners Node dedicados. O runner PostgreSQL tem assertions próprias e não entra nessa soma; não foi executado porque Docker não está disponível neste ambiente.

## Inventário de cobertura funcional

| Área                                           | Arquivos/casos                 | Principais regras exercitadas                                                                                                                   |
| ---------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Operação, fechamento, produção e inadimplência | 56 casos Vitest                | Abertura com conferência de estoque; destinos e bloqueios de fechamento; ordens e fichas de produção; reabertura e auditoria de inadimplência.  |
| Pagamentos, crédito e pedido de conta          | 41 casos Vitest                | Liquidação parcial/integral, saldo, crédito em comanda, Mercado Pago Point simulado e ciclo de pedido/atendimento de conta.                     |
| Apoio, dados públicos, branding e push         | 61 casos Vitest                | Privacidade e isolamento do apoio, prioridade, fila, chat, carregamento assíncrono, dados públicos, marca, notificações e service worker.       |
| OCR e leitura de fotos de estoque              | 47 casos: 5 Vitest + 42 Node   | Contrato de extração, seleção de conexão/modelo, fallback, formato Responses, parsing de valores e pré-processamento de imagens.                |
| Views de comanda e telefone                    | 21 casos Vitest                | Classificação de comandas, formatação, consulta/autopreenchimento por telefone e preservação de nomes editados.                                 |
| Schema/RPC de apoio em PostgreSQL              | Runner com assertions próprias | Migration, privilégios, segurança básica, concorrência, regras de pedidos/mensagens e retenção. Requer Docker; não foi executado nesta análise. |

### Operação, estoque, produção e inadimplência

- [`tests/operacao-abertura.test.ts`](../tests/operacao-abertura.test.ts) — 16 casos: seleção de itens contáveis, diferenças e motivos, quantidades inválidas, criação da operação/conferência, bloqueio de operação duplicada, comanda travada, bebidas/ingredientes/itens produzidos e contagens fracionadas.
- [`tests/operacao-fechamento.test.ts`](../tests/operacao-fechamento.test.ts) — 24 casos: elegibilidade por status/saldo/origem, destinos como arquivo, cortesia, inadimplência, conta pedida e manter aberta; seleção em massa, duplicidades, pendências e falhas parciais.
- [`tests/producao.test.ts`](../tests/producao.test.ts) — 11 casos: validação de ficha/componentes, rendimento e perda, gravações simuladas, rollback/limpeza após falha, quantidade da ordem e parâmetros/respostas da RPC simulada.
- [`tests/inadimplencia-reabertura.test.ts`](../tests/inadimplencia-reabertura.test.ts) — 5 casos: reabertura por telefone/documento, operação aberta, preservação de itens/pagamentos, auditoria, recusa de comanda quitada e de operação fechada.

### Pagamentos, créditos e pedido de conta

- [`tests/pagamento-parcial.test.ts`](../tests/pagamento-parcial.test.ts) — 10 casos: pagamento total/parcial, motivo e senha, saldo restante, quitação posterior, valores inválidos/excessivos, estados cancelado/pago e arredondamento.
- [`tests/credito-comanda.test.ts`](../tests/credito-comanda.test.ts) — 9 casos: crédito e saldo, recusa de valores/comandas inválidos, aplicação por item, remoção de consumo, débito acima do crédito, quitação parcial/total e sobra de crédito.
- [`tests/credito-maquininha.test.ts`](../tests/credito-maquininha.test.ts) — 7 casos: criação simulada de cobrança, webhook aprovado/repetido, estados pendentes, falha/cancelamento de terminal e pagamento normal.
- [`tests/pedido-conta.test.ts`](../tests/pedido-conta.test.ts) — 15 casos: abertura/repetição, estados ativos, validação de comanda, assumir/concluir, fechamento associado e envio/notificação de push simulado.

### Apoio, experiência cliente, dados públicos, branding e notificações

- [`tests/support-requests.test.ts`](../tests/support-requests.test.ts) — 21 casos: adesão, validação de sessão, persistência via RPC mockada, notificação discreta, status público minimizado, isolamento por tenant, gate da equipe, fila, retenção, transições e chat privado.
- [`tests/support-priority.test.ts`](../tests/support-priority.test.ts) — 5 casos: prioridade aos 30/60 segundos, reincidência, status atendido/concluído e datas/relógio inválidos.
- [`tests/support-alert-sound.test.ts`](../tests/support-alert-sound.test.ts) — 4 casos: disponibilidade das APIs de áudio, bloqueio por política do navegador, variação de tons/volume e padrões de vibração.
- [`tests/public-company.test.ts`](../tests/public-company.test.ts) — 5 casos: campos públicos permitidos, sanitização de telefone/CNPJ e consulta do tenant correto.
- [`tests/branding-background.test.ts`](../tests/branding-background.test.ts) — 2 casos: validação de URL HTTPS e limites/padrão de opacidade.
- [`tests/client-async.test.ts`](../tests/client-async.test.ts) — 3 casos: resultado bem-sucedido, rejeição e timeout do helper de fallback, preservando o valor anterior em falhas.
- [`tests/push.test.ts`](../tests/push.test.ts) — 13 casos: VAPID, validação e persistência de inscrições, payload/TTL/urgência, remoção em 404/410, falha transitória e isolamento por aparelho.
- [`tests/push-sw.test.ts`](../tests/push-sw.test.ts) — 6 casos: eventos `push`/`click` com `self` simulado, payload inválido, vibração de apoio e navegação/foco restritos ao app.
- [`tests/push-webpush-real.test.ts`](../tests/push-webpush-real.test.ts) — 2 casos: criação local de detalhes criptográficos com a biblioteca `web-push` e rejeição de chave VAPID inválida; não envia push pela rede.

### OCR, documentos e fotos de estoque

- [`tests/ocr-contract.test.ts`](../tests/ocr-contract.test.ts) — 5 casos Vitest: normalização de cupons legíveis/tremidos, JSON entre cercas Markdown, descarte de itens inválidos e uma checagem textual limitada sobre persistência.
- [`tests/ocr-connection.test.ts`](../tests/ocr-connection.test.ts) — 5 testes Node: resolução de configuração OpenAI/Gateway/endpoint customizado e normalização de provedor.
- [`tests/ocr-fallback.test.ts`](../tests/ocr-fallback.test.ts) — 11 testes Node: sucesso primário, fallback em falha temporária/rede, não fallback em erro de autenticação, permissão, quota ou recusa, respostas incompletas e extração vazia.
- [`tests/ocr-model.test.ts`](../tests/ocr-model.test.ts) — 9 testes Node: corpo das requisições, modelos Gateway/OpenAI, imagem/PDF, temperatura/detalhe de imagem e rejeição de identificadores incompatíveis.
- [`tests/ocr-responses.test.ts`](../tests/ocr-responses.test.ts) — 5 testes Node: payload Responses para imagem/PDF, resolução do transporte, parsing de blocos de texto e partes do schema estrito.
- [`tests/stock-photo.test.ts`](../tests/stock-photo.test.ts) — 12 testes Node: decimais brasileiros, linhas incompletas/inconsistentes, PDF/imagem, proteção contra preço/dados fiscais inferidos de foto, embalagem/quantidade, validação de estoque e pré-processamento de imagem.
- [`tests/fixtures/cupom-legivel.json`](../tests/fixtures/cupom-legivel.json) e [`tests/fixtures/cupom-tremido.json`](../tests/fixtures/cupom-tremido.json) são fixtures de entrada, não casos adicionais por si só.

### Views e utilitários

- [`tests/customer-phone-lookup.test.ts`](../tests/customer-phone-lookup.test.ts) — 5 casos Vitest: telefone inválido, ausência/correspondência, gate do caixa, escopo por tenant e retorno minimizado ao nome.
- [`tests/customer-phone-autocomplete.test.ts`](../tests/customer-phone-autocomplete.test.ts) — 7 casos Vitest: telefone pronto para consulta, token obsoleto, autopreenchimento, limpeza ao trocar número, preservação de edição manual e precedência CPF/RG.
- [`tests/comanda-views.test.ts`](../tests/comanda-views.test.ts) — 7 casos: classificação de status nas abas Em aberto, Fechadas, Histórico e Inadimplentes sob combinações selecionadas de operação/arquivamento.
- [`tests/format-phone.test.ts`](../tests/format-phone.test.ts) — 2 casos: formatação de telefone celular/fixo brasileiro e retorno vazio para valores vazios ou nulos.
- [`tests/helpers/fake-supabase.ts`](../tests/helpers/fake-supabase.ts) é infraestrutura de simulação, não contém casos de teste próprios.

## Integração PostgreSQL para apoio

[`tests/run-support-sql.mjs`](../tests/run-support-sql.mjs) é executado com `pnpm test:support-sql`. Ele cria um contêiner PostgreSQL 17 descartável, prepara tabelas mínimas de tenant/comanda, aplica `supabase/migrations/20261104192808_support_requests.sql` e remove o contêiner ao final.

As assertions existentes e acrescentadas verificam: RLS habilitado; ausência de privilégios de tabela/RPC para `anon` e `authenticated`; grants de DML para `service_role`; adesão e estados de sessão aceitos/recusados; isolamento por tenant/comanda; repetição idempotente; oito chamadas concorrentes resultando em um pedido; chat cliente/equipe e limite de envio; continuidade após pagamento; bloqueio de mensagem após conclusão; escalada de reincidência; retenção de 90 dias com cascade; índice único de pedido ativo; e constraints para dados de atendimento, conclusão e autoria de mensagem.

**Limite importante:** o runner verifica que RLS está habilitado e confere ACLs/grants, mas não faz operações como `anon`/`authenticated` para comprovar o efeito de cada policy. Além disso, usa um PostgreSQL local com schema mínimo, não uma instância Supabase real nem o schema completo de produção.

## Runners e resultados observados

Ambiente desta verificação: Node.js `v22.23.4`, pnpm `11.25.0`, commit-base `5ffdfda`.

| Comando                                                                                 | Resultado observado                                                                                    | Interpretação                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                             | Passou: 184 testes Vitest em 22 arquivos, 30 testes Node de OCR e 12 testes Node de fotos. Total: 226. | Executa `test:vitest` e, em seguida, `test:node`; não deixa os arquivos `node:test` entrarem na descoberta do Vitest. As mensagens OCR de HTTP 4xx/5xx são respostas simuladas pelas fixtures. |
| `pnpm test:vitest`                                                                      | Passou: 184 testes em 22 arquivos.                                                                     | Usa `vitest.config.ts`, que preserva o config Vite do app e exclui `ocr-connection`, `ocr-fallback`, `ocr-model`, `ocr-responses` e `stock-photo`.                                             |
| `pnpm test:node`                                                                        | Passou: 42 testes Node (30 OCR + 12 fotos).                                                            | Encadeia os runners Node existentes `test:ocr-model` e `test:stock-photo`.                                                                                                                     |
| `pnpm test:ocr-model`                                                                   | Passou: 30 testes Node.                                                                                | Executa conexão, fallback, modelo e Responses via `tests/run-ocr-model.mjs`; os códigos HTTP de erro exibidos no log são cenários simulados.                                                   |
| `pnpm test:stock-photo`                                                                 | Passou: 12 testes Node.                                                                                | Executa `tests/stock-photo.test.ts` via `tests/run-stock-photo.mjs`.                                                                                                                           |
| `pnpm test:support-sql`                                                                 | Não executado com sucesso: o processo falha ao iniciar Docker (`Docker command failed`).               | O ambiente não tem Docker CLI/daemon disponível; não significa que as assertions SQL passaram ou falharam.                                                                                     |
| `node --check tests/run-support-sql.mjs` e `pnpm exec eslint tests/run-support-sql.mjs` | Passaram.                                                                                              | Validação estática/sintática do runner; não substitui executar a integração PostgreSQL.                                                                                                        |

Para rodar os testes de apoio focados em Vitest:

```bash
pnpm exec vitest run \
  tests/support-requests.test.ts \
  tests/support-priority.test.ts \
  tests/support-alert-sound.test.ts
```

Essa seleção passou com 30/30 casos durante a sessão. A suíte completa agora inclui esses casos e conclui com sucesso usando `pnpm test`.

## Doubles, mocks e fronteiras do que é validado

- A maioria dos fluxos de servidor usa [`tests/helpers/fake-supabase.ts`](../tests/helpers/fake-supabase.ts) ou `vi.mock` de módulos de acesso ao Supabase. Isso valida lógica de aplicação e payloads, não constraints PostgreSQL, transações, RLS efetivo ou comportamento de rede.
- O FakeSupabase não reproduz integralmente o banco: `order()` não ordena e comparações `lt` são simplificadas/convertem valores para string. Testes que dependem dessas semânticas podem dar confiança indevida sobre ordenação/filtragem real.
- Mercado Pago, notificações, RPCs, CRM e provedores OCR são geralmente simulados por handlers, spies, respostas locais e `fetch` falso. Não há confirmação de conexão com serviços externos, webhooks reais ou dispositivos.
- O teste `push-webpush-real` usa criptografia local da biblioteca, mas não realiza envio. `push-sw` simula APIs do service worker, não roda em navegador instalado ou aparelho real.
- Os fixtures de OCR não são validados campo a campo em sua totalidade; alguns dados são usados apenas para contagem ou cenários selecionados.

## Lacunas relevantes e prioridades

1. **Executar PostgreSQL em CI:** disponibilizar Docker/PostgreSQL 17 no pipeline e executar `pnpm test:support-sql`. Acrescentar probes reais sob `anon` e `authenticated` para as policies RLS, além das verificações atuais de ACL.
2. **Aproximar o fake do banco:** documentar as limitações e adicionar teste de integração sempre que a regra depender de ordenação, comparação de datas, transação, atomicidade, uniqueness ou concorrência.
3. **Cobrir falhas de persistência e corridas de negócio:** ampliar abertura/fechamento, auditoria, produção/estoque, reabertura, crédito e pedido de conta com falhas reais de gravação, transições concorrentes e testes de seleção ordenada.
4. **Adicionar testes E2E de cliente/equipe:** validar rotas, autenticação/gate, estados visuais, PWA instalada, reconexão, teclado móvel, permissões do navegador e service worker em browser/device.
5. **Aumentar testes de integrações externas:** cobrir contratos/sandbox para Mercado Pago, entrega de push e OCR sem expor segredos, separando claramente teste simulado de teste real.
6. **Adicionar cobertura quantitativa:** não há script/limiar de cobertura por linha/branch configurado em `package.json`. Este documento é um inventário comportamental; não deve ser interpretado como percentual de cobertura do código.

## Convenção para manter este documento

Ao adicionar ou alterar uma suíte, atualizar a matriz com: arquivo, runner, número de casos e regras protegidas. Registrar separadamente:

- o que foi exercitado por unit test/mock;
- o que foi exercitado em PostgreSQL descartável;
- o que foi exercitado em navegador/serviço externo real;
- comando, pré-requisitos e resultado observado.

Contar cada caso conforme o runner que o executa; fixtures e helpers não contam como casos. Nunca marcar integração real como aprovada apenas porque mocks ou validações estáticas passaram.
