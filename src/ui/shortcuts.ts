import { getAccessibleDocuments } from "../dom/documents";

export interface ShortcutCallbacks {
  isClosed: () => boolean;
  isPickingFirstBox: () => boolean;
  isJumpMode: () => boolean;
  hasRows: () => boolean;
  isRunning: () => boolean;
  onCancelPick: () => void;
  onCancelJump: () => void;
  onToggleRun: () => void;
  onPresent: () => void;
  onAbsent: () => void;
  onPrev: () => void;
  onRepeat: () => void;
  onPause: () => void;
}

const NON_BLOCKING_INPUT_TYPES = new Set(["checkbox", "button", "submit", "reset"]);

function isTypingOrControlElement(el: EventTarget | null): boolean {
  if (!el || typeof el !== "object" || (el as Node).nodeType !== 1) return false;
  const htmlEl = el as HTMLElement;
  const tag = htmlEl.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT" || Boolean(htmlEl.isContentEditable)) {
    return true;
  }
  if (tag === "INPUT") {
    const inputType = ((htmlEl as HTMLInputElement).type || "text").toLowerCase();
    return !NON_BLOCKING_INPUT_TYPES.has(inputType);
  }
  return false;
}

export interface ShortcutBinding {
  syncDocuments: () => void;
  dispose: () => void;
}

/**
 * Registers HUD keyboard shortcuts across the main document and accessible same-origin
 * iframes with Shadow-DOM-aware focus filtering (text/range inputs stay editable while
 * focused checkboxes do not block attendance arrows).
 */
export function bindKeyboardShortcuts(
  shadowRoot: ShadowRoot,
  callbacks: ShortcutCallbacks
): ShortcutBinding {
  const attachedDocs = new Set<Document>();

  const onKeyDown = (e: KeyboardEvent): void => {
    if (callbacks.isClosed()) return;

    const ownerDoc =
      e.currentTarget && (e.currentTarget as Node).nodeType === 9
        ? (e.currentTarget as Document)
        : document;
    const deepTarget = (e.composedPath?.()[0] as EventTarget | undefined) ?? e.target;

    if (
      isTypingOrControlElement(deepTarget) ||
      isTypingOrControlElement(ownerDoc.activeElement) ||
      isTypingOrControlElement(shadowRoot.activeElement)
    ) {
      return;
    }

    if (e.code === "Escape") {
      if (callbacks.isPickingFirstBox()) {
        e.preventDefault();
        callbacks.onCancelPick();
        return;
      }
      if (callbacks.isJumpMode()) {
        e.preventDefault();
        callbacks.onCancelJump();
        return;
      }
    }

    if (e.code === "Space" && e.altKey) {
      e.preventDefault();
      callbacks.onToggleRun();
      return;
    }

    if (!callbacks.hasRows()) return;

    if (e.code === "ArrowRight") {
      e.preventDefault();
      callbacks.onPresent();
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      callbacks.onAbsent();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      callbacks.onPrev();
    } else if (e.code === "ArrowUp") {
      e.preventDefault();
      callbacks.onRepeat();
    } else if (e.code === "Space" && callbacks.isRunning()) {
      e.preventDefault();
      callbacks.onPause();
    }
  };

  const syncDocuments = (): void => {
    for (const doc of getAccessibleDocuments()) {
      if (attachedDocs.has(doc)) continue;
      try {
        doc.addEventListener("keydown", onKeyDown, true);
        attachedDocs.add(doc);
      } catch (_) {}
    }
  };

  const dispose = (): void => {
    for (const doc of attachedDocs) {
      try {
        doc.removeEventListener("keydown", onKeyDown, true);
      } catch (_) {}
    }
    attachedDocs.clear();
  };

  syncDocuments();
  return { syncDocuments, dispose };
}
