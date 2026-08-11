import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import '../src/calendar-card-pro';
import { TIMING } from '../src/config/constants';
import {
  VIEW_SWITCH_HYSTERESIS_PX,
  computeColumnThresholdPx,
  computeColumnThresholdPxFor,
} from '../src/config/view';

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
 * below `min_day_width`. The threshold is bypassed without ever being
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
  hass?: unknown;
  preview?: boolean;
  editMode?: boolean;
  updateEvents(force?: boolean): Promise<void>;
  readonly effectiveView: 'list' | 'column';
  /**
   * The number of columns actually rendered.
   *
   * Read rather than derived, because the density tests below are about the host
   * holding this across measurements — deriving it from width in the test would
   * re-implement the very resolver under test and pass regardless of the wiring.
   */
  _columnCount: number;
  _scheduleWidthMeasurement(widthPx: number): void;
  getGridOptions(): { columns: 'full'; rows: 'auto' };
}

/**
 * Config under test.
 *
 * Not the bare default, and the gutter is pinned rather than inherited. The straddle
 * this file depends on -- transient above the decision edge, settled below it -- has to
 * survive changes to `min_day_width`, the card padding and the default
 * `day_spacing`, none of which this file is about. Pinning the column gutter to 4px
 * puts the decision edge at 476px, comfortably between the two measured widths, so the
 * straddle
 * is deliberate rather than an accident of the current defaults.
 *
 * The edge is *not* the raw threshold: the Schmitt trigger is centred, so a first
 * measurement is judged against threshold + VIEW_SWITCH_HYSTERESIS_PX / 2. Asserting
 * against the raw threshold would leave this file passing while the straddle it needs
 * had already collapsed.
 */
function columnConfig() {
  const config = buildConfig();
  config.view = 'column';
  config.column = { day_spacing: '4px' };
  return config;
}

/** Threshold for the config above: 140 x 3 + 32 padding + 2 x 4 gutter. */
const THRESHOLD = computeColumnThresholdPx(columnConfig());

/** The width a first measurement is actually judged against. */
const ENTER_EDGE = THRESHOLD + VIEW_SWITCH_HYSTERESIS_PX / 2;

/** A width HA reports for one frame before constraining a 1280px-viewport section. */
const TRANSIENT_WIDTH = 500;

/** The width that same section actually settles at. */
const SETTLED_WIDTH = 464;

function mountColumnCard(): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(columnConfig());
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
    // Guards the two tests below against silently losing their point if the minimum
    // column width, the card padding or the hysteresis band changes: both depend on the
    // transient clearing the decision edge while the settled width does not. It has
    // already earned its keep once, catching a 152 -> 140 change that left only 4px
    // between the settled width and the edge.
    expect(THRESHOLD).toBe(460);
    expect(TRANSIENT_WIDTH).toBeGreaterThanOrEqual(ENTER_EDGE);
    expect(SETTLED_WIDTH).toBeLessThan(ENTER_EDGE);
    // Both margins are wide enough that a small future change cannot silently erase the
    // straddle without tripping the two assertions above.
    expect(TRANSIENT_WIDTH - ENTER_EDGE).toBeGreaterThanOrEqual(12);
    expect(ENTER_EDGE - SETTLED_WIDTH).toBeGreaterThanOrEqual(12);
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

  it('crosses the threshold without fetching', async () => {
    // Spec E makes "no fetch on a view transition" an acceptance criterion, and
    // `_handleWidthMeasured`'s docstring cites it -- but nothing pinned it. A
    // transition looks like a state change that needs data, so a later refactor
    // adding `updateEvents()` here would read as a correction rather than a
    // regression. The cost is not theoretical: the observer fires continuously
    // while a window is dragged, so one fetch per transition is a burst of calls
    // against the HA calendar API for a layout change over events already held.
    const card = mountColumnCard();

    const callApi = vi.fn(async () => []);
    card.hass = {
      states: {},
      callApi,
      callService: () => undefined,
      locale: { language: 'en', time_format: '24' },
    };
    document.body.appendChild(card);

    // Let anything the mount itself scheduled run and settle, so the counters below
    // start from zero rather than absorbing startup work. Bounded deliberately: the
    // card holds a recurring refresh interval, so `runAllTimersAsync` never returns.
    await vi.advanceTimersByTimeAsync(TIMING.WIDTH_SETTLE_DELAY * 2);
    const updateEvents = vi.spyOn(card, 'updateEvents');
    callApi.mockClear();

    // Enter column view on a confirmed measurement, then narrow past the exit
    // threshold. Both directions are exercised because they take different branches.
    card._scheduleWidthMeasurement(800);
    await vi.advanceTimersByTimeAsync(TIMING.WIDTH_SETTLE_DELAY);
    expect(card.effectiveView).toBe('column');

    card._scheduleWidthMeasurement(300);
    await vi.advanceTimersByTimeAsync(TIMING.WIDTH_SETTLE_DELAY);

    // The transition has to have actually happened, or this asserts nothing.
    expect(card.effectiveView).toBe('list');
    expect(updateEvents).not.toHaveBeenCalled();
    expect(callApi).not.toHaveBeenCalled();
  });
});

