import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PrimaryButton, TextField } from "@/components/stock/SharedFormFields";
import { parseAmount } from "@/lib/format";
import {
  confirmarEntradaEstoque,
  confirmarNotaFiscal,
  getSupplyItemAliases,
  lookupNotaFiscal,
  parseSupplyFile,
} from "@/lib/nota-fiscal.functions";

type ComponentOption = { id: string; name: string; kind: "base_drink" | "ingredient" };

type Alias = { rawTextNormalized: string; kind: "base_drink" | "ingredient"; componentId: string };

type ItemLido = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
};

type LinhaConfirmacao = {
  key: string;
  descricaoOriginal: string;
  quantidadeNota: string;
  kind: "base_drink" | "ingredient";
  componentId: string;
  packs: string;
  purchaseCost: string;
};

/** Casamento do item externo (nota, planilha) com um insumo do estoque, em duas etapas: primeiro
 * tenta o que já foi aprendido (a equipe confirmou essa mesma descrição antes -- ver
 * upsertSupplyAliases no servidor), que é exato e não erra; só na ausência disso cai pro casamento
 * por substring ("Heineken Long Neck" contém "Heineken"), que é só uma pré-seleção, não uma
 * certeza -- por isso sempre revisável na tela de confirmação. */
function sugerirComponente(
  descricaoNota: string,
  componentes: ComponentOption[],
  aliases: Alias[],
): ComponentOption | null {
  const alvo = descricaoNota.trim().toLowerCase();
  if (!alvo) return null;

  const aprendido = aliases.find((a) => a.rawTextNormalized === alvo);
  if (aprendido) {
    const match = componentes.find((c) => c.id === aprendido.componentId && c.kind === aprendido.kind);
    if (match) return match;
  }

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

  const [mode, setMode] = useState<"choosing" | "scanning" | "looking_up" | "parsing_file" | "confirming" | "done">(
    "choosing",
  );
  // De onde vieram os itens em confirmação -- decide qual server function o "Confirmar" chama:
  // nota fiscal tem chave de acesso (trava contra reimportar a mesma nota), planilha não tem
  // esse identificador único, então usa um caminho de confirmação mais simples.
  const [origem, setOrigem] = useState<"qr" | "arquivo" | null>(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [arquivoError, setArquivoError] = useState<string | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lookup = useServerFn(lookupNotaFiscal);
  const confirmar = useServerFn(confirmarNotaFiscal);
  const confirmarArquivo = useServerFn(confirmarEntradaEstoque);
  const parseArquivo = useServerFn(parseSupplyFile);
  const loadAliases = useServerFn(getSupplyItemAliases);

  useEffect(() => {
    // Carrega o que já foi aprendido uma vez, ao abrir o painel -- não depende do modo, porque
    // tanto o caminho de QR quanto o de planilha usam a mesma lista de sugestões.
    loadAliases()
      .then((result) => setAliases(result.aliases))
      .catch(() => {
        /* sem aliases carregados, as sugestões caem pro casamento por substring -- não é um erro
           que precise travar a tela por causa disso. */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "scanning") return;
    stoppedRef.current = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        // A permissão pode levar segundos, e o modal pode ter sido fechado (ou o modo mudado)
        // enquanto o navegador ainda perguntava -- sem essa checagem, a câmera fica ligada em
        // segundo plano pra sempre, porque o cleanup já rodou antes de existir stream pra parar.
        if (stoppedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
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
    let result: Awaited<ReturnType<typeof lookup>>;
    try {
      result = await lookup({ data: { qrUrl } });
    } catch {
      setLookupError("Não foi possível consultar a nota agora -- tente escanear de novo.");
      setMode("scanning");
      return;
    }
    if (!result.ok) {
      // Chave de acesso lida com sucesso mas o portal da SEFAZ não respondeu -- ainda dá pra
      // aproveitar a chave e completar os itens à mão, em vez de forçar escanear tudo de novo.
      if (result.code === "portal_indisponivel" && result.chave) {
        setOrigem("qr");
        setChave(result.chave);
        setUf(result.uf ?? null);
        setEmitenteNome(null);
        setEmitenteDocumento(null);
        setValorTotal(null);
        setAvisoItensVazios(true);
        setLinhas([]);
        setLookupError(result.message);
        setMode("confirming");
        return;
      }
      setLookupError(result.message);
      setMode("scanning");
      return;
    }
    setOrigem("qr");
    setChave(result.chave);
    setUf(result.uf);
    setEmitenteNome(result.emitenteNome);
    setEmitenteDocumento(result.emitenteDocumento);
    setValorTotal(result.valorTotal);
    setAvisoItensVazios(result.avisoItensVazios);
    setLinhas(
      result.itens.map((item: ItemLido, index: number) => {
        const sugestao = sugerirComponente(item.descricao, componentes, aliases);
        return {
          key: `nf-${index}`,
          descricaoOriginal: item.descricao,
          quantidadeNota: `${item.quantidade} ${item.unidade}`,
          kind: sugestao?.kind ?? "base_drink",
          componentId: sugestao?.id ?? "",
          // "packs" no sistema é embalagem de compra (caixa, garrafa), multiplicada por
          // units_per_pack -- não é a mesma coisa que a quantidade de unidades da nota (ex.: nota
          // com "24 UN" não vira 24 embalagens). Deixa em branco de propósito: a equipe informa
          // quantas embalagens comprou de fato, só usando a quantidade da nota (mostrada acima do
          // campo) como referência visual, nunca preenchendo esse número sozinho.
          packs: "",
          purchaseCost:
            item.valorUnitario > 0 ? String(item.valorUnitario * item.quantidade).replace(".", ",") : "",
        };
      }),
    );
    setMode("confirming");
  }

  async function onArquivoSelecionado(file: File) {
    setArquivoError(null);
    setMode("parsing_file");
    setArquivoNome(file.name);

    const base64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") return resolve(null);
        const [, data] = result.split(",");
        resolve(data ?? null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!base64) {
      setArquivoError("Não foi possível ler esse arquivo.");
      setMode("choosing");
      return;
    }

    let result: Awaited<ReturnType<typeof parseArquivo>>;
    try {
      result = await parseArquivo({ data: { fileName: file.name, base64 } });
    } catch {
      setArquivoError("Não foi possível processar o arquivo agora -- tente de novo.");
      setMode("choosing");
      return;
    }
    if (!result.ok) {
      setArquivoError(result.message);
      setMode("choosing");
      return;
    }

    setOrigem("arquivo");
    setChave("");
    setUf(null);
    setEmitenteNome(null);
    setEmitenteDocumento(null);
    setValorTotal(null);
    setAvisoItensVazios(false);
    setLinhas(
      result.itens.map((item, index) => {
        const sugestao = sugerirComponente(item.descricao, componentes, aliases);
        return {
          key: `arq-${index}`,
          descricaoOriginal: item.descricao,
          quantidadeNota: `${item.quantidade} ${item.unidade}`,
          kind: sugestao?.kind ?? "base_drink",
          componentId: sugestao?.id ?? "",
          packs: "",
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
        quantidadeNota: "",
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
      descricaoOriginal?: string;
    }> = [];
    for (const linha of linhas) {
      if (!linha.componentId) continue;
      const packs = Number(linha.packs);
      if (!Number.isInteger(packs) || packs <= 0) {
        setConfirmError(`Quantidade de embalagens inválida em "${linha.descricaoOriginal || "item manual"}".`);
        return;
      }
      let purchaseCost: number | undefined;
      if (linha.purchaseCost.trim()) {
        const parsed = parseAmount(linha.purchaseCost);
        if (parsed === null) {
          setConfirmError(`Valor pago inválido em "${linha.descricaoOriginal || "item manual"}".`);
          return;
        }
        purchaseCost = parsed;
      }
      itensValidos.push({
        kind: linha.kind,
        componentId: linha.componentId,
        packs,
        ...(purchaseCost !== undefined ? { purchaseCost } : {}),
        ...(linha.descricaoOriginal.trim() ? { descricaoOriginal: linha.descricaoOriginal.trim() } : {}),
      });
    }
    if (itensValidos.length === 0) {
      setConfirmError("Escolha o item correspondente em pelo menos uma linha.");
      return;
    }

    // Planilha não tem chave de acesso -- não há como travar contra reenvio duplicado como na
    // nota fiscal, então usa o caminho mais simples, sem a lógica de retry/reconciliação abaixo
    // (que existe especificamente pra aproveitar essa trava).
    if (origem === "arquivo") {
      setConfirming(true);
      try {
        const result = await confirmarArquivo({
          data: { origem: `planilha: ${arquivoNome}`, itens: itensValidos },
        });
        if (!result.ok) {
          setConfirmError(result.message ?? "Não foi possível confirmar a entrada.");
          return;
        }
        setResultado(`${itensValidos.length} item(ns) lançados no estoque.`);
        setMode("done");
        props.onImported();
      } catch {
        setConfirmError("Não foi possível confirmar agora -- confira o estoque antes de tentar de novo.");
      } finally {
        setConfirming(false);
      }
      return;
    }

    const payload = {
      chave,
      uf: uf ?? undefined,
      emitenteNome: emitenteNome ?? undefined,
      emitenteDocumento: emitenteDocumento ?? undefined,
      valorTotal: valorTotal ?? undefined,
      itens: itensValidos,
    };

    // "ja_importada" só prova que a trava existe -- não que todos os itens foram lançados. Uma
    // tentativa anterior (ou a que colidiu agora) pode ter tido sucesso parcial ou ainda estar
    // no meio do loop de itens no servidor (todosItensOk null). Tratar isso sempre como "sucesso
    // total" mascararia itens que precisam de lançamento manual.
    function tratarJaImportada(res: { todosItensOk?: boolean | null; message?: string }) {
      if (res.todosItensOk === false) {
        props.onImported();
        setConfirmError(
          res.message ?? "Essa nota foi lançada parcialmente -- confira o estoque e lance o restante manualmente.",
        );
        return;
      }
      if (res.todosItensOk === null || res.todosItensOk === undefined) {
        setConfirmError(
          res.message ?? "Essa nota já está sendo processada em outra tentativa -- confira o estoque em instantes.",
        );
        return;
      }
      setResultado("A nota já tinha sido importada -- estoque atualizado.");
      setMode("done");
      props.onImported();
    }

    setConfirming(true);
    try {
      const result = await confirmar({ data: payload });
      if (!result.ok) {
        if (result.code === "ja_importada") {
          tratarJaImportada(result);
          return;
        }
        setConfirmError(result.message ?? "Não foi possível confirmar a entrada.");
        return;
      }
      setResultado(`${itensValidos.length} item(ns) lançados no estoque.`);
      setMode("done");
      props.onImported();
    } catch {
      // A chamada pode ter comitado no servidor e a resposta se perdido na rede -- reenviar o
      // mesmo payload é seguro graças à trava de chave_acesso única: se a nota já tiver sido
      // importada (ou estiver em andamento), o retry só confirma isso (sem duplicar) em vez de
      // deixar o operador achando que nada aconteceu.
      try {
        const recheck = await confirmar({ data: payload });
        if (!recheck.ok && recheck.code === "ja_importada") {
          tratarJaImportada(recheck);
          return;
        }
        if (recheck.ok) {
          setResultado(`${itensValidos.length} item(ns) lançados no estoque.`);
          setMode("done");
          props.onImported();
          return;
        }
        setConfirmError(recheck.message ?? "Não foi possível confirmar a entrada.");
      } catch {
        setConfirmError("Não foi possível confirmar agora -- confira o estoque antes de tentar de novo.");
      }
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Dar entrada no estoque</p>
          <button onClick={props.onClose} className="text-xs text-muted-foreground underline">
            Fechar
          </button>
        </div>

        {mode === "choosing" && (
          <div className="space-y-2">
            <p className="mb-1 text-xs text-muted-foreground">Como você quer lançar essa entrada?</p>
            <button
              onClick={() => {
                setOrigem("qr");
                setCameraError(null);
                setLookupError(null);
                setMode("scanning");
              }}
              className="w-full rounded-xl border border-dashed border-border p-3 text-left hover:border-primary"
            >
              <p className="text-xs font-semibold">Ler QR code da nota fiscal</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Aponta a câmera pro QR do cupom -- busca os itens direto no portal da SEFAZ.
              </p>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border border-dashed border-border p-3 text-left hover:border-primary"
            >
              <p className="text-xs font-semibold">Subir planilha do fornecedor</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                .xlsx, .xls ou .csv com produto, quantidade e valor -- normaliza e você confere
                antes de lançar.
              </p>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void onArquivoSelecionado(file);
              }}
            />
            <div className="w-full cursor-not-allowed rounded-xl border border-dashed border-border p-3 text-left opacity-60">
              <p className="text-xs font-semibold">Foto da nota (em breve)</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Ler uma foto de nota sem QR precisa de leitura por IA, que ainda não está
                configurada neste projeto.
              </p>
            </div>
            {arquivoError && <p className="text-xs text-destructive">{arquivoError}</p>}
          </div>
        )}

        {mode === "parsing_file" && (
          <p className="py-8 text-center text-sm text-muted-foreground">Lendo a planilha...</p>
        )}

        {mode === "scanning" && (
          <div>
            <button
              onClick={() => setMode("choosing")}
              className="mb-2 text-[11px] font-medium text-muted-foreground underline hover:text-foreground"
            >
              ← voltar
            </button>
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
            {origem === "qr" ? (
              <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
                <p>Chave: {chave}</p>
                {uf && <p>UF: {uf}</p>}
                {emitenteNome && <p>Emitente: {emitenteNome}</p>}
                {valorTotal != null && <p>Valor total da nota: {valorTotal.toFixed(2).replace(".", ",")}</p>}
              </div>
            ) : (
              <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
                <p>Planilha: {arquivoNome}</p>
              </div>
            )}

            {avisoItensVazios && (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                {lookupError ?? "Não consegui ler os itens automaticamente desse portal. Adicione manualmente abaixo."}
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
                        placeholder={linha.quantidadeNota ? `Nota: ${linha.quantidadeNota}` : ""}
                      />
                      <TextField
                        label="Valor pago (opcional)"
                        value={linha.purchaseCost}
                        onChange={(value) => updateLinha(linha.key, { purchaseCost: value })}
                        type="text"
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
