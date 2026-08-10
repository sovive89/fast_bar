# QR Code único do cliente

O QR Code do FastBar deve apontar para:

`https://SEU-DOMINIO/abrir`

Fluxo:

QR Code → /abrir → nome + celular → Abrir comanda → /c/:sessionId

Não há SMS, código de verificação, mesa ou integração com Infobip no fluxo de abertura.

Depois do deploy, use a URL pública definitiva do FastBar para gerar o QR Code.
