import type { ReactNode } from "react";
import { Construction } from "lucide-react";

/**
 * Página de uma área que já tem lugar no menu, mas ainda não funciona. Existe para o dono ver o
 * desenho do módulo e para a equipe não achar que falta um botão. Não mostra dado, formulário nem
 * número de mentira: só descreve o que virá e o que já existe em outro lugar.
 */
export function PreparedArea(props: {
  title: string;
  intro: string;
  willHave: { title: string; text: string }[];
  alreadyElsewhere?: string;
  rules?: string[];
  /** Texto do selo quando a área já tem uma parte funcionando. */
  badge?: string;
  /** Parte que já funciona, mostrada antes do que ainda vem. */
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{props.title}</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600">
          <Construction className="h-3.5 w-3.5" aria-hidden="true" />
          {props.badge ?? "Preparado — ainda não funciona"}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{props.intro}</p>
      {props.children}

      <h2 className="mt-6 text-sm font-semibold">O que vai ter aqui</h2>
      <ul className="mt-3 space-y-3">
        {props.willHave.map((item) => (
          <li key={item.title} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.text}</p>
          </li>
        ))}
      </ul>

      {props.rules && props.rules.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-semibold">Regras combinadas</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-muted-foreground">
            {props.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </>
      )}

      {props.alreadyElsewhere && (
        <p className="mt-6 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
          {props.alreadyElsewhere}
        </p>
      )}
    </main>
  );
}
