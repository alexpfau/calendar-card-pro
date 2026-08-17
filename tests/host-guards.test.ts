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
  _setupWeatherSubscriptions(): Promise<void>;
  _weatherUnsubscribers: Array<() => void>;
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
