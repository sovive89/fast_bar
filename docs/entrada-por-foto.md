# Entrada de estoque por foto

No estoque, abra **Dar entrada no estoque** e escolha **Fotografar produtos ou
geladeira** ou **Escolher foto dos produtos**. Também são aceitos engradados,
caixas fechadas, latas e garrafas avulsas.

A leitura usa a conexão OCR já configurada em **Conexões**. Não instala um modelo
no celular e precisa de internet. Fotos são redimensionadas preservando as cores
dos rótulos; o arquivo enviado deve ter até 3 MB.

## Conferência obrigatória

1. Confira marca, variante e volume contra a prévia da foto.
2. Associe cada produto ao item correto do estoque.
3. Marque apenas a mercadoria recém-colocada. Todos os itens da foto começam
   desmarcados para evitar a entrada de estoque anterior.
4. Informe **Embalagens novas (conferidas)** conforme a embalagem configurada no
   cadastro. A contagem visível não preenche esse campo automaticamente.
5. Confirme a entrada para gravar os movimentos.

Se já havia unidades do mesmo produto na geladeira, informe somente as adicionadas,
não o total visível. A imagem não distingue a idade das unidades. Produtos escondidos
precisam ser conferidos manualmente. Uma caixa fechada continua sendo uma caixa;
a IA não presume quantas latas ou garrafas existem dentro dela.

Preço, fornecedor, lote e validade não são inferidos pela foto. Campos opcionais
podem ser preenchidos pelo operador. A origem da entrada fica registrada como foto
de produtos / geladeira revisada.

## Validação

`npm run test:stock-photo` executa os testes da normalização, seleção da mercadoria
nova, contagens inválidas, preservação de cor e formato de envio de PDF. Usa Node.js
24, compatível com o runtime do projeto.

Esses testes usam respostas simuladas. A precisão visual ainda precisa ser avaliada
com fotos reais dos produtos e da geladeira do estabelecimento.

## Modelo OpenAI

O padrão do OCR é **GPT-6 Astra** (`openai/gpt-6-astra`), com suporte a imagens, PDFs e
resposta JSON. Em **Conexões → OCR inteligente para estoque**, deixe o modelo
vazio para usar o padrão ou informe `openai/gpt-6-astra`. Uma configuração explícita
anterior continua prevalecendo; troque-a nesse campo se estava usando outro modelo.

- **AI Gateway:** deixe o endpoint e a chave da conexão vazios, sem `OPENAI_API_KEY` no servidor. A autenticação usa
  `AI_GATEWAY_API_KEY` ou o OIDC da Vercel, conforme a configuração existente.
- **OpenAI direta:** com uma chave OpenAI salva (ou `OPENAI_API_KEY` no servidor), o endpoint vazio conecta automaticamente à OpenAI. Também pode usar `https://api.openai.com/v1/responses` no endpoint e
  configure a chave no campo protegido da conexão ou em `OPENAI_API_KEY` no servidor.
  O aplicativo envia `gpt-6-astra` para essa API, removendo o prefixo `openai/`.

As chamadas à IA acontecem no servidor. O GPT-6 Astra é o padrão escolhido pelo suporte
a visão, PDF e JSON; sua precisão neste estoque ainda deve ser avaliada com fotos reais.

`npm run test:ocr-model` valida a montagem das requisições OpenAI e Gateway sem
chamadas pagas.

### Modelo alternativo

O motor principal é `openai/gpt-6-astra`. O alternativo é
`openai/gpt-5.6-luna`, também configurável em Conexões. Em chamadas pelo Gateway
ou diretamente à OpenAI, o alternativo é acionado uma única vez em falhas de
rede, timeout, HTTP 408/429/5xx ou resposta sem uma lista JSON de itens válida.
Cada tentativa tem timeout de 30 segundos. Erros de chave, permissão, créditos
ou requisição inválida são apresentados ao operador sem troca de modelo.

Endpoints personalizados de outros serviços continuam com uma única tentativa,
pois não há garantia de que ofereçam o modelo alternativo.

O GPT-6 Astra e o Luna usam esforço baixo de raciocínio,
conforme os parâmetros verificados no catálogo. A troca de modelo não elimina
a conferência humana e pode gerar o custo de uma segunda chamada.

### Qualidade de leitura

Para Astra e Luna, a entrada de imagem usa `detail: original`, conforme a
documentação de visão, para preservar detalhes de texto e rótulos. O limite de
2400 pixels do upload continua para controlar o tamanho do pedido. A configuração
não usa a ferramenta `image_generation`: o fluxo analisa as imagens enviadas e
não gera novas imagens. A integração OpenAI/Gateway usa a Responses API, com entrada de imagem/PDF e
saída JSON estruturada. Endpoints Chat personalizados de outros serviços continuam compatíveis.

### Responses API

A OpenAI recebe `input_image` para fotos e `input_file` para PDFs. O contrato JSON
usa `text.format` com schema estrito; o raciocínio usa `reasoning.effort`.
A configuração `store: false` evita o armazenamento da resposta pela API.

Se o endpoint OpenAI salvo ainda termina em `/v1/chat/completions`, ele é convertido
para `/v1/responses` ao enviar. Não é necessário redigitar a chave. Endpoints
personalizados de terceiros mantêm o formato correspondente ao caminho configurado.

Respostas incompletas não são tratadas como leituras bem-sucedidas; o alternativo é
tentado antes de devolver um erro. Uma recusa do modelo interrompe a leitura.
IDs de requisição são registrados nas falhas, sem fotos, prompts ou chaves nos logs.
