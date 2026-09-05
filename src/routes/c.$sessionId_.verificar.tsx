import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BrandingProvider, useBranding } from "@/lib/branding";
import { resendVerificationCode, verifyClientCode } from "@/lib/client-session.functions";

export const Route = createFileRoute("/c/$sessionId_/verificar")({
  head: () => ({
    meta: [{ title: "Confirme seu celular" }],
  }),
  component: VerifyCodePage,
});

const RESEND_COOLDOWN_SECONDS = 30;

function VerifyCodePage() {
  return (
    <BrandingProvider>
      <VerifyCodeContent />
    </BrandingProvider>
  );
}

function VerifyCodeContent() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const { branding, style } = useBranding();
  const verify = useServerFn(verifyClientCode);
  const resend = useServerFn(resendVerificationCode);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || code.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verify({ data: { sessionId, code } });
      if (!result.ok) {
        setError(result.message);
        setBusy(false);
        return;
      }
      await navigate(
        result.profileCompleted
          ? { to: "/c/$sessionId", params: { sessionId } }
          : { to: "/c/$sessionId/perfil", params: { sessionId } },
      );
    } catch {
      setError("Não foi possível confirmar o código. Atualize a página e tente de novo.");
      setBusy(false);
    }
  }

  // O reenvio pode trocar de canal: quem não recebeu no WhatsApp normalmente quer tentar por
  // SMS (ou o contrário), e obrigar a recomeçar a comanda só pra mudar isso seria absurdo.
  async function handleResend(channel: "whatsapp" | "sms") {
    if (resending || cooldown > 0) return;
    setResending(true);
    setError(null);
    let result: { ok: boolean; message?: string };
    try {
      result = await resend({ data: { sessionId, channel } });
    } catch {
      setResending(false);
      setError("Não foi possível reenviar o código. Atualize a página e tente de novo.");
      return;
    }
    setResending(false);
    if (!result.ok) {
      setError(result.message ?? "Não foi possível reenviar o código.");
      return;
    }
    setCode("");
    setResent(true);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setTimeout(() => setResent(false), 3000);
  }

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10"
      style={style}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        {branding.brandName}
      </p>
      <h1 className="mt-2 text-2xl font-bold">Confirme seu celular</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Mandamos um código de 4 dígitos pro número que você informou. Digite abaixo pra continuar.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          maxLength={4}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="0000"
          className="h-16 w-full rounded-xl border border-border bg-card text-center text-3xl font-bold tracking-[0.5em] outline-none focus:border-ring"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy || code.length !== 4}
          className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
        >
          {busy ? "Confirmando..." : "Confirmar"}
        </button>
      </form>

      <div className="mt-5 text-center">
        {resending ? (
          <p className="text-xs font-medium text-muted-foreground">Reenviando...</p>
        ) : cooldown > 0 ? (
          <p className="text-xs font-medium text-muted-foreground">
            Reenviar código em {cooldown}s
          </p>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <span className="text-xs text-muted-foreground">Não chegou? Reenviar por</span>
            <button
              type="button"
              onClick={() => void handleResend("whatsapp")}
              className="text-xs font-semibold text-primary underline underline-offset-2"
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => void handleResend("sms")}
              className="text-xs font-semibold text-primary underline underline-offset-2"
            >
              SMS
            </button>
          </div>
        )}
      </div>
      {resent && <p className="mt-1 text-center text-xs text-emerald-500">Código reenviado.</p>}
    </main>
  );
}
