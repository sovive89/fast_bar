# Fast Bar / Pop9 Bar — contexto único para Claude Code

> Este repositório também usa `AGENTS.md` para o aviso obrigatório do Lovable (histórico de commits sincroniza com o editor Lovable) — leia os dois; este arquivo é o contexto de produto, `AGENTS.md` é a regra operacional de git.

> Este arquivo é a fonte única de contexto de produto para agentes. Ele reúne
> pedidos do proprietário; **não significa que todos já foram implementados**.
> Antes de dizer que algo está pronto, inspeccione código, banco, migrations e
> fluxos reais. Nunca exponha chaves, senhas ou dados de clientes.

## 1. Produto e estado atual

- Projeto: sistema operacional para bar, hoje chamado **Fast Bar** no código.
  A marca pública desejada é **Pop9 Bar**; não faça uma renomeação global sem
  uma migração deliberada de marca e os ativos finais.
- Stack: Vite + React + TanStack Start/Nitro + Supabase. É um único aplicativo
  na raiz do repositório, não um monorepo de workspaces.
- O usuário quer prioridade absoluta para UX mobile e operações rápidas no
  balcão, sem perder auditoria para ações financeiras ou de estoque.
- O produto deve permanecer em português para a operação; código pode continuar
  em inglês.
- A aplicação ainda não deve se apresentar como multi-tenant completamente
  funcional: domínio próprio só pode ser liberado após resolver tenant pelo host
  em cada requisição e aplicar isolamento em todas as consultas/escritas.

## 2. Regras de trabalho inegociáveis

1. Preserve mudanças existentes que não pertençam à tarefa. Não use reset,
   checkout destrutivo, force-push, rebase ou amend de commits publicados.
2. Toda ação sensível deve ser auditável: autor, horário, operação, motivo,
   valor/quantidade anterior e posterior quando aplicável.
3. Senha de gestor/permissão é necessária para exceções: pular conferência,
   editar pagamento, desconto/cortesia, cancelamento, reabrir pendência,
   fechar comanda aberta e dano patrimonial.
4. Não cobrar, baixar patrimônio ou classificar perda automaticamente quando a
   decisão depender de avaliação humana.
5. Dados de apoio e ocorrências são sensíveis: minimização, acesso por perfil,
   retenção definida e sem exposição na interface pública.
6. Entregue por incrementos verticais testáveis; não tente construir todo o ERP
   numa alteração única.

## 3. Prioridade sugerida de implementação

### P0 — disponibilidade e fundação

- Publicar o app na AWS Amplify mantendo o Supabase existente.
- A branch de continuidade usada anteriormente foi `feat/celular-formato-55`.
- O build SSR deve gerar o artefato do Amplify (`.amplify-hosting`) via preset
  Nitro `aws_amplify`; não usar `dist` como artefato SSR.
