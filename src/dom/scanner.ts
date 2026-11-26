import { extractStudentId, parseSpeechNames } from "../nlp/names";
import { HOST_ID } from "../shared/constants";
import type { RowStatus, StudentRow } from "../shared/types";
import { clearHighlights, ensureStylesInDoc, getAccessibleDocuments } from "./documents";
import { isCheckboxChecked } from "./mutator";

interface RawCheckboxHit {
  el: HTMLElement;
  visual: HTMLElement;
}

export function isElementHiddenByCSS(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node.nodeType === 1) {
    const win = node.ownerDocument?.defaultView || window;
    const style = win.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return true;
    node = node.parentElement;
  }
  return false;
}

export function getVisualTarget(cb: HTMLElement): HTMLElement {
  const doc = cb.ownerDocument || document;
  const pfBox = cb.closest(".ui-chkbox")?.querySelector<HTMLElement>(".ui-chkbox-box");
  if (pfBox) return pfBox;

  const rect = cb.getBoundingClientRect();
  if (rect.width >= 8 && rect.height >= 8) return cb;

  // Custom styled/sr-only checkboxes often hide the <input> and style its <label>
  if (cb.id) {
    const linkedLabel = doc.querySelector<HTMLElement>(`label[for="${CSS.escape(cb.id)}"]`);
    if (linkedLabel) return linkedLabel;
  }
  const parentLabel = cb.closest<HTMLElement>("label");
  if (parentLabel) return parentLabel;

  return cb.parentElement || cb;
}

export function collectCheckboxesFromRoot(
  root: Document | ShadowRoot | null,
  results: RawCheckboxHit[]
): void {
  if (!root) return;
  const selector = 'input[type="checkbox"], [role="checkbox"]';
  const found = root.querySelectorAll<HTMLElement>(selector);

  for (const el of found) {
    if (el.closest(`#${HOST_ID}`)) continue;
    if (el.tagName === "INPUT" && (el as HTMLInputElement).disabled) continue;
    if (el.getAttribute("aria-disabled") === "true") continue;
    if (el.closest("th, thead")) continue;

    const visual = getVisualTarget(el);
    if (isElementHiddenByCSS(visual)) continue;
    const rect = visual.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    results.push({ el, visual });
  }

  // Traverse open Shadow Roots (modern web components)
  const allEls = root.querySelectorAll("*");
  for (const node of allEls) {
    if (node.id === HOST_ID) continue;
    if (node.shadowRoot) {
      collectCheckboxesFromRoot(node.shadowRoot, results);
    }
  }
}

export function findSafeRowElement(cb: HTMLElement): HTMLElement | null {
  const tableOrList = cb.closest<HTMLElement>("tr, li, .student-row, .row, [role='row']");
  if (tableOrList) {
    const h = tableOrList.getBoundingClientRect().height;
    if (h > 0 && h < 140) return tableOrList;
  }

  let parent = cb.parentElement;
  for (let depth = 0; depth < 3 && parent; depth++) {
    const rect = parent.getBoundingClientRect();
    const textLen = (parent.textContent || "").trim().length;
    if (rect.height > 0 && rect.height < 95 && textLen > 1) {
      return parent;
    }
    parent = parent.parentElement;
  }

  return null;
}

function getCleanElementText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input, button, select, script, style").forEach((n) => n.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

export function extractStudentMetadata(
  cb: HTMLElement,
  rowEl: HTMLElement | null,
  idx: number
): {
  displayName: string;
  studentId: string;
  fullSpeechName: string;
  shortSpeechName: string;
} {
  const doc = cb.ownerDocument || document;
  let candidateText = "";
  let extractedId = "";

  // 1. Table row: inspect cells for student name & optional ID column
  if (rowEl && (rowEl.tagName === "TR" || rowEl.getAttribute("role") === "row")) {
    const cells = Array.from(rowEl.querySelectorAll<HTMLElement>("td, [role='cell'], [role='gridcell']"));
    const nameCells: { txt: string; letters: number; wordCount: number; order: number }[] = [];

    cells.forEach((td, order) => {
      const txt = getCleanElementText(td);
      if (!extractedId) {
        const numericOnly = txt.replace(/\s+/g, "");
        if (/^[0-9٠-٩]{4,14}$/.test(numericOnly)) {
          extractedId = extractStudentId(`(${numericOnly})`);
        } else {
          extractedId = extractStudentId(txt);
        }
      }
      if (td.contains(cb) && txt.length < 3) return;
      const letters = (txt.match(/[\u0600-\u06FFa-zA-Z]/g) || []).length;
      const digits = (txt.match(/\d/g) || []).length;
      if (letters >= 2 && letters > digits) {
        nameCells.push({
          txt,
          letters,
          wordCount: txt.split(/\s+/).filter(Boolean).length,
          order
        });
      }
    });

    if (nameCells.length > 0) {
      const sorted = [...nameCells].sort((a, b) => b.letters - a.letters);
      if (sorted.length >= 2 && sorted[0].wordCount === 1 && sorted[1].wordCount === 1) {
        const pair = [sorted[0], sorted[1]].sort((a, b) => a.order - b.order);
        candidateText = `${pair[0].txt} ${pair[1].txt}`;
      } else {
        candidateText = sorted[0].txt;
      }
    }
  }

  // 2. Explicit <label for="id"> or aria-label
  if (!candidateText && cb.id) {
    const lbl = doc.querySelector<HTMLElement>(`label[for="${CSS.escape(cb.id)}"]`);
    if (lbl) candidateText = getCleanElementText(lbl);
  }
  if (!candidateText) {
    const aria = cb.getAttribute("aria-label");
    if (aria) candidateText = aria.trim();
  }

  // 3. Fallback: clean text from safe parent row
  if (!candidateText && rowEl) {
    candidateText = getCleanElementText(rowEl);
  }

  if (!extractedId) {
    extractedId = extractStudentId(candidateText) || (rowEl ? extractStudentId(getCleanElementText(rowEl)) : "");
  }

  const displayName = candidateText.length > 1 ? candidateText.slice(0, 68) : `Student #${idx}`;
  const { fullSpeechName, shortSpeechName } = parseSpeechNames(candidateText, displayName);

  return { displayName, studentId: extractedId, fullSpeechName, shortSpeechName };
}

