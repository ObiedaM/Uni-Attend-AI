import { describe, expect, it } from "vitest";
import {
  cleanNameForSpeech,
  extractStudentId,
  parseSpeechNames,
  splitIntoLogicalNameParts
} from "../../src/nlp/names";

describe("compound Arabic 2-part name extraction", () => {
  it('extracts 2 logical parts from "1. عبدالرحمن أحمد الكردي (2024003)"', () => {
    const res = parseSpeechNames("1. عبدالرحمن أحمد الكردي (2024003)", "Student #1");
    expect(res.fullSpeechName).toBe("عبدالرحمن أحمد الكردي");
    expect(res.shortSpeechName).toBe("عبدالرحمن أحمد");
  });

  it('keeps space-separated prefix compound name intact: "عبد الرحمن محمد علي"', () => {
    const res = parseSpeechNames("عبد الرحمن محمد علي", "Student #2");
    expect(res.fullSpeechName).toBe("عبد الرحمن محمد علي");
    expect(res.shortSpeechName).toBe("عبد الرحمن محمد");
  });

  it('keeps suffix compound name intact: "صلاح الدين الأيوبي حسن"', () => {
    const res = parseSpeechNames("صلاح الدين الأيوبي حسن", "Student #3");
    expect(res.fullSpeechName).toBe("صلاح الدين الأيوبي حسن");
    expect(res.shortSpeechName).toBe("صلاح الدين الأيوبي");
  });

  it("handles compound father's name as the second part", () => {
    expect(splitIntoLogicalNameParts("محمد عبد الرحمن علي").slice(0, 2).join(" ")).toBe(
      "محمد عبد الرحمن"
    );
    expect(splitIntoLogicalNameParts("أحمد صلاح الدين محمود").slice(0, 2).join(" ")).toBe(
      "أحمد صلاح الدين"
    );
    expect(splitIntoLogicalNameParts("نور الهدى خالد يوسف").slice(0, 2).join(" ")).toBe(
      "نور الهدى خالد"
    );
    expect(splitIntoLogicalNameParts("أبو بكر عمر الحسن").slice(0, 2).join(" ")).toBe(
      "أبو بكر عمر"
    );
  });

  it("cleans row numbers, Arabic-Indic digits, brackets, and punctuation", () => {
    expect(cleanNameForSpeech("٣. محمد عبدالسلام [CS] (2024001)")).toBe("محمد عبدالسلام");
  });

  it("extracts student IDs cleanly without mistaking row indices for IDs", () => {
    expect(extractStudentId("1. عبدالرحمن أحمد الكردي (2024003)")).toBe("2024003");
    expect(extractStudentId("2025101 | صلاح الدين الأيوبي")).toBe("2025101");
    expect(extractStudentId("طالب (٢٠٢٤٠٠٩)")).toBe("2024009");
    expect(extractStudentId("1. ريان خالد")).toBe("");
  });
});
