import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { EMPRESA_AREAS } from "@/components/empresa/areas";

export const Route = createFileRoute("/caixa/empresa")({
  head: () => ({ meta: [{ title: "Empresa | FastBar" }] }),
  component: EmpresaLayout,
});

/**
 * Módulo Empresa: tudo que é da empresa em si, e não do dia a dia do balcão — configuração,
 * conexões, inventário, gestão e documentos. Mesmo padrão do CRM: cabeçalho com abas de links e
 * `<Outlet />` com a área escolhida. As abas rolam na horizontal no celular em vez de quebrar linha.
 */
function EmpresaLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isOverview = pathname === "/caixa/empresa" || pathname === "/caixa/empresa/";

  const tabClass = (active: boolean) =>
    `inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 py-1.5 text-xs font-medium ${
      active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
    }`;

  return (
    <div>
      <div className="mx-auto w-full max-w-3xl px-5 pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Empresa</p>
        <nav aria-label="Áreas da empresa" className="mt-2 flex gap-2 overflow-x-auto pb-1">
          <Link to="/caixa/empresa" className={tabClass(isOverview)}>
            Visão geral
          </Link>
          {EMPRESA_AREAS.map((area) => (
            <Link key={area.key} to={area.to} className={tabClass(pathname.startsWith(area.to))}>
              {area.label}
            </Link>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
