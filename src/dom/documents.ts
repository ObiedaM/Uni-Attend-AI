import { HIGHLIGHT_CSS, STYLE_ID } from "../shared/constants";

export function ensureStylesInDoc(doc: Document | null | undefined): void {
  try {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = HIGHLIGHT_CSS;
    (doc.head || doc.documentElement).appendChild(style);
  } catch (_) {}
}

function collectDocumentsRecursive(rootDoc: Document, out: Document[], visited: Set<Document>): void {
  if (visited.has(rootDoc)) return;
  visited.add(rootDoc);
  out.push(rootDoc);

  const iframes = rootDoc.querySelectorAll("iframe");
  for (const frame of iframes) {
    try {
      const childDoc = frame.contentDocument;
      if (childDoc && childDoc.body) {
        collectDocumentsRecursive(childDoc, out, visited);
      }
    } catch (_) {
      // Cross-origin iframe — safely skipped
    }
  }
}

export function getAccessibleDocuments(): Document[] {
  const docs: Document[] = [];
  collectDocumentsRecursive(document, docs, new Set<Document>());
  return docs;
}

export function clearHighlights(): void {
  for (const doc of getAccessibleDocuments()) {
    try {
      doc.body?.classList.remove("ua-jump-mode");
      doc
        .querySelectorAll(
          ".ua-cb-active, .ua-row-active, .ua-row-present, .ua-row-absent, .ua-row-jumpable"
        )
        .forEach((el) => {
          el.classList.remove(
            "ua-cb-active",
            "ua-row-active",
            "ua-row-present",
            "ua-row-absent",
            "ua-row-jumpable"
          );
        });
    } catch (_) {}
  }
}
