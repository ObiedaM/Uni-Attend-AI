import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "../../src/shared/storage";

describe("sanitizeSettings", () => {
  it("clamps out-of-range numeric settings and rejects invalid types safely", () => {
    const clean = sanitizeSettings({
      ttsRate: 99,
      ttsVolume: -5,
      timerDuration: 0,
      micGain: Number.NaN,
      hudWidth: 9999,
      langMode: "fr-FR",
      invertMode: "not-a-bool",
      presentKeywords: ["  نعم  ", "", 123, "a".repeat(100)]
    });

    expect(clean.ttsRate).toBe(1.5);
    expect(clean.ttsVolume).toBe(0.5);
    expect(clean.timerDuration).toBe(2);
    expect(clean.micGain).toBe(2.5);
    expect(clean.hudWidth).toBe(640);
    expect(clean.langMode).toBe("ar-JO");
    expect(clean.invertMode).toBe(true);
    expect(clean.presentKeywords).toEqual(["نعم", "a".repeat(60)]);
  });
});