- Variáveis essenciais: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` e `BAR_PANEL_PASSWORD`.
  Chaves de IA/OCR só são exigidas pelos respectivos recursos. Nunca registre
  valores de variáveis, especialmente `SUPABASE_SERVICE_ROLE_KEY`.
- Corrigir qualquer alternância arbitrária de tema/paleta: a paleta do painel
  administrativo deve ser estável. A identidade visual do cardápio público é
  uma configuração separada.

### P1 — operação diária segura

1. Depois de um fechamento, o próximo acesso deve iniciar em **Abertura de
   operação → conferência de estoque** antes das comandas.
2. Comparar o estoque teórico do último fechamento com a contagem física.
3. A confirmação exige senha; é permitido pular apenas com senha, motivo e
   trilha de auditoria.
4. Diferença sem causa conhecida deve gerar ajuste **Divergência de inventário /
   perda não identificada**, distinto de quebra, vencimento e consumo interno.
5. No fechamento da operação, detectar comandas abertas e permitir, uma a uma
   ou em massa com senha e justificativa:
   - fechar como cortesia;
   - enviar à inadimplência preservando o saldo;
   - manter aberta para a próxima operação.
6. Navegação de comandas: **Em aberto**, **Fechadas nesta operação**,
   **Histórico** e **Inadimplentes**. Fechadas passam a histórico na próxima
   operação; inadimplência permanece separada.

### P2 — comandas, cobrança e atendimento

- No fechamento, valor pago é editável somente com senha e justificativa.
  Motivos iniciais: desconto, cortesia, perda/quebra e lançamento errado.
- Pagamento parcial não é desconto: deve levar o saldo para pendência de
  pagamento/inadimplência. Reabrir exige permissão e não pode apagar a dívida.
- Suportar crédito pré-pago: atendente insere valor, cobra pela maquininha e o
  cliente consome o saldo gradualmente. A comanda pode ir ao histórico com
  crédito e recuperar o saldo quando reaberta.
- A integração de maquininha deve servir tanto para pagamento quanto para
  inserir crédito; não fingir confirmação automática de PIX sem integração
  real.
- Cliente deve poder pedir fechamento no celular. O painel e a equipe móvel
  recebem alerta visual/sonoro/push; a equipe marca em atendimento e fechado.
- Aviso de saldo pendente ao cliente deve ser neutro e respeitoso.
- Taxa de serviço é opcional, transparente e ajustável/recusável no fechamento.

### P3 — estoque, produção e patrimônio

#### Estoque consumível e de reposição

- **Bebidas alcoólicas**: unidade (garrafa/lata), chope por ml e doses por
  fração/unidade de medida.
- **Bebidas não alcoólicas**: uma categoria própria; bebidas produzidas como
  sucos e drinks sem álcool podem apontar para ficha técnica.
- **Ingredientes**: bar e cozinha, incluindo hortifruti, validade, lote e
  perecíveis.
- **Itens produzidos**: resultado de receitas e ordens de produção.
- **Operacionais**: subcategorias de limpeza, descartáveis, óleo, gás/GLP,
  CO₂, filtros, pilhas e demais materiais de consumo.
- **Utensílios de reposição**: copos, taças, pratos e talheres que podem ter
  custo de reposição e baixa rápida.
- Fornecedor é opcional em lançamentos operacionais. Todo lote precisa poder
  registrar quantidade, unidade de medida, custo, data e histórico para custo
  médio.

#### Inventário/patrimônio (separado do estoque)

- Bens duráveis: geladeiras, máquinas, mesas, cadeiras, decoração, mesa de
  sinuca etc. Registrar custo, estado, depreciação quando aplicável e valor de
  reposição/avaliação.
- Valuation deve ser estimativa por cenários e premissas, nunca uma soma
  apresentada como valor objetivo da empresa.

#### Produção e cozinha

- Reaproveitar conceitualmente a estrutura Pop9: **Fichas técnicas**, **Ordens
  de produção** e **Itens produzidos**.
- Produzir baixa ingredientes e gera saldo do item produzido; receitas devem
  ter rendimento, perdas e unidades de medida.
- Preparar módulo de Cozinha/KDS com a mesma base de fichas técnicas, porém
  desligável em configurações e sem obrigar bares sem cozinha a usá-lo.
- Criar “Sugestão do chef/bartender”: item temporário ou permanente, com ficha
  técnica rápida, preço, disponibilidade e exposição configurável no cardápio.
- Combos e Happy Hour precisam de regras de itens, preço, período e
  disponibilidade.

#### OCR de contagem

- OCR fica dentro do lançamento de lote/contagem — não como módulo solto.
- Usuário escolhe antes o produto do estoque e pode enviar até três fotos
  (frontal, lateral e superior). O sistema ajuda a contar unidades; usuário
  confirma manualmente. Não dependa de reconhecer marca/rótulo automaticamente.

### P4 — danos e perdas cobradas

- Para copos/taças/itens previamente autorizados: atalho de “reposição de
  utensílio” na comanda, com item, quantidade, motivo e baixa de estoque. A
  cobrança só ocorre mediante autorização de gestor.
- Para dano relevante ao patrimônio: somente gestor acessa “ocorrência de
  dano”; busca item, descreve, anexa foto, estima valor e deixa aguardando
  avaliação. Não baixar nem cobrar automaticamente.
- Não usar um dropdown gigante de todo inventário no atendimento comum.

### P5 — relatórios e inteligência

- Filtro de período/calendário em todos os relatórios.
- Vendas, categoria, produtos mais/menos vendidos, giro, CMV, margem, perdas,
  desperdício e custo médio.
- Custos operacionais (energia, gás, óleo, aluguel, APIs etc.) lançados em
  módulo administrativo e considerados em análises de margem quando houver
  dados suficientes.
- Insights apenas sugerem: reajuste de preço, variação de custo de fornecedor,
  item de baixa saída ou margem reduzida. Nunca ajustar preços automaticamente.
- Explicitar qualidade/ausência dos dados: lançamentos incompletos reduzem a
  precisão das inferências.

### P6 — administração, pessoas e documentos

- Criar módulo administrativo/contábil para despesas fixas, comprovantes,
  documentos, exportação ao contador e histórico.
- Pessoas/RH: usuário, perfis, jornada, ponto, diária/hora, hora extra, férias,
  contratos e documentos. Login de funcionário inicia jornada; continuidade ou
  hora extra requer autorização de gestor.
- Preparar dados para contador, mas não alegar que substitui emissão fiscal.
  Emissão NFC-e/NFS-e deve vir depois, com credenciamento, certificado e
  provedor adequado ao estado/município.
- Perfil jurídico/comercial: razão social, nome fantasia, CNPJ, sócios/cotas,
  natureza jurídica, regime tributário, contatos, endereço, alvarás, licenças,
  documentos fiscais e registro de visitas da vigilância sanitária.

## 4. Navegação e configurações

Criar o módulo principal **Empresa**, sem espalhar configuração pela sidebar:

- **Perfil da empresa**: dados legais, contatos, endereço, sócios, unidades.
- **Marca e cardápio público**: logo, imagem de fundo, paleta pública,
  transparência, tipografia entre opções, estilo de cards, ícones, ordem e
  visibilidade.
- **Operação**: horários, abertura/fechamento, impressoras térmicas,
  maquininha e conexões.
- **Presença digital**: site, PWA, cardápio público, QR Codes, domínio e links
  públicos. “Presença digital” é preferível a uma aba chamada apenas “Links”.
- **Documentos e legal**: arquivos societários, fiscais, licenças e contratos.
- **Unidades**: ao existir mais de uma, selecioná-la na abertura de operação;
  cada uma terá operações, estoque e relatórios próprios.

Para domínio próprio, o cliente informa o domínio e recebe instruções de DNS;
o backend valida e associa domínio ao tenant. Só ativar depois de isolamento
multi-tenant real.

## 5. Cardápio público e marca

- Mobile-first. No cliente, usar cabeçalho fixo e translúcido: logo no canto
  esquerdo, categorias em rolagem horizontal, acesso à comanda e informações do
  estabelecimento. Cards rolam por baixo sem invadir o cabeçalho.
- Painel “Informações” deve conter site, redes sociais com ícones, telefone,
  WhatsApp Business opcional, endereço, mapa/rotas, compartilhar localização e
  link de orçamento.
- O administrador pode definir mensagens rotativas na abertura/espera e usar
  variável de nome do cliente, de forma bem-humorada se desejar.
- Separar **categoria interna** (estoque, relatórios, cadastro) de **seção
  pública do cardápio** (nome criativo, ícone/foto, aparência, ordem e produtos
  vinculados). Exemplo: interno “Hambúrguer”; seção pública “Mata a fome”.
  Renomear exposição nunca pode quebrar estoque, ficha técnica ou relatórios.
- Categorias públicas podem ter biblioteca de ícones ou imagem enviada, cor,
  borda, tipografia, caixa alta/normal e formato visual. Padronizar tratamento
  de imagem para não degradar a interface.
- No administrador, manter categoria interna como padrão operacional e indicar
  a seção pública correspondente. Em comandas, permitir alternar entre visão
  operacional e visão pública quando fizer sentido.

## 6. Segurança e apoio a mulheres e pessoas LGBTQIA+

- O recurso é de proteção, não de marketing superficial. Precisa ser discreto,
  confiável e desenhado com privacidade.
- Não obrigar ninguém a informar gênero. Em vez disso, oferecer ativação
  voluntária e discreta de recurso de apoio para mulheres e pessoas LGBTQIA+;
  não guardar isso no CRM sem base legal e necessidade clara.
- Na primeira visita, mostrar política de proteção editável. Depois, manter
  botão flutuante persistente de apoio, acionado por pressionar e segurar alguns
  segundos. A interface do cliente deve confirmar apenas “equipe avisada”.
- O painel recebe alerta prioritário; reincidência escala para gestão. Registre
  status, horários, ações, responsáveis, narrativa da equipe e confirmação da
  pessoa que pediu ajuda. A pessoa pode indicar que não foi resolvido e acionar
  novamente.
- Ocorrências só podem ser vistas por perfis autorizados. Antes de lançamento,
  revisar LGPD, controle de acesso, retenção, resposta a incidente e orientações
  de especialistas locais.

## 7. Modelo de sessão/QR e pessoas na mesma comanda

- Cada pessoa pode escanear QR, abrir sua sessão e ter consumo individualizado.
- O atendimento pode unir sessões em uma conta/grupo mediante confirmação.
- No pagamento: uma pessoa paga tudo, divisão por itens, valor editável ou
  proporção. Preservar a atribuição individual e auditoria.
- Não condicionar o recurso de apoio à existência de uma comanda em nome da
  pessoa sem antes desenhar um caminho seguro para visitantes.

## 8. Critérios de aceite por entrega

Para cada módulo entregue, documentar:

1. Migration/tabelas e RLS ou outra estratégia de autorização.
2. Perfis capazes de ver, criar, aprovar, editar e encerrar registros.
3. Fluxo feliz e fluxos de exceção com senha/motivo.
4. Efeito no estoque, caixa, relatório e histórico.
5. Testes (unitários, integração e/ou roteiro manual) e dados de demonstração
   não sensíveis.
6. Experiência mobile validada em largura pequena.

## 9. O que não assumir

- Não afirmar que o banco já está completamente preparado para multi-tenant
  sem verificar `tenant_id`, RLS e todas as queries.
- Não afirmar que pagamento/PIX ou emissão fiscal é automático sem integração
  homologada e confirmação real.
- Não habilitar domínio próprio para novos tenants antes do isolamento de dados.
- Não chamar toda divergência de estoque de “perda”; motivo e confirmação são
  obrigatórios.
- Não transformar o grande escopo acima em uma única PR. Priorizar P0/P1,
  propor migrations e interfaces em incrementos revisáveis.
