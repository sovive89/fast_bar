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

O padrão do OCR é **GPT-4.1** (`openai/gpt-4.1`), com suporte a imagens, PDFs e
resposta JSON. Em **Conexões → OCR inteligente para estoque**, deixe o modelo
vazio para usar o padrão ou informe `openai/gpt-4.1`. Uma configuração explícita
anterior continua prevalecendo; troque-a nesse campo se estava usando outro modelo.

- **AI Gateway:** deixe o endpoint vazio. A autenticação usa
  `AI_GATEWAY_API_KEY` ou o OIDC da Vercel, conforme a configuração existente.
- **OpenAI direta:** use `https://api.openai.com/v1/chat/completions` no endpoint e
  configure a chave no campo protegido da conexão ou em `OPENAI_API_KEY` no servidor.
  O aplicativo envia `gpt-4.1` para essa API, removendo o prefixo `openai/`.

As chamadas à IA acontecem no servidor. O GPT-4.1 é o padrão escolhido pelo suporte
a visão, PDF e JSON; sua precisão neste estoque ainda deve ser avaliada com fotos reais.

`npm run test:ocr-model` valida a montagem das requisições OpenAI e Gateway sem
chamadas pagas.
