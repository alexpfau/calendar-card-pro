/**
 * Guards in the card host that a mutation sweep left standing, and what each turned out
 * to be.
 *
 * Two were real gaps and are closed here: a refresh interval that silently reverted to
 * the built-in default, and the error state for a card with no calendars configured.
 *
 * The rest were **equivalent mutants**, and are recorded rather than tested, because a
 * test that appeared to pin one would be pinning the mutation's own absorption:
 *
 * - the retry-cleanup guard in `updateEvents` is followed by a branch that clears and
 *   re-arms the timer either way;
 * - `hasCompactModeLimits`'s `Number.isFinite` check sits behind `toValidNumber`, which
 *   has already reduced every limit — card-level and per-entity — to `number | undefined`;
 * - the weather-setup early return is masked **three** times over. Its entity half is
 *   absorbed by `getRequiredForecastTypes`, which returns an empty list without one; its
 *   `hass` half by `subscribeToWeatherForecast`, which guards `!hass?.connection`; and
 *   both by that function's `try`/`catch`, which is deliberate — a weather stream that
 *   fails must not take the card down with it. Relaxing the first two together still
 *   changes nothing observable.
 *
 * The weather cases below therefore pin the *contract* rather than any mutant: a card
 * configured for weather but not yet given `hass` — the ordinary first-paint ordering —
 * subscribes to nothing and does not reject.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  isInitialLoad: boolean;
  events: Types.CalendarEventData[];
  updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  _setupWeatherSubscriptions(): Promise<void>;
  _weatherUnsubscribers: Array<() => void>;
  _refreshTimerId?: number;
  _initialLoadRetryId?: number;
  startRefreshTimer(): void;
  renderedTitle?: string;
  readonly shadowRoot: ShadowRoot | null;
}

/** Resolve pending microtasks and the macrotask queue. */
const flush = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 0));

function card(config: Record<string, unknown> = {}): CardUnderTest {
  const element = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  element.setConfig(buildConfig({ entities: ['calendar.personal'], ...config }));
  element.isInitialLoad = false;
  return element;
}

/** A connection that records every subscription attempt. */
function recordingHass(): { hass: unknown; attempts: number } {
  const state = { attempts: 0 };
  return {
    attempts: 0,
    hass: {
      states: {},
      callService: () => {},
      locale: { language: 'en' },
      callApi: async () => [],
      connection: {
        async subscribeMessage() {
          state.attempts += 1;
          return () => {};
        },
      },
      _state: state,
    },
  } as unknown as { hass: unknown; attempts: number };
}

describe('the refresh timer honours the configured interval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('schedules the next refresh at refresh_interval, not the built-in default', async () => {
    // `refresh_interval` reaches this read already normalized, so the `|| DEFAULT` beside it
    // is defensive and never fires — which is exactly why dropping the configured value in
    // favour of the default went unnoticed. The default is 30 minutes; 5 is chosen so the
    // two cannot be confused.
    const element = card({ refresh_interval: 5 });
    const timeout = vi.spyOn(window, 'setTimeout');

    document.body.appendChild(element);
    element.hass = { states: {}, callService: () => {}, locale: { language: 'en' } };
    await element.updateComplete;

    const delays = timeout.mock.calls.map((args) => args[1]);

    expect(delays).toContain(5 * 60 * 1000);
    expect(delays).not.toContain(30 * 60 * 1000);

    timeout.mockRestore();
  });

  it('does not re-arm the refresh timer after disconnect', async () => {
    const element = card({ refresh_interval: 5 });
    document.body.appendChild(element);
    element.hass = { states: {}, callService: () => {}, locale: { language: 'en' } };
    await element.updateComplete;
    // Fake timers return a handle object rather than a bare number — presence is the pin.
    expect(element._refreshTimerId).toBeTruthy();

    element.remove();
    expect(element._refreshTimerId).toBeUndefined();

    // setConfig always ends in startRefreshTimer — without the isConnected guard
    // that re-arms a detached card's updateEvents loop indefinitely.
    element.setConfig(buildConfig({ entities: ['calendar.personal'], refresh_interval: 5 }));
    expect(element._refreshTimerId).toBeUndefined();

    // Positive control: reconnecting still schedules.
    document.body.appendChild(element);
    expect(element._refreshTimerId).toBeTruthy();
  });
});

