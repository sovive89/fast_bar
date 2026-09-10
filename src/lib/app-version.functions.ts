import { createServerFn } from "@tanstack/react-start";

/**
 * Carimbo da build que está rodando NO SERVIDOR agora.
 *
 * `__BUILD_ID__` é trocado por um literal em tempo de compilação (ver `define` no vite.config),
 * então este arquivo, depois de compilado, devolve o id do deploy que atendeu a chamada — não o
 * da aba que perguntou. É essa diferença que denuncia um cliente desatualizado.
 *
 * De propósito NÃO exige acesso do caixa: a checagem de versão precisa funcionar até em tela de
 * login, e o id de uma build não é informação sensível.
 */
export const getServerBuildId = createServerFn({ method: "GET" }).handler(async () => {
  return { buildId: __BUILD_ID__ };
});
