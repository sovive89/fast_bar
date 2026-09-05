import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MessageCircle, Instagram, CreditCard, Phone, Printer, Palette } from "lucide-react";
import {
  getIntegrations,
  updateIntegration,
  type IntegrationKey,
  type IntegrationRow,
} from "@/lib/integrations.functions";

export const Route = createFileRoute("/caixa/conexoes")({
  head: () => ({
    meta: [{ title: "Conexões | FastBar" }],
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
  {
    key: "branding",
    name: "Identidade visual",
    description: "Logo e nome exibidos na tela do cliente e no cupom impresso.",
    icon: Palette,
    fields: [
      { key: "brandName", label: "Nome exibido", placeholder: "ex.: Golpe Baixo" },
      { key: "logoUrl", label: "URL do logo", placeholder: "https://..." },
    ],
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

/**
 * Hub de integrações externas: cada card guarda config (chaves/tokens) e um toggle ativo/inativo em
 * fastbar_integrations. Por enquanto é só configuração/status — nenhuma integração dispara chamada
 * de verdade ainda (marcado "Em breve"), exceto Identidade Visual que já é usada pela tela do
 * cliente e pelo cupom impresso.
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
