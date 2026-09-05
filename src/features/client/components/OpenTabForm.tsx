import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Field } from "@/components/shared/Field";
import { formatPhone } from "@/lib/format";
import { openClientSession } from "@/lib/client-session.functions";

export function OpenTabForm() {
  const navigate = useNavigate();
  const openSession = useServerFn(openClientSession);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openTab(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    // Sem try/catch aqui, uma falha de rede (ou um bundle desatualizado depois de um deploy —
    // service worker/PWA guardam a página em cache) deixava o botão preso em "Abrindo comanda..."
    // pra sempre, sem mensagem nenhuma: a pessoa só descobria recarregando a página por conta
    // própria. Agora qualquer falha mostra um erro e libera o botão de novo.
    try {
      const result = await openSession({ data: { name, phone } });

      if (!result.ok) {
        setError(result.message);
        setBusy(false);
        return;
      }

      if (result.needsVerification) {
        await navigate({ to: "/c/$sessionId/verificar", params: { sessionId: result.sessionId } });
        return;
      }

      // Cliente que já preencheu o perfil antes (reabrindo comanda pelo mesmo celular) não passa
      // pela segunda tela de novo — ela é pra coletar uma vez, não repetir a cada visita.
      await navigate(
        result.profileCompleted
          ? { to: "/c/$sessionId", params: { sessionId: result.sessionId } }
          : { to: "/c/$sessionId/perfil", params: { sessionId: result.sessionId } },
      );
    } catch {
      setError(
        "Não foi possível abrir a comanda. Atualize a página (puxe pra baixo ou recarregue) e tente de novo.",
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={openTab} className="mt-8 space-y-4">
      <Field
        id="name"
        label="Nome completo"
        value={name}
        onChange={setName}
        maxLength={80}
        placeholder="Ex.: Maria Souza"
      />
      <Field
        id="phone"
        label="Celular"
        value={phone}
        onChange={(value) => setPhone(formatPhone(value))}
        inputMode="tel"
        placeholder="(11) 91234-5678"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
      >
        {busy ? "Abrindo comanda..." : "Abrir comanda"}
      </button>
    </form>
  );
}
