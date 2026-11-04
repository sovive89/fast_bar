import { DEFAULT_PRIMARY, DEFAULT_SECONDARY } from "../../core/tokens";
import type { ComponentDefinition } from "../../core/registry";

export const LOADER_STATES = ["idle", "loading", "progress", "success", "error"] as const;

export const loaderDefinition: ComponentDefinition = {
  component: "loader",
  templates: [
    { id: "orbit", label: "Órbita", description: "Pontos girando em torno do centro." },
    { id: "pulse", label: "Pulso", description: "Círculo que pulsa suavemente." },
    { id: "dots", label: "Pontos", description: "Três pontos saltando em sequência." },
    { id: "wave", label: "Onda", description: "Barras que sobem e descem." },
    { id: "progress", label: "Progresso", description: "Barra de progresso com valor real." },
    { id: "logo", label: "Logo", description: "Sua logomarca pulsando." },
  ],
  params: {
    primaryColor: { type: "color", label: "Cor principal", default: DEFAULT_PRIMARY },
    secondaryColor: { type: "color", label: "Cor secundária", default: DEFAULT_SECONDARY },
    size: { type: "number", label: "Tamanho (px)", default: 48, min: 16, max: 256, step: 2 },
    speed: { type: "number", label: "Velocidade", default: 1, min: 0.25, max: 4, step: 0.05 },
    duration: { type: "number", label: "Duração do ciclo (s)", default: 1.2, min: 0.2, max: 10, step: 0.1 },
    intensity: { type: "number", label: "Intensidade", default: 1, min: 0.2, max: 2, step: 0.05 },
    direction: { type: "enum", label: "Direção", default: "normal", options: ["normal", "reverse"] },
    repeat: { type: "number", label: "Repetições (0 = infinito)", default: 0, min: 0, max: 20, step: 1 },
    logo: { type: "url", label: "Logo (URL https ou data:image)", default: "" },
    label: { type: "text", label: "Rótulo", default: "Carregando", maxLength: 80 },
    progress: { type: "number", label: "Progresso real (0–100)", default: 0, min: 0, max: 100, step: 1 },
    state: { type: "enum", label: "Estado", default: "loading", options: LOADER_STATES },
  },
};
