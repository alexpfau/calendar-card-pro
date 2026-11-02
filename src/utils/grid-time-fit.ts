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
 *   1. clock icon, start and end, on one line
 *   2. start and end, on one line
 *   3. start and end, across two lines
 *   4. start
 *   5. nothing
 *
 * Truncation is not a rung. An ellipsis is an honest mark on a title and a false statement
 * inside a clock reading -- "10:00 - 1..." for an event that ends at 12:00 reads as ending
 * at one o'clock. A wrapped row is consistent with that rather than an exception to it: it
 * states the whole reading, and only spends a line doing so. The clock icon is the first
 * thing to go because it repeats what the row's position in the block already says; the end
 * time goes next because a grid block already draws it, as its own bottom edge. Where the
 * end time is not drawn at all, rungs 2, 3 and 4 coincide -- same test, same result -- and
 * the ladder collapses on its own, with no case analysis.
 *
 * There is deliberately no "clock icon and start" rung between 2 and 3, and adding one
 * reintroduces a defect rather than a nicety. An end time is always wider than the icon --
 * " - 12:00" measures 39.1px against the icon's 18px at the shipped type scale -- so a
 * `full - end` test is strictly looser than `full - icon`. A ladder holding both therefore
 * drops the icon, brings it back one rung later, and drops it again, so the icon blinks off
 * and on as a lane narrows. That is not an edge case: measured across 110 real blocks it
 * fired on every one of the 55 that draw an end time, and on none of the 55 that do not.
 *
 * The wrapped rung extends that reasoning rather than contradicting it. It is a wrapped
 * `start and end`, never an `icon and start`, and **there is no wrapped rung that draws the
 * icon** -- however well one measures. A wrapped row carrying the icon needs about 57px,
 * which is *cheaper* than a bare range on one line at 68.98px, so a width-sorted ladder
 * would seat it between rungs 2 and 3 and reproduce the same blink from the other
 * direction: icon off at 87, back on at 69, off again at 57. Ordering by what the row says
 * rather than by what it measures is what keeps the icon monotonic, and yields an invariant
 * stronger than monotonicity:
 *
 *   The icon is drawn if and only if the lane is at least `full - words` wide.
 *
 * That is a function of lane width alone (`words` is a folded countdown's, below). It does
 * not consult the block's height, so it cannot flip-flop along either axis; the height pass
 * can only take the icon away, never bring it back.
 *
 * The wrapped rung costs a line of height, which is a budget the *vertical* pass owns, not
 * this one. So this module stays pure, total and width-only: it grants the wrap whenever
 * width allows, and the caller revokes it where the block cannot pay. Revoking lands on
 * exactly the class set rung 4 would have produced, so a revoked wrap is indistinguishable
 * from never having been offered.
 *
 * Because `wrapped` is `max(start, end - separator space)`, two orderings hold by
 * construction rather than by measurement:
 *
 *   start <= wrapped < bare < full
 *
 * `wrapped >= start` because it is a maximum taken over `start`; `wrapped < bare` because
 * `max(a, b - s) <= a + b - s < a + b`. So no ladder inversion is possible, whatever the
 * locale or the type scale does to the strings. Checked against the corpus anyway: zero
 * violations across 55 rows, in both 24-hour and 12-hour clock modes.
 *
 * A countdown folded into the time ("9:00 - 13:00 · in 4 days") is not part of the reading
 * the ladder protects. Its words flow after the time and break wherever the line runs out, as
 * the weather row's chips do, so every rung leaves them out; only its separator stays in,
 * because the separator is glued to the time before it and must fit on the time's last line.
 * The clock needs room beside the time, not beside the words, so it is drawn wherever the
 * time and separator fit with it. Measured with the words in, a range that fitted its lane
 * was wrapped for a countdown that could never have shared its line anyway, the countdown
 * then started a third line with its dot, and the clock was dropped from rows with room for
 * it.
 *
 * Words that flow onto a line of their own spend height, exactly as the wrap does, so they
 * are granted on the same terms: optimistically, and revoked where the block cannot pay, onto
 * the widest rung that keeps them on the time's line (`gridTimeFallback`). A one-hour block
 * with room for one time line keeps "6:30 PM · in 2 days" rather than losing the whole row to
 * "6:30 PM - 7:30 PM ·" and a second line it cannot show.
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
  /**
   * Width the row needs with the end time on a second line, or 0 where none is drawn.
   *
   * Measured rather than derived. It is `max(start, end - the separator's leading space)`,
   * and that space is a font metric no arithmetic here should be guessing at. A folded
   * countdown's words are not in it.
   */
  wrapped: number;
  /**
   * Width a folded countdown's words take out of `full`, 0 where none is folded in. The words
   * flow after the time, so no rung has to fit them on its line.
   */
  words?: number;
}

/** Which pieces of a time row survive at the widest rung that fits. */
export interface GridTimeFit {
  /** Whether the row is drawn at all. */
  time: boolean;
  /** Whether the clock icon is drawn. */
  icon: boolean;
  /** Whether the end time is drawn. */
  end: boolean;
  /** Whether the end time is drawn on a second line. Never true unless `end` is. */
  wrap: boolean;
}

