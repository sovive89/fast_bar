import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { NousButton } from "@nous/motion/button";
import "@nous/motion/style.css";
import { MessageCircle, Shield, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useBranding } from "@/lib/branding";
import { DEFAULT_SUPPORT_POLICY } from "@/lib/support-policy";
import {
  getMySupportMessages,
  getMySupportStatus,
  requestMySupport,
  sendMySupportMessage,
} from "@/lib/support-requests.functions";
import { CUSTOMER_SUPPORT_PRESETS } from "@/lib/support-presets";
import type { PublicSupportRequest } from "@/lib/support-requests.types";

const HOLD_MS = 2000;
const CUSTOMER_MESSAGES = CUSTOMER_SUPPORT_PRESETS;
type Choice = "enabled" | "declined";
type Messages = Awaited<ReturnType<typeof getMySupportMessages>>;
const buttonClass =
  "min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50";

/** Só montado na comanda verificada. Nenhuma preferência é gravada no CRM. */
export function SupportWidget({
  sessionId,
  activeSession = true,
  portalTarget = null,
}: {
  sessionId: string;
  activeSession?: boolean;
  portalTarget?: HTMLElement | null;
}) {
  const { branding, style } = useBranding();
  const key = `fastbar:apoio:v1:${sessionId}`;
  const [choice, setChoice] = useState<Choice | null>(null);
  const [ready, setReady] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [request, setRequest] = useState<PublicSupportRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [holding, setHolding] = useState(false);
  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [chatSyncError, setChatSyncError] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [messages, setMessages] = useState<Messages>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentByHold = useRef(false);
  const submitting = useRef(false);
  const sendingRef = useRef(false);
  const statusSequence = useRef(0);
  const chatSequence = useRef(0);
  const loadStatus = useServerFn(getMySupportStatus);
  const makeRequest = useServerFn(requestMySupport);
  const loadMessages = useServerFn(getMySupportMessages);
  const sendMessage = useServerFn(sendMySupportMessage);
  const helpId = useId();

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(key);
    } catch {
      /* A escolha vale na aba. */
    }
    const next = saved === "enabled" || saved === "declined" ? saved : null;
    setChoice(next);
    setPolicyOpen(next === null && activeSession);
    setReady(true);
  }, [key, activeSession]);

  const cancelHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);

  useEffect(() => {
    const cancelWhenHidden = () => {
      if (document.hidden) cancelHold();
    };
    window.addEventListener("blur", cancelHold);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("blur", cancelHold);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
    };
  }, [cancelHold]);

  function choose(next: Choice) {
    cancelHold();
    setChoice(next);
    setPolicyOpen(false);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      /* Funciona sem storage. */
    }
  }

  useEffect(() => {
    if (choice !== "enabled") return;
    let active = true;
    async function refresh() {
      const sequence = ++statusSequence.current;
      try {
        const result = await loadStatus({ data: { sessionId } });
        if (active && sequence === statusSequence.current) {
          setRequest(result);
          setSyncError(false);
        }
      } catch {
        if (active && sequence === statusSequence.current) setSyncError(true);
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [choice, loadStatus, sessionId]);

  const requestId = request?.id;
  useEffect(() => {
    if (!conversationOpen || !requestId) return;
    const currentRequestId = requestId;
    let active = true;
    async function refresh() {
      const sequence = ++chatSequence.current;
      try {
        const result = await loadMessages({ data: { sessionId, requestId: currentRequestId } });
        if (active && sequence === chatSequence.current) {
          setMessages(result);
          setChatSyncError(false);
        }
      } catch {
        if (active && sequence === chatSequence.current) setChatSyncError(true);
      }
    }
    setMessages([]);
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [conversationOpen, requestId, loadMessages, sessionId]);

  async function askForSupport() {
    if (submitting.current || choice !== "enabled") return;
    cancelHold();
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await makeRequest({ data: { sessionId, optedIn: true } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      ++statusSequence.current;
      setRequest(result.request);
      setSyncError(false);
      setConversationOpen(true);
    } catch {
      setError(
        "Não foi possível confirmar o envio. Se precisar de ajuda agora, procure a equipe pessoalmente.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function startHold() {
    sentByHold.current = false;
    if (busy || timer.current || (request && request.status !== "completed")) return;
    sentByHold.current = false;
    setHolding(true);
    timer.current = setTimeout(() => {
      sentByHold.current = true;
      void askForSupport();
    }, HOLD_MS);
  }

  async function submitMessage(text: string) {
    if (!request || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setMessageError("");
    try {
      const result = await sendMessage({
        data: { sessionId, requestId: request.id, body: text },
      });
      if (!result.ok) {
        setMessageError(result.message);
        return;
      }
      const sequence = ++chatSequence.current;
      const updatedMessages = await loadMessages({ data: { sessionId, requestId: request.id } });
      if (sequence === chatSequence.current) setMessages(updatedMessages);
    } catch {
      setMessageError(
        "Não foi possível confirmar a mensagem. Confira a conversa antes de tentar novamente.",
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (!ready || (!activeSession && !request)) return null;
  const active = request && request.status !== "completed";
  const statusText =
    request?.status === "attending"
      ? "A equipe está em atendimento."
      : request?.status === "completed"
        ? "A equipe encerrou este atendimento. Se ainda precisar, peça apoio novamente."
        : "Pedido registrado para a equipe. Aguardando atendimento.";

  return (
    <>
      <button
        type="button"
        onClick={() => setPolicyOpen(true)}
        className="mt-6 min-h-11 rounded-lg px-2 text-xs text-muted-foreground underline underline-offset-4"
      >
        Recurso de apoio
      </button>

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent
          style={style}
          className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl"
        >
          <DialogTitle>Acolhimento e proteção</DialogTitle>
          <DialogDescription>{branding.supportPolicy || DEFAULT_SUPPORT_POLICY}</DialogDescription>
          <p className="text-sm">
            Ao ativar, aparece um botão discreto sobre o conteúdo. Segure por 2 segundos ou toque
            para confirmar o pedido. Você poderá conversar por texto com a equipe, sem som no seu
            aparelho.
          </p>
          <p className="text-xs text-muted-foreground">
            Sua escolha fica neste navegador. As mensagens e os pedidos ficam restritos à equipe
            autorizada do bar. Registros encerrados entram em limpeza após 90 dias. Não compartilhe
            o link da sua comanda: ele também dá acesso à conversa. Desativar oculta o botão, mas
            não apaga pedidos já enviados.
          </p>
          <p className="text-xs text-muted-foreground">
            O recurso depende de conexão e da resposta da equipe. Se houver risco imediato, procure
            ajuda presencial ou ligue 190.
          </p>
          <button
            type="button"
            className={`${buttonClass} bg-primary text-primary-foreground`}
            onClick={() => choose("enabled")}
          >
            {choice === "enabled" ? "Manter ativado" : "Ativar recurso de apoio"}
          </button>
          <button type="button" className={buttonClass} onClick={() => choose("declined")}>
            {choice === "enabled" ? "Desativar neste aparelho" : "Agora não"}
          </button>
        </DialogContent>
      </Dialog>

      {choice === "enabled" &&
        !conversationOpen &&
        !policyOpen &&
        createPortal(
          <div
            style={style}
            className={
              portalTarget
                ? "relative min-w-0"
                : "fixed bottom-[calc(var(--client-footer-height,0px)+max(env(safe-area-inset-bottom),16px))] right-[max(env(safe-area-inset-right),16px)] z-40 max-w-[calc(100vw-2rem)]"
            }
          >
            {error && (
              <p
                role="alert"
                className="absolute bottom-full right-0 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background p-3 text-xs"
              >
                {error}
              </p>
            )}
            <NousButton
              size="sm"
              template="pulse"
              variant="outline"
              primaryColor="#f87171"
              speed={0.45}
              intensity={0.2}
              radius={999}
              reducedMotion="system"
              loading={busy}
              style={{
                background: "color-mix(in srgb, var(--background) 85%, transparent)",
                color: "var(--foreground)",
                backdropFilter: "blur(14px)",
                animationDuration: "3.6s",
                minHeight: "44px",
                padding: portalTarget ? "8px 10px" : "12px 18px",
                fontSize: "14px",
              }}
              className="support-floating-button select-none shadow-lg"
              aria-label={active ? "Abrir conversa com a equipe" : "Pedir apoio à equipe"}
              aria-describedby={helpId}
              onPointerDown={(event) => {
                if (event.isPrimary && event.button === 0) startHold();
              }}
              onPointerUp={cancelHold}
              onPointerCancel={cancelHold}
              onPointerLeave={cancelHold}
              onBlur={cancelHold}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                  event.preventDefault();
                  startHold();
                }
                if (event.key === "Escape") cancelHold();
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  cancelHold();
                  if (!sentByHold.current) setConversationOpen(true);
                  sentByHold.current = false;
                }
              }}
              onClick={() => {
                cancelHold();
                if (!sentByHold.current) setConversationOpen(true);
                sentByHold.current = false;
              }}
            >
              <span className="flex items-center gap-2">
                {branding.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <Shield aria-hidden="true" className="h-5 w-5 text-red-400" />
                )}
                {busy ? (portalTarget ? "…" : "Enviando…") : holding ? "Segure…" : "Apoio"}
                {active && !portalTarget && (
                  <MessageCircle aria-hidden="true" className="h-4 w-4" />
                )}
              </span>
            </NousButton>
            <span id={helpId} className="sr-only">
              Segure por dois segundos para pedir apoio, ou toque para abrir a confirmação. A
              conversa não emite som.
            </span>
          </div>,
          portalTarget ?? document.body,
        )}

      <Dialog
        open={conversationOpen}
        onOpenChange={(open) => {
          cancelHold();
          setConversationOpen(open);
          if (!open) sentByHold.current = false;
        }}
      >
        <DialogContent
          style={style}
          className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl"
        >
          <DialogTitle>Conversa com a equipe</DialogTitle>
          <DialogDescription>
            {request
              ? statusText
              : "Confirme para pedir apoio de forma discreta. Você poderá responder à equipe com mensagens prontas."}
          </DialogDescription>
          {syncError && (
            <p role="status" className="text-xs text-muted-foreground">
              Sem atualização do atendimento. Verifique sua conexão.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!request && (
            <button
              type="button"
              className={`${buttonClass} bg-primary text-primary-foreground`}
              disabled={busy}
              onClick={() => void askForSupport()}
            >
              {busy ? "Enviando…" : "Confirmar pedido de apoio"}
            </button>
          )}
          {request && (
            <>
              <ol
                aria-label="Mensagens da conversa"
                aria-live="polite"
                aria-relevant="additions text"
                className="max-h-[35dvh] space-y-3 overflow-y-auto overscroll-contain rounded-xl border border-border p-3"
              >
                {messages.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    Nenhuma mensagem ainda. Toque em uma resposta pronta abaixo.
                  </li>
                )}
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className={`rounded-lg p-2 text-sm ${message.sender === "customer" ? "ml-5 bg-primary/10" : "mr-5 bg-muted"}`}
                  >
                    <span className="block text-xs font-semibold">
                      {message.sender === "customer" ? "Você" : "Equipe"}
                    </span>
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  </li>
                ))}
              </ol>
              {request.status !== "completed" ? (
                <div className="space-y-2">
                  <div role="group" aria-label="Mensagens prontas" className="flex flex-col gap-2">
                    {CUSTOMER_MESSAGES.map((text) => (
                      <button
                        key={text}
                        type="button"
                        disabled={sending}
                        onClick={() => void submitMessage(text)}
                        className={`${buttonClass} text-left`}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void askForSupport()}
                >
                  Ainda preciso de apoio
                </button>
              )}
              {chatSyncError && (
                <p role="status" className="text-xs text-muted-foreground">
                  Sem atualização da conversa. Verifique sua conexão.
                </p>
              )}
              {messageError && (
                <p role="alert" className="text-sm text-destructive">
                  {messageError}
                </p>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => {
              sentByHold.current = false;
              setConversationOpen(false);
            }}
            className={`${buttonClass} flex items-center justify-center gap-2`}
          >
            <X className="h-4 w-4" aria-hidden="true" /> Ocultar conversa
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
