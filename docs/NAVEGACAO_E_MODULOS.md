# Navegação, abas e módulos — estado real e decisões (04/11/2026)

Mapa do painel da equipe (`/caixa`) como está no código hoje, o que o `CLAUDE.md` (seção 4) pede, e as
decisões já tomadas. Legenda: **Feito** = está no código; **Decidido** = o dono decidiu, falta fazer;
**Proposta** = sugestão minha, aguarda o dono.

## 1. Menu lateral hoje (`src/routes/caixa.tsx`)

| Ordem | Item | Rota | Observação |
| --- | --- | --- | --- |
| 1 | **Empresa** | `/caixa/empresa` | **Novo (04/11).** Abas: Visão geral, Configurações, Conexões, Inventário, Gestão, Documentos (as três últimas **preparadas**, ainda sem função) |
| 2 | Comandas | `/caixa` | Tem as quatro abas abaixo |
| 3 | Cardápio | `/caixa/cardapio` | |
| 4 | Estoque | `/caixa/estoque` | Abas: Bebidas, Ingredientes, **Materiais e utensílios** (setor bar/cozinha/geral; tipo material de consumo ou utensílio; baixa manual com motivo), Fornecedores, Relatórios |
| 5 | Produção | `/caixa/producao` | Fichas técnicas, ordens, itens produzidos |
| 6 | CRM | `/caixa/crm` | Clientes, análises |
| 7 | Relatórios Vendas | `/caixa/relatorios` | |
| 8 | Alertas | `/caixa/alertas` | |
| 9 | Segurança | `/caixa/seguranca` | Apoio (histórico privado) e ocorrências; ver seção 8 |
| 10 | **Fiscal** | `/caixa/fiscal` | **Novo (04/11).** Módulo separado, **preparado**: não emite nota nenhuma |

Configurações e Conexões **saíram do menu** e moram em Empresa (`/caixa/empresa/configuracoes` e
`/caixa/empresa/conexoes`). As URLs antigas (`/caixa/configuracoes`, `/caixa/conexoes`,
`/caixa/marca`) redirecionam, então favoritos e o app instalado continuam funcionando.

Fora do menu, acessadas por botões no cabeçalho do caixa: **Abertura** (`/caixa/abertura`) e
**Fechamento** (`/caixa/fechamento`).

## 2. Abas da tela Comandas (**Feito**, `src/lib/comanda-views.ts`)

1. **Em aberto** — comandas em uso (inclui "conta pedida", que aguarda pagamento).
2. **Fechadas nesta operação** — desfechos da operação atual; na operação seguinte passam ao Histórico.
3. **Histórico** — comandas arquivadas (só as **sem saldo devido**, decisão de 04/11).
4. **Inadimplentes** — dívida preservada; sai daqui quando o cliente volta (reabre) ou paga.

## 3. Decisões sobre fluxo entre abas (04/11/2026)

- **Arquivo ≠ Inadimplência ≠ Cortesia ≠ Fechar conta**: quatro coisas diferentes (ver `DECISOES.md`).
  "Fechar conta" é ação **parcial**: a comanda segue em "Em aberto" aguardando pagamento.
- Comandas de operações anteriores entram no Fechamento e só podem ir a Arquivo (quitada) ou
  Inadimplência (deve). **Feito.**
- Inadimplente reabre quando o cliente volta (mesmo celular/documento). **Feito.**

## 4. O que o `CLAUDE.md` pede para a navegação e ainda **não** existe

| Pedido | Estado | Prioridade sugerida |
| --- | --- | --- |
| Módulo principal **Empresa** (Perfil, Marca e cardápio público, Operação, Presença digital, Documentos e legal, Unidades) | **Feito em parte (04/11):** o módulo existe com Configurações e Conexões dentro; Inventário, Gestão e Documentos são páginas preparadas. Faltam Presença digital e Unidades | Continuar por PRs pequenos |
| Abertura/Fechamento dentro de "Operação" | Estão como botões soltos no cabeçalho | **Proposta**: mover para Empresa → Operação quando o módulo existir |
| Cozinha/KDS desligável | Não existe; **decisão pendente do dono**: aba própria ou dentro de Produção | Pendente |
| Separar categoria interna × seção pública do cardápio | Não verificado no código nesta sessão | Verificar antes de dizer que está pronto |
| Alternar visão operacional/pública nas comandas | Não existe | P5+ |
| Relatórios com filtro de período em todos | Não verificado | Verificar |

## 5. Realocações de páginas/módulos propostas (**Proposta** — nada foi movido)

1. Criar **Empresa** e mover para dentro dela: Marca, Conexões, Configurações, Abertura, Fechamento.
   O menu lateral fica: Comandas, Cardápio, Estoque, Produção, CRM, Relatórios, Alertas, **Empresa**.
2. Renomear "Relatórios Vendas" para "Relatórios" quando entrarem custos, CMV e perdas.
3. Estoque: separar bebidas / ingredientes / produzidos / suprimentos / utensílios (item 4 do roadmap,
   com o Codex) — hoje só Bebidas e Ingredientes.
4. Patrimônio (bens duráveis) fica **separado** do Estoque, em módulo próprio.
5. Mover só com redirecionamento das rotas antigas, para não quebrar favoritos nem o PWA instalado.

## 6. Regras para qualquer mudança de navegação

- Um PR por movimentação; nada de reorganizar tudo de uma vez (`CLAUDE.md` §9).
- Validar em tela de celular estreita (UX mobile é prioridade absoluta).
- Atualizar este arquivo e o `DECISOES.md` no mesmo PR.

## 7. PWA do cliente — continuidade da gravação (04/11/2026)

- Nesta branch: cardápio também na página inicial; cabeçalho persistente com logo, categorias
  horizontais e atalhos públicos configurados em Marca (Instagram, WhatsApp e localização).
- O botão de apoio pertence à PWA de atendimento e será exibido somente após adesão voluntária,
  precedida da explicação das políticas do bar, sem coleta de gênero. Implementação pendente,
  incluindo o template NØUS Motion solicitado. Ver decisão correspondente em `DECISOES.md`.
- Roteiro: em 320/375/430 px, conferir ausência de rolagem lateral da página; rolar as categorias,
  saltar até a última e conferir que o título fica abaixo do cabeçalho; abrir cada atalho;
  compartilhar/cancelar compartilhamento; repetir com campos públicos vazios. Conferir no
  aparelho real após o deploy. Nenhum efeito sobre estoque, caixa ou histórico financeiro.

## 8. Segurança — apoio e áreas futuras (04/11/2026)

- Nesta branch, `/caixa/seguranca` e item Segurança no menu: Apoio (histórico privado), Ocorrências
  (preparada, abertura manual futura) e Câmeras (integração futura).
- Faixa prioritária de apoio acima do pedido de conta no layout da equipe. Na comanda do cliente,
  botão sobreposto só após adesão voluntária; conversa privada com mensagens prontas.
- O pedido não vira ocorrência formal automaticamente. A confirmação do relato pelo cliente é
  posterior, se a equipe precisar abrir uma ocorrência. Ver `APOIO_E_SEGURANCA.md`.