const HIDDEN: GridTimeFit = { time: false, icon: false, end: false, wrap: false };
/** Rung 4, the start time alone, where a decision the block cannot afford falls back to. */
const START_ONLY: GridTimeFit = { time: true, icon: false, end: false, wrap: false };

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
  /** A countdown folded into the time text, whose words are left out of the widths. */
  countdown: HTMLElement | null;
}

/** Every class this module owns, so a reset need not enumerate them at each call site. */
const FIT_CLASSES = [
  'grid-time-fits',
  'grid-time-no-icon',
  'grid-time-no-end',
  'grid-time-wrap',
] as const;

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
    countdown: time.querySelector<HTMLElement>('.time-text > .time-countdown'),
  };
}

/**
 * The width of a folded countdown's words, without the separator drawn before them.
 *
 * Read off the text through a range, which covers the element's text and not its generated
 * separator. Valid only while the row is sized to its content, where the countdown is one
 * unbroken line.
 *
 * @param target Nodes from `gridTimeTarget`
 * @returns The words' width, 0 where no countdown is folded in
 */
function countdownWordsWidth(target: GridTimeTarget): number {
  if (!target.countdown) return 0;
  const range = target.countdown.ownerDocument.createRange();
  range.selectNodeContents(target.countdown);
  return range.getBoundingClientRect().width;
}

/**
 * How far the start time's line reaches from the row's inline start, for the wrapped shape.
 *
 * Where a countdown is folded in, the wrapped row's width is the wider of its two lines, the
 * second carrying the countdown's words, so taking those words off the width answers for the
 * second line only. The first line is read here so the larger of the two can be kept.
 *
 * @param target Nodes from `gridTimeTarget`
 * @returns The first line's reach, 0 where there is no start text to read
 */
function startLineReach(target: GridTimeTarget): number {
  const start = target.end?.parentElement;
  if (!start || !target.end) return 0;
  const range = start.ownerDocument.createRange();
  range.setStartBefore(start.firstChild ?? target.end);
  range.setEndBefore(target.end);
  const text = range.getBoundingClientRect();
  if (text.width <= 0) return 0;
  const row = target.time.getBoundingClientRect();
  const rtl =
    target.time.ownerDocument.defaultView?.getComputedStyle(target.time).direction === 'rtl';
  return rtl ? row.right - text.left : text.right - row.left;
}

/**
 * What a row needs once a folded countdown's words are left to flow after it: the width it
 * measured less the words, and never less than its first line.
 *
 * @param width The row's width, as measured with the words in
 * @param words The words' width, from `countdownWordsWidth`
 * @param firstLine The first line's reach, for a row on two lines
 * @returns The width the ladder tests
 */