describe('updateEvents refuses work after disconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('does not re-arm the no-hass retry after disconnect', async () => {
    const element = card();
    document.body.appendChild(element);
    // No hass: the first load arms the 1.5s retry.
    await element.updateEvents();
    expect(element._initialLoadRetryId).toBeTruthy();

    element.remove();
    expect(element._initialLoadRetryId).toBeUndefined();

    // Detached setConfig only reaches updateEvents when entities/processing change.
    // An identical config is a silent no-op and cannot pin this guard — call the
    // method, and also drive setConfig with a real entity change.
    await element.updateEvents();
    expect(element._initialLoadRetryId).toBeUndefined();

    element.setConfig(buildConfig({ entities: ['calendar.work'] }));
    expect(element._initialLoadRetryId).toBeUndefined();

    // Positive control: reconnecting with still-missing hass arms it again.
    document.body.appendChild(element);
    await element.updateEvents();
    expect(element._initialLoadRetryId).toBeTruthy();
  });
});

describe('weather setup requires a Home Assistant connection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('subscribes when both the entity and hass are present', async () => {
    // The positive control. Without it the assertion below passes on a card that has
    // stopped subscribing under every condition.
    const element = card({ weather: { entity: 'weather.home', position: 'date' } });
    const recording = recordingHass();
    element.hass = recording.hass;
    document.body.appendChild(element);

    await element._setupWeatherSubscriptions();
    await flush();

    expect((recording.hass as { _state: { attempts: number } })._state.attempts).toBeGreaterThan(0);
  });

  it('attempts nothing when hass is absent', async () => {
    // Pins the contract, not a mutant. The guard this looks like it is testing is masked
    // three times over — see the file header — so no behavioural test can kill it, and
    // claiming otherwise would be the "check that cannot fail" this suite exists to avoid.
    // What is genuinely worth holding is the outcome: a card configured for weather that
    // has not yet received `hass` subscribes to nothing and does not reject.
    const element = card({ weather: { entity: 'weather.home', position: 'date' } });
    element.hass = undefined;
    document.body.appendChild(element);

    await expect(element._setupWeatherSubscriptions()).resolves.toBeUndefined();
    expect(element._weatherUnsubscribers).toHaveLength(0);
  });
});

describe('the card reports an unusable configuration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  /** The rendered text of a card in the given state. */
  async function textFor(config: Record<string, unknown>, hass: unknown): Promise<string> {
    const element = card(config);
    document.body.appendChild(element);
    element.hass = hass;
    await element.updateComplete;
    return element.shadowRoot?.textContent ?? '';
  }

  it('shows the error state when no calendars are configured', async () => {
    // Reachable from the editor, which can hold an empty calendar list mid-edit. Without
    // this arm the card renders an ordinary empty agenda and gives no hint that it is
    // waiting for configuration rather than for events.
    const text = await textFor(
      { entities: [] },
      {
        states: {},
        callService: () => {},
        locale: { language: 'en' },
      },
    );

    expect(text).toMatch(/error|entities|configur/i);
  });

  it('renders normally when calendars are configured', async () => {
    // The control: the assertion above must be caused by the empty list, not by the
    // harness failing to render anything at all.
    const element = card();
    document.body.appendChild(element);
    element.hass = { states: {}, callService: () => {}, locale: { language: 'en' } };
    element.events = [];
    await element.updateComplete;

    expect(element.shadowRoot?.textContent ?? '').not.toMatch(/error/i);
  });
});

/**
 * `isTitlePending` decides which element the header container holds, and nothing drove it.
 *
 * `render.ts` renders `<h1 class="card-header">` when the title is non-empty **or** the
 * title is pending, and a `.card-header-placeholder` div otherwise. `card-wrapper-dom`
 * pins that renderer, but it calls `renderMainCardStructure` directly and supplies
 * `titlePending` itself — so the argument was covered and the getter computing it was
 * not. Relaxing `isTemplate(title) && renderedTitle === undefined` to `||` therefore
 * survived all of `npm test`.
 *
 * The observable is a card with **no title at all**, which is the default config: under
 * `||` the second operand is true on its own, so an empty header renders an empty `<h1>`
 * where it should render the placeholder.
 */
