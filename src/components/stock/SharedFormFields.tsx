import type { ReactNode } from "react";

/** Campos de formulário reutilizados nas abas de Estoque e no módulo Cardápio. */
export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
      />
    </label>
  );
}

export function PrimaryButton(props: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      {props.children}
    </button>
  );
}

export function SectionCard(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{props.title}</p>
      <div className="mt-3">{props.children}</div>
    </div>
  );
}
