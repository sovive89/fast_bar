import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Clock, KeyRound, MessageSquare, Moon, Percent, Sun } from "lucide-react";
import {
  getSettings,
  saveEstablishment,
  saveOperationConfig,
  saveServiceFeeConfig,
  changeTeamPassword,
} from "@/lib/settings.functions";
import { updateIntegration, type IntegrationRow } from "@/lib/integrations.functions";
import { BrandingModule } from "@/components/settings/BrandingModule";
import { applyTheme, readStoredTheme, storeTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/caixa/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações | Pop9Bar" }] }),
  component: SettingsPage,
});

type Settings = Awaited<ReturnType<typeof getSettings>>;

const TABS = [
  { key: "perfil", label: "Perfil" },
  { key: "acesso", label: "Senha" },
  { key: "aparencia", label: "Aparência" },
  { key: "operacao", label: "Operação" },
  { key: "taxa", label: "Taxa de serviço" },
  { key: "sugestoes", label: "Sugestões" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function Section(props: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {props.icon}
        </span>
        <div>
          <p className="text-sm font-semibold">{props.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{props.description}</p>
        </div>
      </div>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{props.label}</label>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder ?? ""}
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}

function SaveRow(props: { saving: boolean; saved: boolean; error: string | null; onSave: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="button"
        disabled={props.saving}
        onClick={props.onSave}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        {props.saving ? "Salvando..." : "Salvar"}
      </button>
      {props.saved && <span className="text-xs text-emerald-500">Salvo.</span>}
      {props.error && <span className="text-xs text-destructive">{props.error}</span>}
    </div>
  );
}

function useSaveState() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setSaving(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.message ?? "Não foi possível salvar.");
      }
      return result;
    } catch {
      setError("Não foi possível salvar — tente de novo.");
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }

  return { saving, saved, error, run };
}

function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("perfil");
  const [settings, setSettings] = useState<Settings | null>(null);
  const load = useServerFn(getSettings);

  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setSettings(result);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Caixa</p>
      <h1 className="mt-1 text-3xl font-bold">Configurações</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ajustes do sistema: identidade e dados do estabelecimento, senha da equipe, tema, horário do
        expediente, taxa de serviço e sugestões.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              tab === item.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!settings ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Carregando...
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {tab === "perfil" && <ProfileTab settings={settings} />}
          {tab === "acesso" && <PasswordTab />}
          {tab === "aparencia" && <AppearanceTab />}
          {tab === "operacao" && <OperationTab settings={settings} />}
          {tab === "taxa" && <ServiceFeeTab settings={settings} />}
          {tab === "sugestoes" && <SuggestionsTab />}
        </div>
      )}
    </main>
  );
}

function ProfileTab({ settings }: { settings: Settings }) {
  const [row, setRow] = useState<IntegrationRow | undefined>(
    (settings.branding as IntegrationRow | null) ?? undefined,
  );
  const [form, setForm] = useState(settings.estabelecimento);
  const save = useServerFn(updateIntegration);
  const saveDados = useServerFn(saveEstablishment);
  const state = useSaveState();

  return (
    <>
      <Section
        icon={<Building2 className="h-4 w-4" />}
        title="Dados do estabelecimento"
        description="Cadastro do negócio. Fica só no painel — nada disso aparece nas telas do cliente."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Razão social" value={form.legalName} placeholder="ex.: Golpe Baixo Bar Ltda" onChange={(legalName) => setForm({ ...form, legalName })} />
          <TextField label="Nome fantasia" value={form.tradeName} placeholder="ex.: Golpe Baixo" onChange={(tradeName) => setForm({ ...form, tradeName })} />
          <TextField label="CNPJ" value={form.document} placeholder="00.000.000/0000-00" onChange={(document) => setForm({ ...form, document })} />
          <TextField label="Telefone" value={form.phone} placeholder="(61) 99999-9999" onChange={(phone) => setForm({ ...form, phone })} />
          <TextField label="Responsável" value={form.managerName} placeholder="Quem responde pelo bar" onChange={(managerName) => setForm({ ...form, managerName })} />
          <TextField label="Endereço" value={form.address} placeholder="Rua, número, bairro, cidade" onChange={(address) => setForm({ ...form, address })} />
        </div>
        <SaveRow saving={state.saving} saved={state.saved} error={state.error} onSave={() => void state.run(() => saveDados({ data: form }))} />
      </Section>

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
    </>
  );
}

function PasswordTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const change = useServerFn(changeTeamPassword);
  const state = useSaveState();

  async function handleSave() {
    setLocalError(null);
    if (next !== confirm) {
      setLocalError("A confirmação não bate com a nova senha.");
      return;
    }
    const result = await state.run(() => change({ data: { currentPassword: current, newPassword: next } }));
    if (result.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }

  return (
    <Section
      icon={<KeyRound className="h-4 w-4" />}
      title="Senha da equipe"
      description="A mesma senha do login do caixa e das confirmações (cancelar comanda, remover item, abrir e encerrar operação)."
    >
      <div className="grid gap-3 sm:max-w-sm">
        <div><label className="text-xs font-medium text-muted-foreground">Senha atual</label><input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" /></div>
        <div><label className="text-xs font-medium text-muted-foreground">Nova senha</label><input type="password" value={next} onChange={(event) => setNext(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" /></div>
        <div><label className="text-xs font-medium text-muted-foreground">Repita a nova senha</label><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" /></div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Todo mundo do balcão usa a mesma senha. Ao trocar, avise a equipe.</p>
      <SaveRow saving={state.saving} saved={state.saved} error={localError ?? state.error} onSave={() => void handleSave()} />
    </Section>
  );
}

function AppearanceTab() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => { setTheme(readStoredTheme()); }, []);
  function choose(next: Theme) {
    setTheme(next);
    storeTheme(next);
    applyTheme(next);
  }
  return (
    <Section
      icon={theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      title="Tema do painel"
      description="Escolha o modo claro ou escuro para este aparelho. As telas do cliente seguem as cores da marca."
    >
      <div className="flex gap-2">
        {(["light", "dark"] as const).map((option) => (
          <button key={option} type="button" onClick={() => choose(option)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${theme === option ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
            {option === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {option === "light" ? "Claro" : "Escuro"}
          </button>
        ))}
      </div>
    </Section>
  );
}

function OperationTab({ settings }: { settings: Settings }) {
  const [inicio, setInicio] = useState(settings.operacao.inicio);
  const [virada, setVirada] = useState(settings.operacao.virada);
  const [timezone, setTimezone] = useState(settings.operacao.timezone);
  const save = useServerFn(saveOperationConfig);
  const state = useSaveState();
  return (
    <Section icon={<Clock className="h-4 w-4" />} title="Horário do expediente" description="Define a qual dia de operação cada venda pertence quando o bar atravessa a madrugada.">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="text-xs font-medium text-muted-foreground">Abertura</label><input type="time" value={inicio} onChange={(event) => setInicio(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" /></div>
        <div><label className="text-xs font-medium text-muted-foreground">Virada</label><input type="time" value={virada} onChange={(event) => setVirada(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" /></div>
        <div><label className="text-xs font-medium text-muted-foreground">Fuso horário</label><input type="text" value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" /></div>
      </div>
      <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><strong className="text-foreground">Virada:</strong> vendas depois da meia-noite podem continuar pertencendo ao movimento do dia anterior, conforme o horário configurado.</p>
      <SaveRow saving={state.saving} saved={state.saved} error={state.error} onSave={() => void state.run(() => save({ data: { inicio, virada, timezone } }))} />
    </Section>
  );
}

function ServiceFeeTab({ settings }: { settings: Settings }) {
  const [percent, setPercent] = useState(String(settings.taxaServico.percent));
  const [onByDefault, setOnByDefault] = useState(settings.taxaServico.onByDefault);
  const save = useServerFn(saveServiceFeeConfig);
  const state = useSaveState();
  return (
    <Section icon={<Percent className="h-4 w-4" />} title="Taxa de serviço" description="Percentual sugerido no fechamento da comanda. A equipe pode tirar na hora.">
      <div className="grid gap-3 sm:max-w-xs">
        <div><label className="text-xs font-medium text-muted-foreground">Percentual (%)</label><input type="number" min={0} max={100} step="0.5" value={percent} onChange={(event) => setPercent(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" /></div>
        <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={onByDefault} onChange={(event) => setOnByDefault(event.target.checked)} className="h-4 w-4 rounded border-border" />Já vem marcada no fechamento</label>
      </div>
      <SaveRow saving={state.saving} saved={state.saved} error={state.error} onSave={() => void state.run(() => save({ data: { percent: Number(percent), onByDefault } }))} />
    </Section>
  );
}

function SuggestionsTab() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("fastbar:last-suggestion");
    if (stored) setText(stored);
  }, []);

  function saveSuggestion() {
    const value = text.trim();
    if (!value) return;
    window.localStorage.setItem("fastbar:last-suggestion", value);
    setText(value);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Section
      icon={<MessageSquare className="h-4 w-4" />}
      title="Sugestões"
      description="Registre uma ideia, melhoria ou problema para não perder o contexto durante o uso do FastBar."
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        placeholder="Ex.: adicionar um filtro por garçom no relatório de vendas..."
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!text.trim()}
          onClick={saveSuggestion}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Registrar sugestão
        </button>
        {saved && <span className="text-xs text-emerald-500">Registrada neste aparelho.</span>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Nesta primeira versão, a sugestão fica salva apenas neste aparelho. Ela não é enviada para terceiros nem altera dados da operação.
      </p>
    </Section>
  );
}
