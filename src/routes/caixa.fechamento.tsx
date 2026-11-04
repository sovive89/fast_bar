import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { PasswordConfirm } from "@/components/shared/PasswordConfirm";
import { SectionCard } from "@/components/stock/SharedFormFields";
import { brl } from "@/lib/format";
import {
  closeOperationAfterReview,
  getClosureCandidates,
  resolveClosureBulk,
} from "@/lib/operation-closure.functions";
import { Loading } from "@/components/motion/Loading";

export const Route = createFileRoute("/caixa/fechamento")({
  head: () => ({
    meta: [{ title: "Fechamento de operação | FastBar" }],
  }),
  component: FechamentoOperacao,
});

type Candidates = Awaited<ReturnType<typeof getClosureCandidates>>;
type Candidate = Candidates["candidates"][number];
type Destino = Candidate["allowed"][number];

/** Os destinos, cada um com um sentido só (docs/DECISOES.md). A ordem é a dos botões. */
const DESTINOS: {
  id: Destino;
  label: string;
  hint: string;
  needsMotivo: boolean;
  tone: "neutral" | "danger";
}[] = [
  {
    id: "arquivo",
    label: "Arquivo",
    hint: "Comanda sem saldo devido vai para o Histórico.",
    needsMotivo: false,
    tone: "neutral",
  },
  {
    id: "cortesia",
    label: "Cortesia",
    hint: "O bar não cobra o saldo. Pede motivo.",
    needsMotivo: true,
    tone: "neutral",
  },
  {
    id: "inadimplencia",
    label: "Inadimplência",
    hint: "O saldo vira dívida e reabre quando o cliente voltar. Pede motivo.",
    needsMotivo: true,
    tone: "danger",
  },
  {
    id: "conta_pedida",
    label: "Fechar conta",
    hint: "Ação parcial: fica aguardando pagamento e volta no próximo fechamento.",
    needsMotivo: false,
    tone: "neutral",
  },
  {
    id: "mantida_aberta",
    label: "Manter aberta",
    hint: "Comanda desta operação que continua em uso.",
    needsMotivo: false,
    tone: "neutral",
  },
];

const DESTINO_BY_ID = Object.fromEntries(DESTINOS.map((d) => [d.id, d])) as Record<
  Destino,
  (typeof DESTINOS)[number]
>;