export function withoutCountdownWords(width: number, words: number, firstLine = 0): number {
  return Math.max(firstLine, width - words);
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
export function measureGridTimeCosts(
  target: GridTimeTarget,
  available: number,
  wrapped = 0,
): GridTimeCosts {
  return {
    available,
    full: target.time.getBoundingClientRect().width,
    icon: target.icon ? outerInlineWidth(target.icon) : 0,
    end: target.end ? outerInlineWidth(target.end) : 0,
    wrapped,
    words: countdownWordsWidth(target),
  };
}

/**
 * Put the row into its wrapped shape, so the width it needs there can be read.
 *
 * 🚨 The shape includes `grid-time-no-icon`, and that is the whole correctness of this
 * function rather than an optimization. Rung 3 draws no icon, so a measurement taken with
 * the icon still in the flex row prices a rung the ladder does not have — `icon + wrapped
 * range`, the one shape deliberately excluded because seating it by width makes the icon
 * blink. Measured live on `🧪 QA Window` in a 46px lane: with the icon the row reports
 * 54.14 and the rung fails; without it, 36.14 and the rung fires. The unit tests cannot
 * see this, because they hand `wrapped` to `gridTimeFit` as a number and never build the
 * shape. `openGridTimeWrapMeasurement` and `applyGridTimeFit` must therefore agree on the
 * class set for a wrap, which `tests/grid-time-fit.test.ts` reconciles.
 *
 * Paired with `settleGridTimeWrapMeasurement`, and batched by the caller: every row is put
 * into the shape, then every row is read, then every row is taken back out. Doing it one
 * row at a time would force a layout per block.
 *
 * @param target Nodes from `gridTimeTarget`
 */
export function openGridTimeWrapMeasurement(target: GridTimeTarget): void {
  target.disclosure.classList.add('grid-time-no-icon', 'grid-time-wrap');
}

/**
 * Read what the row needs with its end time on a second line and no icon beside it.
 *
 * Valid only between `openGridTimeWrapMeasurement` and `settleGridTimeWrapMeasurement`.
 * The row is sized to `max-content`, and the wrapped shape puts the end time on a line of its
 * own, so the row's max-content width is the wider of the two lines -- which is precisely the
 * quantity the rung tests against. Confirmed against the browser's own line boxes on 55
 * live rows, in both clock modes. A folded countdown continues the second line, so its words
 * come off that line's width (`withoutCountdownWords`).
 *
 * Zero where the row has no end time to move, so the rung collapses into the one above it.
 *
 * @param target Nodes from `gridTimeTarget`
 * @returns The wrapped row's content width
 */
export function measureGridTimeWrapped(target: GridTimeTarget): number {
  if (!target.end) return 0;
  const width = target.time.getBoundingClientRect().width;
  const words = countdownWordsWidth(target);
  return words > 0 ? withoutCountdownWords(width, words, startLineReach(target)) : width;
}

/**
 * Take the row back out of its wrapped shape, so the decision can be applied cleanly.
 *
 * Removes both classes the open added. `applyGridTimeFit` sets the surviving ones back
 * from the decision, so leaving either behind would let a measurement shape paint.
 *
 * @param target Nodes from `gridTimeTarget`
 */
export function settleGridTimeWrapMeasurement(target: GridTimeTarget): void {
  target.disclosure.classList.remove('grid-time-no-icon', 'grid-time-wrap');
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
  if (fit.wrap) target.disclosure.classList.add('grid-time-wrap');
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
  const { available, full, icon, end, wrapped, words = 0 } = costs;

  if (![available, full, icon, end, wrapped, words].every(Number.isFinite)) return HIDDEN;
  if (available <= 0 || full <= 0) return HIDDEN;

  const budget = available + PRECISION;
  // The range and the separator after it, without the clock or a folded countdown's words,
  // which flow onto the lines after it. The clock needs room beside the range only, so it is
  // drawn wherever the row without those words fits.
  const bare = full - words - icon;

  if (bare + icon <= budget) return { time: true, icon: true, end: true, wrap: false };
  if (bare <= budget) return { time: true, icon: false, end: true, wrap: false };
  // A wrapped rung with nothing to wrap is the rung below it wearing a class, so an
  // unmeasured or absent end time falls straight through rather than granting a wrap that
  // would spend a line of height and draw nothing with it. Note which of the two guards is
  // doing that: with no end time the rung *above* already answers, because `full - icon`
  // and `wrapped` are then the same number -- the row's max-content width is its start
  // time either way. So `end > 0` is unreachable from any real measurement and guards the
  // contract of a total, exported function instead. A mutation sweep reads it as dead code
  // unless it is handed a wrapped width narrower than the start time the row contains;
  // `grid-time-fit.test.ts` carries exactly that fixture, and says why.
  // A wrap the block cannot afford is withdrawn onto the start-only rung below, so the wrap is
  // granted only where that rung fits too. Without a countdown it always does, since the start
  // time is one of the two lines `wrapped` measures; with one, the start time carries the
  // countdown's separator, which may make it the wider.
  const start = bare - end;
  if (end > 0 && wrapped > 0 && Math.max(wrapped, start) <= budget) {
    return { time: true, icon: false, end: true, wrap: true };
  }
  if (start <= budget) return START_ONLY;

  return HIDDEN;
}

/**
 * The decision to fall back on where a block cannot afford the line `fit` spends.
 *
 * Two decisions are made on width and paid for in height, a budget this module cannot see:
 * the wrap, and a folded countdown's words flowing onto a line of their own after the time.
 * The caller grants both optimistically and, where the block's content then overflows,
 * applies this instead. A wrap falls back to rung 4, the start time alone, which always
 * saves its line. Flowing words fall back to the widest rung that keeps them on the time's
 * line -- the range without the clock, or the start time alone. Where neither does, a clock
 * still goes, because it narrows the column the words wrap in and so can cost a line of its
 * own; otherwise no rung is shorter, and the height pass weighs the row against the others,
 * as it does any time row.
 *
 * @param costs The measurements `fit` was decided from
 * @param fit The decision `gridTimeFit` made from them
 * @returns The decision that saves the line, or `null` where none would
 */
export function gridTimeFallback(costs: GridTimeCosts, fit: GridTimeFit): GridTimeFit | null {
  if (fit.wrap) return START_ONLY;
  if (!fit.time) return null;
  const oneLine = gridTimeFit({ ...costs, wrapped: 0, words: 0 });
  const same =
    oneLine.time === fit.time &&
    oneLine.icon === fit.icon &&
    oneLine.end === fit.end &&
    oneLine.wrap === fit.wrap;
  if (same) return null;
  if (oneLine.time) return oneLine;
  return fit.icon ? { time: true, icon: false, end: true, wrap: false } : null;
}

/**
 * Withdraw a decision the block cannot afford, leaving the row where its fallback would have.
 *
 * Called before anything else competes for the height. The resulting class set is exactly
 * the one `applyGridTimeFit` gives the fallback on its own, which is what makes a withdrawn
 * wrap or flow indistinguishable from one that was never offered.
 *
 * @param target Nodes from `gridTimeTarget`
 * @param fallback Decision from `gridTimeFallback`
 */
export function demoteGridTimeFit(target: GridTimeTarget, fallback: GridTimeFit): void {
  target.disclosure.classList.remove(...FIT_CLASSES);
  applyGridTimeFit(target, fallback);
}
