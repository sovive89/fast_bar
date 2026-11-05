import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { deleteSupportRequestFn } from "@/lib/support-requests.functions";

/**
 * Apaga um atendimento de apoio (teste, engano ou registro que não deve ficar). Duas etapas para
 * não apagar por toque sem querer. O que a pessoa recebeu em outro canal não é afetado.
 */
export function DeleteSupportButton({
  requestId,
  onDeleted,
  className = "",
}: {
  requestId: string;
  onDeleted: () => void;
  className?: string;
}) {
  const remove = useServerFn(deleteSupportRequestFn);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await remove({ data: { requestId } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDeleted();
    } catch {
      setError("Não foi possível apagar agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming)
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
        >
          Apagar este alerta
        </button>
      </div>
    );
  return (
    <div className={`space-y-2 rounded-lg border border-destructive/40 p-3 ${className}`}>
      <p role="alert" className="text-sm">
        Apagar definitivamente o registro e as mensagens deste alerta? Não dá para desfazer.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className="min-h-11 flex-1 rounded-lg bg-destructive px-3 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
        >
          {busy ? "Apagando…" : "Apagar agora"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="min-h-11 flex-1 rounded-lg border border-border px-3 text-sm"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
