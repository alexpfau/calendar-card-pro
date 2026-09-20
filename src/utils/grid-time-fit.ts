/**
 * Decide how much of a grid block's time row fits across, and drive the degradation.
 *
 * Grid is the only view where a time row can be too narrow for its own text. A block's
 * height is its duration times the hour height and its width is the day width divided by
 * the number of concurrent columns, so the two axes are set by unrelated quantities and a
 * two-hour event is the same 89px tall whether it has the day to itself or shares it with
 * three others. Height alone therefore cannot answer this, and a fixed pixel width cannot
 * either: what the row needs depends on the type scale, on the theme's icon size, on
 * whether the hour has one digit or two, and on whether the locale writes "10:00" or
 * "10:00 AM". Measure it instead.
 *
 * The ladder gives up decoration before content and content before honesty:
 *
 *   1. clock icon, start and end
 *   2. start and end
 *   3. clock icon and start
 *   4. start
 *   5. nothing
 *
 * Truncation is not a rung. An ellipsis is an honest mark on a title and a false statement
 * inside a clock reading -- "10:00 - 1..." for an event that ends at 12:00 reads as ending
 * at one o'clock. The end time is the first content to go because a grid block already
 * draws it, as its own bottom edge; the clock icon goes before that because it repeats what
 * the row's position in the block already says. Where the end time is not drawn at all the
 * ladder collapses to two rungs on its own, with no case analysis: rungs 1 and 3 coincide,
 * as do 2 and 4.
 */

/** Sub-pixel rounding tolerance, matching the title fitter's. No design slack beyond it. */
const PRECISION = 1 / 64;

/** What one time row costs, in the order the ladder gives the pieces up. */
export interface GridTimeCosts {
  /** Content-box width the row has to lay out in. */
  available: number;
  /** Width the row needs with everything drawn. */
  full: number;
  /** Width the clock icon and its margin take out of `full`. */
  icon: number;
  /** Width the end time and its separator take out of `full`, or 0 where none is drawn. */
  end: number;
}

/** Which pieces of a time row survive at the widest rung that fits. */
export interface GridTimeFit {
  /** Whether the row is drawn at all. */
  time: boolean;
  /** Whether the clock icon is drawn. */
  icon: boolean;
  /** Whether the end time is drawn. */
  end: boolean;
}

const HIDDEN: GridTimeFit = { time: false, icon: false, end: false };

/** The nodes one block's time row is measured and degraded through. */
export interface GridTimeTarget {
  /** Carries the classes, because the title clamp rides on the same decision. */
  disclosure: HTMLElement;
  /** The row itself: its content box is the width to fit into. */
  time: HTMLElement;
  /** The clock icon, absent when the theme or the row shape has none. */
  icon: HTMLElement | null;
  /** The end time and its separator, absent unless this shape has a droppable one. */
  end: HTMLElement | null;
}

/** Every class this module owns, so a reset need not enumerate them at each call site. */
const FIT_CLASSES = ['grid-time-fits', 'grid-time-no-icon', 'grid-time-no-end'] as const;

/**
 * Read the time-row nodes of one timed grid block.
 *
 * @param block A `.grid-event` element
 * @returns The nodes to measure, or `null` where this block draws no time row
 */
export function gridTimeTarget(block: HTMLElement): GridTimeTarget | null {
  const disclosure = block.querySelector<HTMLElement>('.grid-event-disclosure');
  const time = disclosure?.querySelector<HTMLElement>('.time');
  if (!disclosure || !time) return null;

  return {
    disclosure,
    time,
    icon: time.querySelector<HTMLElement>('.time-actual > ha-icon'),
    end: time.querySelector<HTMLElement>('.time-end'),
  };
}

/**
 * Clear the previous decision and reveal the row, so it can be measured at all.
 *
 * The row is `display: none` until something reveals it, and a hidden element has no boxes
 * to read. Revealing it inline is safe because nothing between this and the restore paints:
 * the whole pass runs inside one animation frame.
 *
 * @param target Nodes from `gridTimeTarget`
 */
