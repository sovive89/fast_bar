import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { Download, ExternalLink, Instagram, MessageCircle, Palette } from "lucide-react";
import {
  getIntegrations,
  updateIntegration,
  type IntegrationRow,
} from "@/lib/integrations.functions";
import {
  brandingStyle,
  hasReadableContrast,
  publicBaseUrl,
  sanitizeInstagramUser,
  sanitizeWhatsappNumber,
  uploadBrandLogo,
  whatsappLink,
  HEX_COLOR_PATTERN,
} from "@/lib/branding";

export const Route = createFileRoute("/caixa/marca")({
  head: () => ({
    meta: [{ title: "Marca | Pop9Bar" }],
  }),
  component: BrandPage,
});

const DEFAULT_PRIMARY_COLOR = "#f97316";

/** Reduz a imagem antes de subir — logo de celular vem com megabytes que não servem pra nada num
 * avatar de 40px, e o upload trafega em base64 (cresce ~33%). */
async function compressImageForUpload(file: File): Promise<{ base64: string; contentType: string }> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/png");
  const [, base64] = dataUrl.split(",");
  if (!base64) throw new Error("Falha ao codificar a imagem.");
  return { base64, contentType: "image/png" };
}

/**
 * Módulo Marca — tudo que o cliente vê a partir do QR code: nome, logo, cor de destaque, redes
 * (Instagram e WhatsApp) e o QR code pronto pra imprimir e colar no balcão.
 *
 * Saiu de dentro de Conexões e ganhou rota própria: Conexões é sobre integrações com serviços de
 * fora (Mercado Pago, Twilio), enquanto isto aqui é a identidade do estabelecimento — assunto
 * diferente, e o card único já estava grande demais pra caber junto com upload de logo e QR code.
 *
 * A config continua na mesma linha 'branding' de fastbar_integrations, então nada quebra pra quem
 * já tinha configurado antes da mudança de tela.
 */
function BrandPage() {
  const [row, setRow] = useState<IntegrationRow | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const load = useServerFn(getIntegrations);
  const save = useServerFn(updateIntegration);

  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (!active) return;
      setRow(result.integrations.find((item) => item.key === "branding"));
      setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Caixa</p>
      <h1 className="mt-1 text-3xl font-bold">Marca</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Identidade que o cliente vê ao escanear o QR code — nome, logo, cor, redes sociais — e o QR
        code pronto pra imprimir. Só o visual muda; o fluxo é o mesmo pra todo mundo.
      </p>

      {loading ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Carregando...
        </p>
      ) : (
        <BrandingModule
          row={row}
          onSave={async (enabled, config) => {
            await save({ data: { key: "branding", enabled, config } });
            setRow((current) => ({
              key: "branding",
              updated_at: new Date().toISOString(),
              ...current,
              enabled,
              config,
            }));
          }}
        />
      )}
    </main>
  );
}

