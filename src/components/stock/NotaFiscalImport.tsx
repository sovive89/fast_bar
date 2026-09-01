import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PrimaryButton, TextField } from "@/components/stock/SharedFormFields";
import { confirmarNotaFiscal, lookupNotaFiscal } from "@/lib/nota-fiscal.functions";

type ComponentOption = { id: string; name: string; kind: "base_drink" | "ingredient" };

type ItemLido = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
};

type LinhaConfirmacao = {
  key: string;
  descricaoOriginal: string;
  kind: "base_drink" | "ingredient";
  componentId: string;
  packs: string;
  purchaseCost: string;
};

/** Casamento simples: item da nota bate com item do estoque se um nome contém o outro
 * (case-insensitive) -- não é fuzzy match de verdade, só o suficiente pra pré-selecionar o campo
 * óbvio ("Heineken Long Neck" na nota vs. "Heineken" cadastrada) e deixar o resto pra escolha manual. */
function sugerirComponente(descricaoNota: string, componentes: ComponentOption[]): ComponentOption | null {
  const alvo = descricaoNota.trim().toLowerCase();
  if (!alvo) return null;
  const exato = componentes.find((c) => c.name.trim().toLowerCase() === alvo);
  if (exato) return exato;
  const parcial = componentes.find(
    (c) => alvo.includes(c.name.trim().toLowerCase()) || c.name.trim().toLowerCase().includes(alvo),
  );
  return parcial ?? null;
}

