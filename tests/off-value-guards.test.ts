import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Types from '../src/config/types';
import * as Leaves from '../src/rendering/leaves';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';
import '../src/calendar-card-pro';

/**
 * Guards for option values that no test asserted against.
 *
 * These came out of a mechanical sweep: every boolean option with a gate in the
 * rendering or event pipeline was mutated so the gate ignored the option, and
 * the suite was run. A surviving mutation proves nothing depends on that value.
 * Of the gates swept here, four survived and are pinned below; two more survived
 * but were disqualified as inert, because a second check downstream re-reads the
 * same option and is itself covered.
 *
 * The direction that survives is nearly always the same one. A test written to
 * show a feature works asserts that its output exists, so it dies when the
 * feature breaks — but it is equally satisfied when the feature starts happening
 * somewhere it should not, which is exactly what the other value of the option
 * is there to prevent. Only an assertion written against that value can see it.
 *
 * Every case below is paired with a control asserting the opposite value in the
 * same harness, because an assertion that something is absent passes trivially in
 * a harness that never produces it.
 */

describe('time_two_digit_hours on a multi-day event', () => {
  /**
   * `formatEventTime` has two padding call sites: one for a range inside a single
   * day and one for a range spanning days. Every existing case used a single-day
   * event, so the multi-day site could stop padding — or start padding when the
   * option was off — with the suite green.
   */
  const MULTI_DAY = {
    summary: 'Conference',
    start: { dateTime: '2026-06-22T09:00:00.000Z' },
    end: { dateTime: '2026-06-24T09:00:00.000Z' },
  } as unknown as Types.CalendarEventData;

  const plain = () => FormatUtils.formatEventTime(MULTI_DAY, buildConfig({ time_24h: true }), 'en');

  const padded = () =>
    FormatUtils.formatEventTime(
      MULTI_DAY,
      buildConfig({ time_24h: true, time_two_digit_hours: true }),
      'en',
    );

  it('leaves the hour unpadded at the default', () => {
    expect(plain()).toContain('9:00');
    expect(plain()).not.toContain('09:00');
  });

  it('pads the hour when enabled', () => {
    expect(padded()).toContain('09:00');
  });
});

describe('daily_forecast_fallback on an event with no hourly forecast', () => {
  /**
   * The fallback is on by default: a timed event with no hourly forecast still
   * gets the day's forecast. Existing weather cases all pinned it off, so nothing
   * failed if it stopped falling back.
   */
  const EVENT: Types.CalendarEventData = {
    start: { dateTime: '2026-06-17T14:00:00.000Z' },
    end: { dateTime: '2026-06-17T16:00:00.000Z' },
    summary: 'Weather test',
    _entityId: 'calendar.personal',
  };

  const DAILY_ONLY: Types.WeatherForecasts = {
    hourly: {},
    daily: {
      [FormatUtils.getLocalDateKey(new Date('2026-06-17T14:00:00.000Z'))]: {
        icon: 'mdi:weather-sunny',
        condition: 'sunny',
        temperature: 21,
        datetime: '2026-06-17T12:00:00.000Z',
      } as unknown as Types.WeatherData,
    },
  };

  function badgeExists(fallback: boolean | undefined): boolean {
    const config = buildConfig();
    config.weather = {
      entity: 'weather.home',
      position: 'event',
      event: fallback === undefined ? {} : { daily_forecast_fallback: fallback },
    } as unknown as Types.Config['weather'];

    const host = document.createElement('div');
    litRender(Leaves.renderEventWeather(EVENT, config, DAILY_ONLY, 'row', null), host);
    return host.querySelector('.event-weather') !== null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to the daily forecast when left at its default', () => {
    expect(badgeExists(undefined)).toBe(true);
  });

  it('falls back to the daily forecast when explicitly enabled', () => {
    expect(badgeExists(true)).toBe(true);
  });

  it('renders no badge when the fallback is turned off', () => {
    expect(badgeExists(false)).toBe(false);
  });
});

describe('refresh_on_navigate shortens the cache window on a manual reload', () => {
  /**
   * On a manual page reload the cache is treated as valid for seconds rather than
   * minutes, so navigating back to a dashboard shows fresh events. Nothing tested
   * it: both forcing the short window and removing it left the suite green.
   */
  const KEY = 'cpc_refresh_on_navigate_probe';

  function memoryStorage(): Storage {
    const store = new Map<string, string>();
    return {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      removeItem: (k: string) => void store.delete(k),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
    } as Storage;
  }

  /** Ages the entry past the manual-reload window but well inside the normal one. */
  const AGE_MS = 30_000;

  function hit(refreshOnNavigate: boolean, isManualPageReload: boolean): boolean {
    globalThis.localStorage.setItem(
      KEY,
      JSON.stringify({ events: [], timestamp: Date.now() - AGE_MS }),
    );

    const config = buildConfig({ refresh_on_navigate: refreshOnNavigate });
    return EventUtils.getValidCacheEntry(KEY, config, isManualPageReload) !== null;
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the entry when the page was not manually reloaded', () => {
    expect(hit(true, false)).toBe(true);
  });

  it('keeps the entry on a manual reload when the option is off', () => {
    expect(hit(false, true)).toBe(true);
  });

  it('drops the entry on a manual reload when the option is on', () => {
    expect(hit(true, true)).toBe(false);
  });
});

describe('hide_when_empty leaves an empty card visible when off', () => {
  /**
   * The existing case named after this option only exercises the event count that
   * feeds it, never the visibility gate itself, so the gate could start hiding
   * every empty card with the suite green. The default is off, and an empty card
   * staying visible is the whole point of that default.
   */
  interface CardUnderTest extends HTMLElement {
    setConfig(config: Record<string, unknown>): void;
    _applyVisibility(): void;
  }

  function hiddenWith(hideWhenEmpty: boolean): boolean {
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ entities: ['calendar.personal'], hide_when_empty: hideWhenEmpty });
    card._applyVisibility();
    return card.hidden;
  }

  it('hides an empty card when the option is on', () => {
    expect(hiddenWith(true)).toBe(true);
  });

  it('leaves an empty card visible at the default', () => {
    expect(hiddenWith(false)).toBe(false);
  });
});
