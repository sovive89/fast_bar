import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBillRequests, updateBillRequest } from "@/lib/bill-requests.functions";
import { playAlertSound, unlockAlertSound, vibrateAlert } from "@/lib/alert-sound";
import { hhmm } from "@/lib/format";

const POLL_MS = 5000;
const MUTE_KEY = "fastbar:billAlertMuted";

type Requests = Awaited<ReturnType<typeof getBillRequests>>;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Faixa de alerta "cliente pediu a conta" no topo de todas as telas do caixa. Consulta o servidor a
 * cada poucos segundos (mesmo modelo do resto do caixa), toca um som curto e vibra quando chega um
 * pedido NOVO, e deixa a equipe assumir ("Atender") e concluir. O pedido só avisa: quem fecha a
 * comanda é a equipe, pelo fluxo normal — fechar a comanda também conclui o alerta.
 */
export function BillRequestAlerts() {
  const load = useServerFn(getBillRequests);
  const update = useServerFn(updateBillRequest);
  const [requests, setRequests] = useState<Requests>([]);
  const [muted, setMuted] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const alerted = useRef(new Set<string>());
  const mutedRef = useRef(false);

  useEffect(() => {
    const initial = readMuted();
    setMuted(initial);
    mutedRef.current = initial;
  }, []);

  // O navegador só libera o som depois de um toque da pessoa na página.
  useEffect(() => {
    const unlock = () => unlockAlertSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await load();
      setRequests(next);
      // Alerta só para pedido que ainda não avisamos nesta sessão da tela.
      const fresh = next.filter((r) => r.status === "pedida" && !alerted.current.has(r.id));
      for (const request of next) alerted.current.add(request.id);
      if (fresh.length > 0 && !mutedRef.current) {
        playAlertSound();
        vibrateAlert();
      }
    } catch {
      // Falha de rede não derruba o caixa: mantém o que já estava na tela e tenta de novo.
    }
  }, [load]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Título da aba com o contador, para quem está em outra aba/app.
  useEffect(() => {
    const pending = requests.filter((r) => r.status === "pedida").length;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = pending > 0 ? `(${pending}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [requests]);

  async function act(requestId: string, action: "atender" | "concluir") {
    if (busyId) return;
    setBusyId(requestId);
    await update({ data: { requestId, action } });
    await refresh();
    setBusyId(null);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      // sem armazenamento (aba anônima): o mudo vale só até recarregar.
    }
    if (!next) {
      unlockAlertSound();
      playAlertSound();
    }
  }

  if (requests.length === 0) return null;

  const waiting = requests.filter((r) => r.status === "pedida").length;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`px-4 py-4 text-amber-950 ${waiting > 0 ? "bg-amber-300" : "bg-amber-200"}`}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <p className="flex items-center gap-3 text-xl font-extrabold leading-tight">
          <BellRing className="h-7 w-7 shrink-0" aria-hidden />
          {requests.length === 1 ? "Pedido de conta" : `${requests.length} pedidos de conta`}
        </p>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Ligar o som do alerta" : "Silenciar o som do alerta"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/60 text-amber-950"
        >
          {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </button>
      </div>
      {/* Altura limitada: o alerta mora na faixa fixa do topo e, com vários pedidos, não pode cobrir
          o celular inteiro. Rola por dentro. */}
      <ul className="mx-auto mt-3 max-h-[45vh] max-w-2xl space-y-3 overflow-y-auto overscroll-contain">
        {requests.map((request) => (
          <li
            key={request.id}
            className={`rounded-2xl border-4 bg-white p-4 shadow-md ${
              request.status === "pedida" ? "alert-pulse-border" : "border-amber-500"
            }`}
          >
            <Link
              to="/caixa/$sessionId"
              params={{ sessionId: request.sessionId }}
              className="block min-w-0"
            >
              <span className="block break-words text-2xl font-bold leading-tight">
                {request.customerName}
              </span>
              <span className="mt-1 block text-base font-medium text-amber-900">
                {request.status === "pedida" ? "Pediu a conta" : "Em atendimento"} ·{" "}
                {hhmm(request.createdAt)}
              </span>
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {request.status === "pedida" ? (
                <button
                  type="button"
                  disabled={busyId === request.id}
                  onClick={() => void act(request.id, "atender")}
                  className="h-14 rounded-xl bg-amber-600 text-lg font-bold text-white disabled:opacity-60"
                >
                  Atender
                </button>
              ) : (
                <span className="flex h-14 items-center justify-center rounded-xl bg-amber-100 text-lg font-semibold text-amber-900">
                  Atendendo...
                </span>
              )}
              <button
                type="button"
                disabled={busyId === request.id}
                onClick={() => void act(request.id, "concluir")}
                className="h-14 rounded-xl border-2 border-amber-700 text-lg font-bold disabled:opacity-60"
              >
                Concluir
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
