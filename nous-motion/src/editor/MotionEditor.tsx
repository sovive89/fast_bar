import { useEffect, useState } from "react";
import { defaultRegistry, validatePreset } from "../core/presets";
import { defaultsOf } from "../core/validate";
import type { MotionComponent, MotionParameters, MotionPreset, MotionStorageAdapter } from "../core/types";
import { MotionGallery } from "./MotionGallery";
import { MotionCustomizer } from "./MotionCustomizer";
import { MotionPreview } from "./MotionPreview";
import "../styles/variables.css";
import "./editor.css";

export interface MotionEditorProps {
  component?: MotionComponent;
  initial?: MotionPreset;
  /** Opcional. A persistência (e o isolamento por tenant) é do app que fornece o adaptador. */
  storage?: MotionStorageAdapter;
  onChange?(preset: MotionPreset): void;
}

/** Galeria + customizador + preview. Importe de "@nous/motion/editor" (carregue sob demanda). */
export function MotionEditor({ component: c0 = "loader", initial, storage, onChange }: MotionEditorProps) {
  const [component, setComponent] = useState<MotionComponent>(initial?.component ?? c0);
  const def = defaultRegistry.get(component)!;
  const [template, setTemplate] = useState(initial?.template ?? def.templates[0]!.id);
  const [params, setParams] = useState<MotionParameters>(initial?.parameters ?? defaultsOf(def.params));
  const [status, setStatus] = useState("");

  const preset: MotionPreset = { id: `${component}-${template}`, component, template, version: 1, parameters: params };
  useEffect(() => { onChange?.(preset); }, [component, template, params]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (c: MotionComponent) => {
    const d = defaultRegistry.get(c)!;
    setComponent(c); setTemplate(d.templates[0]!.id); setParams(defaultsOf(d.params));
  };

  const save = async () => {
    const v = validatePreset(preset);
    if (!v.ok || !v.value) { setStatus(`Inválido: ${v.errors.join("; ")}`); return; }
    await storage?.save(v.value);
    setStatus("Salvo");
  };

  return (
    <section className="nm-ed" aria-label="Editor de animações">
      <div className="nm-ed__tabs" role="tablist">
        {defaultRegistry.list().map((d) => (
          <button key={d.component} role="tab" type="button" aria-selected={component === d.component} onClick={() => pick(d.component)}>
            {d.component}
          </button>
        ))}
      </div>
      <MotionGallery component={component} selected={template} onSelect={setTemplate} />
      <div className="nm-ed__work">
        <MotionPreview component={component} template={template} parameters={params} />
        <MotionCustomizer component={component} parameters={params} onChange={setParams} />
      </div>
      <pre className="nm-ed__json" aria-label="Preset em JSON">{JSON.stringify(preset, null, 2)}</pre>
      {storage ? <button type="button" onClick={save}>Salvar preset</button> : null}
      <p role="status">{status}</p>
    </section>
  );
}
