import { describe, expect, it } from "vitest";
import { compileDictionary, matchAttendanceKeyword } from "../../src/nlp/keywords";
import { DEFAULT_ABSENT_KEYWORDS, DEFAULT_PRESENT_KEYWORDS } from "../../src/shared/constants";

describe("matchAttendanceKeyword", () => {
  const presentDict = compileDictionary(DEFAULT_PRESENT_KEYWORDS);
  const absentDict = compileDictionary(DEFAULT_ABSENT_KEYWORDS);

  it('prevents substring collisions: "هلا" and "شغال" resolve to Present, never Absent "لا" or "غا"', () => {
    const absentWithGa = compileDictionary([...DEFAULT_ABSENT_KEYWORDS, "غا"]);

    expect(matchAttendanceKeyword("هلا", presentDict, absentWithGa)).toBe("present");
    expect(matchAttendanceKeyword("هَلا!", presentDict, absentWithGa)).toBe("present");
    expect(matchAttendanceKeyword("شغال", presentDict, absentWithGa)).toBe("present");
    expect(matchAttendanceKeyword("شغّال", presentDict, absentWithGa)).toBe("present");
    // Unrelated word containing "لا" must not falsely match "لا"
    expect(matchAttendanceKeyword("سلام", presentDict, absentWithGa)).toBeNull();
  });

  it("matches Arabic, English, and phonetic Present keywords accurately", () => {
    expect(matchAttendanceKeyword("نعم", presentDict, absentDict)).toBe("present");
    expect(matchAttendanceKeyword("موجودة", presentDict, absentDict)).toBe("present");
    expect(matchAttendanceKeyword("حاضر دكتور", presentDict, absentDict)).toBe("present");
    expect(matchAttendanceKeyword("حاظر", presentDict, absentDict)).toBe("present");
    expect(matchAttendanceKeyword("حاض", presentDict, absentDict)).toBe("present");
    expect(matchAttendanceKeyword("Yes, here!", presentDict, absentDict)).toBe("present");
    expect(matchAttendanceKeyword("بريزنت", presentDict, absentDict)).toBe("present");
    // Clipped real-world STT token "ر" never leaks into Absent words containing letter ر
    expect(matchAttendanceKeyword("اعتذر", presentDict, absentDict)).toBe("absent");
  });

  it("gives Absent multi-word phrases priority over positive single-word tokens", () => {
    expect(matchAttendanceKeyword("مش موجود", presentDict, absentDict)).toBe("absent");
    expect(matchAttendanceKeyword("مو هون", presentDict, absentDict)).toBe("absent");
    expect(matchAttendanceKeyword("not here today", presentDict, absentDict)).toBe("absent");
    expect(matchAttendanceKeyword("غائب", presentDict, absentDict)).toBe("absent");
    expect(matchAttendanceKeyword("لا", presentDict, absentDict)).toBe("absent");
    expect(matchAttendanceKeyword("skip", presentDict, absentDict)).toBe("absent");
  });

  it("enforces whole-word boundaries on multi-word phrases", () => {
    // "cannot here" must NOT match the phrase "not here", though "here" matches Present
    expect(matchAttendanceKeyword("cannot here", presentDict, absentDict)).toBe("present");
    expect(matchAttendanceKeyword("cannot there", presentDict, absentDict)).toBeNull();
  });

  it("supports custom user-defined keywords dynamically", () => {
    const customPresent = compileDictionary([...DEFAULT_PRESENT_KEYWORDS, "متواجد", "roger"]);
    const customAbsent = compileDictionary([...DEFAULT_ABSENT_KEYWORDS, "معذور"]);

    expect(matchAttendanceKeyword("متواجد", customPresent, customAbsent)).toBe("present");
    expect(matchAttendanceKeyword("Roger that", customPresent, customAbsent)).toBe("present");
    expect(matchAttendanceKeyword("معذور", customPresent, customAbsent)).toBe("absent");
  });
});
