import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { eraseCustomerFn } from "@/lib/customers.functions";

/**
 * Apaga os dados pessoais do cliente do CRM. Duas etapas e senha. As comandas e os valores
 * continuam, sem identificar a pessoa; se ela voltar, é cliente novo.
 */
export function EraseCustomerButton({ customerId }: { customerId: string }) {
  const erase = useServerFn(eraseCustomerFn);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await erase({ data: { customerId, password } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPassword("");
      await navigate({ to: "/caixa/crm/clientes" });
    } catch {
      setError("Não foi possível apagar agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Apagar dados do cliente"
      className="mt-8 rounded-2xl border border-border bg-card p-4"
    >
      <p className="text-sm font-semibold">Apagar dados do cliente</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Remove o cadastro (nome, celular, documento, aniversário e perfil) e o nome e celular das
        comandas dele. As comandas e os valores continuam, sem identificar a pessoa. Se ela voltar,
        será cadastrada como cliente novo. Não dá para desfazer.
      </p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground"
        >
          Apagar este cliente
        </button>
      ) : (
        <div className="mt-3 space-y-3 rounded-xl border border-destructive/40 p-3">
          <p role="alert" className="text-sm">
            Confirma apagar os dados deste cliente definitivamente?
          </p>
          <label className="block text-sm font-medium">
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-ring"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !password}
              onClick={() => void confirm()}
              className="min-h-11 flex-1 rounded-lg bg-destructive px-3 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
            >
              {busy ? "Apagando…" : "Apagar agora"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setPassword("");
                setError("");
              }}
              className="min-h-11 flex-1 rounded-lg border border-border px-3 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
