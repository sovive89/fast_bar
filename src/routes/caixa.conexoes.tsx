import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import {
  CheckCircle2,
  MessageCircle,
  Instagram,
  CreditCard,
  Phone,
  Printer,
  Palette,
  Download,
  ExternalLink,
} from "lucide-react";
import {
  getIntegrations,
  updateIntegration,
  type IntegrationKey,
  type IntegrationRow,
} from "@/lib/integrations.functions";
import {
  uploadBrandLogo,
  hasReadableContrast,
  brandingStyle,
  HEX_COLOR_PATTERN,
} from "@/lib/branding";

export const Route = createFileRoute("/caixa/conexoes")({
  head: () => ({
    meta: [{ title: "Conexões | Pop9Bar" }],
  }),
  component: ConnectionsPage,
});

type FieldDef = { key: string; label: string; placeholder: string; secret?: boolean };

type CardDef = {
  key: IntegrationKey;
  name: string;
  description: string;
  icon: typeof MessageCircle;
  fields: FieldDef[];
  comingSoon?: boolean;
};

// Um card por integração. Adicionar uma nova é só adicionar uma linha aqui + o key novo no check
// constraint da tabela fastbar_integrations (migration) — a UI de card genérica segue tudo daqui.
const CARDS: CardDef[] = [
  {
    key: "whatsapp",
    name: "WhatsApp Business",
    description: "Envio de confirmação, campanhas e (futuramente) verificação por WhatsApp.",
    icon: MessageCircle,
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID", placeholder: "ex.: 109876543210" },
      { key: "accessToken", label: "Access Token", placeholder: "token da Cloud API (Meta)", secret: true },
    ],
    comingSoon: true,
  },
  {
    key: "instagram",
    name: "Instagram Business",
    description: "Divulgação de promoções e campanhas via Instagram (conta profissional).",
    icon: Instagram,
    fields: [
      { key: "igUserId", label: "Instagram User ID", placeholder: "ex.: 17841400000000000" },
      { key: "accessToken", label: "Access Token", placeholder: "token da Graph API (Meta)", secret: true },
    ],
    comingSoon: true,
  },
  {
    key: "mercado_pago",
    name: "Mercado Pago",
    description: "Maquininha: fechar comanda envia o valor pro Point e só confirma se bater.",
    icon: CreditCard,
    fields: [
      { key: "accessToken", label: "Access Token", placeholder: "token de produção da conta MP", secret: true },
      { key: "deviceId", label: "Device ID da maquininha", placeholder: "ex.: PAX_A910__SMARTPOS..." },
    ],
    comingSoon: true,
  },
  {
    key: "twilio",
    name: "Twilio",
    description: "SMS/voz como canal alternativo (backup do WhatsApp para avisos e campanhas).",
    icon: Phone,
    fields: [
      { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { key: "authToken", label: "Auth Token", placeholder: "token da conta Twilio", secret: true },
      { key: "fromNumber", label: "Número remetente", placeholder: "+55..." },
    ],
    comingSoon: true,
  },
  {
    key: "printer",
    name: "Impressora térmica",
    description: "Cupom de fechamento de comanda, protocolo ESC/POS (cabo ou rede).",
    icon: Printer,
    fields: [
      { key: "connection", label: "Conexão", placeholder: "rede (IP:porta) ou USB" },
      { key: "ip", label: "IP / endereço", placeholder: "ex.: 192.168.0.50:9100" },
    ],
    comingSoon: true,
  },
];

