import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getServerBuildId } from "@/lib/app-version.functions";

/**
 * Aviso de "saiu versão nova" no painel da equipe.
 *
 * Por que existe: o caixa é uma aba que fica aberta o turno inteiro. Publicar um deploy não
 * atualiza uma aba já aberta — ela continua rodando o JavaScript que baixou quando abriu. Na
 * prática isso apareceu como um módulo novo que simplesmente "não existia" no celular da equipe,
 * mesmo com a produção certa, e a única saída era mandar alguém limpar cache na mão.
 *
 * Como funciona: `__BUILD_ID__` é carimbado em tempo de compilação, então o valor que ESTE arquivo
 * carrega é o da build que a aba baixou. `getServerBuildId` roda no servidor, que já é o deploy
 * atual. Se os dois diferem, esta aba está velha.
 *
 * Nunca recarrega sozinho: a equipe pode estar no meio de uma comanda, e perder o que está
 * digitado por causa de um refresh automático seria pior que a versão desatualizada. O toque na
 * barra é que atualiza.
 */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Já sabemos que está velha — não adianta continuar perguntando.
      if (cancelled || stale) return;
      try {
        const { buildId } = await getServerBuildId();
        // Em dev cada build gera um id novo a cada reinício do servidor; o aviso só faz sentido
        // quando o servidor devolve um id de verdade e ele difere do nosso.
        if (!cancelled && buildId && buildId !== __BUILD_ID__) setStale(true);
      } catch {
        // Sem rede, ou servidor fora do ar: não é assunto deste aviso. O caixa tem os próprios
        // erros pra isso, e uma barra de "atualize" piscando por falha de rede só confunde.
      }
    }

    void check();
    const timer = setInterval(() => void check(), 5 * 60_000);
    // Voltar pro app depois de um tempo em segundo plano é justamente quando um deploy pode ter
    // acontecido sem ninguém ver.
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [stale]);

  if (!stale) return null;

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="flex w-full items-center justify-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
    >
      <RefreshCw className="h-4 w-4" />
      Nova versão disponível — toque para atualizar
    </button>
  );
}
