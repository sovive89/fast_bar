import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";

/**
 * Base das animações do app (biblioteca Motion, motion.dev).
 *
 * - `LazyMotion` + `domAnimation`: carrega só o necessário para animações comuns (entrar, sair,
 *   pulsar), em vez do pacote inteiro — mantém o app leve no celular. Por isso os componentes usam
 *   `m.div`/`m.span` (versão enxuta), nunca `motion.div`: o modo `strict` acusa se alguém misturar.
 * - `reducedMotion="user"`: quem pediu "reduzir movimento" no aparelho não vê as animações de
 *   deslocamento; o conteúdo aparece direto.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
