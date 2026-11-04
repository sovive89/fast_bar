# Apoio discreto na PWA

## O que esta entrega faz

Na comanda confirmada, a pessoa recebe uma explicação editável em Configurações → Marca e decide
se quer ativar o recurso. Não há pergunta de gênero. A escolha fica somente neste navegador,
separada do CRM, e pode ser desativada. A ajuda não depende de assinar uma ocorrência.

O botão sobreposto usa a logo do bar, superfície translúcida e o template `pulse` do NØUS Motion,
com respiro suave. Continua visível ao rolar, respeita a área segura do aparelho e a preferência de
reduzir movimento. Segurar por dois segundos envia o pedido; toque simples abre uma confirmação
acessível. Soltar antes, sair do botão, perder o foco ou interromper o gesto cancela a pressão.

Após o servidor registrar o pedido, a tela confirma o registro, sem prometer que um profissional
já o leu. Cliente e equipe podem trocar mensagens de texto. Respostas prontas apenas preenchem o
rascunho: o envio exige confirmação. A conversa no cliente é silenciosa e pode ser ocultada.
Não há gravação de áudio, permissão de microfone nem integração de câmera nesta entrega.

### Mensagens prontas

Cliente: “Preciso que alguém venha até mim.”; “Não consigo falar agora.”;
“Quero ir para um local mais reservado.”; “Posso encontrar a equipe no balcão.”;
“Ainda preciso de apoio.”; “Estou em segurança agora, obrigado.”

Equipe: “Recebemos seu pedido. Como podemos ajudar?”; “Estamos indo até você.”;
“Você consegue vir até o balcão com segurança?”

A primeira mensagem não é enviada automaticamente. O campo livre permite contextualizar o pedido.

## Atendimento e prioridade

O apoio tem faixa própria acima dos pedidos de conta, visual e som distintos. A prioridade inicial
é alta; sem assumir, aumenta aos 30 segundos e chega à prioridade máxima aos 60 segundos. Novo
acionamento após conclusão já nasce destacado para gestão. Lembretes param quando o pedido é
assumido, respeitando a opção de silenciar da equipe. Som depende de interação com o navegador;
vibração depende do aparelho. Reduzir movimento desliga efeitos decorativos.

A equipe informa o nome de quem atende, assume e, para concluir, registra as ações realizadas.
Este nome é **autodeclarado dentro do acesso por senha compartilhada**, não uma identidade
individual autenticada. A conclusão pela equipe não é apresentada como confirmação da pessoa.
Ela pode pedir apoio novamente; o novo pedido recebe destaque para gestão. O pagamento da comanda
não corta a conversa de um pedido já aberto. Novos pedidos de quem não tem histórico de apoio
exigem comanda aberta ou aguardando pagamento, já confirmada pela equipe.

Segurança → Apoio reúne o histórico privado de atendimentos e mensagens. **Ocorrências** e
**Câmeras** são áreas preparadas, ainda sem emissão de documento formal ou conexão de vídeo.

## Ocorrência formal: decisão para etapa posterior

**Só se necessário depois do apoio:** a equipe abre manualmente a ocorrência, redige o relato,
identifica envolvidos conforme necessário e encaminha ao cliente. Ele confirma o seu relato ou
pede correção, para ficar registrado. O alerta não cria uma ocorrência formal automaticamente.

Sugestão ainda não implementada: preservar cada versão do relato e a data de confirmação; exigir
nova verificação do celular na confirmação. Isso registra que a pessoa confirmou aquela versão,
não prova por si só todos os fatos. Assinatura eletrônica formal, se desejada, exige integração
própria. Nenhuma dessas capacidades está disponível nesta entrega.

## Dados, acesso e limites

- `fastbar_support_requests`: pedido, estado, estabelecimento/comanda, horários, responsáveis
  autodeclarados e registro da equipe. `fastbar_support_messages`: texto, remetente e horário.
- Ambas têm RLS habilitada e acesso SQL/API negado a `anon`/`authenticated`. Só o servidor usa
  `service_role`. Funções SQL são invoker e também negadas a papéis públicos.
- Toda ação da equipe exige `assertRegisterAccess`, além de filtro de estabelecimento. O painel
  atual tem senha compartilhada; **não há perfis individuais novos nesta entrega**.
- O cliente usa o link imprevisível da própria comanda, como no acesso já existente. O servidor
  confere estabelecimento, comanda confirmada e propriedade do pedido. Esse link é uma credencial:
  quem o receber também poderá ler a conversa. A tela explica para não compartilhá-lo.
- Não se retorna ao cliente narrativa interna, nome de atendente nem outros dados de clientes.
  Não se grava gênero, adesão no CRM ou conteúdo sensível no texto de push.
- Um pedido ativo por comanda é garantido no banco, com trava para pedidos concorrentes. Mensagens
  têm limite de 1.000 caracteres e intervalo de um segundo por remetente/pedido. Consultas de
  mensagens trazem até as 100 mais recentes; a fila ativa não é descartada por falha de rede.
