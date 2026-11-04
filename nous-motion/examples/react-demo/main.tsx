import { StrictMode, Suspense, lazy, useState } from "react";
import { createRoot } from "react-dom/client";
import { NousLoader } from "@nous/motion/loader";
import { NousButton } from "@nous/motion/button";
import { NousTransition } from "@nous/motion/transition";
import { Loading } from "./Loading";

// O editor só é baixado quando o usuário abre a área de personalização.
const MotionEditor = lazy(() => import("@nous/motion/editor").then((m) => ({ default: m.MotionEditor })));

function App() {
  const [editor, setEditor] = useState(false);
  const [box, setBox] = useState(true);
  const [pct, setPct] = useState(35);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, display: "grid", gap: 24, fontFamily: "system-ui" }}>
      <h1>@nous/motion</h1>
      <section>
        <h2>Loader</h2>
        <Loading />
        <p>Progresso real (controlado por você, nunca simulado):</p>
        <NousLoader template="progress" state="progress" progress={pct} label="Enviando" />
        <div><input type="range" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="Progresso" style={{ width: "100%" }} /></div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(["orbit", "pulse", "dots", "wave"] as const).map((t) => <NousLoader key={t} template={t} label={t} />)}
          <NousLoader state="success" label="Salvo" />
          <NousLoader state="error" label="Falhou" />
        </div>
      </section>
      <section>
        <h2>Botão</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(["pulse", "ripple", "glow", "magnetic", "scale", "slide", "alert"] as const).map((t) => (
            <NousButton key={t} template={t}>{t}</NousButton>
          ))}
          <NousButton template="notification" badge={3}>Avisos</NousButton>
          <NousButton template="loading" loading>Salvando</NousButton>
          <NousButton template="success" state={state} onClick={() => { setState("loading"); setTimeout(() => setState("success"), 1000); }}>
            Confirmar
          </NousButton>
        </div>
      </section>
      <section>
        <h2>Transição</h2>
        <NousButton variant="outline" onClick={() => setBox((b) => !b)}>Alternar</NousButton>
        {(["fade", "slide", "scale", "collapse"] as const).map((t) => (
          <NousTransition key={t} template={t} show={box}><p>Bloco com {t}</p></NousTransition>
        ))}
      </section>
      <section>
        <NousButton onClick={() => setEditor(true)}>Abrir personalização</NousButton>
        {editor ? <Suspense fallback={<NousLoader label="Abrindo editor" />}><MotionEditor /></Suspense> : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
