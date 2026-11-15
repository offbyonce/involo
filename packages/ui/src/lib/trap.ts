// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift Tab inside `node` (a menu, picker or sheet over the page) while `on`. */
export function trapFocus(node: HTMLElement, on: boolean = true) {
  let active = on;
  function key(e: KeyboardEvent): void {
    if (!active || e.key !== "Tab") return;
    const all = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    const first = all[0];
    const last = all[all.length - 1];
    if (!first || !last) return;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || !node.contains(at))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (at === last || !node.contains(at))) {
      e.preventDefault();
      first.focus();
    }
  }
  document.addEventListener("keydown", key);
  return {
    update(next: boolean) {
      active = next;
    },
    destroy() {
      document.removeEventListener("keydown", key);
    },
  };
}
