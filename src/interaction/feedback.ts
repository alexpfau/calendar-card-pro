/**
 * Visual feedback helpers for Calendar Card Pro interactions.
 */

import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// VISUAL INDICATORS
//-----------------------------------------------------------------------------

/**
 * Create a visual hold indicator at pointer position.
 *
 * Fixed positioning and client coordinates use the same viewport coordinate space.
 *
 * @param event - Pointer event that triggered the hold
 * @param config - Card configuration to use for styling
 * @returns The created hold indicator element
 */
export function createHoldIndicator(event: PointerEvent, config: Types.Config): HTMLElement {
  const holdIndicator = document.createElement('div');

  holdIndicator.style.position = 'fixed';
  holdIndicator.style.pointerEvents = 'none';
  holdIndicator.style.borderRadius = '50%';
  holdIndicator.style.backgroundColor = config.accent_color;
  holdIndicator.style.opacity = `${Constants.UI.HOLD_INDICATOR_OPACITY}`;
  holdIndicator.style.transform = 'translate(-50%, -50%) scale(0)';
  holdIndicator.style.transition = `transform ${Constants.TIMING.HOLD_INDICATOR_TRANSITION}ms ease-out`;

  holdIndicator.style.left = event.clientX + 'px';
  holdIndicator.style.top = event.clientY + 'px';

  const isTouchEvent = event.pointerType === 'touch';
  const size = isTouchEvent
    ? Constants.UI.HOLD_INDICATOR.TOUCH_SIZE
    : Constants.UI.HOLD_INDICATOR.POINTER_SIZE;

  holdIndicator.style.width = `${size}px`;
  holdIndicator.style.height = `${size}px`;

  document.body.appendChild(holdIndicator);

  setTimeout(() => {
    holdIndicator.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 10);

  Logger.debug('Created hold indicator');
  return holdIndicator;
}

/**
 * Remove a hold indicator with animation
 *
 * @param indicator - Hold indicator element to remove
 */
export function removeHoldIndicator(indicator: HTMLElement): void {
  indicator.style.opacity = '0';
  indicator.style.transition = `opacity ${Constants.TIMING.HOLD_INDICATOR_FADEOUT}ms ease-out`;

  setTimeout(() => {
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
      Logger.debug('Removed hold indicator');
    }
  }, Constants.TIMING.HOLD_INDICATOR_FADEOUT);
}

/**
 * Where a press was, in viewport coordinates, and how it was made: the event popover opens
 * beside it, and beside the pressed element's box where the press was on one.
 */
export interface PressOrigin {
  readonly x: number;
  readonly y: number;
  readonly pointerType?: string;
  /**
   * What can be seen of the event or button pressed (`originOf`, `eventBox`). A press with no
   * event under it, on a day or an empty slot, has none: the popover opens at its point.
   */
  readonly rect?: { left: number; top: number; right: number; bottom: number };
  /** Open below the box rather than beside it, as for a toolbar button. */
  readonly below?: boolean;
}

/**
 * The widest gap, in pixels, inside an event's text that still reads as one block. Anything
 * past a wider one is a part pinned to the row's far edge, such as a weather badge or a
 * countdown.
 */
const TEXT_GAP_PX = 48;

/** A box in viewport coordinates. */
interface Box {
  left: number;
  right: number;
}

/**
 * Where a block of text ends: the right edge of the boxes that start at its leftmost one and
 * follow each other with no gap wider than `TEXT_GAP_PX`.
 *
 * @param boxes - The text's line boxes, in any order
 * @returns The block's right edge, or undefined for no text
 */
export function textBlockRight(boxes: readonly Box[]): number | undefined {
  const sorted = boxes.filter((box) => box.right > box.left).sort((a, b) => a.left - b.left);
  if (!sorted.length) return undefined;
  let right = sorted[0].right;
  for (const box of sorted.slice(1)) {
    if (box.left > right + TEXT_GAP_PX) break;
    right = Math.max(right, box.right);
  }
  return right;
}

/**
 * Whether a computed background color can be seen: any alpha above 0. A form this cannot read
 * counts as seen, which keeps the event's box.
 *
 * @param color - A computed `background-color`
 * @returns Whether it paints anything
 */
export function paints(color: string): boolean {
  const value = color.trim().toLowerCase();
  if (!value || value === 'transparent') return false;
  const alpha =
    /\/\s*([\d.]+%?)\s*\)$/.exec(value) ??
    /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+%?)\s*\)$/.exec(value);
  if (!alpha) return true;
  const number = Number.parseFloat(alpha[1]);
  return Number.isNaN(number) || number > 0;
}

/**
 * What can be seen of an event, for the popover to open beside it, as macOS opens one beside an
 * event. A tinted event, a grid block or any event under `event_background_opacity`, is a box,
 * and ends where its box does. An untinted one draws no box of its own, so it ends where its
 * text does; an untinted list row's box stretches across the card, far from its words.
 *
 * @param element - The event pressed, or an element inside it
 * @returns Its box, its right edge brought in to the end of its text where it draws no box
 */
export function eventBox(element: Element): NonNullable<PressOrigin['rect']> {
  const rect = element.getBoundingClientRect();
  const box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  const event = element.closest('.event');
  if (!event || paints(getComputedStyle(event).backgroundColor)) return box;
  // Measured from the left only: a right-to-left row keeps its box rather than be anchored at
  // the start of its words, or at a part pinned to its far edge.
  if (getComputedStyle(event).direction === 'rtl') return box;

  const lines: Box[] = [];
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return box;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim()) continue;
    range.selectNodeContents(node);
    for (const line of Array.from(range.getClientRects())) lines.push(line);
  }
  const right = textBlockRight(lines);
  return right === undefined ? box : { ...box, right: Math.min(box.right, right) };
}