describe('the header element tracks the title state', () => {
  /** Mount a card and return its header container's first element child. */
  async function headerChild(config: Record<string, unknown>): Promise<Element | null> {
    const element = card(config);
    document.body.appendChild(element);
    element.hass = { states: {}, callService: () => {}, locale: { language: 'en' } };
    element.events = [];
    await element.updateComplete;

    return element.shadowRoot?.querySelector('.header-container')?.firstElementChild ?? null;
  }

  it('renders the placeholder when there is no title', async () => {
    // The kill. `title` is absent in DEFAULT_CONFIG, so this is the ordinary card.
    const child = await headerChild({});

    expect(child?.tagName.toLowerCase()).toBe('div');
    expect(child?.classList.contains('card-header-placeholder')).toBe(true);
  });

  it('renders a heading when there is a plain title (control)', async () => {
    // Without this the assertion above would also pass for a header container that never
    // renders a heading under any configuration.
    const child = await headerChild({ title: 'Agenda' });

    expect(child?.tagName.toLowerCase()).toBe('h1');
    expect(child?.textContent?.trim()).toBe('Agenda');
  });

  it('collapses back to the placeholder when a template resolves to empty', async () => {
    // The third mutant on this getter: dropping the `renderedTitle` operand leaves
    // `isTemplate(title)` alone, which keeps the heading open forever. It differs from
    // the real thing in exactly one place — a template that resolved to an empty string
    // — so nothing above can see it.
    //
    // The placeholder is `height: 0` while `.card-header` carries a 16px bottom margin,
    // so holding the heading open here would reserve header space for a title that
    // renders nothing. Once a value is in hand the header must behave as it would for a
    // static title of the same text, which for '' means the placeholder.
    const element = card({ title: '{{ states("sensor.x") }}' });
    document.body.appendChild(element);
    element.hass = { states: {}, callService: () => {}, locale: { language: 'en' } };
    element.events = [];
    await element.updateComplete;

    element.renderedTitle = '';
    await element.updateComplete;

    const child = element.shadowRoot?.querySelector('.header-container')?.firstElementChild;
    expect(child?.classList.contains('card-header-placeholder')).toBe(true);
  });

  it('holds the heading open while a templated title is still resolving', async () => {
    // The reason the getter exists: `renderedTitle` is undefined until the subscription
    // delivers, and the heading has to be there from first paint so the card does not
    // jump when the value arrives. Without `hass.connection` nothing ever resolves, which
    // is precisely the pending state.
    const child = await headerChild({ title: '{{ states("sensor.x") }}' });

    expect(child?.tagName.toLowerCase()).toBe('h1');
    expect(child?.textContent?.trim()).toBe('');
  });
});

/**
 * A bare `hold_action:` in YAML must behave like `hold_action: none`, and did not.
 *
 * `_handlePointerDown` arms the hold timer when `hold_action?.action !== 'none'`. Optional
 * chaining makes that **true** for a null `hold_action`, because `null?.action` is
 * `undefined` and `undefined !== 'none'` — so a key the user wrote to mean "nothing on
 * hold" armed a timer, set `_holdTriggered`, and drew a hold indicator. `_handlePointerUp`
 * then disagreed with it: its hold branch needs `this.config.hold_action` to be truthy, so
 * the hold did nothing, and its tap branch needs `!this._holdTriggered`, so the tap was
 * swallowed too. A long press produced a ripple and no action, and the user's `tap_action`
 * never ran.
 *
 * This was the last untriaged survivor from the host sweep. The earlier note filed it as
 * reachable only through the shallow merge in `setConfig`, and that reading was wrong:
 * `mergeConfig` replaces a non-object value wholesale, exactly as the spread did, so
 * `hold_action: null` still arrives as `null` and the deep merge changed nothing here.
 * The mismatch is between the two pointer handlers, not in the merge.
 *
 * With the guard on line 786 tightened to match, `_holdTriggered` can no longer be true
 * while `hold_action` is falsy, which turns the `!this._holdTriggered` operand in the tap
 * branch into defensive duplication rather than a coverage gap.
 */
describe('a hold action the user disabled', () => {
  /** Press, hold past the threshold, release; return the actions HA was asked to run. */
  async function pressAndHold(config: Record<string, unknown>): Promise<string[]> {
    const element = card({ tap_action: { action: 'more-info' }, ...config });
    document.body.appendChild(element);
    element.hass = { states: {}, callService: () => {}, locale: { language: 'en' } };
    element.events = [];
    await element.updateComplete;

    const seen: string[] = [];
    element.addEventListener('hass-action', (ev) => {
      seen.push((ev as unknown as { detail: { action: string } }).detail.action);
    });

    const target = element.shadowRoot?.querySelector('ha-card') ?? element;
    const opts = { bubbles: true, composed: true };
    target.dispatchEvent(Object.assign(new Event('pointerdown', opts), { pointerId: 1 }));
    vi.advanceTimersByTime(600);
    target.dispatchEvent(Object.assign(new Event('pointerup', opts), { pointerId: 1 }));

    return seen;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the tap action on release, as an explicit none does', async () => {
    expect(await pressAndHold({ hold_action: null })).toEqual(['tap']);
  });

  it('agrees with the explicit form (reference)', async () => {
    // `hold_action: none` is the documented way to say this, and it already worked. The
    // two must not disagree, which is the whole claim.
    expect(await pressAndHold({ hold_action: { action: 'none' } })).toEqual(['tap']);
  });

  it('still runs a configured hold action instead of the tap (control)', async () => {
    // Without this, both assertions above would also pass for a card that had simply
    // stopped detecting holds at all.
    expect(await pressAndHold({ hold_action: { action: 'more-info' } })).toEqual(['hold']);
  });
});
