import { DEFAULT_PRIMARY } from "../../core/tokens";
import type { ComponentDefinition } from "../../core/registry";

export const BUTTON_STATES = ["idle", "loading", "success", "error"] as const;

export const buttonDefinition: ComponentDefinition = {
  component: "button",
  templates: [
    { id: "pulse", label: "Pulso", description: "Halo que pulsa chamando atenção." },
    { id: "ripple", label: "Ondulação", description: "Onda a partir do ponto do toque." },
    { id: "glow", label: "Brilho", description: "Brilho no hover (só com mouse)." },
    { id: "magnetic", label: "Magnético", description: "Segue o ponteiro (só com mouse)." },
    { id: "scale", label: "Escala", description: "Encolhe ao pressionar." },
    { id: "slide", label: "Deslize", description: "Preenchimento deslizando no hover." },
    { id: "success", label: "Sucesso", description: "Confirma a ação com ✓." },
    { id: "loading", label: "Carregando", description: "Spinner enquanto processa." },
    { id: "notification", label: "Notificação", description: "Selo pulsante de aviso." },
    { id: "alert", label: "Alerta", description: "Balanço curto para erro/urgência." },
  ],
  params: {
    variant: { type: "enum", label: "Variante", default: "solid", options: ["solid", "outline", "ghost"] },
    primaryColor: { type: "color", label: "Cor principal", default: DEFAULT_PRIMARY },
    secondaryColor: { type: "color", label: "Cor do texto/secundária", default: "#ffffff" },
    size: { type: "enum", label: "Tamanho", default: "md", options: ["sm", "md", "lg"] },
    radius: { type: "number", label: "Raio (px)", default: 10, min: 0, max: 32, step: 1 },
    speed: { type: "number", label: "Velocidade", default: 1, min: 0.25, max: 4, step: 0.05 },
    intensity: { type: "number", label: "Intensidade", default: 1, min: 0.2, max: 2, step: 0.05 },
    shadow: { type: "boolean", label: "Sombra", default: false },
    disabled: { type: "boolean", label: "Desabilitado", default: false },
    loading: { type: "boolean", label: "Carregando", default: false },
    state: { type: "enum", label: "Estado", default: "idle", options: BUTTON_STATES },
  },
};
