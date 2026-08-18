import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, SINGLE_EVENT, WEATHER, buildConfig } from './fixtures';
import * as Types from '../src/config/types';
import * as Leaves from '../src/rendering/leaves';
import * as Presentation from '../src/rendering/presentation';
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

/**
 * The same sweep, extended from boolean options to numeric ones whose "off"
 * value is `0` or unset. Three more gates survived and are pinned below.
 *
 * These are harder to see than the boolean cases, because `0` is not a
 * disabled feature — it is a different, equally valid setting that happens to
 * render nothing extra. `uv_index_threshold: 0` means "never suppress", and a
 * background opacity of `0` means "draw no background", so in both cases the
 * default output is indistinguishable from the option not working at all.
 */
describe('uv_index_threshold suppresses the badge below the threshold', () => {
  /**
   * The threshold is the whole point of the option: it exists so a user only
   * sees a UV badge on days that warrant one. Both scopes asserted that the
   * badge *appears* — mutating the comparison to `false` killed 1 test in the
   * date scope and 7 in the event scope — but mutating it to `true`, which
   * makes the threshold do nothing at all, left the suite green in both.
   *
   * The fixture forecast carries `uv_index: 7`, so a threshold of 7 must still
   * show the badge and a threshold of 8 must hide it. Both are asserted, so
   * neither passes in a harness that simply never renders UV.
   */
  const DATE = new Date(FROZEN_NOW);

  // `renderEventWeather` drops the badge for an event that has already ended,
  // so the clock has to sit inside the fixture day or every case below returns
  // empty markup and the absence assertions pass for the wrong reason.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function dateBadge(uv_index_threshold: number) {
    const config = buildConfig({
      weather: {
        entity: 'weather.home',
        position: 'date',
        date: { show_uv_index: true, uv_index_threshold },
      },
    } as never);
    const container = document.createElement('div');
    litRender(Leaves.renderDateWeather(DATE, config, WEATHER), container);
    return container.querySelector('.weather-uv-index');
  }

  function eventBadge(uv_index_threshold: number) {
    const config = buildConfig({
      weather: {
        entity: 'weather.home',
        position: 'event',
        event: { show_uv_index: true, uv_index_threshold },
      },
    } as never);
    const container = document.createElement('div');
    // The hourly fixtures carry no `uv_index` at all, so a timed event that
    // resolves to one can never show the badge. Empty the hourly map to take
    // the documented daily fallback, which is the forecast that has the index.
    const forecasts = { ...WEATHER, hourly: {} };
    litRender(
      Leaves.renderEventWeather(SINGLE_EVENT[0], config, forecasts, 'title', null),
      container,
    );
    return container.querySelector('.weather-uv-index');
  }

  it('shows the date badge when the index reaches the threshold', () => {
    expect(dateBadge(7)?.textContent).toBe('UV7');
  });

  it('hides the date badge when the index is below the threshold', () => {
    expect(dateBadge(8)).toBeNull();
  });

  it('shows the event badge when the index reaches the threshold', () => {
    expect(eventBadge(7)?.textContent).toBe('UV7');
  });

  it('hides the event badge when the index is below the threshold', () => {
    expect(eventBadge(8)).toBeNull();
  });
});

describe('event_background_opacity draws a background once it is set', () => {
  /**
   * The inverse direction to the UV case. Forcing the opacity to a constant 50
   * killed 17 tests, so "no background at the default" is thoroughly covered —
   * but forcing it to a constant 0, which removes the background from every
   * card that asks for one, left the suite green. `event_background_opacity`
   * appeared only in `config.test.ts`, which normalizes the value and never
   * renders it, so nothing connected the accepted number to any output.
   */
  const presentation = (event_background_opacity: number) =>
    Presentation.buildEventPresentation(
      SINGLE_EVENT[0],
      buildConfig({ event_background_opacity }),
      'en',
      null,
    );

  it('emits no background colour at the default of 0', () => {
    expect(presentation(0).entityAccentBackgroundColor).toBe('');
  });

  it('emits a background colour once an opacity is configured', () => {
    expect(presentation(50).entityAccentBackgroundColor).not.toBe('');
  });
});
