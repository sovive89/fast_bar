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

    const result = await openSession({ data: { name, phone } });

    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }

    await navigate({
      to: "/c/$sessionId",
      params: { sessionId: result.sessionId },
    });
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
