# Pop9 Bar / FastBar — documentação funcional detalhada

**Versão:** 1.0  
**Status:** especificação consolidada; parte das funções ainda é futura.  
**Objetivo:** orientar desenvolvimento, produto, operação do bar e validação de entregas.

---

## 1. Visão do produto

O Pop9 Bar é uma plataforma operacional para bares. Ela reúne atendimento por
comanda, cardápio público/PWA, estoque, produção, custos, equipe, CRM e relatórios.
O princípio central é simples: as informações de venda, consumo e estoque devem
alimentar a operação sem criar trabalho duplicado ou misturar patrimônio com itens
consumíveis.

O sistema possui dois contextos:

- **Administração/operação:** equipe, caixa, estoque, produção, comandas, relatórios
  e configurações da empresa.
- **Cliente/PWA:** cardápio público, sessão/comanda, pedidos, informações do bar,
  solicitação de fechamento e recursos de apoio.

## 2. Objetivos e princípios

- Prioridade para uso em celular, inclusive por atendentes em movimento.
- Ações financeiras, de estoque e de exceção devem ser auditáveis.
- O que é exibido ao cliente pode ser criativo e customizável sem alterar a lógica
  interna de estoque, ficha técnica ou relatórios.
- Ajustes relevantes nunca ocorrem silenciosamente: exigem responsável, hora, motivo
  e, quando definido, senha/permissão.
- Insights auxiliam decisões; o sistema não muda preço, baixa estoque ou conclui
  ocorrência automaticamente sem confirmação humana.

---

## 3. Abertura e fechamento de operação

### 3.1 Abertura da operação

**Fluxo esperado**

1. O usuário autorizado entra no sistema.
2. O sistema verifica se existe operação ativa para a unidade selecionada.
3. Se não existir, abre a etapa **Conferência de estoque inicial** antes de liberar
   comandas e caixa.
4. A tela mostra, por item aplicável, estoque teórico do fechamento anterior,
   contagem física informada, diferença e unidade de medida.
5. Quando houver diferença, o usuário classifica e descreve o ajuste.
6. Após concluir a conferência, um usuário autorizado confirma por senha e abre a
   operação.
7. A partir daí, caixa, comandas e lançamentos operam normalmente.

### 3.2 Divergência de estoque

Motivos padronizados:

- perda/quebra;
- vencimento;
- consumo interno;
- lançamento incorreto;
- divergência não identificada.

Uma divergência desconhecida deve usar **divergência não identificada**. Ela reduz ou
aumenta o saldo conforme necessário, mas não deve ser classificada automaticamente
como perda/quebra. Cada ajuste armazena item, saldo esperado, contado, diferença,
motivo, observação, usuário, data/hora e operação.

### 3.3 Pular a conferência

A conferência pode ser pulada apenas mediante senha de perfil autorizado. O registro
de auditoria precisa conter usuário responsável, data/hora, justificativa e operação.
O skip não elimina o estoque teórico nem apaga a pendência: apenas permite a abertura
controlada do dia.

### 3.4 Fechamento da operação

No encerramento, o sistema lista comandas em aberto. Cada uma deve receber um destino
individual, com confirmação por senha quando aplicável:

| Destino | Resultado |
| --- | --- |
| Cortesia | Fecha a comanda com motivo obrigatório e mantém histórico. |
| Inadimplência | Fecha a operação da comanda, preserva saldo devedor em área separada. |
| Manter aberta | Continua disponível na próxima operação, com vínculo e histórico. |

Comandas fechadas na operação atual aparecem separadas do histórico. Ao iniciar uma
nova operação, as fechadas anteriores passam para **Histórico**. Inadimplência não se
mistura com comandas abertas ou histórico comum.

**Critérios de aceite**

- Não é possível terminar o fluxo sem revisar as comandas abertas.
- Cortesia, inadimplência e manutenção em aberto deixam evidência auditável.
- Histórico conserva operação, usuário, valores e justificativas.

---

## 4. Comandas, pagamentos, crédito e atendimento

### 4.1 Alteração de valor e encerramento

No momento do pagamento, o valor é editável. Se o valor recebido for diferente do
saldo, o sistema exige senha/permissão e motivo. Motivos iniciais:

- desconto;
- cortesia;
- correção de lançamento;
- arredondamento;
- pagamento parcial/pendência.

Pagamento parcial não é desconto: a diferença deve ir para pendência/inadimplência,
com o valor efetivamente recebido separado do saldo restante.

### 4.2 Crédito pré-pago

O atendente pode escolher **Adicionar crédito**, digitar valor e enviar a cobrança
para a maquininha integrada. Após confirmação, é criado um lançamento de crédito
vinculado ao cliente/sessão. Cada consumo utiliza esse crédito antes de gerar saldo
devedor. Uma comanda arquivada/histórica com crédito pode ser reaberta e deve recuperar
o saldo de crédito disponível.