function BrandingModule({
  row,
  onSave,
}: {
  row: IntegrationRow | undefined;
  onSave: (enabled: boolean, config: Record<string, string>) => Promise<void>;
}) {
  const config = (row?.config ?? {}) as Record<string, string>;
  const [brandName, setBrandName] = useState(config["brandName"] ?? "");
  const [logoUrl, setLogoUrl] = useState(config["logoUrl"] ?? "");
  const [primaryColor, setPrimaryColor] = useState(config["primaryColor"] ?? "");
  const [instagramUser, setInstagramUser] = useState(config["instagramUser"] ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(config["whatsappNumber"] ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [abrirUrl, setAbrirUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadLogo = useServerFn(uploadBrandLogo);
  const isValidColor = HEX_COLOR_PATTERN.test(primaryColor);
  const previewStyle = brandingStyle({ primaryColor: isValidColor ? primaryColor : null });

  const cleanInstagram = sanitizeInstagramUser(instagramUser);
  const cleanWhatsapp = sanitizeWhatsappNumber(whatsappNumber);

  useEffect(() => {
    // Nunca window.location.origin: o gestor pode estar num deploy efêmero da Vercel
    // (fast-bar-abc123.vercel.app) e o QR sairia impresso apontando pra uma URL que expira. O QR
    // colado no balcão precisa valer pra sempre, então sai sempre da URL pública fixa.
    setAbrirUrl(`${publicBaseUrl()}/abrir`);
  }, []);

  useEffect(() => {
    if (!abrirUrl || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, abrirUrl, { width: 260, margin: 1 });
  }, [abrirUrl]);

  async function handleLogoFile(file: File) {
    setUploading(true);
    try {
      const compressed = await compressImageForUpload(file);
      const result = await uploadLogo({
        data: {
          fileName: file.name,
          base64: compressed.base64,
          contentType: compressed.contentType,
        },
      });
      if (result.ok) setLogoUrl(result.url);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Grava já normalizado: o cliente lê direto do banco pra montar o link, então guardar
      // "@bar" ou "(61) 9..." aqui viraria link quebrado lá na frente.
      await onSave(row?.enabled ?? true, {
        brandName,
        logoUrl,
        primaryColor,
        instagramUser: cleanInstagram ?? "",
        whatsappNumber: cleanWhatsapp ?? "",
      });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function downloadQr() {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `qr-code-${(brandName || "fastbar").toLowerCase().replace(/\s+/g, "-")}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Palette className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Identidade</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nome, logo e cor de destaque exibidos em /abrir, na comanda ao vivo e no cardápio do
              cliente.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome exibido</label>
            <input
              type="text"
              value={brandName}
              placeholder="ex.: Golpe Baixo"
              onChange={(e) => setBrandName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Logo</label>
            <div className="mt-1 flex items-center gap-3">
              {logoUrl && (
                <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded-lg object-cover" />
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleLogoFile(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {uploading ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Cor de destaque</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={isValidColor ? primaryColor : DEFAULT_PRIMARY_COLOR}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
              />
              <input
                type="text"
                value={primaryColor}
                placeholder="#f97316 (padrão do Pop9Bar se deixar em branco)"
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
              {primaryColor && (
                <button
                  type="button"
                  onClick={() => setPrimaryColor("")}
                  className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
            {isValidColor && !hasReadableContrast(primaryColor) && (
              <p className="mt-1.5 text-xs text-amber-500">
                A combinação escolhida apresenta baixo contraste. Considere usar uma cor mais clara
                ou mais escura.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Instagram className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Redes</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Aparecem como ícones no cardápio e nas telas do cliente. Deixe em branco pra não
              mostrar.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Instagram</label>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-primary">
              <Instagram className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">@</span>
              <input
                type="text"
                value={instagramUser}
                placeholder="golpebaixo"
                onChange={(e) => setInstagramUser(e.target.value)}
                className="w-full bg-transparent py-1.5 text-sm outline-none"
              />
            </div>
            {cleanInstagram && (
              <a
                href={`https://instagram.com/${cleanInstagram}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4"
              >
                instagram.com/{cleanInstagram} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">WhatsApp</label>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-primary">
              <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                inputMode="tel"
                value={whatsappNumber}
                placeholder="(61) 99999-9999"
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full bg-transparent py-1.5 text-sm outline-none"
              />
            </div>
            {whatsappNumber && !cleanWhatsapp && (
              <p className="mt-1.5 text-xs text-amber-500">
                Número incompleto — informe DDD e o número (10 ou 11 dígitos).
              </p>
            )}
            {cleanWhatsapp && (
              <a
                href={whatsappLink(cleanWhatsapp)}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4"
              >
                Abrir conversa <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-border bg-card p-4">
          <span className="text-xs font-medium text-muted-foreground">Prévia</span>
          <div
            className="mt-2 space-y-3 rounded-xl border border-border bg-background p-4"
            style={previewStyle}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              {logoUrl && (
                <img src={logoUrl} alt="Logo" className="h-14 w-14 rounded-xl object-cover" />
              )}
              <p className="text-lg font-bold">{brandName || "Bar"}</p>
            </div>
            <p className="text-center text-xs text-muted-foreground">Sua comanda digital</p>
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-primary px-4 py-2 text-center text-xs font-semibold text-primary-foreground"
            >
              Abrir comanda
            </button>
            {(cleanInstagram || cleanWhatsapp) && (
              <div className="flex items-center justify-center gap-3 pt-1 text-muted-foreground">
                {cleanInstagram && <Instagram className="h-4 w-4" />}
                {cleanWhatsapp && <MessageCircle className="h-4 w-4" />}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            {savedMsg && <span className="text-xs text-emerald-500">Salvo.</span>}
            <a
              href="/abrir"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4"
            >
              Ver página <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-4">
          <p className="text-xs font-semibold">QR code do balcão</p>
          <canvas ref={canvasRef} className="h-[160px] w-[160px]" />
          <p className="max-w-[180px] break-all text-center text-[10px] text-muted-foreground">
            {abrirUrl}
          </p>
          <button
            type="button"
            onClick={downloadQr}
            className="flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4"
          >
            <Download className="h-3 w-3" /> Baixar QR code
          </button>
        </div>
      </div>
    </div>
  );
}
