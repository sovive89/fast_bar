/**
 * Som e vibração dos alertas do caixa (pedido de conta, e os próximos alertas que usarem a mesma
 * base). Navegadores BLOQUEIAM som automático antes de a pessoa interagir com a página, então o
 * áudio só é destravado no primeiro toque na tela; antes disso o alerta continua visual (e vibra,
 * onde o aparelho deixa).
 */

let audioContext: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioContext = new Ctor();
  } catch {
    return null;
  }
  return audioContext;
}

/** Chame uma vez, num gesto da pessoa (toque/clique). Idempotente. */
export function unlockAlertSound(): void {
  if (unlocked) return;
  const context = getContext();
  if (!context) return;
  void context.resume().then(
    () => {
      unlocked = true;
    },
    () => undefined,
  );
}

export function isAlertSoundUnlocked(): boolean {
  return unlocked;
}

/** Dois "bips" curtos. Silencioso (sem erro) se o navegador ainda não liberou o áudio. */
export function playAlertSound(): void {
  const context = getContext();
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  for (const [offset, frequency] of [
    [0, 880],
    [0.22, 1175],
  ] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.2);
  }
}

/** Vibra o aparelho (Android). iOS/Safari não tem essa API: nada acontece e não dá erro. */
export function vibrateAlert(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate([200, 100, 200]);
  } catch {
    // Alguns navegadores bloqueiam fora de gesto — alerta visual segue valendo.
  }
}
