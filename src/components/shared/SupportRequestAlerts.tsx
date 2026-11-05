import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSupportRequests,
  updateSupportRequest,
  getSupportMessages,
  sendSupportMessage,
} from "@/lib/support-requests.functions";
import { playSupportAlert, unlockAlertSound, vibrateSupportAlert } from "@/lib/alert-sound";
import { supportPriority, type SupportPriorityLevel } from "@/lib/support-priority";
import { STAFF_SUPPORT_PRESETS } from "@/lib/support-presets";
import { DeleteSupportButton } from "./DeleteSupportButton";
import { hhmm } from "@/lib/format";

const POLL_MS = 5000;
const CRITICAL_REMINDER_MS = 15000;
type AudiblePriority = Exclude<SupportPriorityLevel, "attending">;
const PRIORITY_RANK = { attending: 0, priority: 1, urgent: 2, critical: 3 } as const;
const PRIORITY_LABEL = {
  attending: "Em atendimento",
  priority: "Atendimento prioritário",
  urgent: "Atendimento urgente",
  critical: "Prioridade máxima · acione a gestão",
} as const;
function waitingLabel(createdAt: string, now: number) {
  const elapsed = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  if (!Number.isFinite(elapsed)) return "Aguardando atendimento";
  return elapsed < 60
    ? `Aguardando há ${elapsed} s`
    : `Aguardando há ${Math.floor(elapsed / 60)} min`;
}
type Requests = Awaited<ReturnType<typeof getSupportRequests>>;

