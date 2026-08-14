import { useState } from "react";

/** Inline password re-entry for a destructive action — same login senha as the team, no separate admin tier. */
export function PasswordConfirm(props: {
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    // Guarda contra duplo-envio: sem isso, Enter batido duas vezes dispara a ação destrutiva de
    // novo e estorna o estoque em dobro.
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.onConfirm(password);
      if (!result.ok) setError(result.message ?? "Não foi possível concluir.");
    } catch {
      setError("Não foi possível concluir — tente de novo.");
    } finally {
      // No finally para que uma exceção não deixe o botão preso em "Confirmando...".
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-xs text-foreground">{props.message}</p>
      <input
        type="password"
        inputMode="numeric"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && void submit()}
        placeholder="Senha da equipe"
        autoFocus
        className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
      />
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => void submit()}
          disabled={busy || !password}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Confirmando..." : props.confirmLabel}
        </button>
        <button
          onClick={props.onCancel}
          disabled={busy}
          className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
