import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("som e vibração exclusivos do apoio", () => {
  it("não falha sem APIs de áudio/vibração", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", undefined);
    const { playSupportAlert, vibrateSupportAlert } = await import("../src/lib/alert-sound");
    expect(() => playSupportAlert("critical")).not.toThrow();
    expect(() => vibrateSupportAlert("critical")).not.toThrow();
  });

  it("respeita o bloqueio de reprodução do navegador e não força resume", async () => {
    const createOscillator = vi.fn();
    const resume = vi.fn();
    vi.stubGlobal("window", {
      AudioContext: class {
        state = "suspended";
        createOscillator = createOscillator;
        resume = resume;
      },
    });
    const { playSupportAlert } = await import("../src/lib/alert-sound");
    playSupportAlert("critical");
    expect(createOscillator).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it("distingue apoio da conta e aumenta a intensidade mantendo volume limitado", async () => {
    const tones: Array<{ frequency: { value: number } }> = [];
    const rampPeaks: number[] = [];
    vi.stubGlobal("window", {
      AudioContext: class {
        state = "running";
        currentTime = 0;
        destination = {};
        createOscillator() {
          const oscillator = {
            frequency: { value: 0 },
            type: "sine",
            connect: (target: unknown) => target,
            start: () => undefined,
            stop: () => undefined,
            disconnect: () => undefined,
          };
          tones.push(oscillator);
          return oscillator;
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: () => undefined,
              exponentialRampToValueAtTime: (value: number) => {
                if (value > 0.001) rampPeaks.push(value);
              },
            },
            connect: () => undefined,
            disconnect: () => undefined,
          };
        }
      },
    });
    const { playSupportAlert, playAlertSound } = await import("../src/lib/alert-sound");
    const peaks: number[] = [];
    for (const level of ["priority", "urgent", "critical"] as const) {
      tones.length = 0;
      rampPeaks.length = 0;
      playSupportAlert(level);
      expect(tones).toHaveLength(3);
      expect(rampPeaks.every((value) => value > 0 && value <= 0.3)).toBe(true);
      peaks.push(Math.max(...rampPeaks));
    }
    const supportFrequencies = tones.map((tone) => tone.frequency.value);
    tones.length = 0;
    playAlertSound();
    expect(tones).toHaveLength(2);
    expect(tones.every((tone) => !supportFrequencies.includes(tone.frequency.value))).toBe(true);
    expect(peaks[0]).toBeLessThan(peaks[1]!);
    expect(peaks[1]).toBeLessThan(peaks[2]!);
  });

  it("vibra em três pulsos progressivos e tolera rejeição do navegador", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const { vibrateSupportAlert } = await import("../src/lib/alert-sound");
    for (const level of ["priority", "urgent", "critical"] as const) vibrateSupportAlert(level);
    const durations = vibrate.mock.calls.map(([pattern]) => {
      expect(pattern).toHaveLength(5);
      const total = (pattern as number[]).reduce(
        (duration, value, index) => duration + (index % 2 === 0 ? value : 0),
        0,
      );
      expect(total).toBeLessThanOrEqual(1000);
      return total;
    });
    expect(durations[0]).toBeLessThan(durations[1]!);
    expect(durations[1]).toBeLessThan(durations[2]!);
    vibrate.mockImplementation(() => {
      throw new Error("not allowed");
    });
    expect(() => vibrateSupportAlert("critical")).not.toThrow();
  });
});
