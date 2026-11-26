import type { AbsentExportEntry, StudentRow } from "./types";

function formatIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function collectAbsentEntries(rows: readonly StudentRow[]): AbsentExportEntry[] {
  const entries: AbsentExportEntry[] = [];
  rows.forEach((row, idx) => {
    if (row.status === "absent") {
      entries.push({
        rowNumber: idx + 1,
        name: row.nameText,
        studentId: row.studentId
      });
    }
  });
  return entries;
}

export function formatAbsentPlainText(
  entries: readonly AbsentExportEntry[],
  date: Date = new Date()
): string {
  const dateStr = formatIsoDate(date);
  if (entries.length === 0) {
    return `UniAttend AI — Absent List (${dateStr}): 0 absent`;
  }
  const lines = [`UniAttend AI — Absent List (${dateStr}) [${entries.length}]:`];
  entries.forEach((entry, i) => {
    const idSuffix = entry.studentId ? ` | ID: ${entry.studentId}` : "";
    lines.push(`${i + 1}. ${entry.name}${idSuffix}`);
  });
  return lines.join("\n");
}

/**
 * Escapes a single CSV field per RFC 4180 and neutralizes spreadsheet formula injection.
 */
export function escapeCsvField(raw: string): string {
  let safe = String(raw ?? "");
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Formats absent students as UTF-8 BOM CSV so Microsoft Excel opens Arabic names cleanly.
 */
export function formatAbsentCsv(
  entries: readonly AbsentExportEntry[],
  date: Date = new Date()
): string {
  const dateStr = formatIsoDate(date);
  const header = "Row,Student Name,Student ID,Status,Date";
  const rows = entries.map((entry) =>
    [
      String(entry.rowNumber),
      escapeCsvField(entry.name),
      escapeCsvField(entry.studentId),
      "Absent",
      dateStr
    ].join(",")
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

export function buildAbsentCsvFilename(date: Date = new Date()): string {
  return `uniattend-absent-${formatIsoDate(date)}.csv`;
}

export function triggerCsvDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    // Fallback below for restricted / file:// contexts
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch (_) {
    return false;
  }
}