describe('editor preview view resolution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Spec A3-C.4: the card-edit modal is ~480px, which sits at or under the
  // threshold for a default 3-day card. Resolving by measurement there would show
  // a list preview to every user configuring a column card -- the one context
  // where the measured answer is actively unhelpful. The mitigation is a single
  // early return in the `effectiveView` getter, so a refactor collapsing that
  // getter to `return this._effectiveView` would silently reintroduce it.
  for (const flag of ['preview', 'editMode'] as const) {
    it(`renders the selected view under \`${flag}\`, not the measured one`, () => {
      const card = mountColumnCard();
      card[flag] = true;

      // A width narrow enough to force list anywhere else, driven through the real
      // settle path so this cannot pass merely because no measurement ever landed.
      card._scheduleWidthMeasurement(300);
      vi.advanceTimersByTime(TIMING.WIDTH_SETTLE_DELAY);

      expect(card.effectiveView).toBe('column');

      // Control: the identical measurement does flip the view outside the editor,
      // which is what makes the assertion above about the flag rather than the width.
      card[flag] = false;
      expect(card.effectiveView).toBe('list');
    });
  }
});

/**
 * HA sections-grid sizing.
 *
 * Lives in this file rather than with the pure resolvers because `getGridOptions` is a
 * method on the custom element, and this is the only suite that mounts one.
 */
describe('grid options', () => {
  it('claims the full width of its section', () => {
    // Measured against the HA frontend's own source. `hui-grid-section` sets
    // `--grid-column-count: calc(12 * var(--column-span, 1))`, so a card returning
    // `columns: 12` inside a section spanning 3 columns occupies 12 of 36 tracks --
    // exactly one third, which is what the maintainer saw on a live dashboard. The
    // string `full` is not the number 12: it selects a `.full-width` class that sets
    // `grid-column: 1 / -1`, which spans whatever the section actually is.
    const card = mountColumnCard();

    expect(card.getGridOptions()).toEqual({ columns: 'full', rows: 'auto' });
  });

  it('answers identically for a list-view card', () => {
    // Deliberate, and the thing most likely to be "fixed" into a bug later: grid
    // options are the *input* HA uses to size the card, so the width they produce is
    // what the view decision is then made from. Asking `effectiveView` here would be
    // circular, and would answer `list` on first render regardless -- no measurement
    // has landed yet -- so a view-dependent implementation would never return `full`
    // to a card that needs it.
    //
    // Harmless in list view: inside an unspanned section, 12 of 12 tracks and
    // `1 / -1` are the same width. They diverge only where the spanned case needs it.
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ ...buildConfig(), view: 'list' });
    document.body.appendChild(card);

    expect(card.getGridOptions()).toEqual({ columns: 'full', rows: 'auto' });
  });

  it('is present at all, which is what removes HA resize warning', () => {
    // `hui-card-layout-editor` renders its "does not fully support resizing yet"
    // banner when the card's default grid options come back empty -- that is, when
    // the card implements no `getGridOptions` at all. Implementing it is the entire
    // fix; the banner is not keyed on the values.
    const card = mountColumnCard();

    expect(typeof card.getGridOptions).toBe('function');
    expect(Object.keys(card.getGridOptions()).length).toBeGreaterThan(0);
  });
});

