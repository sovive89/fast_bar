import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listStaffFn,
  listStaffLoginsFn,
  registerStaffFn,
  setBarNetworkFn,
  setStaffStatusFn,
} from "@/lib/staff-users.functions";
import {
  STAFF_EMPLOYMENT_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  type StaffEmployment,
  type StaffRole,
} from "@/lib/staff-users";
import { formatPhone } from "@/lib/format";

type StaffList = Awaited<ReturnType<typeof listStaffFn>>;
type LoginList = Awaited<ReturnType<typeof listStaffLoginsFn>>;

const STATUS_LABEL: Record<string, string> = {
  pendente: "Aguardando aprovação",
  ativo: "Ativo",
  inativo: "Desativado",
};
const STATUS_STYLE: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-600",
  ativo: "bg-emerald-500/15 text-emerald-600",
  inativo: "bg-muted text-muted-foreground",
};
const fieldClass =
  "mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-ring";
const buttonClass =
  "min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50";

const maskCpf = (cpf: string) => `•••.•••.•••-${cpf.slice(-2)}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "nunca");

/**
 * Cadastro e aprovação da equipe. Piloto: todos ainda entram com a senha da equipe; aqui nasce o
 * cadastro individual (perfil, vínculo, aprovação, histórico de acessos). CPF, e-mail e telefone
 * só aparecem para quem pode gerir a equipe.
 */
export function StaffPanel() {
  const load = useServerFn(listStaffFn);
  const loadLogins = useServerFn(listStaffLoginsFn);
  const register = useServerFn(registerStaffFn);
  const setStatus = useServerFn(setStaffStatusFn);
  const saveNetwork = useServerFn(setBarNetworkFn);

  const [staff, setStaff] = useState<StaffList | null>(null);
  const [logins, setLogins] = useState<LoginList>([]);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("atendimento");
  const [employment, setEmployment] = useState<StaffEmployment>("fixo");

  const refresh = useCallback(async () => {
    try {
      const [people, recent] = await Promise.all([load(), loadLogins()]);
      setStaff(people);
      setLogins(recent);
      setLoadError("");
    } catch {
      setLoadError("Não foi possível abrir a equipe. Seu perfil precisa ser de administrador.");
    }
  }, [load, loadLogins]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await register({
        data: {
          fullName,
          cpf,
          email,
          phone,
          password,
          role,
          employment: role === "freelancer" ? "freelancer" : employment,
        },
      });
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setMessage({ ok: true, text: "Cadastro criado e já ativo." });
      setFullName("");
      setCpf("");
      setEmail("");
      setPhone("");
      setPassword("");
      await refresh();
    } catch {
      setMessage({ ok: false, text: "Não foi possível cadastrar agora. Tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  async function change(staffId: string, action: "aprovar" | "desativar" | "reativar") {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await setStatus({ data: { staffId, action } });
      setMessage(result.ok ? null : { ok: false, text: result.message });
      await refresh();
    } catch {
      setMessage({ ok: false, text: "Não foi possível atualizar. Tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  async function useThisNetwork() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await saveNetwork();
      setMessage(
        result.ok
          ? { ok: true, text: "Rede do bar salva. Logins de outras redes serão sinalizados." }
          : { ok: false, text: result.message },
      );
    } catch {
      setMessage({ ok: false, text: "Não foi possível salvar a rede agora." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="staff-title" className="mt-6 space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 id="staff-title" className="text-sm font-semibold">
          Equipe e acessos
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          No piloto todos ainda entram com a senha da equipe. Aqui você cadastra cada pessoa, com
          perfil e vínculo, e acompanha quem entrou. Quem se cadastra sozinho fica aguardando a sua
          aprovação.
        </p>

        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={`mt-3 text-sm ${message.ok ? "text-emerald-600" : "text-destructive"}`}
          >
            {message.text}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => setOpen((v) => !v)}>
            {open ? "Fechar cadastro" : "Cadastrar funcionário"}
          </button>
          <button type="button" className={buttonClass} disabled={busy} onClick={useThisNetwork}>
            Usar esta rede como Wi-Fi do bar
          </button>
        </div>

        {open && (
          <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
            <label className="block text-sm font-medium">
              Nome completo
              <input
                className={fieldClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={80}
                autoComplete="off"
                required
              />
            </label>
            <label className="block text-sm font-medium">
              CPF
              <input
                className={fieldClass}
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                inputMode="numeric"
                maxLength={14}
                autoComplete="off"
                required
              />
            </label>
            <label className="block text-sm font-medium">
              E-mail
              <input
                className={fieldClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={120}
                autoComplete="off"
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Telefone
              <input
                className={fieldClass}
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                inputMode="tel"
                placeholder="(11) 91234-5678"
                autoComplete="off"
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Senha
              <input
                className={fieldClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                No piloto vale qualquer senha com 4 ou mais caracteres.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Perfil
                <select
                  className={fieldClass}
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {STAFF_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Vínculo
                <select
                  className={fieldClass}
                  value={role === "freelancer" ? "freelancer" : employment}
                  disabled={role === "freelancer"}
                  onChange={(e) => setEmployment(e.target.value as StaffEmployment)}
                >
                  {(Object.keys(STAFF_EMPLOYMENT_LABELS) as StaffEmployment[]).map((e) => (
                    <option key={e} value={e}>
                      {STAFF_EMPLOYMENT_LABELS[e]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Salvando…" : "Cadastrar"}
            </button>
          </form>
        )}
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}

      {staff && staff.length === 0 && !loadError && (
        <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
          Ninguém cadastrado ainda. Use "Cadastrar funcionário" para criar o primeiro acesso.
        </p>
      )}

      {staff && staff.length > 0 && (
        <ul className="space-y-3" aria-label="Equipe cadastrada">
          {staff.map((person) => (
            <li key={person.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 break-words text-sm font-semibold">
                  {person.fullName}
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[person.status] ?? ""}`}
                >
                  {STATUS_LABEL[person.status] ?? person.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {STAFF_ROLE_LABELS[person.role]} · {STAFF_EMPLOYMENT_LABELS[person.employment]}
              </p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {person.email} · {formatPhone(person.phone)} · CPF {maskCpf(person.cpf)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Último acesso: {when(person.lastLoginAt)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {person.status === "pendente" && (
                  <button
                    type="button"
                    className={`${buttonClass} bg-primary text-primary-foreground`}
                    disabled={busy}
                    onClick={() => void change(person.id, "aprovar")}
                  >
                    Aprovar
                  </button>
                )}
                {person.status === "ativo" && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void change(person.id, "desativar")}
                  >
                    Desativar
                  </button>
                )}
                {person.status === "inativo" && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void change(person.id, "reativar")}
                  >
                    Reativar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {logins.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Últimos acessos</h3>
          <ul className="mt-2 divide-y divide-border">
            {logins.slice(0, 20).map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 break-words text-sm">{entry.fullName}</span>
                <span className="text-xs text-muted-foreground">{when(entry.loggedAt)}</span>
                <span
                  className={`text-xs font-medium ${entry.onBarNetwork === false ? "text-amber-600" : "text-muted-foreground"}`}
                >
                  {entry.onBarNetwork === true
                    ? "no Wi-Fi do bar"
                    : entry.onBarNetwork === false
                      ? "fora do Wi-Fi do bar"
                      : "rede do bar não cadastrada"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
