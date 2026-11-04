import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { PasswordConfirm } from "@/components/shared/PasswordConfirm";
import { SectionCard } from "@/components/stock/SharedFormFields";
import {
  getStockCountCandidates,
  openOperationWithStockCount,
  skipStockCountAndOpen,
} from "@/lib/stock-count.functions";
import { Loading } from "@/components/motion/Loading";

export const Route = createFileRoute("/caixa/abertura")({
  head: () => ({
    meta: [{ title: "Abertura de operação | FastBar" }],
  }),
  component: AberturaOperacao,
});

type Candidates = Awaited<ReturnType<typeof getStockCountCandidates>>;
type Product = Candidates["items"][number];
type Motivo = Candidates["motivos"][number]["value"];

/**
 * Tela de conferência de estoque na abertura da operação (seção 3 da documentação funcional,
 * P1.1-4 do CLAUDE.md): mostra o teórico de cada produto contável lado a lado com um campo pra
 * contagem física, pede motivo + observação em toda diferença, e só então libera a abertura —
 * com senha. "Pular conferência" continua existindo, mas exige senha + motivo (auditado), nunca um
 * toque só.
 */
function AberturaOperacao() {
  const navigate = useNavigate();
  const loadCandidates = useServerFn(getStockCountCandidates);
  const confirmOpen = useServerFn(openOperationWithStockCount);
  const doSkip = useServerFn(skipStockCountAndOpen);

  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [motivos, setMotivos] = useState<Record<string, Motivo | "">>({});
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skipMotivo, setSkipMotivo] = useState("");
  const [auditWarning, setAuditWarning] = useState<string | null>(null);

  useEffect(() => {
    void loadCandidates().then(setCandidates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const product of candidates?.items ?? []) {
      const list = groups.get(product.category) ?? [];
      list.push(product);
      groups.set(product.category, list);
    }
    return groups;
  }, [candidates]);

  /** Mesma regra do servidor (normalizeCount em stock-count.server.ts): produto conta em
   * unidades inteiras; bebida base e ingrediente aceitam fração (ex.: 350,5 ml), com vírgula ou
   * ponto. */
  function normalize(value: number, product: Product): number {
    return product.kind === "product" ? Math.floor(value) : Math.round(value * 1000) / 1000;
  }

  function contadaValue(product: Product): number {
    const raw = contagens[product.key];
    const teorico = normalize(product.stockQuantity, product);
    if (raw === undefined || raw.trim() === "") return teorico;
    const parsed = Number(raw.replace(",", "."));
    return Number.isFinite(parsed) ? normalize(parsed, product) : teorico;
  }

  function diferenca(product: Product): number {
    return normalize(contadaValue(product) - normalize(product.stockQuantity, product), product);
  }

  function divergiu(product: Product): boolean {
    return diferenca(product) !== 0;
  }

  /** Valida localmente antes de pedir a senha — evita o passo de senha só pra voltar com "faltou
   * motivo em X" depois. O servidor confere tudo de novo (nunca confia só no client). */
  function findMissingMotivo(): string | null {
    for (const product of candidates?.items ?? []) {
      if (divergiu(product) && !motivos[product.key]) {
        return product.name;
      }
    }
    return null;
  }

  function goToStep3() {
    const missing = findMissingMotivo();
    if (missing) {
      setValidationError(`Informe o motivo da diferença em "${missing}".`);
      return;
    }
    setValidationError(null);
    setConfirming(true);
  }

  async function handleConfirm(password: string) {
    const items = (candidates?.items ?? []).map((product) => ({
      itemKey: product.key,
      contada: contadaValue(product),
      motivo: motivos[product.key] || undefined,
      observacao: observacoes[product.key],
    }));
    const result = await confirmOpen({ data: { password, items } });
    if (result.ok) {
      if (result.auditWarning) {
        setAuditWarning(result.auditWarning);
      } else {
        await navigate({ to: "/caixa", replace: true });
      }
    }
    return result;
  }

  async function handleSkip(password: string) {
    if (skipMotivo.trim().length < 5) {
      return { ok: false as const, message: "Descreva o motivo de pular a conferência." };
    }
    const result = await doSkip({ data: { password, motivo: skipMotivo } });
    if (result.ok) {
      if (result.auditWarning) {
        setAuditWarning(result.auditWarning);
      } else {
        await navigate({ to: "/caixa", replace: true });
      }
    }
    return result;
  }

  if (auditWarning) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-8">
        <SectionCard title="Operação aberta">
          <p className="text-sm text-amber-700 dark:text-amber-400">{auditWarning}</p>
          <button
            onClick={() => void navigate({ to: "/caixa", replace: true })}
            className="mt-4 h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Ir para o caixa
          </button>
        </SectionCard>
      </main>
    );
  }

  if (!candidates) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-8">
        <Loading label="Carregando…" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Abertura de operação
        </p>
        <h1 className="mt-1 text-2xl font-bold">Conferência de estoque</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare o estoque teórico com a contagem física antes de abrir o caixa. Toda diferença
          precisa de um motivo.
        </p>
      </div>

      {candidates.items.length === 0 ? (
        <SectionCard title="Nada para contar">
          <p className="text-sm text-muted-foreground">
            Não há bebidas base, ingredientes ou produtos com saldo próprio ativos (itens com ficha
            técnica ou estoque ilimitado não entram nesta conferência). Pode abrir a operação
            direto.
          </p>
        </SectionCard>
      ) : (
        Array.from(groupedByCategory.entries()).map(([category, products]) => (
          <SectionCard key={category} title={category}>
            <div className="space-y-3">
              {products.map((product) => {
                const hasDiff = divergiu(product);
                return (
                  <div key={product.key} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Teórico: {normalize(product.stockQuantity, product)} {product.unit}
                        </p>
                      </div>
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Contado</span>
                        <input
                          // Texto com teclado numérico, não type="number": no iPhone em
                          // português o teclado decimal digita vírgula, e um input number
                          // descarta o valor inteiro quando recebe "350,5".
                          type="text"
                          inputMode={product.kind === "product" ? "numeric" : "decimal"}
                          value={
                            contagens[product.key] ??
                            String(normalize(product.stockQuantity, product))
                          }
                          onChange={(event) =>
                            setContagens((prev) => ({ ...prev, [product.key]: event.target.value }))
                          }
                          className="h-10 w-20 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-ring"
                        />
                      </label>
                    </div>

                    {hasDiff && (
                      <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3">
                        <p className="text-xs font-medium text-destructive">
                          Diferença de {diferenca(product) > 0 ? "+" : ""}
                          {diferenca(product)} {product.unit}
                        </p>
                        <label className="block">
                          <span className="text-xs font-medium text-muted-foreground">Motivo</span>
                          <select
                            value={motivos[product.key] ?? ""}
                            onChange={(event) =>
                              setMotivos((prev) => ({
                                ...prev,
                                [product.key]: event.target.value as Motivo,
                              }))
                            }
                            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
                          >
                            <option value="">Selecione…</option>
                            {candidates.motivos.map((motivo) => (
                              <option key={motivo.value} value={motivo.value}>
                                {motivo.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-muted-foreground">
                            Observação (opcional)
                          </span>
                          <input
                            type="text"
                            value={observacoes[product.key] ?? ""}
                            onChange={(event) =>
                              setObservacoes((prev) => ({
                                ...prev,
                                [product.key]: event.target.value,
                              }))
                            }
                            placeholder="Detalhe o que aconteceu, se souber"
                            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))
      )}

      {validationError && <p className="text-sm text-destructive">{validationError}</p>}

      {confirming ? (
        <PasswordConfirm
          message="Confirme a senha da equipe para concluir a conferência e abrir a operação."
          confirmLabel="Abrir operação"
          onCancel={() => setConfirming(false)}
          onConfirm={handleConfirm}
        />
      ) : (
        <button
          onClick={goToStep3}
          className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
        >
          Concluir conferência e abrir operação
        </button>
      )}

      {/* "Pular conferência" fica deliberadamente menos destacado que o fluxo normal — é a
          exceção, não o caminho esperado. */}
      <div className="border-t border-border pt-4">
        {skipping ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                Motivo de pular a conferência
              </span>
              <input
                type="text"
                value={skipMotivo}
                onChange={(event) => setSkipMotivo(event.target.value)}
                placeholder="Por que a conferência não vai ser feita agora?"
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </label>
            {skipMotivo.trim().length > 0 && skipMotivo.trim().length < 5 && (
              <p className="text-xs text-destructive">Descreva um pouco mais o motivo.</p>
            )}
            <PasswordConfirm
              message="Confirme a senha da equipe para pular a conferência e abrir a operação assim mesmo."
              confirmLabel="Pular e abrir operação"
              onCancel={() => setSkipping(false)}
              onConfirm={handleSkip}
            />
          </div>
        ) : (
          <button
            onClick={() => setSkipping(true)}
            className="inline-flex min-h-9 items-center text-xs font-semibold text-muted-foreground underline"
          >
            Pular conferência (exige senha e motivo)
          </button>
        )}
      </div>
    </main>
  );
}
