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
import { normalizarDocumentoEstoqueComIA } from "@/lib/stock-ai.functions";

type Kind = "base_drink" | "ingredient";
type ComponentOption = { id: string; name: string; kind: Kind };
type Alias = { rawTextNormalized: string | null; kind: Kind; componentId: string };
type ReadItem = { descricao: string; quantidade: number; unidade: string; valorUnitario: number };
type Line = {
  key: string;
  descricaoOriginal: string;
  quantidadeNota: string;
  kind: Kind;
  componentId: string;
  packs: string;
  purchaseCost: string;
};

type Mode = "choosing" | "camera" | "scanning" | "processing" | "confirming" | "done";

function suggest(descricao: string, components: ComponentOption[], aliases: Alias[]) {
  const alvo = descricao.trim().toLowerCase();
  if (!alvo) return null;
  const alias = aliases.find((a) => a.rawTextNormalized === alvo);
  if (alias) {
    const found = components.find((c) => c.id === alias.componentId && c.kind === alias.kind);
    if (found) return found;
  }
  return (
    components.find((c) => c.name.trim().toLowerCase() === alvo) ??
    components.find((c) => alvo.includes(c.name.trim().toLowerCase()) || c.name.trim().toLowerCase().includes(alvo)) ??
    null
  );
}

function makeLines(items: ReadItem[], components: ComponentOption[], aliases: Alias[], prefix: string): Line[] {
  return items.map((item, index) => {
    const match = suggest(item.descricao, components, aliases);
    return {
      key: `${prefix}-${index}-${Date.now()}`,
      descricaoOriginal: item.descricao,
      quantidadeNota: `${item.quantidade} ${item.unidade}`,
      kind: match?.kind ?? "base_drink",
      componentId: match?.id ?? "",
      packs: "",
      purchaseCost: item.valorUnitario > 0 ? String(item.valorUnitario * item.quantidade).replace(".", ",") : "",
    };
  });
}