/** Only mounted inside the password-protected staff layout. Names/notes never enter push text. */
export function SupportRequestAlerts() {
  const load = useServerFn(getSupportRequests);
  const update = useServerFn(updateSupportRequest);
  const [requests, setRequests] = useState<Requests>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lastRank = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [staffName, setStaffName] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const sequence = useRef(0);
  const alertState = useRef(new Map<string, { level: AudiblePriority; lastAlertAt: number }>());
  const mutedRef = useRef(false);
  const lastNotificationAt = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await load();
      if (!alive.current || current !== sequence.current) return;
      setRequests(next);
      setLoadFailed(false);
    } catch {
      if (alive.current && current === sequence.current) setLoadFailed(true);
    }
  }, [load]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    const unlock = () => unlockAlertSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sound/vibration only for new requests, priority transitions and bounded critical reminders.
  // Taking a request removes it immediately from the escalation/reminder state machine.
  useEffect(() => {
    const pendingIds = new Set<string>();
    let audible: AudiblePriority | null = null;
    let nextAnnouncement: string | null = null;
    for (const request of requests) {
      const level = supportPriority(request, now);
      if (level === "attending") continue;
      pendingIds.add(request.id);
      const previous = alertState.current.get(request.id);
      const advanced = !previous || PRIORITY_RANK[level] > PRIORITY_RANK[previous.level];
      const reminder =
        level === "critical" &&
        previous &&
        now - previous.lastAlertAt >= CRITICAL_REMINDER_MS &&
        now - lastNotificationAt.current >= CRITICAL_REMINDER_MS;
      if (advanced || reminder) {
        if (!audible || PRIORITY_RANK[level] > PRIORITY_RANK[audible]) audible = level;
        alertState.current.set(request.id, { level, lastAlertAt: now });
        if (advanced)
          nextAnnouncement = `Pedido de apoio: ${request.customerName}. ${PRIORITY_LABEL[level]}.`;
      } else if (previous && previous.level !== level) {
        alertState.current.set(request.id, { ...previous, level });
      }
    }
    for (const id of alertState.current.keys()) {
      if (!pendingIds.has(id)) alertState.current.delete(id);
    }
    if (nextAnnouncement) setAnnouncement(nextAnnouncement);
    if (audible) {
      lastNotificationAt.current = now;
      if (!mutedRef.current) {
        playSupportAlert(audible);
        vibrateSupportAlert(audible);
      }
    }
  }, [requests, now]);

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (!next) {
      unlockAlertSound();
      const active = requests
        .map((request) => supportPriority(request, Date.now()))
        .reduce<SupportPriorityLevel>(
          (highest, level) => (PRIORITY_RANK[level] > PRIORITY_RANK[highest] ? level : highest),
          "attending",
        );
      if (active !== "attending") {
        playSupportAlert(active);
        vibrateSupportAlert(active);
      }
      const resumedAt = Date.now();
      lastNotificationAt.current = resumedAt;
      for (const [id, state] of alertState.current)
        alertState.current.set(id, { ...state, lastAlertAt: resumedAt });
    }
  }

  async function act(requestId: string, action: "attend" | "complete") {
    if (busy.current) return;
    const name = staffName.trim();
    const note = (notes[requestId] ?? "").trim();
    if (name.length < 2) {
      setActionError("Informe seu nome para registrar quem fez o atendimento.");
      return;
    }
    if (action === "complete" && note.length < 6) {
      setActionError(
        "Descreva brevemente o atendimento antes de concluir (mínimo de 6 caracteres).",
      );
      return;
    }
    busy.current = true;
    setBusyId(requestId);
    setActionError(null);
    try {
      const result = await update({
        data: { requestId, action, staffName: name, ...(action === "complete" ? { note } : {}) },
      });
      if (!alive.current) return;
      if (!result.ok) {
        setActionError(result.message ?? "Não foi possível atualizar o pedido de apoio.");
      } else {
        // A confirmed staff action stops this device's escalation even if the next read fails.
        ++sequence.current;
        setRequests((current) =>
          action === "complete"
            ? current.filter((request) => request.id !== requestId)
            : current.map((request) =>
                request.id === requestId
                  ? { ...request, status: "attending", attendedBy: name }
                  : request,
              ),
        );
        if (action === "complete")
          setNotes((current) => {
            const next = { ...current };
            delete next[requestId];
            return next;
          });
      }
      await refresh();
    } catch {
      if (alive.current)
        setActionError("Não foi possível registrar a ação. Confira a conexão e tente novamente.");
    } finally {
      busy.current = false;
      if (alive.current) setBusyId(null);
    }
  }

  const highestPriority = requests
    .map((request) => supportPriority(request, now))
    .reduce<SupportPriorityLevel>(
      (highest, level) => (PRIORITY_RANK[level] > PRIORITY_RANK[highest] ? level : highest),
      "attending",
    );

  // Progressivo: o cartão abre sozinho quando chega um pedido e de novo cada vez que a urgência
  // sobe (prioritário → urgente → máxima), mesmo que a equipe tenha recolhido.
  const rank = PRIORITY_RANK[highestPriority];
  useEffect(() => {
    if (rank > lastRank.current) setExpanded(true);
    lastRank.current = rank;
  }, [rank]);

  const oldestWaiting = requests
    .filter((request) => request.status === "requested")
    .reduce<string | null>(
      (oldest, request) => (!oldest || request.createdAt < oldest ? request.createdAt : oldest),
      null,
    );

  if (requests.length === 0) {
    return loadFailed ? (
      <p role="status" className="px-4 pb-2 text-xs text-muted-foreground">
        Avisos de apoio indisponíveis. Vamos tentar novamente; mantenha o atendimento presencial.
      </p>
    ) : null;
  }

  return (
    <section aria-label="Pedidos de apoio" className="sticky top-0 z-50 px-3 pb-2 pt-2">
      <span role="alert" aria-live="assertive" className="sr-only">
        {announcement}
      </span>
      <details
        data-support-priority={highestPriority}
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
        className={`mx-auto max-w-2xl overflow-hidden rounded-2xl border-4 shadow-xl ${
          highestPriority === "critical"
            ? "alert-pulse-border border-red-600 bg-red-700 text-white"
            : highestPriority === "urgent"
              ? "border-red-600 bg-red-600 text-white"
              : highestPriority === "priority"
                ? "border-red-500 bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-50"
                : "border-border bg-card text-foreground"
        }`}
      >
        <summary className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3">
          <ShieldAlert className="h-8 w-8 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold leading-tight">
              {requests.length === 1 ? "1 pedido de apoio" : `${requests.length} pedidos de apoio`}
            </span>
            <span className="block text-sm font-semibold">
              {PRIORITY_LABEL[highestPriority]}
              {oldestWaiting ? ` · ${waitingLabel(oldestWaiting, now)}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium underline underline-offset-4">
            {expanded ? "Recolher" : "Atender"}
          </span>
        </summary>
        <div className="max-h-[60dvh] space-y-3 overflow-y-auto overscroll-contain bg-card px-3 pb-3 pt-1 text-card-foreground">
          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <p className="text-xs text-muted-foreground">
              Atenda com discrição e siga o protocolo de proteção do bar.
            </p>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={
                muted ? "Ligar som dos pedidos de apoio" : "Silenciar som dos pedidos de apoio"
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border"
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </div>
          <div>
            <label htmlFor="support-staff-name" className="text-xs font-medium">
              Seu nome
            </label>
            <input
              id="support-staff-name"
              value={staffName}
              onChange={(event) => setStaffName(event.target.value)}
              maxLength={80}
              autoComplete="off"
              placeholder="Quem está atendendo"
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Identificação informada por quem entrou com a senha compartilhada da equipe.
            </p>
          </div>
          {loadFailed && (
            <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
              Conexão indisponível. Estes são os últimos pedidos recebidos; a lista pode estar
              desatualizada.
            </p>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <ul className="space-y-3">
            {requests.map((request) => (
              <li key={request.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to="/caixa/$sessionId"
                    params={{ sessionId: request.sessionId }}
                    className="min-h-11 min-w-0 flex-1 break-words py-2 text-base font-semibold underline underline-offset-4"
                  >
                    {request.customerName}
                  </Link>
                  <span className="text-xs text-muted-foreground">{hhmm(request.createdAt)}</span>
                </div>
                {request.escalated && (
                  <p className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">
                    Novo acionamento: envolva a gestão agora.
                  </p>
                )}
                {request.status === "requested" && (
                  <p className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">
                    {waitingLabel(request.createdAt, now)} ·{" "}
                    {PRIORITY_LABEL[supportPriority(request, now)]}
                  </p>
                )}
                <StaffSupportChat requestId={request.id} staffName={staffName} />
                {request.status === "requested" ? (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void act(request.id, "attend")}
                    className="min-h-11 w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busyId === request.id ? "Registrando..." : "Assumir atendimento"}
                  </button>
                ) : (
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Em atendimento{request.attendedBy ? ` por ${request.attendedBy}` : ""}.
                    </p>
                    <label htmlFor={`support-note-${request.id}`} className="text-xs font-medium">
                      Registro do atendimento
                    </label>
                    <textarea
                      id={`support-note-${request.id}`}
                      value={notes[request.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                      }
                      maxLength={2000}
                      rows={3}
                      placeholder="Ações realizadas e encaminhamento; evite dados desnecessários."
                      className="mt-1 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Concluir registra a ação da equipe; a pessoa ainda pode informar que precisa
                      de apoio.
                    </p>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void act(request.id, "complete")}
                      className="mt-2 min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {busyId === request.id ? "Registrando..." : "Concluir atendimento"}
                    </button>
                  </div>
                )}
                <DeleteSupportButton
                  requestId={request.id}
                  onDeleted={() => void refresh()}
                  className="mt-3"
                />
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}

function StaffSupportChat({ requestId, staffName }: { requestId: string; staffName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`support-chat-${requestId}`}
        onClick={() => setOpen((value) => !value)}
        className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium"
      >
        {open ? "Fechar conversa" : "Conversar com a pessoa"}
      </button>
      {open && <SupportChatPanel requestId={requestId} staffName={staffName} />}
    </div>
  );
}

function SupportChatPanel({ requestId, staffName }: { requestId: string; staffName: string }) {
  const load = useServerFn(getSupportMessages);
  const send = useServerFn(sendSupportMessage);
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof getSupportMessages>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [sending, setSending] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await load({ data: { requestId } });
      if (alive.current && current === sequence.current) {
        setMessages(next);
        setStale(false);
      }
    } catch {
      if (alive.current && current === sequence.current) setStale(true);
    }
  }, [load, requestId]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  async function sendMessage(text: string) {
    if (busy.current) return;
    if (staffName.trim().length < 2) {
      setError("Informe seu nome acima antes de enviar uma mensagem.");
      return;
    }
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await send({
        data: { requestId, body: text, staffName: staffName.trim() },
      });
      if (!alive.current) return;
      if (!result.ok) {
        setError(result.message);
      } else {
        await refresh();
      }
    } catch {
      if (alive.current)
        setError("Não foi possível enviar. Toque na mensagem para tentar novamente.");
    } finally {
      busy.current = false;
      if (alive.current) setSending(false);
    }
  }

  return (
    <div id={`support-chat-${requestId}`} className="mt-2 rounded-lg border border-border p-2">
      <p className="text-xs text-muted-foreground">
        Conversa privada com quem acionou este pedido de apoio.
      </p>
      <ul
        aria-label="Mensagens do pedido de apoio"
        className="mt-2 max-h-48 space-y-2 overflow-y-auto"
      >
        {messages.map((message) => (
          <li key={message.id} className="rounded-lg bg-muted p-2 text-sm">
            <p className="text-xs font-semibold">
              {message.sender === "customer" ? "Pessoa atendida" : "Equipe"} ·{" "}
              {hhmm(message.createdAt)}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
          </li>
        ))}
      </ul>
      {messages.length === 0 && !stale && (
        <p className="my-2 text-xs text-muted-foreground">Nenhuma mensagem recebida ainda.</p>
      )}
      {stale && (
        <p role="status" className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Não foi possível atualizar a conversa. As mensagens podem estar desatualizadas.
        </p>
      )}
      <div
        role="group"
        aria-label="Respostas prontas da equipe"
        className="mt-2 flex flex-wrap gap-2"
      >
        {STAFF_SUPPORT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={sending}
            onClick={() => void sendMessage(preset)}
            className="min-h-11 max-w-full rounded-lg border border-border px-2 py-2 text-left text-xs font-medium disabled:opacity-60"
          >
            {preset}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Tocar em uma resposta envia a mensagem para a pessoa.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
