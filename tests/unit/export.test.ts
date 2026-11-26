import { describe, expect, it } from "vitest";
import {
  buildAbsentCsvFilename,
  collectAbsentEntries,
  escapeCsvField,
  formatAbsentCsv,
  formatAbsentPlainText
} from "../../src/shared/export";
import {
  buildRowFingerprints,
  countRestorableMarks,
  loadSessionMarks,
  saveSessionMarks
} from "../../src/shared/session";
import type { StudentRow } from "../../src/shared/types";

function makeMockRow(overrides: Partial<StudentRow>): StudentRow {
  const dummyEl = document.createElement("input");
  return {
    checkbox: dummyEl,
    visualBox: dummyEl,
    rowEl: null,
    nameText: "Student",
    studentId: "",
    fullSpeechName: "Student",
    shortSpeechName: "Student",
    status: "pending",
    ...overrides
  };
}

describe("absent list export helpers", () => {
  const fixedDate = new Date(2026, 10, 26); // 2026-11-26

  it("collects only absent rows and formats UTF-8 BOM CSV cleanly", () => {
    const rows: StudentRow[] = [
      makeMockRow({ nameText: "1. محمد عبدالسلام (2024001)", studentId: "2024001", status: "present" }),
      makeMockRow({
        nameText: "2. عبدالرحمن أحمد الكردي (2024003)",
        studentId: "2024003",
        status: "absent"
      }),
      makeMockRow({ nameText: '3. "Ali, Omar"', studentId: "2024009", status: "absent" })
    ];

    const entries = collectAbsentEntries(rows);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      rowNumber: 2,
      name: "2. عبدالرحمن أحمد الكردي (2024003)",
      studentId: "2024003"
    });

    const csv = formatAbsentCsv(entries, fixedDate);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Row,Student Name,Student ID,Status,Date");
    expect(csv).toContain("2,2. عبدالرحمن أحمد الكردي (2024003),2024003,Absent,2026-11-26");
    expect(csv).toContain('3,"3. ""Ali, Omar""",2024009,Absent,2026-11-26');
    expect(buildAbsentCsvFilename(fixedDate)).toBe("uniattend-absent-2026-11-26.csv");
  });

  it("neutralizes spreadsheet formula injection in CSV cells", () => {
    expect(escapeCsvField("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
    expect(escapeCsvField("+12345")).toBe("'+12345");
  });

  it("formats plain-text clipboard summary for empty and non-empty absent lists", () => {
    expect(formatAbsentPlainText([], fixedDate)).toBe(
      "UniAttend AI — Absent List (2026-11-26): 0 absent"
    );
    const text = formatAbsentPlainText(
      [{ rowNumber: 2, name: "نديم هشام", studentId: "2024002" }],
      fixedDate
    );
    expect(text).toContain("UniAttend AI — Absent List (2026-11-26) [1]:");
    expect(text).toContain("1. نديم هشام | ID: 2024002");
  });
});

describe("session recovery guard", () => {
  it("saves marks keyed by URL and detects restorable marks after a simulated refresh", () => {
    window.sessionStorage.clear();
    const url = "https://portal.university.edu/attendance?course=CS101";

    const beforeRefresh: StudentRow[] = [
      makeMockRow({ nameText: "أحمد علي", studentId: "2024001", status: "present" }),
      makeMockRow({ nameText: "سارة خالد", studentId: "2024002", status: "absent" }),
      makeMockRow({ nameText: "عمر زيد", studentId: "2024003", status: "pending" })
    ];

    saveSessionMarks(beforeRefresh, true, window.sessionStorage, url);
    const snapshot = loadSessionMarks(window.sessionStorage, url);
    expect(snapshot).not.toBeNull();

    // Immediately after saving (no refresh): 0 restorable marks since rows already match
    expect(countRestorableMarks(beforeRefresh, snapshot)).toBe(0);

    // After accidental page refresh (all rows reset to pending): 2 restorable marks
    const afterRefresh = beforeRefresh.map((r) => ({ ...r, status: "pending" as const }));
    expect(countRestorableMarks(afterRefresh, snapshot)).toBe(2);
  });

  it("disambiguates duplicate names without IDs using stable occurrence suffixes", () => {
    const fps = buildRowFingerprints([
      { nameText: "محمد علي", studentId: "" },
      { nameText: "محمد علي", studentId: "" }
    ]);
    expect(fps[0]).not.toBe(fps[1]);
  });
});
