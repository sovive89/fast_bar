/** Tipos públicos do núcleo. Tudo aqui é JSON-serializável (nada de funções em presets). */

export type MotionComponent = "loader" | "button" | "transition";

export type LoaderTemplate = "orbit" | "pulse" | "dots" | "wave" | "progress" | "logo";
export type ButtonTemplate =
  | "pulse" | "ripple" | "glow" | "magnetic" | "scale"
  | "slide" | "success" | "loading" | "notification" | "alert";
export type TransitionTemplate = "fade" | "slide" | "scale" | "collapse";

export type LoaderState = "idle" | "loading" | "progress" | "success" | "error";
export type ButtonState = "idle" | "loading" | "success" | "error";

export type ParamValue = string | number | boolean;
export type MotionParameters = Record<string, ParamValue>;

/** Preset = só dados. Nunca contém código. */
export interface MotionPreset {
  id: string;
  component: MotionComponent;
  template: string;
  version: 1;
  parameters: MotionParameters;
}

export type ParamSpec =
  | { type: "color"; label: string; default: string }
  | { type: "number"; label: string; default: number; min: number; max: number; step?: number }
  | { type: "enum"; label: string; default: string; options: readonly string[] }
  | { type: "boolean"; label: string; default: boolean }
  | { type: "text"; label: string; default: string; maxLength: number }
  | { type: "url"; label: string; default: string };

export type ParamSpecs = Record<string, ParamSpec>;

export interface TemplateInfo {
  id: string;
  label: string;
  description: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value: T;
  errors: string[];
}

/**
 * Persistência externa. A biblioteca NÃO sabe quem é o tenant nem como autenticar:
 * o app que implementa o adaptador é responsável por escopo e autorização.
 */
export interface MotionStorageAdapter {
  list(): Promise<MotionPreset[]>;
  get(id: string): Promise<MotionPreset | null>;
  save(preset: MotionPreset): Promise<void>;
  remove(id: string): Promise<void>;
}
