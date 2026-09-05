import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  MessageCircle,
  Instagram,
  CreditCard,
  Phone,
  Printer,
} from "lucide-react";
import {
  getIntegrations,
  updateIntegration,
  getVerificationStatus,
  listMercadoPagoTerminals,
  type IntegrationKey,
  type IntegrationRow,
} from "@/lib/integrations.functions";
import type { PointTerminal } from "@/lib/mercadopago/types";

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

/**
 * Card só de status pro Twilio Verify (verificação de celular por WhatsApp no /abrir). Diferente
 * dos outros cards de Conexões, não tem campos de formulário: as credenciais Twilio vivem só em
 * variável de ambiente do deploy, nunca no banco — então aqui só mostra se estão configuradas ou
 * não, pra equipe/dono saberem sem precisar olhar o Vercel.
 */
function VerificationStatusCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const load = useServerFn(getVerificationStatus);

  useEffect(() => {
    void load().then((res) => setConfigured(res.configured));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Phone className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Verificação por WhatsApp (Twilio Verify)</p>
              {configured === true && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" /> Configurado
                </span>
              )}
              {configured === false && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Não configurado
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Confirma o celular do cliente antes de abrir a comanda pelo QR code. Por segurança,
              as credenciais Twilio são configuradas direto no ambiente do servidor (variáveis de
              ambiente), não aqui — fale com quem cuida do deploy para configurar ou trocar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Card da maquininha (Mercado Pago Point) — diferente do card genérico de texto, porque precisa de
 * três coisas a mais: um botão que busca os terminais pareados com o Access Token digitado (em vez
 * da equipe caçar o ID na mão), a URL do webhook pronta pra copiar e colar no painel do Mercado
 * Pago, e o campo do segredo do webhook (usado só pra conferir que a notificação é mesmo do
 * Mercado Pago, nunca aparece de novo depois de salvo). Fica salvo na mesma linha 'mercado_pago' de
 * fastbar_integrations que o hub genérico usava antes — o resto de Conexões continua guardando
 * config no banco normalmente; só o Twilio Verify (verificação de celular) é env-var-only, por
 * exigência própria daquela integração.
 */
function MercadoPagoModule({
  row,
  onSave,
}: {
  row: IntegrationRow | undefined;
  onSave: (key: IntegrationKey, enabled: boolean, config: Record<string, string>) => Promise<void>;
}) {
  const config = (row?.config ?? {}) as Record<string, string>;
  const [accessToken, setAccessToken] = useState(config["accessToken"] ?? "");
  const [terminalId, setTerminalId] = useState(config["deviceId"] ?? "");
  const [webhookSecret, setWebhookSecret] = useState(config["webhookSecret"] ?? "");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [terminals, setTerminals] = useState<PointTerminal[] | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const enabled = row?.enabled ?? false;
  const findTerminals = useServerFn(listMercadoPagoTerminals);

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/mercadopago/webhook`);
  }, []);

  async function handleFindTerminals() {
    setSearching(true);
    setSearchError(null);
    try {
      const result = await findTerminals({ data: { accessToken } });
      if (!result.ok) {
        setSearchError(result.message);
        setTerminals(null);
        return;
      }
      setTerminals(result.terminals);
      if (result.terminals.length === 0) {
        setSearchError("Nenhum terminal encontrado pra esse Access Token — confira se a maquininha já está pareada.");
      }
    } finally {
      setSearching(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave("mercado_pago", enabled, { accessToken, deviceId: terminalId, webhookSecret });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(next: boolean) {
    setSaving(true);
    try {
      await onSave("mercado_pago", next, { accessToken, deviceId: terminalId, webhookSecret });
    } finally {
      setSaving(false);
    }
  }

  function copyWebhookUrl() {
    void navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CreditCard className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Mercado Pago (maquininha)</p>
              {enabled && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" /> Ativo
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              "Cobrar na maquininha" na tela da comanda envia o valor pro Point; a comanda fecha
              sozinha, com o canal certo (Pix/Crédito/Débito), quando o pagamento é aprovado.
            </p>
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

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Access Token</label>
          <input
            type="password"
            value={accessToken}
            placeholder="token de produção da conta MP (Suas integrações → Credenciais)"
            onChange={(e) => setAccessToken(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Terminal (maquininha)</label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={terminalId}
              placeholder="ID do terminal — busque abaixo ou cole aqui"
              onChange={(e) => setTerminalId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={searching || !accessToken.trim()}
              onClick={() => void handleFindTerminals()}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {searching ? "Buscando..." : "Buscar terminais"}
            </button>
          </div>
          {searchError && <p className="mt-1.5 text-xs text-destructive">{searchError}</p>}
          {terminals && terminals.length > 0 && (
            <div className="mt-2 space-y-1">
              {terminals.map((terminal) => (
                <button
                  key={terminal.id}
                  type="button"
                  onClick={() => setTerminalId(terminal.id)}
                  className={`block w-full rounded-lg border px-3 py-1.5 text-left text-xs ${
                    terminalId === terminal.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {terminal.external_pos_id || terminal.id}
                  {terminal.operating_mode ? ` · ${terminal.operating_mode}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Segredo do webhook</label>
          <input
            type="password"
            value={webhookSecret}
            placeholder="gerado em Suas integrações → Webhooks → Configurar notificação"
            onChange={(e) => setWebhookSecret(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">URL do webhook</label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="w-full rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground outline-none"
            />
            <button
              type="button"
              onClick={copyWebhookUrl}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Cole essa URL em Suas integrações → Webhooks no painel do Mercado Pago, marcando o
            evento de pedidos (orders/Point) — é como o app fica sabendo que o pagamento no
            terminal foi aprovado.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar configuração"}
          </button>
          {savedMsg && <span className="text-xs text-emerald-500">Salvo.</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * Hub de integrações externas: cada card guarda config (chaves/tokens) e um toggle ativo/inativo em
 * fastbar_integrations. Por enquanto é só configuração/status — nenhuma integração dispara chamada
 * de verdade ainda (marcado "Em breve"), exceto a verificação por WhatsApp (Twilio Verify) e a
 * maquininha (Mercado Pago Point), que já estão em uso real. A página de abertura (identidade + QR
 * code) tem seu próprio módulo em destaque no topo, já em uso de verdade.
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
          <VerificationStatusCard />
          <MercadoPagoModule row={rows.find((r) => r.key === "mercado_pago")} onSave={handleSave} />
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