/**
 * Column density — reducing the column count instead of abandoning the layout.
 *
 * These drive the real element for the same reason the settling tests above do: the
 * pure resolver is exhaustively covered in `view-config.test.ts`, so what is left to
 * prove is that the host *carries the previous layout forward* between measurements.
 * A host that recomputed from width alone would pass every resolver test and still
 * oscillate on the dashboard.
 *
 * Every config here lowers `min_days_to_show` below `days_to_show`. That is not
 * incidental — at the default the floor equals the ceiling, the staircase collapses to
 * a single step and a test written at defaults exercises none of this machinery while
 * appearing to.
 */

/** Seven days, floor of three, 4px gutter — a five-step staircase. */
function densityConfig(overrides: Record<string, unknown> = {}) {
  const config = buildConfig() as unknown as Record<string, unknown>;
  config.view = 'column';
  config.days_to_show = 7;
  config.column = { day_spacing: '4px', min_days_to_show: 3, ...overrides };
  return config;
}

function mountDensityCard(overrides: Record<string, unknown> = {}): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(densityConfig(overrides));
  document.body.appendChild(card);
  return card;
}

/** Width at which a cold card first accepts `n` columns. */
function enterWidth(n: number): number {
  return computeColumnThresholdPxFor(densityConfig() as never, n) + VIEW_SWITCH_HYSTERESIS_PX / 2;
}

function settle(card: CardUnderTest, widthPx: number): void {
  card._scheduleWidthMeasurement(widthPx);
  vi.advanceTimersByTime(TIMING.WIDTH_SETTLE_DELAY);
}

describe('column density', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('confirms the staircase the tests below depend on', () => {
    // Same role as the straddle guard above: if the gutter, padding or minimum column
    // width moves, these widths stop meaning what the tests claim they mean.
    expect(enterWidth(7)).toBe(1052);
    expect(enterWidth(3)).toBe(476);
    // Steps must be far enough apart that a single measurement cannot skip one by
    // accident, which would make the one-at-a-time assertions vacuous.
    expect(enterWidth(4) - enterWidth(3)).toBe(144);
  });

  it('renders every configured day when there is room', () => {
    const card = mountDensityCard();
    settle(card, 1400);

    expect(card.effectiveView).toBe('column');
    expect(card._columnCount).toBe(7);
  });

  it('drops columns rather than falling back to the list layout', () => {
    const card = mountDensityCard();
    settle(card, 1400);

    // 700px fits four columns (604) but not five (748). Before the density framework
    // this width produced a list card, because the only question asked was whether all
    // seven fitted.
    settle(card, 700);

    expect(card.effectiveView).toBe('column');
    expect(card._columnCount).toBe(4);
  });

  it('holds the floor down to the width where the floor itself stops fitting', () => {
    const card = mountDensityCard();
    settle(card, 1400);
    settle(card, 480);

    expect(card.effectiveView).toBe('column');
    expect(card._columnCount).toBe(3);
  });

  it('falls back to the list layout below the floor by default', () => {
    const card = mountDensityCard();
    settle(card, 1400);
    settle(card, 300);

    expect(card.effectiveView).toBe('list');
    expect(card._columnCount).toBe(0);
  });

  it('cramps below the floor when asked to', () => {
    const card = mountDensityCard({ min_days_fallback: 'cramp' });
    settle(card, 1400);
    settle(card, 300);

    // Three columns in 300px is well under `min_day_width`. That is the whole
    // point of the option: the user has said the grid matters more than legibility.
    expect(card.effectiveView).toBe('column');
    expect(card._columnCount).toBe(3);
  });

  it('carries the previous layout forward, so a width inside the band does not flip', () => {
    // The reason `_columnCount` is held on the host rather than recomputed at render.
    // 1050px is two pixels below the width that *earns* the seventh column but well
    // above the width that loses it, so a card already showing seven must keep it.
    const card = mountDensityCard();
    settle(card, 1400);
    expect(card._columnCount).toBe(7);

    settle(card, 1050);

    expect(card._columnCount).toBe(7);
  });

  it('does not grant a column the card has never been wide enough for', () => {
    // The optimistic seed claims all seven before anything is measured. If that seed
    // were treated as a confirmed layout it would earn the hysteresis band, and the
    // seventh column would survive a first measurement below its enter width. This is
    // the column-count form of the bug `resolveViewOnMeasurement` exists to prevent.
    const card = mountDensityCard();
    expect(card._columnCount).toBe(7);

    settle(card, 1050);

    expect(card._columnCount).toBe(6);
  });
});
