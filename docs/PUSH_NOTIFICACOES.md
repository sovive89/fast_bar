# Notificações push da equipe (pedido de conta e, depois, alerta de apoio)

O alerta dentro do caixa só funciona com o app aberto no navegador. O **push** avisa o celular da
equipe mesmo com o app fechado e a tela bloqueada.

## Como funciona

1. A equipe abre o caixa no celular e toca no **sino** do cabeçalho → "Ativar neste aparelho".
2. O navegador pede permissão; o aparelho se inscreve e o servidor guarda a inscrição
   (`fastbar_push_subscriptions`, só o servidor lê).
3. Quando um cliente pede a conta, o servidor manda um push para todos os aparelhos inscritos
   ("Ana pediu a conta"). Tocar na notificação abre a comanda.
4. O botão "Enviar teste" (no mesmo quadro) confere na hora se o aviso chega.

O push é um **complemento**: se falhar (serviço fora do ar, aparelho desligado), o pedido do cliente
continua funcionando e o alerta dentro do caixa continua valendo.

## Configuração (uma vez, por quem cuida do sistema)

São três variáveis do **servidor**, no mesmo lugar onde já estão `SUPABASE_SERVICE_ROLE_KEY` e
`SESSION_SECRET` (Amplify → variáveis de ambiente). **Nunca** no repositório.

| Variável | O que é |
| --- | --- |
| `VAPID_PUBLIC_KEY` | Chave pública (o navegador usa para se inscrever) |
| `VAPID_PRIVATE_KEY` | Chave **privada** (segredo; só o servidor) |
| `VAPID_SUBJECT` | Quem manda: `mailto:email-do-bar@exemplo.com` ou o endereço https do site |

Para gerar o par de chaves, no seu computador (a chave privada não precisa passar por ninguém):

```bash
npx web-push generate-vapid-keys
```

Cadastre as três variáveis e faça um novo deploy. Sem elas o push fica desligado e o sino mostra
"as notificações ainda não foram configuradas". **Trocar as chaves depois invalida todas as
inscrições**: cada aparelho precisa ativar de novo.

## Limites por aparelho

- **Android (Chrome):** funciona no navegador e no app instalado.
- **iPhone (Safari):** só com o app **instalado na tela inicial** (Compartilhar → Adicionar à Tela de
  Início) e iOS 16.4 ou mais novo. No Safari comum a função nem existe. O iPhone não vibra por push.
- **Computador:** funciona nos navegadores comuns.
- Se a pessoa **bloquear** as notificações no navegador, só ela consegue liberar de novo, nas
  configurações do site.

## Detalhes técnicos

- Service worker: `public/push-sw.js`, servido em `/push-sw.js`. O plugin de PWA do projeto não entrega
  service worker em produção (ver `vite.config.ts`), então este arquivo não faz cache nenhum: só recebe
  o aviso e mostra a notificação.
- Todo push vira uma notificação visível (exigência do iPhone, que cancela a inscrição se não for assim).
- O tipo `kind` distingue `conta` de `apoio`: o de apoio vibra de outro jeito e é pensado para abrir
  uma janela própria no caixa (PR futuro, desligado por configuração até a revisão de privacidade).
- Aparelho que o serviço de push declara inexistente (404/410) é apagado no próprio envio; erro passageiro
  não apaga.
- O texto da notificação aparece na tela bloqueada: leva só o primeiro nome de quem pediu a conta.
