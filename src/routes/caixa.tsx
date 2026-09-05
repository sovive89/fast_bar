import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  LogOut,
  Package,
  Plug,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { checkBarAccess, lockBarPanel } from "@/lib/bar-gate.functions";
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
] as const;

function useActiveModuleKey() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Ordena do path mais específico pro mais curto: "/caixa" não pode "vencer" "/caixa/estoque".
  const match = [...MODULES]
    .sort((a, b) => b.to.length - a.to.length)
    .find((module) => pathname === module.to || pathname.startsWith(`${module.to}/`));
  return match?.key ?? "comandas";
}

function RegisterLayout() {
  const navigate = useNavigate();
  const lock = useServerFn(lockBarPanel);
  const active = useActiveModuleKey();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              FB
            </span>
            <span className="text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              FastBar
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {MODULES.map((module) => (
                  <SidebarMenuItem key={module.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={active === module.key}
                      tooltip={module.label}
                    >
                      <Link to={module.to}>
                        <module.icon />
                        <span>{module.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
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
        </div>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
