# Decisões do produto

Registro das decisões do dono, com data. Cada linha diz o que foi decidido e onde está no código.
Quando uma decisão for revista, a linha antiga fica e ganha "substituída por" — o histórico de por
que algo é assim vale tanto quanto a regra atual. Contexto geral do produto: `CLAUDE.md`. Quem faz
o quê: `docs/DIVISAO_TAREFAS.md`.

## 04/11/2026 — fechamento de operação e inadimplência

### Destinos do fechamento: cinco, cada um com um sentido só

| Destino | Quando | O que acontece | Motivo |
| --- | --- | --- | --- |
| **Arquivo** | Comanda **sem saldo devido** | Vai para o Histórico. Com consumo vira "paga" (e soma no CRM); sem consumo nenhum, "cancelada". Com saldo, o sistema recusa | Não pede |
| **Cortesia** | Comanda com saldo que o bar decide não cobrar | Encerra; o valor perdoado fica registrado | Obrigatório |
| **Inadimplência** | Comanda com saldo que o cliente paga depois | Vai para a aba Inadimplentes com a dívida preservada; reabre quando o cliente voltar | Obrigatório |
| **Fechar conta** (`conta_pedida`) | Conta pedida, pagamento ainda não feito | **Ação parcial**: fica "aguardando pagamento", não encerra. Volta a aparecer nos fechamentos seguintes | Não pede |
| **Manter aberta** | Comanda desta operação que continua em uso | Nada muda na comanda | Não pede |

- Seleção em massa: caixas de seleção por comanda e "Todas" por grupo. Um destino só fica
  disponível quando **todas** as selecionadas aceitam. Uma senha e um motivo valem para o lote,
  mas cada comanda é gravada e auditada por conta própria (`fastbar_operation_closures`, uma linha
  por comanda e por operação). Se uma falhar, as outras seguem e a tela mostra qual e por quê.
- Código: `src/lib/operation-closure.server.ts` (regra `allowedDestinos`),
  `src/routes/caixa.fechamento.tsx`. Migration:
  `supabase/migrations/20261104190000_fechamento_destinos_arquivo_conta_pedida.sql`.

### Comandas antigas entram no fechamento

- Antes, só apareciam as comandas da operação aberta. Em 04/11/2026 havia **34 comandas antigas**
  abertas ou aguardando pagamento (R$ 3.129 de saldo) que nunca apareciam para receber destino.
- Agora aparece **toda** comanda aberta ou aguardando pagamento, de qualquer data, até receber um
  destino na operação atual. Elas ficam num grupo próprio, "De operações anteriores".
- Comanda antiga só aceita **Arquivo** (se quitada) ou **Inadimplência** (se deve). Ficar aberta de
  novo foi o que deixou essas comandas esquecidas.
- Exceção: comanda antiga sem dívida mas com **crédito sobrando** aceita só "Manter aberta" — não
  dá para arquivar (o crédito sumiria) e não há dívida. Sem essa saída a operação nunca encerraria.
  Resolve-se de vez quando existir a devolução de crédito.

### Inadimplente reabre quando o cliente volta

- O mesmo cliente (mesmo celular pelo QR; celular ou documento quando a equipe abre) volta para a
  comanda que ficou devendo, em vez de abrir uma nova. Itens e pagamentos continuam lá: reabrir
  **não apaga a dívida** (P2 do `CLAUDE.md`), e o saldo antigo é cobrado junto com o consumo novo.
- Pelo QR, a comanda reaberta passa pelas mesmas etapas de uma nova: código no celular (se ainda
  não verificou) e confirmação da equipe no balcão. Pela equipe, já volta aberta.
- Mais de uma comanda inadimplente do mesmo cliente: reabre a mais recente; as outras seguem na
  aba Inadimplentes.
- Cada reabertura fica registrada em `fastbar_session_reopenings` (quando, em qual operação, quem,
  quanto devia).
- Código: `src/lib/debt-reopen.server.ts`, chamado de `openClientSession` e `openSessionByTeam`.

### Itens só vão para o celular depois da verificação

