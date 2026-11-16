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

/** What takes focus inside a control. */
const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), ' +
  'select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The first element that takes focus inside an element, through every shadow root below it, in
 * document order, passing over the line under a field.
 *
 * @param root - Where to look
 * @returns The element, or `undefined`
 */
export function firstFocusable(root: Element | ShadowRoot): HTMLElement | undefined {
  for (const child of root.children) {
    // The line under a field holds its Reset and Remove, never what is typed into.
    if (child.matches('.field-line')) continue;
    if (child.matches(FOCUSABLE)) return child as HTMLElement;
    const inside =
      (child.shadowRoot ? firstFocusable(child.shadowRoot) : undefined) ?? firstFocusable(child);
    if (inside) return inside;
  }
  return undefined;
}

/**
 * Puts focus on what the user asked for in order to type into it: the first control inside an
 * element, Home Assistant's included, once its forms have drawn. The element itself takes focus
 * first, so focus is never lost while they draw, and keeps it where no control appears within a
 * second, or where focus has moved on meanwhile.
 *
 * An exception to this module's rule that focus never goes inside a form, as `focusTextBoxSoon`
 * is: Add Calendar and Add Setting are asked for in order to type, and a wrapper takes no typing.
 *
 * @param element - The wrapper, focusable itself
 */
export function focusInto(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  const until = Date.now() + 1000;
  const root = element.getRootNode() as Document | ShadowRoot;
  const step = (): void => {
    if (!element.isConnected || root.activeElement !== element) return;
    const control = firstFocusable(element);
    if (control) {
      control.focus({ preventScroll: true });
      return;
    }
    if (Date.now() < until) requestAnimationFrame(step);
  };
  step();
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
 * The first text box under an element, through every shadow root below it.
 *
 * @param root - Where to look
 * @returns The box, or `undefined`
 */
function textBoxUnder(root: Element | ShadowRoot): HTMLElement | undefined {
  const box = root.querySelector<HTMLElement>('input:not([type="hidden"]), textarea');
  if (box) return box;
  for (const element of root.querySelectorAll('*')) {
    const inner = element.shadowRoot ? textBoxUnder(element.shadowRoot) : undefined;
    if (inner) return inner;
  }
  return undefined;
}

/**
 * Puts focus in the text box a just-added word list holds, an exception to the rule above:
 * adding the list is asking to type in it. Home Assistant draws the box a few frames after the
 * form, so it is looked for each frame for up to a second; until then, and where none ever
 * appears, the wrapper keeps the focus it was given.
 *
 * @param wrapper - The field's wrapper
 */
export function focusTextBoxSoon(wrapper: HTMLElement): void {
  const until = Date.now() + 1000;
  const step = (): void => {
    if (!wrapper.isConnected) return;
    // Focus that moved on, by the user's own hand, is left where it went.
    const active = (wrapper.getRootNode() as ShadowRoot).activeElement;
    if (active !== null && active !== wrapper && !wrapper.contains(active)) return;
    const box = textBoxUnder(wrapper);
    if (box) {
      box.focus({ preventScroll: true });
      return;
    }
    if (Date.now() < until) requestAnimationFrame(step);
  };
  step();
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
 * Keeps an element at the top of what scrolls the editor while what is drawn above it settles:
 * the forms above a field a result opened finish drawing after the move, and push it down. Each
 * frame it is scrolled back to the top, until it has stayed there for five frames, or for at most
 * a second.
 *
 * @param editor - The editor element
 * @param element - What to keep at the top
 */
export function scrollToTopSettled(editor: Element, element: Element): void {
  const until = Date.now() + 1000;
  let still = 0;
  let last = Number.NaN;
  const step = (): void => {
    scrollToTop(editor, element);
    const top = element.getBoundingClientRect().top;
    still = top === last ? still + 1 : 0;
    last = top;
    if (still < 5 && Date.now() < until && element.isConnected) requestAnimationFrame(step);
  };
  step();
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
