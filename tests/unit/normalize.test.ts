import { describe, expect, it } from "vitest";
import { normalizeText } from "../../src/nlp/normalize";

describe("normalizeText", () => {
  it("normalizes Arabic Alef variants (أ/إ/آ/ٱ -> ا) and Ta Marbuta (ة -> ه)", () => {
    expect(normalizeText("أحمد")).toBe("احمد");
    expect(normalizeText("إسلام")).toBe("اسلام");
    expect(normalizeText("آه")).toBe("اه");
    expect(normalizeText("موجودة")).toBe("موجوده");
    expect(normalizeText("حاضرة")).toBe("حاضره");
    expect(normalizeText("غائبة")).toBe("غائبه");
  });

  it("strips Arabic diacritics (Tashkeel) and Tatweel (kashida)", () => {
    expect(normalizeText("حَاضِرٌ")).toBe("حاضر");
    expect(normalizeText("مَوْجُودَةً")).toBe("موجوده");
    expect(normalizeText("شغّال")).toBe("شغال");
    expect(normalizeText("هَـلا")).toBe("هلا");
    expect(normalizeText("غَـائِـبٌ")).toBe("غائب");
  });

  it("strips Arabic and Latin punctuation and collapses whitespace", () => {
    expect(normalizeText("  نَعَمْ!؟،؛  ")).toBe("نعم");
    expect(normalizeText("Yes, I'm here...")).toBe("yes i m here");
    expect(normalizeText("Not-here / skip (next)")).toBe("not here skip next");
  });

  it("handles empty, null, and undefined inputs safely", () => {
    expect(normalizeText("")).toBe("");
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});