- A tela do cliente recebia os itens da comanda mesmo antes de o código do celular ser confirmado.
  Com a reabertura, quem digitasse o celular de outra pessoa receberia o consumo antigo dela.
  Agora, comanda "não verificada" não manda itens (`getCustomerTab`, `tab-reads.functions.ts`).

## 04/11/2026 — forma de trabalho

- O repositório `sovive89/fast_bar` é a única base. Zips antigos do projeto estão obsoletos.
- Toda mudança vai por branch e PR; nada direto na `master`, que publica na Amplify e sincroniza
  com o Lovable.
- O dono pediu para **desligar a sincronização com o Lovable** (Settings → GitHub no projeto do
  Lovable). Até ser desligada, o aviso do `AGENTS.md` continua valendo. Depois, o aviso sai do
  `AGENTS.md` num PR pequeno. Os pacotes do Lovable no build (`@lovable.dev/vite-tanstack-config`)
  continuam: trocá-los mexe no deploy.
- **Desenvolvimento só pelo GitHub (04/11/2026):** o projeto nasceu no Lovable e o vínculo não pôde ser
  desligado pelo dono. Ninguém edita no Lovable; todo o desenvolvimento acontece no repositório
  (branch + PR). O vínculo fica parado: o Lovable só recebe o que entra na `master` e nada volta dele.
  Se um dia incomodar, o caminho é um repositório novo sem o vínculo (exige reconfigurar a Amplify).
  O aviso do `AGENTS.md` continua valendo enquanto o vínculo existir.
- As diretrizes de marca da Anthropic (skill `brand-guidelines`) **não se aplicam** ao FastBar: o
  painel tem a paleta própria e o cliente vê a marca do bar.

## Mapa de navegação e modelos

- Abas, módulos e realocações (feitas, decididas e propostas): `docs/NAVEGACAO_E_MODULOS.md`.
- Modelos para colar no Notion (decisão, entrega, módulo, roteiro de teste, ocorrência, pendência):
  `docs/TEMPLATES_NOTION.md`.

## Proposta (aguarda o dono) — NØUS Motion no FastBar

O dono pediu "colocar o NØUS Motion como ferramenta na aplicação". Ainda não está definido o que
o NØUS Motion é exatamente; esta é a leitura proposta, **não implementada**:

- **O que já existe**: a camada de animação do app, com a biblioteca Motion (motion.dev, versão
  12.23.12), em `src/components/motion/` (PR #62): `MotionProvider` (carrega só o necessário e
  respeita "reduzir movimento" do aparelho) e `Loading` (indicador de carregando), usada em 14
  arquivos.
- **Proposta**: chamar essa camada de **NØUS Motion** — o conjunto de animações assinado pela NØUS
  (a empresa por trás do FastBar/Pop9), com regras próprias:
  - aparece **só nas telas da equipe**, como a marca d'água do software. As telas do cliente
    seguem só a identidade do bar (decisão já registrada antes);
  - segue as regras visuais da NØUS: elementos que se movem com a câmera fixa, transparência,
    linhas brancas translúcidas, sem excesso de brilho;
  - continua leve no celular e desligável por "reduzir movimento";
  - animações maiores (Lottie, peças generativas) só entram onde o dono escolher, carregadas só
    naquela tela.
- ~~**Falta decidir**: se NØUS Motion é esse nome para a camada de animação, um módulo separado
  (ex.: biblioteca de animações reutilizada entre FastBar, site da NØUS e Pop9) ou outra coisa.~~
  **Substituída por** "04/11/2026 — NØUS Motion é uma biblioteca separada", abaixo.

## 04/11/2026 — NØUS Motion é uma biblioteca separada

- **Decidido:** NØUS Motion é uma **biblioteca própria**, reutilizável entre os produtos da NØUS
  (FastBar, Pop9, PØLE), e não o nome da camada de animação deste app.
- **Onde está:** repositório `sovive89/-Nous_motion`, pacote `@nous/motion` 0.1 (loader, botão,
  transição, presets JSON validados e editor visual). Especificação em
  `docs/ESPECIFICACAO_TECNICA.md` daquele repositório.
