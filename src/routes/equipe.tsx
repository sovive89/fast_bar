import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { unlockBarPanel } from "@/lib/bar-gate.functions";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Acesso do caixa | FastBar" },
      {
        name: "description",
        content: "Área restrita: informe a senha da equipe para abrir o caixa do FastBar.",
      },
      { property: "og:title", content: "Acesso do caixa | FastBar" },
      {
        property: "og:description",
        content: "Informe a senha da equipe para acessar o caixa e as comandas.",
      },
    ],
  }),
  component: StaffUnlock,
});

// Tempo máximo esperando o servidor responder. Sem limite, uma requisição que nunca volta (servidor
// fora do ar, deploy sem backend, rede do celular caindo) deixava o botão em "Verificando..." pra
// sempre, sem a pessoa saber o que aconteceu.
const UNLOCK_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function StaffUnlock() {
  const navigate = useNavigate();
  const router = useRouter();
  const unlock = useServerFn(unlockBarPanel);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { ok } = await withTimeout(unlock({ data: { password } }), UNLOCK_TIMEOUT_MS);
      if (!ok) {
        setError("Senha incorreta.");
        return;
      }
      await navigate({ to: "/caixa", replace: true });
      // Se o cookie da sessão não foi gravado, o /caixa manda de volta pra cá. Antes isso deixava
      // a tela parada em "Verificando..." (o componente continuava montado com busy=true).
      if (router.state.location.pathname === "/equipe") {
        setError(
          "A senha foi aceita, mas o navegador não guardou a sessão. Verifique se os cookies estão permitidos e tente de novo.",
        );
      }
    } catch (err) {
      console.error("[equipe] falha ao entrar no caixa", err);
      setError(
        err instanceof Error && err.message === "timeout"
          ? "O servidor demorou demais para responder. Verifique a internet e tente de novo."
          : "Não foi possível falar com o servidor. Tente de novo em instantes.",
      );
    } finally {
      // Se a navegação deu certo o componente já desmontou e isso não faz nada; em qualquer outro
      // caminho (senha errada, erro, timeout, sessão não gravada) o botão volta a funcionar.
      setBusy(false);
    }
  }

  return (
    <main className="app-watermark mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Área restrita</p>
      <h1 className="mt-2 text-3xl font-bold">Acesso do caixa</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Informe a senha da equipe para abrir o caixa.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-3">
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha da equipe"
          className="h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
        >
          {busy ? "Verificando..." : "Entrar no caixa"}
        </button>
      </form>
    </main>
  );
}
