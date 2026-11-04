import { describe, expect, it } from "vitest";
import { loadWithFallback } from "../src/lib/async-result";

describe("loadWithFallback", () => {
  it("returns loaded data when the request succeeds", async () => {
    const previous = { label: "default" };
    const current = { label: "loaded" };

    await expect(loadWithFallback(async () => current, previous)).resolves.toEqual({
      value: current,
      error: false,
    });
  });

  it("preserves the previous data when the request rejects", async () => {
    const previous = { label: "last good value" };

    await expect(
      loadWithFallback(async () => {
        throw new Error("network unavailable");
      }, previous),
    ).resolves.toEqual({ value: previous, error: true });
  });

  it("uses the previous data when the request times out", async () => {
    const previous = { label: "last good value" };
    const pending = new Promise<{ label: string }>(() => {});

    await expect(loadWithFallback(() => pending, previous, 5)).resolves.toEqual({
      value: previous,
      error: true,
    });
  });
});