- **Estado no FastBar:** **não instalada**. A camada de animação do app continua sendo a de
  `src/components/motion/` (biblioteca Motion, PR #62). Instalar o `@nous/motion` aqui é um PR
  próprio, só com autorização explícita do dono.
- **Falta decidir:** quando instalada, se a `@nous/motion` **substitui** a camada de
  `src/components/motion/` ou **convive** com ela (por exemplo, `@nous/motion` só no editor de
  personalização e a camada atual no resto).

## 04/11/2026 — cardápio da PWA e apoio por adesão voluntária

- **Pedido do dono:** cardápio com logo pequena à esquerda, cabeçalho translúcido persistente,
  categorias em rolagem horizontal e atalhos de localização, contato e Instagram. Os produtos
  rolam por baixo. O endereço público é configurado em Marca, separado dos documentos da empresa.
- **Implementado nesta branch:** cabeçalho sticky no cardápio da comanda e na página inicial,
  links das categorias com compensação da altura do cabeçalho, WhatsApp, Instagram, mapa e
  compartilhamento de localização quando configurados. Sem migration; mantém as permissões
  existentes para editar Marca e retorna apenas o endereço destinado à exibição pública.
- **Esclarecimento do dono:** “alerta” significa apoio/segurança e pertence à PWA de atendimento.
  Uma tela explica as políticas de proteção do bar e a existência do botão. A pessoa escolhe
  aderir; **não se pergunta gênero neste fluxo**, por minimização dos dados — não por uma proibição geral da LGPD. O botão só aparece para quem optar pelo recurso.
- **Animação solicitada:** usar um template do NØUS Motion para esse botão. A biblioteca possui
  `NousButton` com templates `alert` e `notification`; ainda não foi instalada neste app.
  Este pedido autoriza a integração específica do botão, sem decidir a substituição da camada
  de animação do restante do aplicativo. A proposta antiga de usar a biblioteca apenas nas
  telas da equipe fica **substituída por esta exceção para o botão de apoio do cliente**.
- **Pendente, em entrega própria:** tela de adesão, persistência da escolha, acionamento por
  pressionar e segurar, ocorrência protegida, aviso prioritário e atendimento pela equipe,
  confirmação real do envio e integração do template. A infraestrutura de push existente não
  significa que esse fluxo já esteja implementado. Não mostrar confirmação de apoio enviado
  sem registro real. Não expor preferências nem ocorrências no CRM público.

## 04/11/2026 — apoio voluntário, conversa e Segurança

- O dono confirmou botão de apoio **sobreposto, translúcido e com respiro**, usando NØUS Motion,
  exclusivo de quem ativar voluntariamente após ler a política do bar; sem pergunta de gênero.
- Cliente e equipe trocam mensagens com opções prontas e envio explícito. **Sem gravação de áudio.**
- Apoio e pedido de conta são alertas diferentes. Apoio fica acima, com visual/som próprios,
  prioridade progressiva enquanto ninguém assume e novo acionamento destacado para a gestão.
- Segurança reúne o registro privado de atendimento e prepara abas de Ocorrências e Câmeras.
  O dono esclareceu que **ocorrência formal é posterior e só se necessária**: equipe redige,
  encaminha ao cliente e ele confirma ou pede correção. Não gerar documento automaticamente.
- **Estado nesta branch:** implementação de apoio/chat, fila da equipe e histórico. Ocorrência
  formal, assinatura, confirmação de relato e câmeras continuam não implementadas.
- **Substitui a pendência de integração específica:** NØUS Motion instalado para o botão de apoio,
  sem substituir a camada de animação do restante do app. Detalhes, permissões, retenção,
  migration e roteiro: `docs/APOIO_E_SEGURANCA.md`.

### Ajuste do dono — barra inferior e transparência no cardápio

- **Substitui o endereço separado em Marca e os atalhos no cabeçalho do PR#71:** endereço, telefone
  e CNPJ públicos vêm dos dados do estabelecimento; a barra inferior reúne contato, redes sociais,
  Maps e compartilhamento da localização com aplicativos. Os campos continuam editáveis no painel.
- O botão de apoio ativado fica na barra inferior da comanda. A logo pequena e as categorias
  permanecem na barra superior. Cards têm transparência ajustável para mostrar o fundo da marca,
  cuja imagem também pode ser configurada em Marca. Essa aparência se aplica à PWA do cliente.
