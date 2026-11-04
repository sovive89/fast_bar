# Roteiro de teste manual — abertura e fechamento de operação

Cobre o que os testes automáticos (`tests/operacao-*.test.ts`) não alcançam: as migrations no
banco real, as telas no celular e o caminho completo de ponta a ponta. Faça no celular, na largura
de tela que a equipe usa no balcão.

Se algum passo não der o resultado esperado, anote o número do passo, o que apareceu na tela (texto
exato ou print) e o horário.

## 0. Pré-requisitos

1. As três migrations estão aplicadas no Supabase de produção, nesta ordem:
   - `20261104093000_stock_counts_abertura_operacao.sql`
   - `20261104094700_fastbar_operations_rls_service_role.sql`
   - `20261104102500_fechamento_operacao.sql`
   - `20261104110000_stock_count_items_kinds.sql`
   - `20261104120000_session_payments.sql`
2. O último deploy do `master` terminou no Amplify.
3. Não há operação aberta. Se houver, ela foi aberta antes da mudança: encerre-a pelo fluxo novo
   (passo 5) antes de começar.
4. Existe pelo menos uma bebida base ativa (ou ingrediente, ou produto com estoque próprio). Anote
   o saldo atual dela: **saldo inicial = ___**.

## 1. Comanda bloqueada sem operação

| Ação | Resultado esperado |
| --- | --- |
| Sem operação aberta, tente abrir uma comanda pela equipe | Mensagem "Nenhuma operação aberta. Abra o caixa antes de criar comandas." |
| Tente abrir a comanda de balcão | A mesma mensagem |
| No celular de um cliente, escaneie o QR e tente abrir uma comanda nova | "O bar ainda não abriu. Tente novamente em instantes." |

## 2. Abertura com conferência

| Ação | Resultado esperado |
| --- | --- |
| Toque em "Abrir operação" no topo do caixa | Abre a tela "Conferência de estoque", com grupos "Bebidas base", "Ingredientes" e as categorias de produto, e o "Teórico" de cada item |
| Confira se aparecem produtos com ficha técnica, estoque ilimitado ou itens desativados | Não devem aparecer |
| Num item em ml, digite um valor com vírgula (ex.: 350,5) | O valor é aceito e a diferença aparece com decimal |
| No produto anotado, mude "Contado" para o saldo inicial **menos 2** | Aparece "Diferença de -2" e os campos Motivo e Observação |
| Toque em "Concluir conferência e abrir operação" sem escolher motivo | Mensagem pedindo o motivo daquele produto; nada abre |
| Escolha o motivo "Perda / quebra", escreva uma observação, conclua e digite a senha | Volta para o caixa, com "Operação dd/mm/aaaa — aberta às hh:mm" no topo |
| Abra Estoque e veja o saldo do item | **Continua igual ao saldo inicial.** A conferência só registra; não corrige o saldo |

## 3. Comandas durante a operação

| Ação | Resultado esperado |
| --- | --- |
| Abra três comandas (A, B, C) e lance um item em cada | As três aparecem em "Em aberto" |
| Feche a comanda C (pedir a conta), sem registrar pagamento | C sai de "Em aberto" e aparece em "Todas" como "Fechada" |

## 4. Encerramento bloqueado

| Ação | Resultado esperado |
| --- | --- |
| Toque em "Encerrar operação" | Abre "Comandas pendentes", listando A, B e C com o valor de cada uma |
| Veja o botão do fim da tela | Desabilitado, com "Resolva as 3 comanda(s) pendentes primeiro" |

## 5. Destinos

| Ação | Resultado esperado |
| --- | --- |
| Em A, toque "Cortesia", escreva só "ok" e confirme com a senha | Recusa: "Descreva o motivo." |
| Em A, escreva um motivo de verdade e confirme | A some da lista |
| Em B, toque "Inadimplência", motivo + senha | B some da lista |
| Em C, toque "Manter aberta" (não pede motivo), senha | C some da lista |
| Recarregue a página | A lista continua vazia (nenhuma volta pedindo destino) |
| Toque em "Encerrar operação" e digite a senha | Volta ao caixa, com "Nenhuma operação aberta" no topo |

