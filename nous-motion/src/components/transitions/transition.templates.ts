import { EASINGS } from "../../core/tokens";
import type { ComponentDefinition } from "../../core/registry";

export const transitionDefinition: ComponentDefinition = {
  component: "transition",
  templates: [
    { id: "fade", label: "Fade", description: "Aparece e some com opacidade." },
    { id: "slide", label: "Deslize", description: "Entra deslizando de uma direção." },
    { id: "scale", label: "Escala", description: "Cresce a partir do centro." },
    { id: "collapse", label: "Recolher", description: "Expande e recolhe a altura." },
  ],
  params: {
    duration: { type: "number", label: "Duração (s)", default: 0.3, min: 0, max: 5, step: 0.05 },
    delay: { type: "number", label: "Atraso (s)", default: 0, min: 0, max: 5, step: 0.05 },
    direction: { type: "enum", label: "Direção", default: "up", options: ["up", "down", "left", "right"] },
    intensity: { type: "number", label: "Intensidade", default: 1, min: 0.2, max: 2, step: 0.05 },
    easing: { type: "enum", label: "Easing", default: "standard", options: EASINGS },
  },
};