export function NotaFiscalImport(props: {
  baseDrinks: Array<{ id: string; name: string }>;
  ingredients: Array<{ id: string; name: string }>;
  onClose: () => void;
  onImported: () => void;
}) {
  const componentes: ComponentOption[] = [
    ...props.baseDrinks.map((b) => ({ id: b.id, name: b.name, kind: "base_drink" as const })),
    ...props.ingredients.map((i) => ({ id: i.id, name: i.name, kind: "ingredient" as const })),
  ];

  const [mode, setMode] = useState<"scanning" | "looking_up" | "confirming" | "done">("scanning");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [avisoItensVazios, setAvisoItensVazios] = useState(false);
  const [chave, setChave] = useState("");
  const [uf, setUf] = useState<string | null>(null);
  const [emitenteNome, setEmitenteNome] = useState<string | null>(null);
  const [emitenteDocumento, setEmitenteDocumento] = useState<string | null>(null);
  const [valorTotal, setValorTotal] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<LinhaConfirmacao[]>([]);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  const lookup = useServerFn(lookupNotaFiscal);
  const confirmar = useServerFn(confirmarNotaFiscal);

  useEffect(() => {
    if (mode !== "scanning") return;
    stoppedRef.current = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        setCameraError("Não foi possível acessar a câmera. Confirme a permissão do navegador.");
      }
    }

    async function tick() {
      if (stoppedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const jsQR = (await import("jsqr")).default;
          const code = jsQR(frame.data, frame.width, frame.height);
          if (code?.data) {
            stoppedRef.current = true;
            stopCamera();
            void onDecoded(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(() => void tick());
    }

    void start();
    return () => {
      stoppedRef.current = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function onDecoded(qrUrl: string) {
    setMode("looking_up");
    setLookupError(null);
    const result = await lookup({ data: { qrUrl } });
    if (!result.ok) {
      setLookupError(result.message);
      setMode("scanning");
      return;
    }
    setChave(result.chave);
    setUf(result.uf);
    setEmitenteNome(result.emitenteNome);
    setEmitenteDocumento(result.emitenteDocumento);
    setValorTotal(result.valorTotal);
    setAvisoItensVazios(result.avisoItensVazios);
    setLinhas(
      result.itens.map((item: ItemLido, index: number) => {
        const sugestao = sugerirComponente(item.descricao, componentes);
        return {
          key: `nf-${index}`,
          descricaoOriginal: item.descricao,
          kind: sugestao?.kind ?? "base_drink",
          componentId: sugestao?.id ?? "",
          packs: String(Math.round(item.quantidade)),
          purchaseCost:
            item.valorUnitario > 0 ? String(item.valorUnitario * item.quantidade).replace(".", ",") : "",
        };
      }),
    );
    setMode("confirming");
  }

  function updateLinha(key: string, patch: Partial<LinhaConfirmacao>) {
    setLinhas((current) => current.map((linha) => (linha.key === key ? { ...linha, ...patch } : linha)));
  }

  function adicionarLinhaManual() {
    setLinhas((current) => [
      ...current,
      {
        key: `manual-${Date.now()}-${current.length}`,
        descricaoOriginal: "",
        kind: "base_drink",
        componentId: "",
        packs: "",
        purchaseCost: "",
      },
    ]);
  }

  async function handleConfirmar() {
    setConfirmError(null);
    const itensValidos: Array<{
      kind: "base_drink" | "ingredient";
      componentId: string;
      packs: number;
      purchaseCost?: number;
    }> = [];
    for (const linha of linhas) {
      if (!linha.componentId) continue;
      const packs = Number(linha.packs);
      if (!Number.isInteger(packs) || packs <= 0) {
        setConfirmError(`Quantidade de embalagens inválida em "${linha.descricaoOriginal || "item manual"}".`);
        return;
      }
      const purchaseCost = linha.purchaseCost.trim() ? Number(linha.purchaseCost.replace(",", ".")) : undefined;
      itensValidos.push({
        kind: linha.kind,
        componentId: linha.componentId,
        packs,
        ...(purchaseCost !== undefined ? { purchaseCost } : {}),
      });
    }
    if (itensValidos.length === 0) {
      setConfirmError("Escolha o item correspondente em pelo menos uma linha.");
      return;
    }

    setConfirming(true);
    const result = await confirmar({
      data: {
        chave,
        uf: uf ?? undefined,
        emitenteNome: emitenteNome ?? undefined,
        emitenteDocumento: emitenteDocumento ?? undefined,
        valorTotal: valorTotal ?? undefined,
        itens: itensValidos,
      },
    });
    setConfirming(false);
    if (!result.ok) {
      setConfirmError(result.message ?? "Não foi possível confirmar a entrada.");
      return;
    }
    setResultado(`${itensValidos.length} item(ns) lançados no estoque.`);
    setMode("done");
    props.onImported();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Ler nota fiscal (QR code)</p>
          <button onClick={props.onClose} className="text-xs text-muted-foreground underline">
            Fechar
          </button>
        </div>

        {mode === "scanning" && (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Aponte a câmera pro QR code impresso no cupom fiscal.
            </p>
            {cameraError ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-destructive">
                {cameraError}
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                <video ref={videoRef} className="w-full" muted playsInline />
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
            {lookupError && <p className="mt-2 text-xs text-destructive">{lookupError}</p>}
          </div>
        )}

        {mode === "looking_up" && (
          <p className="py-8 text-center text-sm text-muted-foreground">Buscando os itens da nota...</p>
        )}

        {mode === "confirming" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
              <p>Chave: {chave}</p>
              {uf && <p>UF: {uf}</p>}
              {emitenteNome && <p>Emitente: {emitenteNome}</p>}
              {valorTotal != null && <p>Valor total da nota: {valorTotal.toFixed(2).replace(".", ",")}</p>}
            </div>

            {avisoItensVazios && (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                Não consegui ler os itens automaticamente desse portal. Adicione manualmente abaixo.
              </p>
            )}

            <div className="space-y-2">
              {linhas.map((linha) => {
                const opcoes = linha.kind === "base_drink" ? props.baseDrinks : props.ingredients;
                return (
                  <div key={linha.key} className="rounded-xl border border-border p-3">
                    {linha.descricaoOriginal && (
                      <p className="mb-1.5 truncate text-xs font-medium text-muted-foreground">
                        Nota: {linha.descricaoOriginal}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-xs font-medium text-muted-foreground">Tipo</span>
                        <select
                          value={linha.kind}
                          onChange={(event) =>
                            updateLinha(linha.key, {
                              kind: event.target.value as "base_drink" | "ingredient",
                              componentId: "",
                            })
                          }
                          className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                        >
                          <option value="base_drink">Bebida base</option>
                          <option value="ingredient">Ingrediente</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-muted-foreground">Item</span>
                        <select
                          value={linha.componentId}
                          onChange={(event) => updateLinha(linha.key, { componentId: event.target.value })}
                          className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                        >
                          <option value="">Ignorar esse item</option>
                          {opcoes.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <TextField
                        label="Embalagens (caixas/garrafas)"
                        value={linha.packs}
                        onChange={(value) => updateLinha(linha.key, { packs: value })}
                        type="number"
                      />
                      <TextField
                        label="Valor pago (opcional)"
                        value={linha.purchaseCost}
                        onChange={(value) => updateLinha(linha.key, { purchaseCost: value })}
                        type="number"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={adicionarLinhaManual}
              className="w-full rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              + Adicionar item manualmente
            </button>

            {confirmError && <p className="text-xs text-destructive">{confirmError}</p>}
            <PrimaryButton onClick={() => void handleConfirmar()} disabled={confirming}>
              {confirming ? "Lançando..." : "Confirmar entrada no estoque"}
            </PrimaryButton>
          </div>
        )}

        {mode === "done" && (
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm font-semibold text-primary">{resultado}</p>
            <PrimaryButton onClick={props.onClose}>Fechar</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
