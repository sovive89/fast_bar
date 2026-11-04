import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { EMPRESA_AREAS } from "@/components/empresa/areas";

export const Route = createFileRoute("/caixa/empresa/")({
  component: EmpresaOverview,
});

function EmpresaOverview() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <h1 className="text-3xl font-bold">Empresa</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tudo o que é da empresa em si: configuração, conexões, inventário, gestão e documentos. O
        fiscal fica num módulo separado no menu.
      </p>

      <ul className="mt-6 space-y-3">
        {EMPRESA_AREAS.map((area) => (
          <li key={area.key}>
            <Link
              to={area.to}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{area.label}</p>
                  {area.status === "preparado" && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                      Preparado
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{area.hint}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
