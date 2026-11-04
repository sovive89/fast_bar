import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SectionCard, TextField } from "@/components/stock/SharedFormFields";
import { brl, hhmm } from "@/lib/format";
import {
  createProductionRecipe,
  getProductionOverview,
  runProductionOrder,
} from "@/lib/production.functions";
import { Loading } from "@/components/motion/Loading";

export const Route = createFileRoute("/caixa/producao")({
  head: () => ({
    meta: [{ title: "Produção | FastBar" }],
  }),
  component: Producao,
});

type Overview = Awaited<ReturnType<typeof getProductionOverview>>;

type DraftComponent = { key: string; quantity: string };

function parseNumber(text: string): number {
  return Number(text.trim().replace(",", "."));
}

const NUMBER_FORMAT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/**
 * Produção (seção 5.5 da documentação funcional): fichas que transformam bebidas base e
 * ingredientes num item produzido (xarope, polpa, molho) e ordens de produção que baixam os
 * componentes e somam o saldo. O item produzido fica em tabela própria — nesta etapa ele só
 * acumula saldo e custo; usá-lo em fichas de drink é um passo seguinte.
 */
function Producao() {
  const load = useServerFn(getProductionOverview);
  const create = useServerFn(createProductionRecipe);
  const produce = useServerFn(runProductionOrder);

  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("ml");
  const [yieldText, setYieldText] = useState("");
  const [lossText, setLossText] = useState("0");
  const [components, setComponents] = useState<DraftComponent[]>([{ key: "", quantity: "" }]);
  const [batches, setBatches] = useState<Record<string, string>>({});

  async function refresh() {
    try {
      setData(await load());
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Não foi possível carregar a produção.",
      );
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveRecipe() {
    if (!data || busy) return;
    setBusy(true);
    setMessage(null);
    const optionByKey = new Map(
      data.options.map((option) => [`${option.kind}:${option.id}`, option]),
    );
    const result = await create({
      data: {
        name,
        unit,
        yieldQuantity: parseNumber(yieldText),
        lossPercent: parseNumber(lossText || "0"),
        components: components
          .filter((component) => component.key !== "")
          .map((component) => {
            const option = optionByKey.get(component.key)!;
            return { kind: option.kind, id: option.id, quantity: parseNumber(component.quantity) };
          }),
      },
    });
    if (result.ok) {
      setName("");
      setYieldText("");
      setLossText("0");
      setComponents([{ key: "", quantity: "" }]);
      setMessage({ tone: "ok", text: "Ficha criada." });
      await refresh();
    } else {
      setMessage({ tone: "error", text: result.message });
    }
    setBusy(false);
  }

  async function runOrder(recipeId: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await produce({
      data: { recipeId, batches: parseNumber(batches[recipeId] || "1") },
    });
    if (result.ok) {
      setMessage({
        tone: "ok",
        text: result.costComplete
          ? `Produzido: ${NUMBER_FORMAT.format(result.produced)}. Custo total ${brl(result.costTotal ?? 0)}.`
          : `Produzido: ${NUMBER_FORMAT.format(result.produced)}. Custo incompleto: algum ingrediente está sem preço nos lotes.`,
      });
      await refresh();
    } else {
      setMessage({ tone: "error", text: result.message });
    }
    setBusy(false);
  }

  if (loadError && !data) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-destructive">{loadError}</p>
        <button type="button" onClick={() => void refresh()} className="mt-3 text-sm underline">
          Tentar de novo
        </button>
      </main>
    );
  }
  if (!data) return <Loading className="p-6" label="Carregando produção..." />;

  const yieldPreview = parseNumber(yieldText) * (1 - parseNumber(lossText || "0") / 100);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-8">
      <div>
        <h1 className="text-2xl font-bold">Produção</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Transforme ingredientes e bebidas base num item produzido (xarope, polpa, molho). Cada
          produção baixa o estoque dos ingredientes e soma o saldo do item.
        </p>
      </div>

      {message && (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            message.tone === "ok"
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </p>
      )}

      <SectionCard title="Itens produzidos">
        {data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum item produzido ainda. Crie a primeira ficha abaixo.
          </p>
        ) : (
          <ul className="space-y-4">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium">{item.name}</p>
                  <p className="shrink-0 text-sm">
                    <span className="font-semibold">{NUMBER_FORMAT.format(item.stock)}</span>{" "}
                    {item.unit}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Custo médio:{" "}
                  {item.unitCost === null
                    ? "ainda sem custo completo"
                    : `${brl(item.unitCost)} por ${item.unit}`}
                </p>
                {item.recipe && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Cada receita rende {NUMBER_FORMAT.format(item.recipe.yieldQuantity)}{" "}
                      {item.unit}
                      {item.recipe.lossPercent > 0
                        ? ` (perda prevista ${item.recipe.lossPercent}%)`
                        : ""}
                      . Leva:{" "}
                      {item.recipe.components
                        .map((c) => `${NUMBER_FORMAT.format(c.quantity)} ${c.unit} de ${c.name}`)
                        .join(", ")}
                      .
                    </p>
                    <div className="flex gap-2">
                      <input
                        inputMode="decimal"
                        value={batches[item.recipe.id] ?? "1"}
                        onChange={(event) =>
                          setBatches({ ...batches, [item.recipe!.id]: event.target.value })
                        }
                        disabled={busy}
                        aria-label="Quantas receitas produzir"
                        className="h-10 w-20 rounded-lg border border-border bg-background px-3 text-base"
                      />
                      <button
                        type="button"
                        onClick={() => void runOrder(item.recipe!.id)}
                        disabled={busy}
                        className="h-10 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {busy ? "Produzindo..." : "Produzir"}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Nova ficha de produção">
        <div className="space-y-3">
          <TextField
            label="Nome do item produzido"
            value={name}
            onChange={setName}
            placeholder="Ex.: Xarope de limão"
          />
          <div className="grid grid-cols-3 gap-2">
            <TextField label="Unidade" value={unit} onChange={setUnit} placeholder="ml, L, kg" />
            <TextField
              label="Rende (por receita)"
              value={yieldText}
              onChange={setYieldText}
              placeholder="1500"
            />
            <TextField
              label="Perda prevista %"
              value={lossText}
              onChange={setLossText}
              placeholder="0"
            />
          </div>
          {Number.isFinite(yieldPreview) && yieldPreview > 0 && (
            <p className="text-xs text-muted-foreground">
              Depois da perda, cada receita soma {NUMBER_FORMAT.format(yieldPreview)} {unit} ao
              saldo.
            </p>
          )}

          <p className="pt-1 text-xs font-medium text-muted-foreground">
            Ingredientes (por receita)
          </p>
          {components.map((component, index) => {
            const option = data.options.find((o) => `${o.kind}:${o.id}` === component.key);
            return (
              <div key={index} className="flex gap-2">
                <select
                  value={component.key}
                  onChange={(event) =>
                    setComponents(
                      components.map((c, i) =>
                        i === index ? { ...c, key: event.target.value } : c,
                      ),
                    )
                  }
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="">Escolha...</option>
                  {data.options.map((o) => (
                    <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                      {o.name} ({NUMBER_FORMAT.format(o.stock)} {o.unit})
                    </option>
                  ))}
                </select>
                <input
                  inputMode="decimal"
                  value={component.quantity}
                  onChange={(event) =>
                    setComponents(
                      components.map((c, i) =>
                        i === index ? { ...c, quantity: event.target.value } : c,
                      ),
                    )
                  }
                  placeholder={option?.unit ? `Qtd (${option.unit})` : "Qtd"}
                  className="h-11 w-28 rounded-xl border border-border bg-background px-3 text-sm"
                />
                {components.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setComponents(components.filter((_, i) => i !== index))}
                    aria-label="Remover ingrediente"
                    className="h-11 rounded-xl border border-border px-3 text-sm text-muted-foreground"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setComponents([...components, { key: "", quantity: "" }])}
            className="inline-flex min-h-9 items-center text-sm font-medium text-primary underline underline-offset-4"
          >
            + Adicionar ingrediente
          </button>

          <button
            type="button"
            onClick={() => void saveRecipe()}
            disabled={busy}
            className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
          >
            Salvar ficha
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Últimas produções">
        {data.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma produção registrada ainda.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.orders.map((order) => (
              <li key={order.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  {order.itemName} · {NUMBER_FORMAT.format(order.produced)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {order.costTotal === null ? "custo incompleto" : brl(order.costTotal)} ·{" "}
                  {hhmm(order.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </main>
  );
}
