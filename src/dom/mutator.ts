import type { StudentRow } from "../shared/types";

function isInputElement(el: HTMLElement): el is HTMLInputElement {
  // Cross-realm safe (works for elements inside same-origin iframes)
  return el.tagName === "INPUT";
}

export function isCheckboxChecked(el: HTMLElement): boolean {
  if (isInputElement(el)) {
    return Boolean(el.checked);
  }
  return el.getAttribute("aria-checked") === "true";
}

/**
 * Universal checkbox mutator supporting:
 * 1. ARIA [role="checkbox"] custom widgets
 * 2. JSF / PrimeFaces .ui-chkbox wrappers
 * 3. React / Vue / Angular controlled <input type="checkbox"> via native prototype setter
 * 4. Plain HTML checkboxes (main document + same-origin iframes)
 */
export function setCheckboxChecked(item: StudentRow | undefined, shouldCheck: boolean): void {
  const cb = item?.checkbox;
  if (!cb || isCheckboxChecked(cb) === shouldCheck) return;

  // 1. ARIA role="checkbox"
  if (!isInputElement(cb)) {
    cb.click();
    return;
  }

  // 2. PrimeFaces wrapper (.ui-chkbox-box)
  const pfBox = cb.closest(".ui-chkbox")?.querySelector<HTMLElement>(".ui-chkbox-box");
  if (pfBox) {
    pfBox.click();
    if (cb.checked === shouldCheck) return;
  }

  // 3. React / Vue / Angular / Native HTML input
  try {
    const win = cb.ownerDocument?.defaultView || window;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      win.HTMLInputElement.prototype,
      "checked"
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(cb, shouldCheck);
    } else {
      cb.checked = shouldCheck;
    }
    cb.dispatchEvent(new Event("click", { bubbles: true }));
    cb.dispatchEvent(new Event("input", { bubbles: true }));
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (_) {
    cb.checked = shouldCheck;
  }
}