export function prepareGridTimeMeasurement(target: GridTimeTarget): void {
  target.disclosure.classList.remove(...FIT_CLASSES);
  target.time.style.display = 'block';
}

/**
 * Read the width the row has, before anything is sized to its content.
 *
 * Separate from `measureGridTimeCosts` so a caller can batch this read across every block
 * before the write that the second read depends on.
 *
 * @param target Nodes from `gridTimeTarget`
 * @returns The row's content-box width
 */
export function measureGridTimeAvailable(target: GridTimeTarget): number {
  return target.time.clientWidth;
}

/**
 * Size the row to its content, so nothing in it is shrunk or wrapped by the space it has.
 *
 * Without this every measurement below is a reading of the constraint rather than of the
 * need: the row's children are flex items with `min-width: 0`, so they shrink to whatever
 * is available and report that they fit. Comparing `scrollWidth` with `clientWidth` fails
 * for the same reason, and returns "fits" for rows that visibly do not.
 *
 * @param target Nodes from `gridTimeTarget`
 */
export function releaseGridTimeWidth(target: GridTimeTarget): void {
  target.time.style.width = 'max-content';
}

/**
 * Read what the row needs and what each droppable piece of it costs.
 *
 * Valid only between `releaseGridTimeWidth` and `applyGridTimeFit`.
 *
 * @param target Nodes from `gridTimeTarget`
 * @param available Width from `measureGridTimeAvailable`
 * @returns Costs for `gridTimeFit`
 */
export function measureGridTimeCosts(target: GridTimeTarget, available: number): GridTimeCosts {
  return {
    available,
    full: target.time.getBoundingClientRect().width,
    icon: target.icon ? outerInlineWidth(target.icon) : 0,
    end: target.end ? outerInlineWidth(target.end) : 0,
  };
}

/**
 * Restore the row and record the decision.
 *
 * The classes are positive — a row is revealed by fitting rather than hidden by failing to
 * — so the title clamp that rides on the same rung needs no separate undo. Where nothing
 * fits, no class is set and both the row and the clamp are exactly where CSS left them.
 *
 * @param target Nodes from `gridTimeTarget`
 * @param fit Decision from `gridTimeFit`
 */
export function applyGridTimeFit(target: GridTimeTarget, fit: GridTimeFit): void {
  target.time.style.removeProperty('display');
  target.time.style.removeProperty('width');

  if (!fit.time) return;

  target.disclosure.classList.add('grid-time-fits');
  if (!fit.icon) target.disclosure.classList.add('grid-time-no-icon');
  if (!fit.end) target.disclosure.classList.add('grid-time-no-end');
}

/** An element's own width plus the horizontal margins that go with it when it is dropped. */
function outerInlineWidth(element: HTMLElement): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const margins = style
    ? (Number.parseFloat(style.marginLeft) || 0) + (Number.parseFloat(style.marginRight) || 0)
    : 0;
  return element.getBoundingClientRect().width + margins;
}

/**
 * Pick the widest rung of the ladder that fits.
 *
 * Pure and total: a non-finite or non-positive measurement yields the hidden rung rather
 * than an exception, because a block that has not been laid out has not been measured and
 * guessing in either direction would be worse than waiting for the next pass.
 *
 * @param costs What the row needs and what each droppable piece of it takes
 * @returns The pieces to draw
 */
export function gridTimeFit(costs: GridTimeCosts): GridTimeFit {
  const { available, full, icon, end } = costs;

  if (![available, full, icon, end].every(Number.isFinite)) return HIDDEN;
  if (available <= 0 || full <= 0) return HIDDEN;

  const budget = available + PRECISION;

  if (full <= budget) return { time: true, icon: true, end: true };
  if (full - icon <= budget) return { time: true, icon: false, end: true };
  if (full - end <= budget) return { time: true, icon: true, end: false };
  if (full - icon - end <= budget) return { time: true, icon: false, end: false };

  return HIDDEN;
}
