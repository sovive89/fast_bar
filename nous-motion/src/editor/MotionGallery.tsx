import { defaultRegistry } from "../core/presets";
import type { MotionComponent } from "../core/types";
import { MotionPreview } from "./MotionPreview";

export interface MotionGalleryProps {
  component: MotionComponent;
  selected?: string;
  onSelect(template: string): void;
}

/** Grade de templates do componente, cada um com mini pré-visualização. */
export function MotionGallery({ component, selected, onSelect }: MotionGalleryProps) {
  const def = defaultRegistry.get(component);
  if (!def) return null;
  return (
    <ul className="nm-ed__gallery" aria-label={`Templates de ${component}`}>
      {def.templates.map((t) => (
        <li key={t.id} className="nm-ed__tile" data-selected={selected === t.id ? "true" : undefined}>
          {/* A prévia é decorativa e inerte: evita <button> dentro de <button> e foco duplicado. */}
          <div aria-hidden="true" inert>
            <MotionPreview component={component} template={t.id} parameters={{}} />
          </div>
          <button type="button" className="nm-ed__pick" aria-pressed={selected === t.id} onClick={() => onSelect(t.id)}>
            <strong>{t.label}</strong>
            <small>{t.description}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}
