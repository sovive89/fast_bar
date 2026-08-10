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
