import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ClipboardList, RefreshCw, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loading } from "@/components/motion/Loading";
import { DeleteSupportButton } from "@/components/shared/DeleteSupportButton";
import {
  getSupportOccurrences,
  getSupportOccurrenceDetail,
} from "@/lib/support-requests.functions";

export const Route = createFileRoute("/caixa/seguranca")({
  head: () => ({ meta: [{ title: "Segurança | FastBar" }] }),
  component: SecurityPage,
});

type SupportHistory = Awaited<ReturnType<typeof getSupportOccurrences>>;
type SupportDetail = Awaited<ReturnType<typeof getSupportOccurrenceDetail>>;
const STATUS_LABEL = {
  requested: "Aguardando atendimento",
  attending: "Em atendimento",
  completed: "Atendimento concluído",
} as const;

function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

/** Staff gate is inherited from /caixa; every read is also authorized server-side. */
function SecurityPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Segurança</p>
      <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold">
        <Shield aria-hidden="true" className="h-7 w-7" /> Proteção e apoio
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Atendimentos de apoio da equipe e áreas previstas para a segurança do estabelecimento.
      </p>
      <Tabs defaultValue="apoio" className="mt-5">
        <TabsList aria-label="Áreas de segurança" className="grid h-auto w-full grid-cols-3 gap-1">
          <TabsTrigger value="apoio" className="min-h-11">
            Apoio
          </TabsTrigger>
          <TabsTrigger value="ocorrencias" className="min-h-11">
            Ocorrências
          </TabsTrigger>
          <TabsTrigger value="cameras" className="min-h-11">
            Câmeras
          </TabsTrigger>
        </TabsList>
        <TabsContent value="apoio" className="mt-5">
          <SupportHistorySection />
        </TabsContent>
        <TabsContent value="ocorrencias" className="mt-5">
          <section className="rounded-2xl border border-dashed border-border p-5">
            <ClipboardList aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
            <h2 className="mt-3 text-xl font-semibold">
              Ocorrências — preparado para uma próxima etapa
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              O registro formal de uma ocorrência será aberto manualmente, posteriormente, se houver
              necessidade após o atendimento.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              O pedido de apoio mantém seu registro de atendimento. Documento formal, identificação
              de envolvidos e confirmação da pessoa serão definidos nessa etapa futura.
            </p>
          </section>
        </TabsContent>
        <TabsContent value="cameras" className="mt-5">
          <section className="rounded-2xl border border-dashed border-border p-5">
            <Camera aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
            <h2 className="mt-3 text-xl font-semibold">Circuito de câmeras — planejado</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Área reservada para uma futura integração do circuito de câmeras do estabelecimento. A
              conexão e as permissões de acesso ainda serão definidas.
            </p>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function SupportHistorySection() {
  const load = useServerFn(getSupportOccurrences);
  const [records, setRecords] = useState<SupportHistory>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await load();
        if (active) {
          setRecords(result);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load, refreshKey]);

  return (
    <section aria-label="Histórico de atendimentos de apoio">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Atendimentos de apoio</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Até 100 registros recentes. Acesso restrito à equipe que entrou com a senha do caixa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
          aria-label="Atualizar atendimentos de apoio"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {failed && (
        <p role="status" className="mt-3 text-sm text-amber-600 dark:text-amber-400">
          Não foi possível atualizar os atendimentos.{" "}
          {records.length > 0
            ? "Os registros abaixo podem estar desatualizados."
            : "Tente atualizar novamente."}
        </p>
      )}
      {loading ? (
        <Loading className="mt-5" label="Carregando atendimentos de apoio..." />
      ) : records.length === 0 && !failed ? (
        <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nenhum atendimento de apoio registrado.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {records.map((record) => (
            <li key={record.id}>
              <button
                type="button"
                id={`support-history-${record.id}`}
                onClick={() => setSelectedId(record.id)}
                aria-pressed={selectedId === record.id}
                className={`w-full rounded-xl border p-4 text-left ${selectedId === record.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              >
                <span className="block break-words text-base font-semibold">
                  {record.customerName}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {dateLabel(record.createdAt)} · {STATUS_LABEL[record.status]}
                </span>
                {record.escalated && (
                  <span className="mt-1 block text-xs font-semibold text-red-600 dark:text-red-400">
                    Novo acionamento · atenção da gestão
                  </span>
                )}
                <span className="mt-2 block text-xs font-medium text-primary">
                  Ver registro de atendimento
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectedId && (
        <SupportDetailPanel
          key={selectedId}
          requestId={selectedId}
          onClose={() => {
            document.getElementById(`support-history-${selectedId}`)?.focus();
            setSelectedId(null);
          }}
          onDeleted={() => {
            setSelectedId(null);
            setRefreshKey((current) => current + 1);
          }}
        />
      )}
    </section>
  );
}

function SupportDetailPanel({
  requestId,
  onClose,
  onDeleted,
}: {
  requestId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const load = useServerFn(getSupportOccurrenceDetail);
  const [detail, setDetail] = useState<SupportDetail>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const panelRef = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      element.focus();
      element.scrollIntoView({ block: "start" });
    }
  }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await load({ data: { requestId } });
        if (active) {
          setDetail(result);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load, requestId, refreshKey]);

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      aria-label="Registro de atendimento selecionado"
      className="mt-5 scroll-mt-28 rounded-2xl border border-border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Registro de atendimento</h3>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-border px-3 text-sm"
        >
          Fechar registro
        </button>
      </div>
      {failed && (
        <div role="status" className="mt-3 text-sm text-amber-600 dark:text-amber-400">
          <p>Não foi possível atualizar o registro.</p>
          <button
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
            className="min-h-11 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <Loading className="mt-4" label="Carregando registro..." />
      ) : !detail ? (
        !failed && <p className="mt-4 text-sm text-muted-foreground">Registro indisponível.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Pessoa atendida</dt>
              <dd className="break-words font-medium">{detail.request.customerName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Situação</dt>
              <dd>{STATUS_LABEL[detail.request.status]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pedido registrado</dt>
              <dd>{dateLabel(detail.request.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Atendimento assumido por</dt>
              <dd className="break-words">{detail.request.attendedBy ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Conclusão registrada</dt>
              <dd>{dateLabel(detail.request.completedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Conclusão registrada por</dt>
              <dd className="break-words">{detail.request.completedBy ?? "—"}</dd>
            </div>
          </dl>
          {detail.request.escalated && (
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              Novo acionamento: encaminhar à gestão.
            </p>
          )}
          <section>
            <h4 className="text-sm font-semibold">Relato da equipe</h4>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {detail.request.completionNote || "Ainda não há relato de conclusão registrado."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Os nomes da equipe foram informados por quem entrou com a senha compartilhada. A
              confirmação da pessoa atendida ainda não foi implementada.
            </p>
          </section>
          <section>
            <h4 className="text-sm font-semibold">Conversa deste atendimento</h4>
            {detail.messages.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma mensagem registrada.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {detail.messages.map((message) => (
                  <li key={message.id} className="rounded-lg bg-muted p-3">
                    <p className="text-xs font-semibold">
                      {message.sender === "customer" ? "Pessoa atendida" : "Equipe"} ·{" "}
                      {dateLabel(message.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Link
            to="/caixa/$sessionId"
            params={{ sessionId: detail.request.sessionId }}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
          >
            Abrir comanda relacionada
          </Link>
          <DeleteSupportButton requestId={requestId} onDeleted={onDeleted} />
        </div>
      )}
    </div>
  );
}
