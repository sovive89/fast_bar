# Templates para o Notion (FastBar / Pop9 Bar)

Modelos prontos para colar no Notion (cada bloco vira uma página de banco de dados). O conector do
Notion não estava ligado nesta sessão, então os templates estão aqui em Markdown. Cole o texto numa
página nova do Notion e ele converte os títulos, tabelas e caixas de seleção.

Sugestão de bancos de dados: **Decisões**, **Entregas (PRs)**, **Módulos e abas**, **Roteiro de teste**,
**Ocorrências de operação**, **Pendências do dono**.

---

## 1. Decisão do produto

**Propriedades:** Data · Área (Comandas / Estoque / Caixa / Cardápio / Empresa / Segurança) · Status
(Decidido / Proposta / Substituída) · Responsável · Código (arquivo) · PR

```
# [Título curto da decisão]

**Data:** dd/mm/aaaa  |  **Status:** Decidido
**Pedido do dono (nas palavras dele):** "..."

## O que foi decidido
- ...

## Por quê
- ...

## Efeito no sistema
- Estoque: ...
- Caixa/financeiro: ...
- Relatórios/histórico: ...
- Auditoria (autor, horário, motivo, valor antes/depois): ...

## Onde está no código
- `src/...`

## Substitui / substituída por
- (deixar a linha antiga e anotar "substituída por")
```

## 2. Entrega (PR)

**Propriedades:** Branch · PR · Prioridade (P0–P6) · Migration aplicada? (Sim/Não) · Testes · Quem (Claude Code / Codex)

```
# [Nome da entrega]

## Critérios de aceite (CLAUDE.md §8)
- [ ] Migration/tabelas e RLS (`to service_role`, revoke de anon/authenticated)
- [ ] Perfis: quem vê, cria, aprova, edita, encerra
- [ ] Fluxo feliz + exceções com senha/motivo
- [ ] Efeito em estoque, caixa, relatório e histórico
- [ ] Testes (unitário/integração/roteiro) + dados de demonstração não sensíveis
- [ ] Validado em celular estreito (light e dark)

## Antes do merge
- [ ] Migration aplicada em produção (conferir tabelas, não só a lista de versões)
- [ ] `pnpm test`, `pnpm run build`
- [ ] Atualizado `docs/DECISOES.md` e `docs/DIVISAO_TAREFAS.md`
```

## 3. Módulo / aba / rota

**Propriedades:** Rota · Menu (sim/não) · Perfil com acesso · Estado (Feito / Decidido / Proposta) · Mobile validado

```
# [Módulo ou aba]

**Rota:** /caixa/...  |  **Onde aparece:** menu lateral / aba de X / botão no cabeçalho
**Estado:** Feito | Decidido | Proposta

## Conteúdo
- ...

## Movido de / para
- De: ...  → Para: ...  (manter redirecionamento da rota antiga)

## Pendências
- ...
```

## 4. Roteiro de teste de operação

```
# Roteiro — [data]

## Abertura
- [ ] Abrir operação com conferência de estoque (com senha)
- [ ] Pular conferência com senha + motivo (fica auditado)

## Durante
- [ ] Abrir comanda por QR e pela equipe
- [ ] Lançar itens, pagamento parcial (vira pendência), crédito pela maquininha
- [ ] Cliente pede conta no celular → alerta no caixa (banner, som, vibração)

## Fechamento
- [ ] Selecionar comandas e aplicar: Arquivo / Cortesia / Inadimplência / Fechar conta / Manter aberta
- [ ] Destino recusado quando a regra não permite (ex.: arquivar com saldo)
- [ ] Falha parcial em lote mostra qual comanda e por quê
- [ ] Encerrar operação só quando não sobrar comanda sem destino

## Retorno do cliente
- [ ] Cliente inadimplente volta: comanda reabre com a dívida
- [ ] Antes de verificar o celular, itens antigos NÃO aparecem

## Resultado
- Passou / Falhou / Observações:
```

## 5. Ocorrência de operação (sensível — acesso restrito)

Só perfis autorizados. Minimizar dados pessoais; definir retenção antes de uso real (LGPD).

```
# Ocorrência — [data/hora]

**Tipo:** dano patrimonial | apoio | divergência de estoque | outro
**Registrada por:** ...  |  **Aprovada por (gestor):** ...
**Status:** aguardando avaliação | resolvida | não resolvida (acionada de novo)

## Narrativa da equipe
...

## Valores / quantidades (antes → depois)
...

## Ações tomadas e horários
- hh:mm — ...

## Observação
Não baixar patrimônio nem cobrar automaticamente: depende de avaliação humana.
```

## 6. Pendência do dono

```
# [Pendência]

**Tipo:** configuração | decisão | teste físico
**Exemplos:** desligar sincronização do Lovable · chaves VAPID no Amplify · testar maquininha · decidir aba Cozinha
- [ ] Feito
- Observações:
```