Lançamentos de crédito precisam ser um razão/ledger, não apenas um campo numérico:

- origem (maquininha, correção autorizada);
- valor;
- data/hora;
- responsável;
- referência da transação, quando disponível;
- consumo/estorno relacionado.

### 4.3 Solicitação de fechamento pelo cliente

Na PWA, o cliente encontra o botão **Solicitar fechamento**. Ao acionar:

1. A comanda recebe status `fechamento_solicitado`.
2. O painel administrativo apresenta alerta visual e sonoro.
3. A equipe habilitada recebe notificação móvel, quando autorizada.
4. Um atendente pode marcar `em_atendimento`.
5. O cliente vê somente estado simples: “Atendimento avisado” e, se aplicável,
   “Em atendimento”.

O botão deve impedir disparos duplicados durante uma solicitação ativa e mostrar o
horário do pedido.

### 4.4 Sessões agrupadas e divisão de conta

Cada pessoa pode escanear QR Code e abrir a própria sessão. Sessões podem ser reunidas
em uma mesma mesa/grupo mediante ação da equipe. Itens continuam atribuídos ao cliente
que pediu; no pagamento, podem ser liquidados individualmente, por proporção editável
ou por uma única pessoa. Alterações manuais de rateio exigem autorização/auditoria.

---

## 5. Estoque, inventário e produção

### 5.1 Separação conceitual

| Área | O que controla | Exemplos |
| --- | --- | --- |
| Estoque | Consumíveis e itens que entram/saem da operação | bebidas, ingredientes, óleo, limpeza |
| Produção | Transformação de ingredientes em item produzido | xarope, polpa, molho, lote de drink |
| Inventário/patrimônio | Bens duráveis e valor patrimonial | geladeira, mesa, decoração, sinuca |

Um copo de reposição pode ficar no estoque como item operacional; uma coleção de
taças/equipamentos duráveis pertence ao inventário. O sistema deve permitir registrar
quebra e custo de reposição sem confundir isso com a depreciação do patrimônio.

### 5.2 Taxonomia de estoque

1. **Bebidas**
   - Alcoólicas: lata/garrafa unitária, chopp por ml, destilados por dose/fração,
     vinhos e demais apresentações.
   - Não alcoólicas: refrigerantes, água, sucos e similares. Podem referenciar ficha
     técnica quando forem preparados, como drink sem álcool.
2. **Ingredientes**
   - Bar, cozinha e hortifruti/perisháveis.
   - Suportam lote, fornecedor opcional, validade, custo e unidade de medida.
3. **Suprimentos operacionais**
   - Limpeza e higiene;
   - gases e combustíveis: GLP, CO2, carvão;
   - consumo de cozinha: óleo, filtros e itens equivalentes;
   - descartáveis e embalagens.
4. **Reposição de utensílios**
   - Copos, pratos, talheres e itens similares, com custo e eventos de quebra.
5. **Produção**
   - Pré-preparos, itens semiacabados e produtos produzidos.

### 5.3 Movimentos

Todo item de estoque deve aceitar, conforme aplicável:

- entrada/lote;
- consumo;
- transferência/produção;
- perda/quebra;
- vencimento;
- consumo interno;
- ajuste por divergência.

Uma entrada mínima registra item, quantidade, unidade, custo, data e responsável.
Fornecedor, documento fiscal, lote e validade são opcionais para operacionais, mas
importantes para alimentos/bebidas quando disponíveis.

### 5.4 Conferência por foto

Contagem assistida por imagem fica dentro de **Lançar lote/contagem**, não como módulo
isolado. Fluxo:

1. Usuário seleciona o item existente no estoque.
2. Escolhe “contar por foto”.
3. Envia até três imagens: frente, lateral e visão superior.
4. A IA propõe quantidade.
5. Usuário confirma ou edita antes do lançamento.

O reconhecimento não deve escolher automaticamente marca/produto, pois rótulo e
embalagem mudam. As imagens servem para contagem daquele produto já informado.

### 5.5 Produção e fichas técnicas

Uma ficha técnica possui produto final, rendimento, unidade, ingredientes, quantidades,
perdas previstas e custo calculado. Ao registrar uma ordem/lote de produção, o sistema
baixa componentes e cria saldo do item produzido. O saldo produzido pode ser usado no
cardápio ou por nova ficha técnica.

**Sugestão do chef/bartender** é um item temporário: ficha rápida, ingredientes,
disponibilidade, preço, prazo de exibição e seção pública. Caso ingrediente essencial
fique indisponível, o sistema avisa ou retira o item da oferta conforme a regra
escolhida.