function ConnectionCard({
  card,
  row,
  onSave,
}: {
  card: CardDef;
  row: IntegrationRow | undefined;
  onSave: (key: IntegrationKey, enabled: boolean, config: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const config = (row?.config ?? {}) as Record<string, unknown>;
    const initial: Record<string, string> = {};
    for (const field of card.fields) {
      const v = config[field.key];
      initial[field.key] = typeof v === "string" ? v : "";
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const enabled = row?.enabled ?? false;
  const Icon = card.icon;

  async function handleToggle(next: boolean) {
    setSaving(true);
    try {
      await onSave(card.key, next, values);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveConfig() {
    setSaving(true);
    try {
      await onSave(card.key, enabled, values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{card.name}</p>
              {enabled && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" /> Ativo
                </span>
              )}
              {card.comingSoon && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Em breve
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.description}</p>
          </div>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={enabled}
            disabled={saving}
            onChange={(e) => void handleToggle(e.target.checked)}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {card.fields.map((field) => (
          <div key={field.key}>
            <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
            <input
              type={field.secret ? "password" : "text"}
              value={values[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveConfig()}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}

/** Reduz o logo pro tamanho de upload — mesma lógica usada pra foto de produto (evita passar do
 * limite de payload das server functions e deixa a imagem leve). */
async function compressImageForUpload(
  file: File,
  maxDimension = 512,
  quality = 0.9,
): Promise<{ base64: string; contentType: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado neste navegador.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Falha ao comprimir a imagem."))),
      "image/png",
      quality,
    );
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const [, base64] = dataUrl.split(",");
  if (!base64) throw new Error("Falha ao codificar a imagem.");
  return { base64, contentType: "image/png" };
}

const DEFAULT_PRIMARY_COLOR = "#f97316";

/**
 * "Interface do cliente": tudo que muda o que o cliente vê a partir do QR code (/abrir, tela ao
 * vivo da comanda) — nome, logo e cor de destaque do estabelecimento — sem mexer em estrutura
 * nenhuma (layout, campos, fluxo continuam os mesmos pra todo mundo). Mostra uma prévia ao vivo e
 * gera o QR code que aponta pra /abrir, pronto pra imprimir e colar no balcão. A config salva
 * aqui é a mesma linha 'branding' de fastbar_integrations que o hub genérico usava antes; ganhou
 * tela própria porque upload de logo e QR code não cabem no card de texto genérico dos outros
 * conectores.
 */
function BrandingModule({
  row,
  onSave,
}: {
  row: IntegrationRow | undefined;
  onSave: (key: IntegrationKey, enabled: boolean, config: Record<string, string>) => Promise<void>;
}) {
  const config = (row?.config ?? {}) as Record<string, string>;
  const [brandName, setBrandName] = useState(config["brandName"] ?? "");
  const [logoUrl, setLogoUrl] = useState(config["logoUrl"] ?? "");
  const [primaryColor, setPrimaryColor] = useState(config["primaryColor"] ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [abrirUrl, setAbrirUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadLogo = useServerFn(uploadBrandLogo);
  const isValidColor = HEX_COLOR_PATTERN.test(primaryColor);
  // Mesma função usada nas rotas reais do cliente (brandingStyle) — a prévia não é uma
  // implementação visual paralela, é os tokens de verdade aplicados num recorte pequeno da tela.
  const previewStyle = brandingStyle({ primaryColor: isValidColor ? primaryColor : null });

  useEffect(() => {
    // A URL da página de abertura depende do domínio de produção (ainda pode mudar até o domínio
    // próprio ser configurado) — pega sempre do navegador em vez de fixar no código.
    setAbrirUrl(`${window.location.origin}/abrir`);
  }, []);

  useEffect(() => {
    if (!abrirUrl || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, abrirUrl, { width: 220, margin: 1 });
  }, [abrirUrl]);

  async function handleLogoFile(file: File) {
    setUploading(true);
    try {
      const compressed = await compressImageForUpload(file);
      const result = await uploadLogo({
        data: { fileName: file.name, base64: compressed.base64, contentType: compressed.contentType },
      });
      if (result.ok) setLogoUrl(result.url);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave("branding", row?.enabled ?? true, { brandName, logoUrl, primaryColor });
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
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Palette className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Interface do cliente</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nome, logo e cor de destaque exibidos em /abrir e na comanda ao vivo do cliente, mais
            o QR code pra imprimir no balcão. Só o visual muda — o fluxo é o mesmo pra todo mundo.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
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

          <div>
            <span className="text-xs font-medium text-muted-foreground">Prévia</span>
            <div
              className="mt-1 space-y-2 rounded-xl border border-border bg-background p-3"
              style={previewStyle}
            >
              <div className="flex items-center gap-2">
                {logoUrl && (
                  <img src={logoUrl} alt="Logo" className="h-6 w-6 rounded-lg object-cover" />
                )}
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  {brandName || "Bar"}
                </p>
              </div>
              <p className="text-sm font-bold">Sua comanda digital</p>
              <button
                type="button"
                disabled
                className="w-full rounded-xl bg-primary px-4 py-2 text-center text-xs font-semibold text-primary-foreground"
              >
                Abrir comanda
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            {savedMsg && <span className="text-xs text-emerald-500">Salvo.</span>}
            {abrirUrl && (
              <a
                href="/abrir"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4"
              >
                Ver página <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-3">
          <canvas ref={canvasRef} className="h-[140px] w-[140px]" />
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

/**
 * Hub de integrações externas: cada card guarda config (chaves/tokens) e um toggle ativo/inativo em
 * fastbar_integrations. Por enquanto é só configuração/status — nenhuma integração dispara chamada
 * de verdade ainda (marcado "Em breve"). A página de abertura (identidade + QR code) tem seu
 * próprio módulo em destaque no topo, já em uso de verdade.
 */
function ConnectionsPage() {
  const [rows, setRows] = useState<IntegrationRow[] | null>(null);
  const load = useServerFn(getIntegrations);
  const save = useServerFn(updateIntegration);

  useEffect(() => {
    void load().then((res) => setRows(res.integrations));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(key: IntegrationKey, enabled: boolean, config: Record<string, string>) {
    await save({ data: { key, enabled, config } });
    setRows((prev) =>
      prev
        ? prev.map((r) => (r.key === key ? { ...r, enabled, config, updated_at: new Date().toISOString() } : r))
        : prev,
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Conexões</p>
        <h1 className="mt-1 text-3xl font-bold">Integrações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure aqui as integrações externas do bar. Cada uma pode ficar salva e desativada até
          entrar em uso.
        </p>
      </div>

      {!rows ? (
        <p className="mt-6 text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="mt-6 space-y-3">
          <BrandingModule row={rows.find((r) => r.key === "branding")} onSave={handleSave} />
          {CARDS.map((card) => (
            <ConnectionCard
              key={card.key}
              card={card}
              row={rows.find((r) => r.key === card.key)}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </main>
  );
}
