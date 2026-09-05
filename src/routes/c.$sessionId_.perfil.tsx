import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Field } from "@/components/shared/Field";
import { getPublicBranding, type PublicBranding } from "@/lib/integrations.functions";
import { brandColorStyle } from "@/lib/brand-color";
import {
  ADMINISTRATIVE_REGIONS,
  HOW_FOUND_OUT_OPTIONS,
  submitCustomerProfile,
} from "@/lib/client-session.functions";

export const Route = createFileRoute("/c/$sessionId_/perfil")({
  head: () => ({
    meta: [
      { title: "Complete seu cadastro" },
      {
        name: "description",
        content: "Conte um pouco mais sobre você — tudo opcional, exceto uma pergunta.",
      },
    ],
  }),
  component: CustomerProfilePage,
});

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function selectClass() {
  return "mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:border-ring";
}

function CustomerProfilePage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const submit = useServerFn(submitCustomerProfile);
  const loadBranding = useServerFn(getPublicBranding);

  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [fullName, setFullName] = useState("");
  const [birthdayDay, setBirthdayDay] = useState("");
  const [birthdayMonth, setBirthdayMonth] = useState("");
  const [administrativeRegion, setAdministrativeRegion] = useState("");
  const [howFoundOut, setHowFoundOut] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadBranding().then(setBranding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function goToTab() {
    await navigate({ to: "/c/$sessionId", params: { sessionId } });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await submit({
      data: {
        sessionId,
        marketingOptIn,
        ...(fullName ? { fullName } : {}),
        ...(birthdayDay ? { birthdayDay: Number(birthdayDay) } : {}),
        ...(birthdayMonth ? { birthdayMonth: Number(birthdayMonth) } : {}),
        ...(administrativeRegion ? { administrativeRegion } : {}),
        ...(howFoundOut ? { howFoundOut } : {}),
      },
    });
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    await goToTab();
  }

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10"
      style={brandColorStyle(branding?.primaryColor)}
    >
      <div>
        <h1 className="text-2xl font-bold">Complete seu cadastro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ganhe um brinde da casa e receba ofertas e novidades{" "}
          {branding?.brandName ? `do ${branding.brandName}` : "do estabelecimento"}.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Seus dados
          </p>

          <Field id="fullName" label="Nome completo" value={fullName} onChange={setFullName} />

          {/* Só dia e mês — sem o ano de propósito, pra não dar pra inferir idade exata. */}
          <div>
            <span className="text-sm font-medium">Data de nascimento (dia e mês)</span>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <select
                value={birthdayDay}
                onChange={(event) => setBirthdayDay(event.target.value)}
                className={selectClass()}
              >
                <option value="">Dia</option>
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
              <select
                value={birthdayMonth}
                onChange={(event) => setBirthdayMonth(event.target.value)}
                className={selectClass()}
              >
                <option value="">Mês</option>
                {MONTHS.map((month, index) => (
                  <option key={month} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Bairro / RA</span>
            <select
              value={administrativeRegion}
              onChange={(event) => setAdministrativeRegion(event.target.value)}
              className={selectClass()}
            >
              <option value="">Selecione sua região</option>
              {ADMINISTRATIVE_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-sm font-medium">Como conheceu a gente?</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {HOW_FOUND_OUT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setHowFoundOut(howFoundOut === option ? "" : option)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    howFoundOut === option
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Quer receber nossas ofertas?</p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(event) => setMarketingOptIn(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-primary"
            />
            <span className="text-sm">
              Sim, quero receber ofertas, novidades, eventos e benefícios
              {branding?.brandName ? ` do ${branding.brandName}` : " do estabelecimento"} pelo
              WhatsApp e/ou e-mail.
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            Você poderá cancelar o recebimento das comunicações promocionais a qualquer momento.
          </p>
        </div>

        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="text-xs font-semibold uppercase tracking-[0.15em]">Privacidade</p>
          <p>
            Seus dados serão utilizados para identificação do cliente, prestação dos serviços
            solicitados e, caso você autorize, para o envio de comunicações promocionais e
            benefícios.
          </p>
          <p>
            Os dados serão tratados e protegidos de acordo com a Lei nº 13.709/2018 — Lei Geral de
            Proteção de Dados (LGPD), respeitando os princípios de finalidade, necessidade,
            segurança e transparência.
          </p>
          <p>
            O consentimento para receber comunicações promocionais é opcional e não condiciona a
            abertura ou utilização da comanda.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
        >
          {busy ? "Salvando..." : "Concluir cadastro e receber meu brinde"}
        </button>

        <a
          href="/politica-privacidade"
          target="_blank"
          rel="noreferrer"
          className="block text-center text-xs text-muted-foreground underline underline-offset-2"
        >
          Política de Privacidade
        </a>
      </form>
    </main>
  );
}