export function scanCheckboxes(invertMode: boolean, anchorEl: HTMLElement | null = null): StudentRow[] {
  clearHighlights();
  const docs = getAccessibleDocuments();
  const collected: RawCheckboxHit[] = [];

  for (const doc of docs) {
    ensureStylesInDoc(doc);
    collectCheckboxesFromRoot(doc, collected);
  }

  let filtered = collected;
  if (anchorEl) {
    const anchorTable = anchorEl.closest("table");
    const anchorTd = anchorEl.closest("td");
    const anchorRect = getVisualTarget(anchorEl).getBoundingClientRect();

    if (anchorTable && anchorTd) {
      const targetColIndex = anchorTd.cellIndex;
      let reachedAnchor = false;
      filtered = collected.filter(({ el }) => {
        if (el === anchorEl) reachedAnchor = true;
        if (!reachedAnchor) return false;
        return el.closest("table") === anchorTable && el.closest("td")?.cellIndex === targetColIndex;
      });
    } else {
      filtered = collected.filter(({ visual }) => {
        const r = visual.getBoundingClientRect();
        return r.top >= anchorRect.top - 10 && Math.abs(r.left - anchorRect.left) < 80;
      });
    }
  }

  return filtered.map(({ el, visual }, idx) => {
    const rowEl = findSafeRowElement(el);
    const { displayName, studentId, fullSpeechName, shortSpeechName } = extractStudentMetadata(
      el,
      rowEl,
      idx + 1
    );
    const checked = isCheckboxChecked(el);
    const initialStatus: RowStatus = checked ? (invertMode ? "absent" : "present") : "pending";

    return {
      checkbox: el,
      visualBox: visual,
      rowEl,
      nameText: displayName,
      studentId,
      fullSpeechName,
      shortSpeechName,
      status: initialStatus
    };
  });
}

export function highlightRows(
  rows: readonly StudentRow[],
  currentIndex: number,
  colorPageRows: boolean,
  shouldScroll = true
): void {
  rows.forEach((item, idx) => {
    const isCurrent = idx === currentIndex;
    item.visualBox?.classList.toggle("ua-cb-active", isCurrent);
    if (item.rowEl) {
      item.rowEl.classList.add("ua-row-jumpable");
      item.rowEl.classList.toggle("ua-row-active", colorPageRows && isCurrent);
      item.rowEl.classList.toggle("ua-row-present", colorPageRows && item.status === "present");
      item.rowEl.classList.toggle("ua-row-absent", colorPageRows && item.status === "absent");
    }
  });

  if (!shouldScroll) return;
  const current = rows[currentIndex];
  const scrollTarget = current?.rowEl || current?.visualBox || current?.checkbox;
  if (scrollTarget) {
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
}

function isElementNode(target: EventTarget | null): target is Element {
  return Boolean(target && typeof target === "object" && (target as Node).nodeType === 1);
}

function isDomNode(target: EventTarget | null): target is Node {
  return Boolean(
    target && typeof target === "object" && typeof (target as Node).nodeType === "number"
  );
}

export function resolvePickCheckboxTarget(eventTarget: EventTarget | null): HTMLElement | null {
  if (!isElementNode(eventTarget)) return null;
  return (
    eventTarget.closest<HTMLElement>('input[type="checkbox"], [role="checkbox"]') ||
    eventTarget.closest(".ui-chkbox")?.querySelector<HTMLElement>('input[type="checkbox"]') ||
    eventTarget.closest("label")?.querySelector<HTMLElement>('input[type="checkbox"]') ||
    null
  );
}

/**
 * Finds the index of the scanned StudentRow containing the clicked DOM target.
 * Cross-realm safe across main document, open Shadow DOMs, and same-origin iframes.
 */
export function findRowIndexForEventTarget(
  rows: readonly StudentRow[],
  eventTarget: EventTarget | null
): number {
  if (!isDomNode(eventTarget)) return -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.rowEl && (row.rowEl === eventTarget || row.rowEl.contains(eventTarget))) {
      return i;
    }
    if (row.visualBox && (row.visualBox === eventTarget || row.visualBox.contains(eventTarget))) {
      return i;
    }
    if (row.checkbox === eventTarget || row.checkbox.contains(eventTarget)) {
      return i;
    }
  }
  return -1;
}