export function NotaFiscalImport(props: {
  baseDrinks: Array<{ id: string; name: string }>;
  ingredients: Array<{ id: string; name: string }>;
  onClose: () => void;
  onImported: () => void;
}) {
  const components: ComponentOption[] = [
    ...props.baseDrinks.map((x) => ({ ...x, kind: "base_drink" as const })),
    ...props.ingredients.map((x) => ({ ...x, kind: "ingredient" as const })),
  ];
  const [mode, setMode] = useState<Mode>("choosing");
  const [origin, setOrigin] = useState<"qr" | "arquivo" | "foto" | null>(null);
  const [fileName, setFileName] = useState("");
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [chave, setChave] = useState("");
  const [uf, setUf] = useState<string | null>(null);
  const [emitente, setEmitente] = useState<string | null>(null);
  const [documento, setDocumento] = useState<string | null>(null);
  const [valorTotal, setValorTotal] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const lookup = useServerFn(lookupNotaFiscal);
  const confirmNF = useServerFn(confirmarNotaFiscal);
  const confirmFile = useServerFn(confirmarEntradaEstoque);
  const parseFile = useServerFn(parseSupplyFile);
  const loadAliases = useServerFn(getSupplyItemAliases);
  const normalizeAI = useServerFn(normalizarDocumentoEstoqueComIA);

  useEffect(() => {
    loadAliases().then((r) => setAliases(r.aliases)).catch(() => undefined);
  }, [loadAliases]);

  function stopCamera() {
    stoppedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    if (mode !== "camera" && mode !== "scanning") return;
    stoppedRef.current = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stoppedRef.current) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (mode === "scanning") scan();
      } catch {
        setCameraError("Não foi possível acessar a câmera. Confirme a permissão do navegador.");
      }
    }
    async function scan() {
      if (stoppedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const jsQR = (await import("jsqr")).default;
          const code = jsQR(frame.data, frame.width, frame.height);
          if (code?.data) {
            stopCamera();
            void decodeQR(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(() => void scan());
    }
    void start();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function decodeQR(qrUrl: string) {
    setMode("processing");
    setError(null);
    try {
      const r = await lookup({ data: { qrUrl } });
      if (!r.ok) {
        setError(r.message);
        setMode(r.code === "portal_indisponivel" ? "confirming" : "scanning");
        if (r.code === "portal_indisponivel" && r.chave) {
          setOrigin("qr");
          setChave(r.chave);
          setUf(r.uf ?? null);
          setLines([]);
        }
        return;
      }
      setOrigin("qr");
      setChave(r.chave);
      setUf(r.uf);
      setEmitente(r.emitenteNome);
      setDocumento(r.emitenteDocumento);
      setValorTotal(r.valorTotal);
      setLines(makeLines(r.itens, components, aliases, "nf"));
      setMode("confirming");
    } catch {
      setError("Não foi possível consultar a nota agora.");
      setMode("scanning");
    }
  }

  async function normalizePhoto(file: File) {
    setOrigin("foto");
    setFileName(file.name);
    setError(null);
    setInfo(null);
    setMode("processing");
    const base64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result.split(",")[1] ?? null : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!base64) {
      setError("Não foi possível ler a foto.");
      setMode("choosing");
      return;
    }
    try {
      const r = await normalizeAI({ data: { base64, mimeType: file.type || "image/jpeg", fileName: file.name } });
      if (!r.ok) {
        setError(r.message ?? "A IA não conseguiu interpretar o documento.");
        setMode("choosing");
        return;
      }
      setEmitente(r.fornecedorNome ?? null);
      setDocumento(r.fornecedorDocumento ?? null);
      setChave(r.chaveAcesso ?? "");
      setValorTotal(r.valorTotal ?? null);
      setConfidence(r.confianca ?? null);
      setDuplicate(Boolean(r.duplicada));
      setDuplicateWarning(r.avisoDuplicidade ?? null);
      setLines(makeLines(r.itens, components, aliases, "ai"));
      if (r.duplicada) setInfo("Documento identificado como possível duplicata. A confirmação ficará bloqueada.");
      setMode("confirming");
    } catch {
      setError("Não foi possível processar a foto com a IA.");
      setMode("choosing");
    }
  }

  async function selectFile(file: File) {
    if (/^image\//.test(file.type) || file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      await normalizePhoto(file);
      return;
    }
    setOrigin("arquivo");
    setFileName(file.name);
    setMode("processing");
    try {
      const base64 = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result.split(",")[1] ?? null : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
      if (!base64) throw new Error();
      const r = await parseFile({ data: { fileName: file.name, base64 } });
      if (!r.ok) throw new Error(r.message);
      setLines(makeLines(r.itens, components, aliases, "file"));
      setMode("confirming");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível processar o arquivo.");
      setMode("choosing");
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      setCameraError("A câmera ainda não está pronta.");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) return;
    await normalizePhoto(new File([blob], `nota-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addManual() {
    setLines((current) => [...current, { key: `manual-${Date.now()}`, descricaoOriginal: "", quantidadeNota: "", kind: "base_drink", componentId: "", packs: "", purchaseCost: "" }]);
  }

  async function confirm() {
    setError(null);
    if (duplicate) {
      setError(duplicateWarning ?? "Esse documento já foi importado.");
      return;
    }
    const items = [] as Array<{ kind: Kind; componentId: string; packs: number; purchaseCost?: number; descricaoOriginal?: string }>;
    for (const line of lines) {
      if (!line.componentId) continue;
      const packs = Number(line.packs);
      if (!Number.isInteger(packs) || packs <= 0) {
        setError(`Informe uma quantidade válida de embalagens para "${line.descricaoOriginal || "item manual"}".`);
        return;
      }
      const cost = line.purchaseCost.trim() ? parseAmount(line.purchaseCost) : null;
      if (line.purchaseCost.trim() && cost === null) {
        setError(`Valor inválido em "${line.descricaoOriginal || "item manual"}".`);
        return;
      }
      items.push({ kind: line.kind, componentId: line.componentId, packs, ...(cost !== null ? { purchaseCost: cost } : {}), ...(line.descricaoOriginal.trim() ? { descricaoOriginal: line.descricaoOriginal.trim() } : {}) });
    }
    if (!items.length) {
      setError("Escolha pelo menos um item do estoque.");
      return;
    }
    setBusy(true);
    try {
      if (origin === "qr" && chave) {
        const r = await confirmNF({ data: { chave, uf: uf ?? undefined, emitenteNome: emitente ?? undefined, emitenteDocumento: documento ?? undefined, valorTotal: valorTotal ?? undefined, itens: items } });
        if (!r.ok) {
          setError(r.message ?? "Não foi possível confirmar a entrada.");
          return;
        }
      } else {
        const r = await confirmFile({ data: { origem: `${origin === "foto" ? "foto IA" : "arquivo"}: ${fileName || "documento"}`, itens: items } });
        if (!r.ok) {
          setError(r.message ?? "Não foi possível confirmar a entrada.");
          return;
        }
      }
      setResult(`${items.length} item(ns) lançados no estoque.`);
      setMode("done");
      props.onImported();
    } catch {
      setError("Não foi possível confirmar agora. Confira o estoque antes de tentar novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Dar entrada no estoque</p>
          <button onClick={props.onClose} className="text-xs text-muted-foreground underline">Fechar</button>
        </div>

        {mode === "choosing" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Foto, QR, PDF ou planilha. Tudo passa pela mesma etapa de conferência antes de alterar o estoque.</p>
            <button onClick={() => { setCameraError(null); setMode("camera"); }} className="w-full rounded-xl border border-dashed border-border p-3 text-left hover:border-primary">
              <p className="text-xs font-semibold">Tirar foto da nota</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Abre a câmera do celular com botão de disparo. A IA interpreta a nota e preenche os campos.</p>
            </button>
            <button onClick={() => photoRef.current?.click()} className="w-full rounded-xl border border-dashed border-border p-3 text-left hover:border-primary">
              <p className="text-xs font-semibold">Escolher foto ou PDF</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Use uma foto já tirada, PDF da nota ou outro documento compatível.</p>
            </button>
            <input ref={photoRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void selectFile(f); }} />
            <button onClick={() => setMode("scanning")} className="w-full rounded-xl border border-dashed border-border p-3 text-left hover:border-primary">
              <p className="text-xs font-semibold">Ler QR code da nota fiscal</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Consulta a nota diretamente no portal oficial da SEFAZ.</p>
            </button>
            <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl border border-dashed border-border p-3 text-left hover:border-primary">
              <p className="text-xs font-semibold">Subir planilha do fornecedor</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">.xlsx, .xls ou .csv.</p>
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void selectFile(f); }} />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        {(mode === "camera" || mode === "scanning") && (
          <div className="space-y-2">
            <button onClick={() => { stopCamera(); setMode("choosing"); }} className="text-[11px] font-medium text-muted-foreground underline">← voltar</button>
            <p className="text-xs text-muted-foreground">{mode === "camera" ? "Enquadre a nota e toque em Disparar." : "Aponte para o QR code da nota."}</p>
            {cameraError ? <p className="rounded-lg border border-dashed border-border p-3 text-xs text-destructive">{cameraError}</p> : <div className="relative overflow-hidden rounded-xl border border-border bg-black"><video ref={videoRef} className="w-full" muted playsInline /><div className="pointer-events-none absolute inset-x-8 top-8 bottom-20 rounded-xl border-2 border-white/70" />{mode === "camera" && <button onClick={() => void capturePhoto()} className="absolute bottom-3 left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-white/20" aria-label="Disparar foto"><span className="h-10 w-10 rounded-full bg-white" /></button>}</div>}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {mode === "processing" && <p className="py-10 text-center text-sm text-muted-foreground">Interpretando o documento e preparando os campos...</p>}

        {mode === "confirming" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
              {origin === "qr" ? <><p>Chave: {chave || "não disponível"}</p>{uf && <p>UF: {uf}</p>}</> : <p>Origem: {origin === "foto" ? "Foto + IA" : `Arquivo: ${fileName}`}</p>}
              {emitente && <p>Fornecedor: {emitente}</p>}
              {documento && <p>CNPJ/Documento: {documento}</p>}
              {valorTotal != null && <p>Valor total: {valorTotal.toFixed(2).replace(".", ",")}</p>}
              {confidence != null && <p>Confiança da IA: {Math.round(confidence <= 1 ? confidence * 100 : confidence)}%</p>}
            </div>
            {duplicateWarning && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{duplicateWarning}</p>}
            {info && <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">{info}</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-[11px] text-muted-foreground">A IA apenas sugere. Nenhuma entrada é gravada até você revisar e confirmar. Campos faltantes podem ser preenchidos manualmente.</p>
            <div className="space-y-2">
              {lines.map((line) => {
                const options = line.kind === "base_drink" ? props.baseDrinks : props.ingredients;
                return <div key={line.key} className="rounded-xl border border-border p-3"><p className="mb-2 truncate text-xs font-medium text-muted-foreground">{line.descricaoOriginal || "Item manual"}{line.quantidadeNota && ` · ${line.quantidadeNota}`}</p><div className="grid grid-cols-2 gap-2"><label className="block"><span className="text-xs font-medium text-muted-foreground">Tipo</span><select value={line.kind} onChange={(e) => updateLine(line.key, { kind: e.target.value as Kind, componentId: "" })} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="base_drink">Bebida base</option><option value="ingredient">Ingrediente</option></select></label><label className="block"><span className="text-xs font-medium text-muted-foreground">Item</span><select value={line.componentId} onChange={(e) => updateLine(line.key, { componentId: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">Ignorar</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><TextField label="Embalagens" value={line.packs} onChange={(value) => updateLine(line.key, { packs: value })} type="number" placeholder={line.quantidadeNota ? `Nota: ${line.quantidadeNota}` : ""} /><TextField label="Valor pago (opcional)" value={line.purchaseCost} onChange={(value) => updateLine(line.key, { purchaseCost: value })} type="text" /></div></div>;
              })}
            </div>
            <button onClick={addManual} className="w-full rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground">+ Adicionar item manualmente</button>
            <PrimaryButton onClick={() => void confirm()} disabled={busy || duplicate}>{busy ? "Lançando..." : duplicate ? "Documento já importado" : "Confirmar entrada no estoque"}</PrimaryButton>
          </div>
        )}

        {mode === "done" && <div className="space-y-3 py-4 text-center"><p className="text-sm font-semibold text-primary">{result}</p><PrimaryButton onClick={props.onClose}>Fechar</PrimaryButton></div>}
      </div>
    </div>
  );
}
