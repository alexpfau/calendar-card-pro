/**
 * Where a box's text lays out along the inline axis.
 *
 * The boxes that cut their text at their inline edges keep room there for marks and glyphs that
 * lean past them: padding, given back by a negative margin of the same size ("Marks above and
 * below the line" in styles.ts). Their border box, and so `getBoundingClientRect()` and
 * `clientWidth`, is that much wider on each side than the space their text has. Script that
 * compares one of them with text, a label or the room left on a line reads these instead.
 */

/** A px value of a computed style, or 0. */
function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

function styleOf(element: Element): CSSStyleDeclaration {
  return (element.ownerDocument.defaultView ?? window).getComputedStyle(element);
}

/**
 * A box's border box with its inline sides brought in to its content box.
 *
 * In the page's pixels, as the rectangle is: lengths come in the card's own and are scaled to
 * it, so a card an ancestor scales or zooms is read like any other. A box with no inline padding
 * or border comes back as it was read.
 *
 * @param element - The box
 * @param rect - Its border box, where the caller has read it already
 * @returns The box from its content's inline start to its content's inline end
 */
export function inlineContentBox(
  element: Element,
  rect: DOMRect = element.getBoundingClientRect(),
): DOMRect {
  const style = styleOf(element);
  const left = px(style.borderLeftWidth) + px(style.paddingLeft);
  const right = px(style.borderRightWidth) + px(style.paddingRight);
  if (left === 0 && right === 0) return rect;
  // An unlaid-out box reports no width in pixels, and is read at the scale of 1.
  const width = Number.parseFloat(style.width);
  const borderBox = !Number.isFinite(width)
    ? 0
    : style.boxSizing === 'border-box'
      ? width
      : width + left + right;
  const scale = borderBox > 0 && rect.width > 0 ? rect.width / borderBox : 1;
  return new DOMRect(
    rect.left + left * scale,
    rect.top,
    Math.max(0, rect.width - (left + right) * scale),
    rect.height,
  );
}

/**
 * `clientWidth` less the box's inline padding: the width its text has, in the card's own pixels.
 *
 * @param element - The box
 * @returns Its content-box width
 */
export function inlineContentWidth(element: HTMLElement): number {
  const style = styleOf(element);
  return element.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
}
