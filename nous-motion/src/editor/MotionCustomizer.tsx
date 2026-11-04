import { useId } from "react";
import { defaultRegistry } from "../core/presets";
import { validateParameters } from "../core/validate";
import type { MotionComponent, MotionParameters, ParamSpec, ParamValue } from "../core/types";

export interface MotionCustomizerProps {
  component: MotionComponent;
  parameters: MotionParameters;
  onChange(next: MotionParameters): void;
}

/** Controles gerados do esquema de parâmetros: nenhum código para o usuário mexer. */
export function MotionCustomizer({ component, parameters, onChange }: MotionCustomizerProps) {
  const def = defaultRegistry.get(component);
  const uid = useId();
  if (!def) return null;

  const set = (key: string, value: ParamValue) => {
    // Só emite valores que passam no validador (ex.: cor incompleta é ignorada até ficar válida).
    const trial = validateParameters(def.params, { ...parameters, [key]: value });
    if (trial.ok) onChange(trial.value);
  };

  return (
    <form className="nm-ed__form" onSubmit={(e) => e.preventDefault()}>
      {Object.entries(def.params).map(([key, spec]) => (
        <Field key={key} id={`${uid}-${key}`} name={key} spec={spec} value={parameters[key] ?? spec.default} onSet={(v) => set(key, v)} />
      ))}
    </form>
  );
}

function Field({ id, name, spec, value, onSet }: { id: string; name: string; spec: ParamSpec; value: ParamValue; onSet(v: ParamValue): void }) {
  const label = <label htmlFor={id}>{spec.label}</label>;
  switch (spec.type) {
    case "number":
      return (
        <div className="nm-ed__field" data-param={name}>
          {label}
          <input id={id} type="range" min={spec.min} max={spec.max} step={spec.step ?? 1} value={Number(value)} onChange={(e) => onSet(Number(e.target.value))} />
          <output htmlFor={id}>{String(value)}</output>
        </div>
      );
    case "enum":
      return (
        <div className="nm-ed__field" data-param={name}>
          {label}
          <select id={id} value={String(value)} onChange={(e) => onSet(e.target.value)}>
            {spec.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    case "boolean":
      return (
        <div className="nm-ed__field" data-param={name}>
          {label}
          <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onSet(e.target.checked)} />
        </div>
      );
    case "color":
      return (
        <div className="nm-ed__field" data-param={name}>
          {label}
          <input id={id} type="color" value={/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#000000"} onChange={(e) => onSet(e.target.value)} />
        </div>
      );
    default:
      return (
        <div className="nm-ed__field" data-param={name}>
          {label}
          <input id={id} type="text" value={String(value)} maxLength={spec.type === "text" ? spec.maxLength : 2000} onChange={(e) => onSet(e.target.value)} />
        </div>
      );
  }
}