## 6. Lista de comandas depois do encerramento

As abas são: **Em aberto**, **Fechadas nesta operação**, **Histórico** e **Inadimplentes**.

| Ação | Resultado esperado |
| --- | --- |
| Aba "Inadimplentes" | Mostra B, com status "Inadimplente" (o contador aparece na aba) |
| Aba "Em aberto" | Mostra C (conta pedida, ainda sem pagamento, mantida aberta) e não mostra A nem B |
| Aba "Fechadas nesta operação" | Com a operação encerrada, está vazia; A (cortesia) já foi para o Histórico |
| Aba "Histórico" | Mostra A, com status "Cortesia" |
| Abra uma nova operação (passo 7) e veja as abas | "Fechadas nesta operação" começa vazia; nada de operações anteriores aparece nela |
| Nessa nova operação, abra uma comanda, lance, registre o pagamento | Ela aparece em "Fechadas nesta operação" e, na operação seguinte, passa para "Histórico" |

## 7. Pular a conferência

| Ação | Resultado esperado |
| --- | --- |
| "Abrir operação" → "Pular conferência (exige senha e motivo)" | Pede um motivo |
| Motivo curto ("abc") + senha | Recusa: "Descreva o motivo de pular a conferência." |
| Motivo de verdade + senha | Abre a operação normalmente |

## 8. Pagamento parcial

Abra uma comanda, lance itens que somem R$ 30 e feche a conta.

| Ação | Resultado esperado |
| --- | --- |
| Em "Registrar pagamento", deixe "Valor recebido" vazio e registre | Comanda paga pelo valor total (como sempre), sem pedir senha |
| Noutra comanda de R$ 30, digite 10 em "Valor recebido" | Aparece o aviso "faltam R$ 20,00, que ficam como dívida em Inadimplentes (não é desconto)" e os campos Motivo e Senha |
| Tente registrar com motivo "ok" | Botão desabilitado (motivo precisa de 5+ letras) |
| Motivo de verdade + senha errada | "Senha incorreta."; nada é gravado |
| Motivo + senha certa | Volta ao caixa; a comanda está em "Inadimplentes" |
| Abra a comanda inadimplente | Mostra "Já recebido −R$ 10,00" e "Saldo a receber R$ 20,00" |
| Digite 25 em "Valor recebido" | Aviso de valor inválido (maior que o saldo); botão desabilitado |
| Registre o saldo (campo vazio) | Comanda vira "Paga"; saída de Inadimplentes |
| Em outra parcial, toque "Reabrir comanda" | Reabre, e o saldo a receber continua mostrando o que faltava |

## 9. Auditoria no banco (quem tem acesso ao Supabase)

Confirme que ficou gravado:

```sql
-- Conferências: uma por operação, CONCLUIDA (passo 2) e PULADA (passo 7, com motivo)
select o.data_operacional, c.status, c.motivo_pulo, c.created_at
from fastbar_stock_counts c join fastbar_operations o on o.id = c.operacao_id
order by c.created_at desc limit 5;

-- Itens da conferência do passo 2: diferença -2, motivo perda_quebra, com o tipo do item
select item_kind, product_name, quantidade_esperada, quantidade_contada, divergencia, motivo, observacao
from fastbar_stock_count_items order by created_at desc limit 10;

-- Pagamentos do passo 8: parcial com motivo e saldo_apos > 0, depois o restante com saldo_apos = 0
select s.customer_name, p.amount, p.method, p.saldo_apos, p.motivo, p.created_at
from fastbar_session_payments p join fastbar_sessions s on s.id = p.session_id
order by p.created_at desc limit 10;

-- Destinos do passo 5: cortesia e inadimplência com motivo e valor; mantida_aberta sem os dois
select session_customer_name, destino, motivo, valor, created_at
from fastbar_operation_closures order by created_at desc limit 10;
```

E que a chave pública **não** lê essas tabelas: uma chamada REST com a `anon key` em
`/rest/v1/fastbar_stock_counts` deve voltar vazia ou com erro de permissão, nunca com as linhas.
