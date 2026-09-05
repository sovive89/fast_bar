import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  LogOut,
  Package,
  Plug,
  Settings,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { checkBarAccess, lockBarPanel } from "@/lib/bar-gate.functions";
import { getOperationStatus, openOperation, closeOperation } from "@/lib/operations.functions";
import { PasswordConfirm } from "@/components/shared/PasswordConfirm";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/caixa")({
  beforeLoad: async () => {
    const { unlocked } = await checkBarAccess();
    if (!unlocked) throw redirect({ to: "/equipe" });
  },
  component: RegisterLayout,
});

// Um módulo por item de menu. Adicionar um módulo novo ao caixa é só adicionar uma linha aqui —
// a sidebar, o estado ativo e o modo colapsado (ícone) seguem tudo daqui.
const MODULES = [
  { key: "comandas", label: "Comandas", to: "/caixa", icon: ClipboardList },
  { key: "cardapio", label: "Cardápio", to: "/caixa/cardapio", icon: UtensilsCrossed },
  { key: "estoque", label: "Estoque", to: "/caixa/estoque", icon: Package },
  { key: "crm", label: "CRM", to: "/caixa/crm", icon: Users },
  { key: "relatorios", label: "Relatórios Vendas", to: "/caixa/relatorios", icon: BarChart3 },
  { key: "alertas", label: "Alertas", to: "/caixa/alertas", icon: AlertTriangle },
  { key: "conexoes", label: "Conexões", to: "/caixa/conexoes", icon: Plug },
  { key: "configuracoes", label: "Configurações", to: "/caixa/configuracoes", icon: Settings },
] as const;

function useActiveModuleKey() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Ordena do path mais específico pro mais curto: "/caixa" não pode "vencer" "/caixa/estoque".
  const match = [...MODULES]
    .sort((a, b) => b.to.length - a.to.length)
    .find((module) => pathname === module.to || pathname.startsWith(`${module.to}/`));
  return match?.key ?? "comandas";
}

/**
 * Menu de módulos — em componente à parte (em vez de direto em RegisterLayout) só pra poder chamar
 * useSidebar, que exige estar dentro do SidebarProvider. No celular a sidebar abre como um overlay
 * por cima do conteúdo (Sheet); sem fechar sozinha depois do toque, a pessoa tinha que fechar na
 * mão toda vez que trocava de módulo — um passo a mais que não existe no desktop, onde a sidebar
 * fica fixa do lado. No desktop (isMobile false) o clique não mexe em nada, só navega.
 */
function ModulesMenu({ active }: { active: string }) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {MODULES.map((module) => (
        <SidebarMenuItem key={module.key}>
          <SidebarMenuButton asChild isActive={active === module.key} tooltip={module.label}>
            <Link to={module.to} onClick={() => isMobile && setOpenMobile(false)}>
              <module.icon />
              <span>{module.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

type OperationStatus = Awaited<ReturnType<typeof getOperationStatus>>;

/** HH:mm no fuso do tenant, a partir de um ISO — usado tanto pro relógio civil quanto pro horário
 * de abertura da operação exibidos na barra. */
function formatLocalTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDataOperacional(dataOperacional: string) {
  const [year, month, day] = dataOperacional.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Data/hora civil atual + a operação (turno comercial) em andamento, com os botões pra abrir e
 * encerrar — o conceito descrito em PROMPT_DATA_OPERACIONAL_ABERTURA_FECHAMENTO. Fica no cabeçalho
 * fixo do caixa porque toda venda depende de existir uma operação aberta pra ser vinculada a ela.
 *
 * "ENCERRAR OPERAÇÃO" reaproveita o PasswordConfirm (mesmo componente das outras ações
 * destrutivas do caixa) como a confirmação explícita que o prompt pede — digitar a senha de novo
 * e clicar "Confirmar" já é o passo deliberado, não um único toque acidental.
 */
function OperationBar() {
  const [status, setStatus] = useState<OperationStatus | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingOpen, setConfirmingOpen] = useState(false);

  const loadStatus = useServerFn(getOperationStatus);
  const doOpen = useServerFn(openOperation);
  const doClose = useServerFn(closeOperation);

  async function refresh() {
    setStatus(await loadStatus());
  }

  useEffect(() => {
    void refresh();
    // Relógio civil no cabeçalho + reconferência periódica da operação: sem isso, a virada do
    // expediente (ex.: 04:00) só apareceria pra equipe depois de um F5 manual na tela.
    const clock = setInterval(() => setNow(new Date()), 30_000);
    const poll = setInterval(() => void refresh(), 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!status) return null;

  const { operation, dataOperacionalAgora, config } = status;
  const timezone = config.timezone;
  const civilLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  async function handleOpen(password: string) {
    const result = await doOpen({ data: { password } });
    if (result.ok) {
      setConfirmingOpen(false);
      await refresh();
    }
    return result;
  }

  async function handleClose(password: string) {
    const result = await doClose({ data: { password } });
    if (result.ok) {
      setConfirmingClose(false);
      await refresh();
    }
    return result;
  }

  return (
    <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
      <div className="flex flex-col text-xs leading-tight">
        <span className="text-muted-foreground">{civilLabel}</span>
        {operation ? (
          <span className="font-medium text-foreground">
            Operação {formatDataOperacional(operation.data_operacional)} — aberta às{" "}
            {formatLocalTime(operation.aberto_em, timezone)}
          </span>
        ) : (
          <span className="font-medium text-muted-foreground">
            Nenhuma operação aberta (data operacional {formatDataOperacional(dataOperacionalAgora)})
          </span>
        )}
      </div>

      {operation ? (
        confirmingClose ? (
          <div className="w-full max-w-xs sm:w-auto">
            <PasswordConfirm
              message="Confirme a senha da equipe para encerrar a operação. Depois disso não dá mais para lançar vendas nela."
              confirmLabel="Encerrar operação"
              onCancel={() => setConfirmingClose(false)}
              onConfirm={handleClose}
            />
          </div>
        ) : (
          <button
            onClick={() => setConfirmingClose(true)}
            className="rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive"
          >
            Encerrar operação
          </button>
        )
      ) : confirmingOpen ? (
        <div className="w-full max-w-xs sm:w-auto">
          <PasswordConfirm
            message="Confirme a senha da equipe para abrir a operação."
            confirmLabel="Abrir operação"
            onCancel={() => setConfirmingOpen(false)}
            onConfirm={handleOpen}
          />
        </div>
      ) : (
        <button
          onClick={() => setConfirmingOpen(true)}
          className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Abrir operação
        </button>
      )}
    </div>
  );
}

function RegisterLayout() {
  const navigate = useNavigate();
  const lock = useServerFn(lockBarPanel);
  const active = useActiveModuleKey();

  return (
    <SidebarProvider className="app-watermark">
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              FB
            </span>
            <span className="text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              Pop9Bar
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <ModulesMenu active={active} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Sair do caixa"
                onClick={async () => {
                  await lock();
                  await navigate({ to: "/equipe", replace: true });
                }}
              >
                <LogOut />
                <span>Sair do caixa</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
          <SidebarTrigger />
          <OperationBar />
        </div>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
