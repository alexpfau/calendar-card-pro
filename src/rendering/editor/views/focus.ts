/**
 * Where focus goes as the editor moves, by the rule every move follows: a card-owned element,
 * never anything inside a form. `ha-form.focus()` and `ha-selector.focus()` do nothing, and
 * focusing a native control five shadow roots down would open a phone's keyboard and send the
 * next Ctrl+Z to the input rather than the editor (`spike/ha-probe.md` §4).
 */

import { scrollContainer } from './scroll';

/**
 * Focuses the first element a selector finds, without scrolling to it.
 *
 * @param root - Where to look
 * @param selectors - Candidates, best first
 * @returns The element focused, or `undefined` when none was found
 */
export function focusFirst(
  root: ParentNode,
  selectors: ReadonlyArray<string>,
): HTMLElement | undefined {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) {
      element.focus({ preventScroll: true });
      return element;
    }
  }
  return undefined;
}

/**
 * The selector for the control a `data-focus` key names.
 *
 * @param key - The key
 * @returns The selector
 */
export function byFocusKey(key: string): string {
  return `[data-focus="${CSS.escape(key)}"]`;
}

/**
 * Scrolls the editor so an element sits at the top of what scrolls it, by arithmetic rather
 * than `scrollIntoView`, which would scroll every ancestor, Home Assistant's dialog included.
 *
 * @param editor - The editor element
 * @param element - What to bring to the top
 */
export function scrollToTop(editor: Element, element: Element): void {
  const container = scrollContainer(editor);
  if (container === undefined) return;
  // The document's own scroller measures from the viewport, which its rectangle does not.
  const top =
    container === editor.ownerDocument.scrollingElement ? 0 : container.getBoundingClientRect().top;
  container.scrollTop += element.getBoundingClientRect().top - top;
}

/**
 * Where the editor's scroll container stands.
 *
 * @param editor - The editor element
 * @returns Its `scrollTop`, 0 where nothing scrolls
 */
export function scrollPosition(editor: Element): number {
  return scrollContainer(editor)?.scrollTop ?? 0;
}

/**
 * Restores the editor's scroll container to a position.
 *
 * @param editor - The editor element
 * @param top - The `scrollTop` to restore
 */
export function restoreScroll(editor: Element, top: number): void {
  const container = scrollContainer(editor);
  if (container !== undefined) container.scrollTop = top;
}