function formatDataOperacional(value: string | null) {
  if (!value) return "sem operação";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Tela de fechamento de operação (seção 3.4 da documentação funcional, P1.5-6 do CLAUDE.md):
 * nenhuma comanda aberta ou aguardando pagamento — desta operação ou esquecida de antes — fica sem
 * destino antes de a operação poder encerrar. As comandas são marcadas com caixas de seleção e
 * recebem o destino em lote, com uma senha (e um motivo, quando há dinheiro em jogo). Cada destino
 * fica gravado no banco por comanda (fastbar_operation_closures).
 */
function FechamentoOperacao() {
  const navigate = useNavigate();
  const loadCandidates = useServerFn(getClosureCandidates);
  const doResolve = useServerFn(resolveClosureBulk);
  const doClose = useServerFn(closeOperationAfterReview);

  const [data, setData] = useState<Candidates | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<Destino | null>(null);
  const [motivo, setMotivo] = useState("");
  const [failures, setFailures] = useState<{ name: string; message: string }[]>([]);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  async function refresh() {
    const next = await loadCandidates();
    setData(next);
    // Seleção só guarda comandas que ainda estão na lista.
    const stillThere = new Set(next.candidates.map((c) => c.sessionId));
    setSelected((current) => new Set([...current].filter((id) => stillThere.has(id))));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const candidates = data?.candidates ?? [];
  const current = candidates.filter((c) => c.fromCurrentOperation);
  const older = candidates.filter((c) => !c.fromCurrentOperation);
  const selectedRows = candidates.filter((c) => selected.has(c.sessionId));
  const selectedTotal = selectedRows.reduce((sum, c) => sum + c.total, 0);

  /** Um destino só fica disponível se TODAS as selecionadas aceitarem. */
  const commonDestinos = useMemo(() => {
    if (selectedRows.length === 0) return new Set<Destino>();
    return new Set(
      DESTINOS.map((d) => d.id).filter((id) => selectedRows.every((c) => c.allowed.includes(id))),
    );
  }, [selectedRows]);

  function toggle(sessionId: string) {
    setDestino(null);
    setSelected((currentSet) => {
      const next = new Set(currentSet);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  function toggleGroup(group: Candidate[]) {
    setDestino(null);
    const allOn = group.every((c) => selected.has(c.sessionId));
    setSelected((currentSet) => {
      const next = new Set(currentSet);
      for (const c of group) {
        if (allOn) next.delete(c.sessionId);
        else next.add(c.sessionId);
      }
      return next;
    });
  }

  async function handleResolve(password: string) {
    if (!destino || selectedRows.length === 0) {
      return { ok: false as const, message: "Selecione as comandas e o destino." };
    }
    if (DESTINO_BY_ID[destino].needsMotivo && motivo.trim().length < 5) {
      return { ok: false as const, message: "Descreva o motivo (mínimo 5 letras)." };
    }
    const result = await doResolve({
      data: {
        password,
        sessionIds: selectedRows.map((c) => c.sessionId),
        destino,
        motivo: motivo.trim() || undefined,
      },
    });
    if (result.message === "Senha incorreta.")
      return { ok: false as const, message: result.message };

    const nameById = new Map(candidates.map((c) => [c.sessionId, c.customerName]));
    setFailures(
      result.failures.map((f) => ({
        name: nameById.get(f.sessionId) ?? "Comanda",
        message: f.message,
      })),
    );
    if (result.done > 0) {
      setDestino(null);
      setMotivo("");
      await refresh();
    }
    // Falha parcial: as que deram certo já saíram da lista; a mensagem fica visível abaixo.
    return result.done > 0
      ? { ok: true as const }
      : { ok: false as const, message: result.message ?? "Nenhuma comanda recebeu o destino." };
  }

  async function handleClose(password: string) {
    const result = await doClose({ data: { password } });
    if (result.ok) {
      await navigate({ to: "/caixa", replace: true });
    } else {
      setCloseError(result.message ?? null);
    }
    return result;
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <Loading label="Carregando…" />
      </main>
    );
  }

  if (!data.operationId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <SectionCard title="Nenhuma operação aberta">
          <p className="text-sm text-muted-foreground">Não há o que encerrar agora.</p>
          <button
            onClick={() => void navigate({ to: "/caixa", replace: true })}
            className="mt-4 h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Voltar
          </button>
        </SectionCard>
      </main>
    );
  }

  const chosen = destino ? DESTINO_BY_ID[destino] : null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-40">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
          Encerrar operação
        </p>
        <h1 className="mt-1 text-2xl font-bold">Comandas pendentes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Marque as comandas e escolha um destino. Toda comanda aberta ou aguardando pagamento
          precisa de destino antes de encerrar, inclusive as esquecidas de dias anteriores.
        </p>
      </div>

      <details className="rounded-2xl border border-border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">O que cada destino faz</summary>
        <dl className="mt-3 space-y-2">
          {DESTINOS.map((d) => (
            <div key={d.id}>
              <dt className="font-medium">{d.label}</dt>
              <dd className="text-muted-foreground">{d.hint}</dd>
            </div>
          ))}
        </dl>
      </details>

      {candidates.length === 0 ? (
        <SectionCard title="Tudo revisado">
          <p className="text-sm text-muted-foreground">
            Nenhuma comanda pendente. A operação pode ser encerrada.
          </p>
        </SectionCard>
      ) : (
        <>
          <CandidateGroup
            title="Desta operação"
            rows={current}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => toggleGroup(current)}
          />
          <CandidateGroup
            title="De operações anteriores"
            note="Só aceitam Arquivo (se quitadas) ou Inadimplência."
            rows={older}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => toggleGroup(older)}
          />
        </>
      )}

      {failures.length > 0 && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">Algumas comandas não receberam o destino</p>
          <ul className="mt-2 space-y-1">
            {failures.map((f, index) => (
              <li key={index}>
                <span className="font-medium">{f.name}:</span>{" "}
                <span className="text-muted-foreground">{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {closeError && <p className="text-sm text-destructive">{closeError}</p>}

      {confirmingClose ? (
        <PasswordConfirm
          message="Confirme a senha da equipe para encerrar a operação. Depois disso não dá mais para lançar vendas nela."
          confirmLabel="Encerrar operação"
          onCancel={() => setConfirmingClose(false)}
          onConfirm={handleClose}
        />
      ) : (
        <button
          onClick={() => {
            setCloseError(null);
            setConfirmingClose(true);
          }}
          disabled={candidates.length > 0}
          className="h-12 w-full rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground disabled:opacity-60"
        >
          {candidates.length > 0
            ? `Dê destino às ${candidates.length} comanda(s) pendentes primeiro`
            : "Encerrar operação"}
        </button>
      )}

      {selectedRows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 shadow-lg backdrop-blur">
          <div className="mx-auto max-w-2xl space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p>
                <span className="font-semibold">{selectedRows.length}</span> selecionada(s) ·{" "}
                <span className="font-semibold">{brl(selectedTotal)}</span> de saldo
              </p>
              <button
                onClick={() => {
                  setSelected(new Set());
                  setDestino(null);
                }}
                className="text-xs font-medium text-muted-foreground underline"
              >
                Limpar
              </button>
            </div>

            {chosen ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{chosen.hint}</p>
                {chosen.needsMotivo && (
                  <input
                    type="text"
                    value={motivo}
                    onChange={(event) => setMotivo(event.target.value)}
                    placeholder={
                      chosen.id === "cortesia"
                        ? "Por que estas comandas não vão ser cobradas?"
                        : "Por que o cliente não vai pagar agora?"
                    }
                    autoFocus
                    className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                  />
                )}
                <PasswordConfirm
                  message={`Confirme a senha da equipe para "${chosen.label}" em ${selectedRows.length} comanda(s).`}
                  confirmLabel={chosen.label}
                  onCancel={() => {
                    setDestino(null);
                    setMotivo("");
                  }}
                  onConfirm={handleResolve}
                />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {DESTINOS.map((d) => {
                  const enabled = commonDestinos.has(d.id);
                  return (
                    <button
                      key={d.id}
                      disabled={!enabled}
                      title={
                        enabled
                          ? d.hint
                          : "Nem todas as comandas selecionadas aceitam este destino."
                      }
                      onClick={() => {
                        setFailures([]);
                        setDestino(d.id);
                      }}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${
                        d.tone === "danger"
                          ? "border-destructive/40 text-destructive"
                          : "border-border"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function CandidateGroup(props: {
  title: string;
  note?: string;
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (sessionId: string) => void;
  onToggleAll: () => void;
}) {
  if (props.rows.length === 0) return null;
  const allOn = props.rows.every((c) => props.selected.has(c.sessionId));
  const total = props.rows.reduce((sum, c) => sum + c.total, 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {props.title} ({props.rows.length})
          </p>
          <p className="text-xs text-muted-foreground">
            {brl(total)} de saldo{props.note ? ` · ${props.note}` : ""}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={allOn}
            onChange={props.onToggleAll}
            className="h-5 w-5 accent-primary"
          />
          Todas
        </label>
      </div>

      <ul className="mt-3 divide-y divide-border">
        {props.rows.map((c) => {
          const checked = props.selected.has(c.sessionId);
          return (
            <li key={c.sessionId}>
              <label className="flex cursor-pointer items-center gap-3 py-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => props.onToggle(c.sessionId)}
                  className="h-5 w-5 shrink-0 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.status === "open" ? "Em andamento" : "Aguardando pagamento"}
                    {!c.fromCurrentOperation && ` · ${formatDataOperacional(c.dataOperacional)}`}
                    {c.creditLeft > 0 && ` · crédito sobrando ${brl(c.creditLeft)}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Aceita: {c.allowed.map((id) => DESTINO_BY_ID[id].label).join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold">{brl(c.total)}</p>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