### 5.6 Cozinha/KDS

O módulo Cozinha/KDS deve existir como recurso configurável/desligado. Ao ativar,
reutiliza ingredientes, fichas técnicas, estoque e produção existentes. Não pode criar
um estoque paralelo de “insumos da cozinha”.

---

## 6. Cardápio público, marca e PWA

### 6.1 Categorias internas versus seções públicas

Há duas camadas deliberadamente separadas:

- **Categoria interna:** objetiva e estável para cadastro, estoque, ficha e relatório
  (ex.: Hambúrguer, Cerveja, Ingrediente).
- **Seção pública:** curadoria exibida ao cliente (ex.: “Mata a fome”, “Gasolina do
  rolê”, “Para dividir”).

Uma seção pública pode reunir produtos de categorias internas diferentes. Trocar seu
nome, ícone ou ordem nunca altera dados de estoque, relatório ou ficha técnica.

Campos da seção pública: nome exposto, descrição opcional, ícone de biblioteca ou
imagem enviada, cor, tipografia aprovada, estilo de caixa, ordem, visibilidade e
produtos/categorias vinculados.

### 6.2 Layout público

- Cabeçalho translúcido e fixo, acima do background escolhido pelo estabelecimento.
- Logo do estabelecimento no canto esquerdo.
- Navegação horizontal com seções públicas roláveis.
- Controles para informações/contato e comanda.
- Cards e conteúdo rolam abaixo do cabeçalho, sem sobreposição indevida.
- Campo de pesquisa pode ser ativado quando o cardápio crescer.

### 6.3 Personalização de marca

Na área Empresa → Marca/Experiência pública:

- logo;
- imagem/background com transparência configurável;
- paleta pública;
- fontes a partir de catálogo seguro;
- formato de card: quadrado, arredondado, circular quando aplicável;
- cores de texto, bordas e botões;
- ícones/imagens das seções;
- mensagens rotativas.

As mensagens de espera/boas-vindas são editáveis pelo gestor e aceitam variáveis como
`{nome}` e `{visitas}`. O uso de humor deve ser opt-in da marca e não deve prejudicar
mensagens de erro, acessibilidade ou suporte.

### 6.4 Informações públicas

Painel do cliente deve poder expor, conforme configurado:

- site;
- redes sociais com ícones corretos;
- telefone comercial;
- WhatsApp Business;
- endereço e abrir rota/mapa;
- compartilhar/localização;
- link de orçamento ou Instagram;
- PWA/cardápio e QR Code.

---

## 7. Segurança e recurso de apoio

O produto prevê recurso discreto de apoio para mulheres e pessoas LGBTQIA+. O intuito
é permitir pedir auxílio em situação de importunação, assédio, violência ou desconforto
sem chamar atenção de terceiros.

### 7.1 Privacidade por desenho

- Não obrigar declaração de gênero.
- A ativação deve ser voluntária e preferencialmente limitada à sessão atual.
- Não salvar gênero/identidade no CRM para este fim.
- Não informar equipe sobre gênero; enviar somente sessão/comanda, local quando houver,
  horário e prioridade.
- Registros de ocorrência ficam visíveis apenas para perfis expressamente autorizados.

### 7.2 Fluxo de suporte

1. Na primeira visita elegível, exibir texto institucional editável sobre política de
   proteção e recurso de apoio.
2. Após ativação voluntária, exibir botão flutuante discreto e persistente.
3. Pressionar por 1–2 segundos envia alerta. A cliente vê “Equipe avisada”.
4. Painel recebe alerta prioritário; equipe habilitada recebe push quando disponível.
5. Reincidência escalona para gestão.
6. Equipe registra ação, narrativa, responsáveis e, se houver, acionamento policial.
7. Cliente responde resolvido/não resolvido e pode pedir apoio novamente.

Antes de produção, realizar revisão de privacidade, retenção, controle de acesso,
notificações e protocolo operacional com assessoria jurídica especializada.

---

## 8. Empresa, pessoas, contábil e documentos

### 8.1 Organização do menu Empresa

| Subárea | Conteúdo |
| --- | --- |
| Perfil da empresa | Razão social, nome fantasia, CNPJ, contatos, endereço, negócio, sócios, unidades |
| Marca | Logo, experiência pública, mensagens, aparência do cardápio |
| Operação | Horários, abertura/fechamento, impressoras, maquininha e integrações |
| Presença digital | Site, PWA, QR Codes, domínios, redes, contatos públicos |
| Documentos e legal | Contratos, alvarás, licenças, documentos fiscais/societários |
| Contábil | Custos fixos, comprovantes, exportação e relatórios contábeis |
| Pessoas | Usuários, permissões, jornada, contratos, férias e freelancer |

