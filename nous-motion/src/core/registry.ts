import { validateParameters } from "./validate";
import type { MotionComponent, ParamSpecs, TemplateInfo } from "./types";

/** Registro de templates por componente. Sem estado global: cada componente exporta o seu. */
export interface ComponentDefinition {
  component: MotionComponent;
  templates: readonly TemplateInfo[];
  params: ParamSpecs;
}

export interface MotionRegistry {
  get(component: MotionComponent): ComponentDefinition | undefined;
  list(): ComponentDefinition[];
  hasTemplate(component: MotionComponent, template: string): boolean;
}

export function createRegistry(definitions: readonly ComponentDefinition[]): MotionRegistry {
  const map = new Map<MotionComponent, ComponentDefinition>();
  for (const d of definitions) map.set(d.component, d);
  return {
    get: (c) => map.get(c),
    list: () => [...map.values()],
    hasTemplate: (c, t) => !!map.get(c)?.templates.some((x) => x.id === t),
  };
}

export { validateParameters };
