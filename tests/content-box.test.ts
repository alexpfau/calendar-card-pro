/**
 * Where a box's text lays out along the inline axis (`src/utils/content-box.ts`).
 *
 * The boxes that cut their text at their inline edges keep room there, padding given back by a
 * negative margin ("Marks above and below the line" in styles.ts), so their border box is wider
 * than the space their text has. The fitters read these instead; this pins what they read.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { inlineContentBox, inlineContentWidth } from '../src/utils/content-box';

afterEach(() => document.body.replaceChildren());

function box(style: string, rect: DOMRect): HTMLElement {
  const element = document.createElement('div');
  element.style.cssText = style;
  element.getBoundingClientRect = () => rect;
  document.body.append(element);
  return element;
}

describe('inlineContentBox', () => {
  it('returns a box with no inline padding or border as it was read', () => {
    const rect = new DOMRect(10, 20, 100, 16);
    expect(inlineContentBox(box('', rect))).toBe(rect);
  });

  it('brings both inline sides in by the padding and the border, and keeps the block axis', () => {
    const element = box(
      'width: 100px; padding: 3px 2px 5px 1.75px; border-left: 1px solid; border-right: 0',
      new DOMRect(8.25, 20, 104.75, 16),
    );
    const content = inlineContentBox(element);
    expect([content.left, content.right, content.top, content.height]).toEqual([11, 111, 20, 16]);
  });

  it("reads a scaled card in the page's pixels", () => {
    // 100px of content and 2px either side drawn at twice the size, as a scaled ancestor does.
    const element = box('width: 100px; padding: 0 2px', new DOMRect(0, 0, 208, 32));
    const content = inlineContentBox(element);
    expect([content.left, content.width]).toEqual([4, 200]);
  });

  it('takes the rectangle a caller has read already', () => {
    const element = box('width: 100px; padding: 0 2px', new DOMRect(0, 0, 1, 1));
    expect(inlineContentBox(element, new DOMRect(50, 0, 104, 10)).left).toBe(52);
  });
});

describe('inlineContentWidth', () => {
  it('is the used content width, not clientWidth less the padding', () => {
    // clientWidth is a whole number of pixels and the room is not: 100.4px of content and
    // 1.75px either side report 104, which less the padding is half a pixel too wide.
    const element = box('width: 100.4px; padding: 0 1.75px', new DOMRect());
    Object.defineProperty(element, 'clientWidth', { value: 104 });
    expect(inlineContentWidth(element)).toBe(100.4);
  });

  it('takes the padding and border off a border-box width', () => {
    const element = box(
      'box-sizing: border-box; width: 104px; padding: 0 1.5px; border: 0 solid; border-left-width: 1px',
      new DOMRect(),
    );
    expect(inlineContentWidth(element)).toBe(100);
  });

  it('falls back to clientWidth less the padding for a box with no width in pixels', () => {
    const element = box('padding: 0 1.75px 0 2px', new DOMRect());
    Object.defineProperty(element, 'clientWidth', { value: 103.75 });
    expect(inlineContentWidth(element)).toBe(100);
  });
});
