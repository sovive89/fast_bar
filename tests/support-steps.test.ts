import { describe, expect, it } from "vitest";
import { nextSupportStep, sanitizeSupportPlaces, STEP_ANSWERS } from "../src/lib/support-presets";

describe("roteiro do apoio", () => {
  it("avança pergunta a pergunta", () => {
    expect(nextSupportStep([], true)).toBe("happening");
    expect(nextSupportStep([STEP_ANSWERS.happening], true)).toBe("needHelp");
    expect(nextSupportStep([STEP_ANSWERS.happening, STEP_ANSWERS.needHelp], true)).toBe("counter");
    const cannot = [STEP_ANSWERS.happening, STEP_ANSWERS.needHelp, STEP_ANSWERS.cannotCounter];
    expect(nextSupportStep(cannot, true)).toBe("place");
    expect(nextSupportStep(cannot, false)).toBe("done");
    expect(nextSupportStep([...cannot, "Estou perto de: Mesa"], true)).toBe("done");
  });
  it("engano e recusa de ajuda encerram o roteiro", () => {
    expect(nextSupportStep([STEP_ANSWERS.falseAlarm], true)).toBe("falseAlarm");
    expect(nextSupportStep([STEP_ANSWERS.happening, STEP_ANSWERS.noHelp], true)).toBe("done");
    expect(
      nextSupportStep(
        [STEP_ANSWERS.happening, STEP_ANSWERS.needHelp, STEP_ANSWERS.canCounter],
        true,
      ),
    ).toBe("done");
  });
  it("lugares: limpa espaços, repetidos, textos longos e limita a 8", () => {
    expect(sanitizeSupportPlaces("  A  b \n\nA  b\n" + "x".repeat(41))).toEqual(["A b"]);
    expect(sanitizeSupportPlaces(Array.from({ length: 12 }, (_, i) => `L${i}`))).toHaveLength(8);
    expect(sanitizeSupportPlaces(42)).toEqual([]);
  });
});
