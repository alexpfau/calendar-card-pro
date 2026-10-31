/**
 * How wide the `+N` strip is drawn, as a share of the day column.
 *
 * `layoutLanes` and `layoutCascade` in `grid.ts` take the strip's width as a percentage of
 * the day column and know nothing else about it, because that module deliberately knows no
 * pixels. But what the strip has to hold is a count such as `+3` in the label's font, and
 * that is a length in pixels: a share fixed in advance is too narrow for the count in a week
 * of narrow columns, and far wider than it in a card showing one day. So the host measures
 * the column and the label after a render, and this module turns the measurement into the
 * share — the arrangement `grid-cascade-threshold.ts` uses for the cascade's threshold.
 */

/** The strip at the default 12px label: room for a two-digit count, its border and gaps. */
export const OVERFLOW_STRIP_PX = 28;

/** The label size {@link OVERFLOW_STRIP_PX} was chosen at: the default `time_font_size`. */
const BASE_LABEL_FONT_PX = 12;

/** What the host measures; see {@link measureOverflowStrip}. */
export interface OverflowStripScale {
  /** Width of one day column, in CSS pixels. */
  dayWidthPx: number;

  /** Computed font size of the `+N` label, in CSS pixels. */
  labelFontPx: number;
}

/**
 * Convert a measured scale into the strip's preferred width, as a percentage of the day
 * column.
 *
 * The strip widens with a label drawn larger than the default, and never narrows below
 * {@link OVERFLOW_STRIP_PX}. `overflowStripWidth` in `grid.ts` then bounds it by the region
 * it sits in, so this is a preference rather than a promise.
 *
 * The share in use is kept unless the strip drawn at it would come out at least a pixel
 * off. A resize changes the column's width on every frame, and redrawing the whole card for
 * a strip that would move by a fraction of a pixel would buy nothing.
 *
 * @param scale - The measured scale, or `null` when there was nothing to measure
 * @param current - The share in use; `Infinity` before anything was measured
 * @returns The share to lay out with
 */
export function overflowStripPct(scale: OverflowStripScale | null, current: number): number {
  if (!scale || !(scale.dayWidthPx > 0) || !(scale.labelFontPx > 0)) {
    return current;
  }

  const stripPx = OVERFLOW_STRIP_PX * Math.max(1, scale.labelFontPx / BASE_LABEL_FONT_PX);

  if (Number.isFinite(current) && Math.abs((current / 100) * scale.dayWidthPx - stripPx) < 1) {
    return current;
  }

  return (stripPx / scale.dayWidthPx) * 100;
}

/**
 * Measure what the strip's width depends on.
 *
 * Read off a rendered label, so there is nothing to measure, and nothing to redraw, until a
 * day has events it cannot draw. One column stands for all of them, because the day tracks
 * share the width equally. Layout pixels (`clientWidth`, computed styles), never
 * `getBoundingClientRect`, so a transformed card compares like with like.
 *
 * @param root - The card's render root
 * @returns The scale, or `null` when no strip is on screen to measure
 */
export function measureOverflowStrip(root: ParentNode): OverflowStripScale | null {
  const label = root.querySelector<HTMLElement>('.grid-event-overflow-label');
  const body = label?.closest<HTMLElement>('.grid-day-body');

  if (!label || !body || body.clientWidth <= 0) {
    return null;
  }

  return {
    dayWidthPx: body.clientWidth,
    labelFontPx: Number.parseFloat(getComputedStyle(label).fontSize),
  };
}
