import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LineChart,
  LogOut,
  Package,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { checkBarAccess, lockBarPanel } from "@/lib/bar-gate.functions";

export const Route = createFileRoute("/caixa")({
  beforeLoad: async () => {
    const { unlocked } = await checkBarAccess();
    if (!unlocked) throw redirect({ to: "/equipe" });
  },
  component: RegisterLayout,
});

const NAV_ITEMS = [
  { to: "/caixa", tab: "comandas", label: "Comandas", icon: ClipboardList },
  { to: "/caixa/cardapio", tab: "cardapio", label: "Cardápio", icon: UtensilsCrossed },
  { to: "/caixa/estoque", tab: "estoque", label: "Estoque", icon: Package },
  { to: "/caixa/crm", tab: "crm", label: "CRM", icon: Users },
  { to: "/caixa/relatorios", tab: "relatorios", label: "Relatórios Vendas", icon: LineChart },
  { to: "/caixa/alertas", tab: "alertas", label: "Alertas", icon: AlertTriangle },
] as const;

function RegisterLayout() {
  const navigate = useNavigate();
  const lock = useServerFn(lockBarPanel);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = pathname.startsWith("/caixa/cardapio")
    ? "cardapio"
    : pathname.startsWith("/caixa/estoque")
      ? "estoque"
      : pathname.startsWith("/caixa/crm")
        ? "crm"
        : pathname.startsWith("/caixa/relatorios")
          ? "relatorios"
          : pathname.startsWith("/caixa/alertas")
            ? "alertas"
            : "comandas";

  const navClass = (tab: string) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active === tab
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`;

  return (
    <div className="flex min-h-screen">
      <aside
        className={`flex shrink-0 flex-col justify-between border-r border-border p-4 transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        <div>
          <div className="flex items-center justify-between px-1">
            {!collapsed && (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">FastBar</p>
            )}
            <button
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
          <nav className="mt-4 flex flex-col gap-1">
            {NAV_ITEMS.map(({ to, tab, label, icon: Icon }) => (
              <Link key={tab} to={to} className={navClass(tab)} title={collapsed ? label : undefined}>
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            ))}
          </nav>
        </div>
        <button
          onClick={async () => {
            await lock();
            await navigate({ to: "/equipe", replace: true });
          }}
          title={collapsed ? "Sair do caixa" : undefined}
          className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>Sair do caixa</span>}
        </button>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