### 8.2 Dados empresariais

Preparar campos separados para natureza jurídica e regime tributário. Exemplos de
natureza: MEI, EI, SLU, LTDA. Exemplos de regime: MEI, Simples Nacional, Lucro
Presumido e Lucro Real. A seleção auxilia cadastro e exportações; não substitui
orientação contábil nem habilita emissão fiscal por si só.

### 8.3 Documentos e fiscalização

Permitir upload e histórico de contratos, documentos societários, alvarás, licenças,
certificados e arquivos fiscais. Registro de visita sanitária: data/hora, órgão,
identificação do agente, relato, anexos e responsáveis internos.

### 8.4 Pessoas e jornada

Admin cria usuários, senha/perfil e permissões. Ao entrar, um funcionário pode iniciar
jornada; no fim, encerra. Continuação fora do horário exige autorização e deve apontar
hora extra. Freelancer deve suportar modelo diário ou por hora. Cálculos trabalhistas,
férias, direitos e contratos exigem parametrização validada por contador/jurídico antes
de se tornarem cálculo oficial.

---

## 9. Contábil, custos e relatórios

### 9.1 Lançamentos

Custos fixos: aluguel, energia, internet, gás, APIs e semelhantes. Custos variáveis:
compras de limpeza, operacionais, utensílios, óleo e ingredientes. Todos podem aceitar
documento/comprovante, competência, valor, categoria e fornecedor opcional.

### 9.2 Relatórios

Todo relatório deve oferecer seletor de intervalo de datas. Indicadores desejados:

- faturamento e vendas por categoria;
- produtos mais e menos vendidos;
- margem, CMV e custo médio;
- desperdício, perdas e divergências;
- consumo de óleo/gás e demais operacionais;
- variação de custo por fornecedor;
- giro e cobertura de estoque;
- custo operacional por período.

Insights devem declarar a base usada e limitar conclusões com poucos dados. Exemplo:
“O custo médio do insumo X cresceu 14% em três compras; revise fornecedor ou preço de
venda.” A decisão final permanece humana.

---

## 10. Multiunidade, multitenancy e domínio

### 10.1 Unidades

Uma empresa pode ter várias unidades. Com uma unidade, ela é pré-selecionada na
abertura da operação. Com mais de uma, o usuário escolhe unidade; operações, estoque e
relatórios são filtrados por ela.

### 10.2 Estado atual de tenant

O banco possui fundação de tenant (`fastbar_tenants` e `tenant_id` em tabelas
principais), porém o aplicativo ainda usa tenant padrão via ambiente. Portanto, ele
não está pronto para oferecer isolamento real entre bares apenas adicionando domínio.

### 10.3 Domínio próprio

No futuro, o cliente informa domínio e faz configuração DNS no registrador/Vercel. O
backend valida o host, encontra o tenant e aplica esse tenant a cada leitura/escrita.
Antes de liberar esse recurso, implementar resolução de host, isolamento em consultas,
RLS testada, testes de não vazamento e painel de status de domínio. Não tratar domínio
próprio como simples redirecionamento.

---

## 11. Integrações futuras

- **Maquininha:** crédito e pagamento dependem do contrato/API, estados da transação e
  tratamento idempotente de callbacks.
- **Impressora térmica:** fica em Empresa → Operação → Conexões; reutilizar referência
  Pop9 de modo adaptado e testado.
- **Notificações:** push deve ter consentimento, cadastro de dispositivo e fallback
  visual/sonoro no painel.
- **Fiscal:** emissão de NFC-e/NFS-e exige credenciamento, certificado, regime,
  estado/município e provedor homologado; não é habilitada somente por API de CNPJ.

---

## 12. Estado técnico e sequência de entrega

### Já iniciado

- Área inicial de Produção dentro de Estoque.
- Correção da troca indevida de paleta azul/laranja.
- Estrutura de banco com fundação de tenant.

### Próximas entregas recomendadas

1. Conferência de estoque inicial + gate da operação + auditoria de skip.
2. Fechamento de operação com roteamento de comandas abertas.
3. Movimentos de estoque/lotes e produção real.
4. Seções públicas e configuração de marca responsiva.
5. Empresa, custos, pessoas e relatórios base.
6. Crédito, grupos e alertas de atendimento.
7. Isolamento multitenant e domínios.
8. Recurso de apoio após revisão de segurança e privacidade.

### Definição de pronto

Uma entrega é considerada pronta quando:

- o fluxo principal funciona no celular e desktop;
- erros e permissões têm estados claros;
- alterações críticas têm auditoria;
- migração de banco, se existir, é reversível/segura e testada;
- lint/build passam ou falhas externas são documentadas;
- não foram incluídos segredos, dados reais de clientes ou alterações não relacionadas.