- Atendimentos concluídos há mais de 90 dias entram em limpeza ao consultar a fila protegida;
  mensagens são apagadas em cascata. Não é um agendamento independente: sem acesso ao painel,
  a limpeza ocorre no próximo acesso. Ativos não são apagados por essa rotina.
- Nenhuma mudança em caixa, pagamentos, estoque ou classificação financeira.

## Publicação

1. Revisar e aplicar a migration `20261104192808_support_requests.sql` no Supabase antes de liberar
   a interface em produção. Ela cria estruturas privadas e RPCs, sem alterar comandas existentes.
2. Publicar a branch via processo normal de PR → master → Amplify. Não editar no Lovable.
3. Configurar VAPID e ativar push nos aparelhos da equipe para receber fora do app. Sem VAPID,
   pedidos ficam registrados e aparecem no painel aberto, mas **não há aviso em aparelho fechado**.
4. Conferir o protocolo real de atendimento e o texto de acolhimento do bar. A ferramenta depende
   de conexão e de equipe disponível; não substitui atendimento presencial ou emergência.

A biblioteca NØUS foi instalada somente para esse botão. O pacote local em `vendor/nous-motion`
está fixado a um commit, com origem, lock de ferramentas e script de reconstrução. A camada
`src/components/motion` do restante do aplicativo continua independente.

## Roteiro de validação no aparelho

- Antes de aderir, não há botão sobreposto; “Agora não” não envia pedido. Reabrir a explicação,
  ativar, recarregar e desativar sem perder o uso da comanda.
- Em 320, 375 e 430 px: botão visível ao rolar; último conteúdo não fica bloqueado; diálogo cabe
  na tela e permite rolar. Teclado virtual não impede ler e enviar mensagens.
- Pressionar e soltar cedo, arrastar para fora e perder foco não enviam. Pressionar dois segundos
  cria um único pedido. Toque simples permite confirmar sem segurar; teclado também funciona.
- Em dois aparelhos: pedido no cliente → alerta prioritário na equipe → assumir → resposta pronta
  → leitura pelo cliente → resposta do cliente → concluir com registro → novo pedido escalado.
- Conferir os patamares aos 30/60 segundos, som distinto do pedido de conta, silêncio e parar
  lembretes ao assumir. Verificar preferência de reduzir movimento.
- Cortar rede antes de enviar e durante a conversa: não mostrar confirmação falsa, manter rascunho,
  indicar falta de atualização, recuperar quando a conexão voltar.
- Pagar a comanda durante o atendimento e confirmar que a conversa permanece acessível.
- Confirmar que Ocorrências não gera documento nem pede assinatura nesta etapa.

## Ajuste final da PWA — barra inferior e fundo da marca

A barra inferior do cardápio reúne compartilhar localização com aplicativos, Instagram, WhatsApp
e Empresa. Em Empresa há link para Google Maps, telefone e CNPJ. Endereço, nome público, telefone
e CNPJ vêm de Dados do estabelecimento (Configurações → Perfil); redes sociais vêm dos campos
existentes de Marca. Não há um segundo cadastro de endereço em Marca. A consulta pública usa uma
lista explícita de campos e filtro de estabelecimento; não devolve sócios, gestor, documentos
pessoais ou configurações internas. CNPJ numérico e alfanumérico são validados; CPF não é exposto.

O botão de apoio fica **dentro da barra inferior** quando ativado na comanda. A barra continua
sobreposta ao conteúdo ao rolar. A versão sem barra usa posicionamento sobreposto como fallback.
A página reserva espaço para o rodapé não impedir o acesso ao último conteúdo.

Marca permite enviar uma imagem de fundo ou configurar sua URL HTTPS e ajustar a opacidade dos
cards entre 60% e 100%. A imagem fica atrás do cardápio; uma camada de contraste preserva a leitura.
O painel administrativo mantém sua identidade visual. A barra superior permanece com logo pequena
e categorias na horizontal; os atalhos públicos ficam na barra inferior.

Verificação desta entrega: 169 testes do aplicativo passaram; a execução completa mantém as cinco
suítes antigas de OCR/stock-photo sem suíte Vitest reconhecida. A biblioteca NØUS passou 67 testes,
typecheck e build. A migration foi executada em PostgreSQL 17 descartável: RLS/permissões,
concorrência, isolamento, limite do chat, continuidade após pagamento e retenção passaram.
Navegador Chromium com respostas fictícias validou adesão, cancelamento de gesto, pressão via
teclado, conversa em duas páginas, assumir/concluir/reincidência, redução de movimento e telas
320/375/430 px; a progressão 30/60 s e a parada do lembrete ao assumir também passaram. Isso não
substitui teste nos aparelhos reais nem comprova push de produção.
