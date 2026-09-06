import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';

/**
 * The plumbing between the browser's `ResizeObserver` and the width scheduler.
 *
 * `width-settle.test.ts` covers everything downstream of `_scheduleWidthMeasurement`,
 * and says plainly why it enters there: happy-dom has no layout engine, so a real
 * `ResizeObserver` never fires. That is true, and it left the wiring *above* the
 * scheduler with no coverage at all -- the part that decides the card is observed in
 * the first place, and that a delivered entry becomes a measurement.
 *
 * A mutation sweep put numbers on it. Removing `observe(this)`, removing the
 * `_startWidthObserver()` call from `connectedCallback`, reading `entries[1]` instead
 * of `entries[0]`, and dropping the `requestUpdate()` that follows a layout change all
 * left the full suite green. Any one of them severs the responsive column view
 * completely: the card would size itself once from its configuration and then ignore
 * every resize for the rest of its life.
 *
 * No layout engine is needed to close that gap. A recording stand-in for
 * `ResizeObserver` proves the card asks to be observed, and lets the observer's own
 * callback be invoked with a synthetic entry -- which is exactly the boundary the
 * browser crosses and the one nothing was checking.
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

const fetchEventData = vi.hoisted(() => vi.fn());
vi.mock('../src/utils/events', async () => {
  const actual = await vi.importActual<typeof import('../src/utils/events')>('../src/utils/events');
  return { ...actual, fetchEventData };
});

await import('../src/calendar-card-pro');

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  readonly effectiveView: 'list' | 'column';
  _columnCount: number;
  _measuredWidthPx: number | null;
  _holdTriggered: boolean;
  _handlePointerDown(event: PointerEvent): void;
  _holdIndicator: HTMLElement | null;
  _lastUpdateTime: number;
  isInitialLoad: boolean;
  updateEvents(force?: boolean): Promise<void>;
  readonly updateComplete: Promise<boolean>;
  _startWidthObserver(): void;
}

type Entry = { contentRect: { width: number } };

/** Records what the card asks of the observer, and hands back its callback. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];

  readonly observed: Element[] = [];
  disconnected = false;

  constructor(readonly callback: (entries: Entry[]) => void) {
    RecordingResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }
}

/** The only observer the card created. Fails loudly rather than returning undefined. */
function soleObserver(): RecordingResizeObserver {
  expect(RecordingResizeObserver.instances).toHaveLength(1);
  return RecordingResizeObserver.instances[0];
}

function columnConfig(overrides: Record<string, unknown> = {}) {
  const config = buildConfig();
  config.view = 'column';
  config.column = { day_spacing: '4px' };
  return Object.assign(config, overrides);
}

/** Comfortably above the 460px decision edge for the config above. */
const WIDE = 900;

/** Comfortably below it, so a measurement here is a real change of layout. */
const NARROW = 300;

/**
 * Inside the hysteresis band: past the 460px decision edge but short of the
 * centred enter edge a first measurement has to clear. A card measured here
 * first lands in list view; one that already holds a column fit keeps it.
 */
const INSIDE_HYSTERESIS_BAND = 464;

function mount(overrides: Record<string, unknown> = {}): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(columnConfig(overrides));
  card.hass = { states: {}, locale: { language: 'en' } };
  card.isInitialLoad = false;
  document.body.appendChild(card);
  return card;
}

/** Delivers a width the way the browser would, then lets the debounce elapse. */
function deliverWidth(card: CardUnderTest, widthPx: number): void {
  void card;
  soleObserver().callback([{ contentRect: { width: widthPx } }]);
  vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
}

