/**
 * How far below an event another must start before the cascade may draw it on top.
 *
 * `layoutCascade` in `grid.ts` takes this threshold in minutes and knows nothing else
 * about it, because that module deliberately knows no pixels. But what the threshold
 * protects is pixels: the uncovered strip above a nested event is all the room its host
 * has for its title, and how many minutes buy one title row depends on how tall an hour is
 * on screen and how large the type is. Neither can be read from the configuration — an
 * hour can be `4em`, a fixed card height compresses the axis, and a theme can change the
 * font — so the host measures them after a render and this module turns the measurement
 * into minutes.
 *
 * A fixed number of minutes was tried first and fails in both directions. Thirty minutes
 * at a compressed 30px hour leaves a host 15px of headroom, and its title went blank; sixty
 * keeps every host's time row at the default scale but stops nesting most of the events the
 * cascade exists for. So the rule protects one title row, at whatever scale the card is
 * drawn, and never drops below the half hour that makes two events "start together".
 */

/** Below this, two events start together, and go side by side at any scale. */
export const CASCADE_THRESHOLD_FLOOR_MIN = 30;

/** Thresholds are rounded up to this, so small measurement noise cannot move them. */
export const CASCADE_THRESHOLD_STEP_MIN = 5;

/**
 * Headroom one title row needs at the default type, in CSS pixels.
 *
 * 24px is what thirty minutes gives at the default 48px hour, which is where the floor
 * already sits — so at the shipped defaults the measurement changes nothing.
 */
const BASE_HEADROOM_PX = 24;

/**
 * The block's own vertical chrome at the defaults: 2px padding above and below, a 1px gap
 * above and below, and the 1px hour rule its upper edge clears. A thicker rule or wider gap
 * is headroom the title does not get, so anything past this is added on.
 */
const DEFAULT_CHROME_PX = 7;

/**
 * How far past a step boundary the scale must move before the threshold drops a step.
 *
 * Raising is immediate, because a threshold that is too low blanks titles. Lowering only
 * costs width, so it waits until the measurement is clearly on the other side — a card
 * being resized across a boundary would otherwise flip layouts back and forth.
 */
const LOWERING_HYSTERESIS_MIN = 2;

/** Measurement noise a reading may carry without moving it up a step. */
const ROUNDING_SLACK_MIN = 0.05;

/** What the host measures; see {@link measureCascadeThreshold}. */
export interface CascadeScale {
  /** Height of one day's time body, in CSS pixels. */
  bodyHeightPx: number;

  /** Computed event title font size, in CSS pixels. */
  fontPx: number;

  /** A block's vertical padding plus the gaps it keeps above and below, in CSS pixels. */
  chromePx: number;
}

/**
 * Convert a measured scale into the cascade threshold, in minutes.
 *
 * The headroom is one title row: at least {@link BASE_HEADROOM_PX}, and twice the font
 * size once the type is larger than the default, which also covers emoji and the 1em
 * calendar label icons and pictures beside a title. It is never below the floor, and it is
 * never capped from above: on a card compressed so far that no host could show a title
 * above anything nested in it, the threshold passes the band's length and the day simply
 * draws side by side. Capped at one minute past the band so the number stays meaningful.
 *
 * @param scale - The measured scale, or `null` before anything was measured
 * @param bandMinutes - Length of the visible band
 * @param current - The threshold in use, for hysteresis; omit on a first measurement
 * @returns The threshold to lay out with, in minutes
 */
export function cascadeThresholdMin(
  scale: CascadeScale | null,
  bandMinutes: number,
  current?: number,
): number {
  const fallback = current ?? CASCADE_THRESHOLD_FLOOR_MIN;

  if (
    !scale ||
    !Number.isFinite(bandMinutes) ||
    bandMinutes <= 0 ||
    !Number.isFinite(scale.bodyHeightPx) ||
    scale.bodyHeightPx <= 0 ||
    !Number.isFinite(scale.fontPx) ||
    scale.fontPx <= 0 ||
    !Number.isFinite(scale.chromePx)
  ) {
    return fallback;
  }

  const pxPerMinute = scale.bodyHeightPx / bandMinutes;
  const headroomPx =
    Math.max(BASE_HEADROOM_PX, 2 * scale.fontPx) + Math.max(0, scale.chromePx - DEFAULT_CHROME_PX);
  const raw = headroomPx / pxPerMinute;
  const bucket = (minutes: number): number =>
    Math.min(
      bandMinutes + 1,
      Math.max(
        CASCADE_THRESHOLD_FLOOR_MIN,
        Math.ceil((minutes - ROUNDING_SLACK_MIN) / CASCADE_THRESHOLD_STEP_MIN) *
          CASCADE_THRESHOLD_STEP_MIN,
      ),
    );
  const next = bucket(raw);

  if (current === undefined || next >= current) {
    return next;
  }

  const lowered = bucket(raw + LOWERING_HYSTERESIS_MIN);

  return lowered < current ? lowered : current;
}

/**
 * Measure the scale a grid is drawn at.
 *
 * One hidden probe, appended to a day body and removed again before returning, resolves
 * the two values that only exist as custom properties: the event font size and the gaps a
 * block keeps. The padding is read off a rendered block, so it follows the stylesheet
 * rather than restating it. Layout pixels throughout (`clientHeight`, computed styles),
 * never `getBoundingClientRect`, so a transformed card compares like with like.
 *
 * @param root - The card's render root
 * @returns The scale, or `null` when there is no grid with a block to measure
 */
export function measureCascadeThreshold(root: ParentNode): CascadeScale | null {
  const body = root.querySelector<HTMLElement>('.grid-day-body');
  const block = root.querySelector<HTMLElement>('.grid-event:not(.grid-event-overflow)');

  if (!body || !block || body.clientHeight <= 0) {
    return null;
  }

  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;inset-inline-start:0;top:0;' +
    'width:0;font-size:var(--calendar-card-font-size-event);' +
    'height:calc(2 * var(--calendar-card-grid-event-gap, 1px) + ' +
    'var(--calendar-card-grid-rule-width, 1px));';
  body.appendChild(probe);

  try {
    const fontPx = Number.parseFloat(getComputedStyle(probe).fontSize);
    const gapsPx = Number.parseFloat(getComputedStyle(probe).height) || 0;
    const blockStyle = getComputedStyle(block);
    const paddingPx =
      (Number.parseFloat(blockStyle.paddingTop) || 0) +
      (Number.parseFloat(blockStyle.paddingBottom) || 0);

    return { bodyHeightPx: body.clientHeight, fontPx, chromePx: gapsPx + paddingPx };
  } finally {
    probe.remove();
  }
}
