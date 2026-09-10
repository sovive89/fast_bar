declare module "virtual:pwa-register" {
  export type RegisterSWOptions = {
    immediate?: boolean;
    onRegistered?: (
      r?: ServiceWorkerRegistration | Promise<ServiceWorkerRegistration | undefined>,
    ) => void;
    onRegisterError?: (error: any) => void;
  };

  export function registerSW(opts?: RegisterSWOptions): () => void;
  export default registerSW;
}

/**
 * Carimbo da build, injetado pelo `define` do vite.config. Mesmo valor no bundle do servidor e no
 * do cliente dentro de uma mesma build — e por isso diferente entre uma aba antiga e o deploy
 * novo que ela chama. Ver src/lib/app-version.functions.ts.
 */
declare const __BUILD_ID__: string;
