import { normalizeText } from "../nlp/normalize";
import { SESSION_STORAGE_PREFIX } from "./constants";
import type { SavedSessionSnapshot, StudentRow } from "./types";

export function getSessionStorageKey(url: string = window.location.href): string {
  try {
    const parsed = new URL(url);
    return `${SESSION_STORAGE_PREFIX}${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch (_) {
    return `${SESSION_STORAGE_PREFIX}${url}`;
  }
}

/**
 * Generates deterministic fingerprints for scanned rows so saved marks survive
 * accidental page refreshes without relying on fragile DOM element references.
 */
export function buildRowFingerprints(rows: readonly Pick<StudentRow, "studentId" | "nameText">[]): string[] {
  const seenCounts = new Map<string, number>();
  return rows.map((row) => {
    const base = row.studentId
      ? `id:${row.studentId}`
      : `name:${normalizeText(row.nameText) || row.nameText.trim()}`;
    const count = seenCounts.get(base) || 0;
    seenCounts.set(base, count + 1);
    return count === 0 ? base : `${base}#${count}`;
  });
}

export function saveSessionMarks(
  rows: readonly StudentRow[],
  invertMode: boolean,
  storage: Storage = window.sessionStorage,
  url: string = window.location.href
): void {
  try {
    const fingerprints = buildRowFingerprints(rows);
    const marks: Record<string, "present" | "absent"> = {};
    rows.forEach((row, idx) => {
      if (row.status === "present" || row.status === "absent") {
        marks[fingerprints[idx]] = row.status;
      }
    });

    const key = getSessionStorageKey(url);
    if (Object.keys(marks).length === 0) {
      storage.removeItem(key);
      return;
    }

    const snapshot: SavedSessionSnapshot = {
      savedAt: Date.now(),
      invertMode,
      marks
    };
    storage.setItem(key, JSON.stringify(snapshot));
  } catch (_) {
    // Ignore storage quota or private-mode security errors
  }
}

export function loadSessionMarks(
  storage: Storage = window.sessionStorage,
  url: string = window.location.href
): SavedSessionSnapshot | null {
  try {
    const raw = storage.getItem(getSessionStorageKey(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSessionSnapshot>;
    if (!parsed || typeof parsed.marks !== "object" || parsed.marks === null) return null;
    return {
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
      invertMode: Boolean(parsed.invertMode),
      marks: parsed.marks
    };
  } catch (_) {
    return null;
  }
}

export function clearSessionMarks(
  storage: Storage = window.sessionStorage,
  url: string = window.location.href
): void {
  try {
    storage.removeItem(getSessionStorageKey(url));
  } catch (_) {}
}

/**
 * Counts how many saved marks match the current scanned rows and are NOT already reflected
 * on the page (meaning the user likely refreshed and lost unsaved marks).
 */
export function countRestorableMarks(
  rows: readonly StudentRow[],
  snapshot: SavedSessionSnapshot | null
): number {
  if (!snapshot) return 0;
  const fingerprints = buildRowFingerprints(rows);
  let restorable = 0;

  rows.forEach((row, idx) => {
    const saved = snapshot.marks[fingerprints[idx]];
    if (saved && row.status !== saved) {
      restorable++;
    }
  });

  return restorable;
}
