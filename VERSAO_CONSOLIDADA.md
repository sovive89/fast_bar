# FastBar — versão consolidada

Esta versão consolida:

- PWA única para a equipe, com entrada em `/equipe`.
- Caixa, comandas, clientes e estoque no mesmo aplicativo e sessão de equipe.
- Fluxo do cliente sem SMS/Infobip/código:
  `QR único → /abrir → nome + celular → /c/:sessionId`.
- Estoque existente preservado em `/caixa/estoque` e `src/lib/stock.functions.ts`.
- Ícones PWA PNG 192/512, maskable e Apple Touch Icon.
- Metatags para instalação no iPhone.
- Nenhum `.env` ou segredo incluído no pacote final.

QR único:
`https://SEU-DOMINIO/abrir`
