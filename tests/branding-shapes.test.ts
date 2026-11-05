import { describe, expect, it } from "vitest";
import {
  sanitizeCardShape,
  sanitizeCategoryShape,
  CARD_SHAPES,
  CATEGORY_SHAPES,
} from "../src/lib/branding/background";

describe("formatos do branding", () => {
  it("aceita só valores da lista e cai no padrão", () => {
    for (const shape of CARD_SHAPES) expect(sanitizeCardShape(shape)).toBe(shape);
    for (const shape of CATEGORY_SHAPES) expect(sanitizeCategoryShape(shape)).toBe(shape);
    expect(sanitizeCardShape("<script>")).toBe("rounded");
    expect(sanitizeCardShape(undefined)).toBe("rounded");
    expect(sanitizeCategoryShape(42)).toBe("pill");
  });
});
