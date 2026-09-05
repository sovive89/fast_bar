import { createFileRoute } from "@tanstack/react-router";
import { BrandingProvider, useBranding } from "@/lib/branding";

export const Route = createFileRoute("/politica-privacidade")({
  head: () => ({
    meta: [{ title: "Política de Privacidade" }],
  }),
  component: PrivacyPolicyPage,
});

/**
 * Texto padrão/genérico — cobre o consentimento pedido na tela de cadastro (nome, aniversário,
 * bairro, como conheceu, opt-in de marketing). Serve de ponto de partida; o gestor pode pedir pra
 * ajustar o texto se o estabelecimento tiver uma política própria mais detalhada.
 */
function PrivacyPolicyPage() {
  return (
    <BrandingProvider>
      <PrivacyPolicyContent />
    </BrandingProvider>
  );
}

function PrivacyPolicyContent() {
  const { branding, style } = useBranding();
  const brandName = branding.brandName || "o estabelecimento";

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10" style={style}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Privacidade</p>
      <h1 className="mt-1 text-2xl font-bold">Política de Privacidade</h1>

      <div className="mt-6 space-y-4 text-sm text-muted-foreground">
        <p>
          Esta política explica como {brandName} coleta, usa e protege os dados informados no
          cadastro feito ao abrir uma comanda.
        </p>

        <div>
          <p className="font-semibold text-foreground">Quais dados coletamos</p>
          <p className="mt-1">
            Nome, celular, e, caso você preencha o cadastro complementar, data de nascimento (dia
            e mês), bairro/região administrativa e como você conheceu o estabelecimento.
          </p>
        </div>

        <div>
          <p className="font-semibold text-foreground">Para que usamos</p>
          <p className="mt-1">
            Para identificar você na comanda e no histórico de visitas, e, caso você autorize, para
            enviar ofertas, novidades, eventos e benefícios por WhatsApp e/ou e-mail.
          </p>
        </div>

        <div>
          <p className="font-semibold text-foreground">Base legal e seus direitos</p>
          <p className="mt-1">
            O tratamento segue a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados (LGPD),
            respeitando os princípios de finalidade, necessidade, segurança e transparência. O
            consentimento para comunicações promocionais é opcional, pode ser revogado a qualquer
            momento, e nunca condiciona a abertura ou o uso da comanda.
          </p>
        </div>

        <div>
          <p className="font-semibold text-foreground">Contato</p>
          <p className="mt-1">
            Para dúvidas, correção ou exclusão dos seus dados, fale diretamente com a equipe do
            estabelecimento.
          </p>
        </div>
      </div>
    </main>
  );
}
