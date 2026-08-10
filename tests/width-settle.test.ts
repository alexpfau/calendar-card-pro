import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import '../src/calendar-card-pro';
import { TIMING } from '../src/config/constants';
import { computeColumnThresholdPx } from '../src/config/view';

/**
 * Width measurement settling.
 *
 * Every other view test in this suite exercises the pure resolvers. This one has to
 * instantiate the real custom element, because the behaviour under test is not a
 * decision — it is *when* the decision is taken, which lives entirely in the host's
 * `ResizeObserver` plumbing.
 *
 * The bug it guards against was measured live in Home Assistant. HA's sections grid
 * lays a card out at its unconstrained width for at least one frame before applying
 * the section's constraint, so a card that settles at 464px is measured at 500px
 * first. Acting on that first measurement lets the card enter column view legitimately
 * at 500px and then *keep* it at 464px via the hysteresis band, rendering columns
 * below `min_day_column_width_px`. The threshold is bypassed without ever being
 * violated by any single comparison, which is why the pure resolvers cannot catch it.
 */

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

/**
 * The card, with only the two private members this file drives exposed.
 *
 * TypeScript's `private` is erased at runtime, so reaching the scheduler directly is
 * legal. It is also the only option: happy-dom has no layout engine, so a real
 * `ResizeObserver` would never fire, and driving `_handleWidthMeasured` instead would
 * bypass the debounce that is the entire subject of these tests.
 */
interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  readonly effectiveView: 'list' | 'column';
  _scheduleWidthMeasurement(widthPx: number): void;
}

/** Threshold for the default config: 152 x 3 + 16 padding + 2 x 4 gutter. */
const THRESHOLD = computeColumnThresholdPx({ ...buildConfig(), view: 'column' });

/** A width HA reports for one frame before constraining a 1280px-viewport section. */
const TRANSIENT_WIDTH = 500;

/** The width that same section actually settles at. */
const SETTLED_WIDTH = 464;

function mountColumnCard(): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ ...buildConfig(), view: 'column' });
  document.body.appendChild(card);
  return card;
}

describe('width measurement settling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('confirms the fixture widths still straddle the threshold', () => {
    // Guards the two tests below against silently losing their point if the default
    // gutter or minimum column width changes: both depend on the transient clearing
    // the threshold while the settled width does not.
    expect(THRESHOLD).toBe(480);
    expect(TRANSIENT_WIDTH).toBeGreaterThanOrEqual(THRESHOLD);
    expect(SETTLED_WIDTH).toBeLessThan(THRESHOLD);
  });

  it('acts on the settled width, not the transient one that precedes it', () => {
    const card = mountColumnCard();

    // Seeded optimistically from the request, before anything has been measured.
    expect(card.effectiveView).toBe('column');

    card._scheduleWidthMeasurement(TRANSIENT_WIDTH);
    card._scheduleWidthMeasurement(SETTLED_WIDTH);

    // Nothing has been acted on yet — the measurements are still arriving.
    expect(card.effectiveView).toBe('column');

    vi.advanceTimersByTime(TIMING.WIDTH_SETTLE_DELAY);

    // Only 464px was ever judged, and as a first measurement it faces the enter
    // threshold with no band. Acting on 500px first would have earned the band and
    // pinned the card to columns at 464px.
    expect(card.effectiveView).toBe('list');
  });

  it('still acts on a width that arrives alone', () => {
    // The debounce must delay the decision, not drop it: a card whose width never
    // changes again produces exactly one callback.
    const card = mountColumnCard();

    card._scheduleWidthMeasurement(SETTLED_WIDTH);
    vi.advanceTimersByTime(TIMING.WIDTH_SETTLE_DELAY);

    expect(card.effectiveView).toBe('list');
  });

  it('grants the hysteresis band to a width that follows a settled one', () => {
    // The complement of the first test, and the reason it cannot simply be fixed by
    // always applying the enter threshold: once a measurement has confirmed the view,
    // a later narrowing within the band must *not* flip it, or the card oscillates.
    const card = mountColumnCard();

    card._scheduleWidthMeasurement(800);
    vi.advanceTimersByTime(TIMING.WIDTH_SETTLE_DELAY);
    expect(card.effectiveView).toBe('column');

    card._scheduleWidthMeasurement(SETTLED_WIDTH);
    vi.advanceTimersByTime(TIMING.WIDTH_SETTLE_DELAY);
    expect(card.effectiveView).toBe('column');
  });

  it('drops a pending measurement when the card leaves the DOM', () => {
    // A timer that survives teardown would call requestUpdate on a disconnected
    // element, and in a dashboard that switches views repeatedly they would accumulate.
    const card = mountColumnCard();

    card._scheduleWidthMeasurement(SETTLED_WIDTH);
    card.remove();

    vi.advanceTimersByTime(TIMING.WIDTH_SETTLE_DELAY);

    // The seeded view survives untouched: the pending decision was discarded, not run.
    expect(card.effectiveView).toBe('column');
  });
});
