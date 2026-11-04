import { NousLoader } from "../components/loader/NousLoader";
import { NousButton } from "../components/button/NousButton";
import { NousTransition } from "../components/transitions/NousTransition";
import type { LoaderTemplate, ButtonTemplate, MotionComponent, MotionParameters, TransitionTemplate } from "../core/types";
import { useEffect, useState } from "react";

export interface MotionPreviewProps {
  component: MotionComponent;
  template: string;
  /** Já validados (o customizador só emite valores válidos). */
  parameters: MotionParameters;
}

/** Renderiza o componente com os parâmetros atuais; atualiza a cada mudança (tempo real). */
export function MotionPreview({ component, template, parameters }: MotionPreviewProps) {
  const [show, setShow] = useState(true);
  // Transition: alterna sozinho para o usuário ver entrada e saída.
  useEffect(() => {
    if (component !== "transition") return;
    const t = setInterval(() => setShow((s) => !s), 1600);
    return () => clearInterval(t);
  }, [component]);

  const p = parameters as Record<string, never>;
  return (
    <div className="nm-ed__preview" role="img" aria-label={`Pré-visualização: ${component} ${template}`}>
      {component === "loader" && (
        <NousLoader {...p} template={template as LoaderTemplate} {...(typeof parameters["progress"] === "number" ? { progress: parameters["progress"] } : {})} />
      )}
      {component === "button" && (
        <NousButton {...p} template={template as ButtonTemplate} type="button">
          Botão de exemplo
        </NousButton>
      )}
      {component === "transition" && (
        <NousTransition {...p} template={template as TransitionTemplate} show={show}>
          <div className="nm-ed__card">Conteúdo de exemplo</div>
        </NousTransition>
      )}
    </div>
  );
}