describe('resize observer wiring', () => {
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchEventData.mockReset();
    fetchEventData.mockResolvedValue([]);
    document.body.innerHTML = '';
    RecordingResizeObserver.instances = [];
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    vi.useRealTimers();
  });

  it('observes the card element itself once connected', () => {
    const card = mount();

    // Two separate failures hide here. With no observer at all the card never learns
    // its width; with an observer that was never pointed at anything, the callback
    // simply never fires. Both look identical from every other test in the suite.
    expect(RecordingResizeObserver.instances).toHaveLength(1);
    expect(soleObserver().observed).toEqual([card]);
  });

  it('turns an entry delivered by the observer into a layout decision', () => {
    const card = mount();

    // Seeded optimistically from the requested view, before anything is measured.
    expect(card.effectiveView).toBe('column');

    deliverWidth(card, NARROW);

    expect(card.effectiveView).toBe('list');
  });

  it('reads the width from the first entry', () => {
    const card = mount();

    // A single observed element yields a single entry, so reaching past it reads
    // undefined and the card silently stops responding to width forever.
    soleObserver().callback([{ contentRect: { width: NARROW } }, { contentRect: { width: WIDE } }]);
    vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);

    expect(card.effectiveView).toBe('list');
  });

  it('does not let a zero width count as the first measurement', () => {
    const card = mount();

    // A card inside a collapsed section, a hidden tab or a `display: none`
    // container reports 0. Recording that as a measurement is not merely a
    // no-op: it spends the card's one first-measurement chance. Every later
    // width is then judged with hysteresis against the fit already held, so a
    // width that should drop the card to list view keeps it in columns
    // narrower than `min_day_width` instead.
    deliverWidth(card, 0);
    expect(card._measuredWidthPx).toBeNull();

    deliverWidth(card, INSIDE_HYSTERESIS_BAND);
    expect(card.effectiveView).toBe('list');
  });

  it('treats a width inside the hysteresis band as a real measurement', () => {
    // Control for the test above: the same width is only decided this way
    // because it arrives first, not because 464px is list-only.
    const card = mount();

    deliverWidth(card, WIDE);
    expect(card.effectiveView).toBe('column');

    deliverWidth(card, INSIDE_HYSTERESIS_BAND);
    expect(card.effectiveView).toBe('column');
  });

  it('waits for the settle delay before acting on a delivered width', () => {
    const card = mount();

    soleObserver().callback([{ contentRect: { width: NARROW } }]);
    vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY - 1);
    expect(card.effectiveView).toBe('column');

    vi.advanceTimersByTime(1);
    expect(card.effectiveView).toBe('list');
  });

  it('does not start a second observer while one is already running', () => {
    const card = mount();

    card._startWidthObserver();

    expect(RecordingResizeObserver.instances).toHaveLength(1);
  });

  it('disconnects the observer when the card leaves the document', () => {
    const card = mount();
    const observer = soleObserver();

    expect(observer.disconnected).toBe(false);

    card.remove();

    expect(observer.disconnected).toBe(true);
  });

  it('re-renders the card when a measurement changes the layout', async () => {
    const card = mount();
    await card.updateComplete;

    // `show_empty_days` defaults on in column scope, so the days render without events.
    const before = card.shadowRoot?.querySelectorAll('.day-column').length ?? 0;
    expect(before).toBeGreaterThan(0);

    deliverWidth(card, NARROW);
    await card.updateComplete;

    // Recording the decision without asking for a render leaves the card showing
    // columns while its own state says list.
    expect(card.shadowRoot?.querySelectorAll('.day-column')).toHaveLength(0);
  });

  it('does not re-render when a measurement leaves the layout unchanged', async () => {
    const card = mount();
    await card.updateComplete;

    const requestUpdate = vi.spyOn(
      card as unknown as { requestUpdate: () => void },
      'requestUpdate',
    );

    deliverWidth(card, WIDE);
    expect(requestUpdate).not.toHaveBeenCalled();

    // Control: the same path does ask for a render when the layout really changes,
    // so the assertion above cannot pass merely because nothing was wired up.
    deliverWidth(card, NARROW);
    expect(requestUpdate).toHaveBeenCalled();
  });
});

describe('teardown', () => {
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchEventData.mockReset();
    fetchEventData.mockResolvedValue([]);
    document.body.innerHTML = '';
    RecordingResizeObserver.instances = [];
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    vi.useRealTimers();
  });

  it('takes the hold indicator with it when the card is removed', () => {
    const card = mount();

    const indicator = document.createElement('div');
    document.body.appendChild(indicator);
    card._holdIndicator = indicator;

    card.remove();
    vi.advanceTimersByTime(Constants.TIMING.HOLD_INDICATOR_FADEOUT);

    // The indicator is appended to the document, not to the card's shadow root, so
    // removing the card does not take it along. A card torn down mid-hold -- a view
    // change, a dashboard edit -- would otherwise leave it on screen for good.
    expect(card._holdIndicator).toBeNull();
    expect(indicator.parentNode).toBeNull();
  });

  it('abandons a hold in progress when the card is removed', () => {
    const card = mount({ hold_action: { action: 'expand' } });

    card._handlePointerDown(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        isPrimary: true,
      }),
    );

    // The user starts a hold, then the dashboard swaps views before it matures.
    // A timer left running fires against a card that is no longer in the
    // document, marking a hold nobody can act on and attaching an indicator to
    // a detached tree.
    card.remove();
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);

    expect(card._holdTriggered).toBe(false);
    expect(card._holdIndicator).toBeNull();
  });

  it('completes a hold that matures while the card is still connected', () => {
    // Control: the assertions above only mean something because an untouched
    // hold does mature on this timeline.
    const card = mount({ hold_action: { action: 'expand' } });

    card._handlePointerDown(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        isPrimary: true,
      }),
    );
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);

    expect(card._holdTriggered).toBe(true);
  });

  it('stops the periodic refresh once removed', () => {
    const card = mount();
    const updateEvents = vi.spyOn(card, 'updateEvents').mockResolvedValue(undefined);
    const refreshMs = Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES * 60 * 1000;

    // Control: the timer is running and does fire on this timeline.
    vi.advanceTimersByTime(refreshMs + 1000);
    expect(updateEvents).toHaveBeenCalled();

    card.remove();

    // Left running, the timer reschedules itself forever, so every card the
    // user has ever scrolled past keeps polling the calendar API for the life
    // of the browser tab.
    updateEvents.mockClear();
    vi.advanceTimersByTime(refreshMs * 3);
    expect(updateEvents).not.toHaveBeenCalled();
  });

  it('stops listening for visibility changes once removed', async () => {
    const card = mount();
    await card.updateComplete;

    // Spying on the refresh rather than on the network call: a second fetch inside the
    // cache window is served from storage, so `fetchEventData` would stay silent even
    // with the listener firing, and the control below would pass for the wrong reason.
    const updateEvents = vi.spyOn(card, 'updateEvents').mockResolvedValue(undefined);

    // Control: while connected, a visibility change after a long gap does refresh.
    card._lastUpdateTime = 0;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(updateEvents).toHaveBeenCalled();

    card.remove();

    // The listener lives on `document`, which outlives the card, so leaving it
    // attached keeps a removed card alive and refreshing for every tab switch.
    card._lastUpdateTime = 0;
    updateEvents.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(updateEvents).not.toHaveBeenCalled();
  });
});
