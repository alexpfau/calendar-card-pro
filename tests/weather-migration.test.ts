/**
 * Converting weather as written before v6 into weather per layout (`migrateWeatherFormat`).
 *
 * Not wired into the editor yet; this pins what it will write. Three properties:
 *
 * - **What it writes**, example by example, as the card's documentation shows them.
 * - **That the converted card draws what the old one drew**, layout by layout and forecast by
 *   forecast, through the card's own resolution, for every configuration the old reading
 *   draws. The one deliberate exception, a half-converted card, is pinned on its own.
 * - **That converting twice changes nothing.**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { RecordingResizeObserver, mount } from './helpers/weather-card';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { convertsDrawnWeather, migrateWeatherFormat } from '../src/config/weather-migration';
import { resolveWeatherPosition } from '../src/utils/weather-position';

const ENTITY = 'weather.home';
const VIEWS: Types.EffectiveView[] = ['list', 'column', 'grid', 'month'];
const date = (presentation: Record<string, unknown> = {}) => ({
  weather: { position: 'date', ...presentation },
});

describe('what the conversion writes', () => {
  it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    [
      'an entity alone',
      { weather: { entity: ENTITY } },
      { weather_entity: ENTITY, list: date(), column: date(), time_grid: date() },
    ],
    [
      'every option, an explicit default and a calendar of its own',
      {
        config_version: 5,
        entities: ['calendar.anna', { entity: 'calendar.ben', show_weather: false }],
        weather: {
          entity: ENTITY,
          position: 'both',
          date: { show_conditions: true, show_low_temp: true },
          event: { show_conditions: false, max_lines: 1 },
        },
      },
      {
        config_version: 5,
        entities: ['calendar.anna', { entity: 'calendar.ben', show_weather: false }],
        weather_entity: ENTITY,
        ...Object.fromEntries(
          ['list', 'column', 'time_grid'].map((key) => [
            key,
            {
              weather: {
                position: 'both',
                date: { show_conditions: true, show_low_temp: true },
                event: { show_conditions: false, max_lines: 1 },
              },
            },
          ]),
        ),
      },
    ],
    [
      'weather turned off',
      { weather: { entity: ENTITY, position: 'none' } },
      {
        weather_entity: ENTITY,
        list: { weather: { position: 'none' } },
        column: { weather: { position: 'none' } },
        time_grid: { weather: { position: 'none' } },
      },
    ],
    [
      'options naming no entity anywhere, which drew nothing and named nothing to draw',
      { title: 'Family', weather: { position: 'event' }, list: { show_location: false } },
      { title: 'Family', list: { show_location: false } },
    ],
    [
      'a layout’s own weather, which the old block made the card ignore',
      {
        weather: { entity: ENTITY, position: 'both' },
        list: { weather: { position: 'none' }, show_location: false },
        month: { weather: { position: 'event' } },
      },
      {
        weather_entity: ENTITY,
        list: { weather: { position: 'both' }, show_location: false },
        column: { weather: { position: 'both' } },
        time_grid: { weather: { position: 'both' } },
      },
    ],
    [
      'a layout block keeps its other options, in its own order',
      { view: 'grid', time_grid: { start_time: '07:00' }, weather: { entity: ENTITY } },
      {
        view: 'grid',
        time_grid: { start_time: '07:00', weather: { position: 'date' } },
        weather_entity: ENTITY,
        list: date(),
        column: date(),
      },
    ],
  ])('converts %s', (_name, before, after) => {
    const result = migrateWeatherFormat(before);
    expect(result.converted).toBe(true);
    expect(result.config).toEqual(after);
  });

  it('puts weather_entity where weather was, and names what it dropped', () => {
    const result = migrateWeatherFormat({
      title: 'Family',
      weather: { entity: ENTITY },
      weather_entity: 'weather.office',
      days_to_show: 7,
      list: { weather: { position: 'none' } },
      month: { weather: { position: 'event' }, row_height: '90px' },
    });
    expect(Object.keys(result.config)).toEqual([
      'title',
      'weather_entity',
      'days_to_show',
      'list',
      'month',
      'column',
      'time_grid',
    ]);
    expect(result.config.weather_entity).toBe(ENTITY);
    expect(result.config.month).toEqual({ row_height: '90px' });
    expect(result.dropped).toEqual(['weather_entity', 'list.weather', 'month.weather']);
    expect(result.filled).toEqual(['list', 'column', 'grid']);
    expect(result.drawn).toBe(true);
  });

  it('writes a copy into each layout, never one shared object', () => {
    const { config } = migrateWeatherFormat({
      weather: { entity: ENTITY, event: { show_temp: false } },
    }) as { config: Record<string, { weather: { event: object } }> };
    expect(config.list.weather).not.toBe(config.column.weather);
    expect(config.list.weather.event).not.toBe(config.time_grid.weather.event);
  });

  it('leaves alone anything that is not a top-level weather block', () => {
    for (const config of [
      {},
      { weather: null },
      { weather: 'weather.home' },
      { weather_entity: ENTITY, list: { weather: { position: 'event' } } },
    ]) {
      const result = migrateWeatherFormat(config as Record<string, unknown>);
      expect(result.converted).toBe(false);
      expect(result.config).toBe(config);
    }
  });

  it('only removes an empty block', () => {
    expect(migrateWeatherFormat({ weather: {}, weather_entity: ENTITY })).toMatchObject({
      config: { weather_entity: ENTITY },
      filled: [],
      dropped: [],
    });
  });

  it('names a block of options that named no entity anywhere as dropped, and fills nothing', () => {
    for (const weather_entity of [undefined, '', '  ']) {
      const result = migrateWeatherFormat({ weather: { position: 'both' }, weather_entity });
      expect(result.filled).toEqual([]);
      expect(result.dropped).toEqual(['weather']);
      expect(result.config).not.toHaveProperty('weather');
    }
    expect(migrateWeatherFormat({ weather: {} }).dropped).toEqual([]);
  });

  it('converts on opening only a block that names weather the card draws from', () => {
    expect(convertsDrawnWeather({ weather: { entity: ENTITY } })).toBe(true);
    expect(convertsDrawnWeather({ weather: {}, weather_entity: ENTITY })).toBe(true);
    for (const config of [
      {},
      { weather_entity: ENTITY },
      { weather: { position: 'both' } },
      { weather: { position: 'both' }, weather_entity: ' ' },
      { weather: null, weather_entity: ENTITY },
    ]) {
      expect(convertsDrawnWeather(config as Record<string, unknown>), JSON.stringify(config)).toBe(
        false,
      );
    }
  });
});

/**
 * Everything a view draws from its weather, as the renderers read it: the entity, the position
 * they act on, and every detail of both parts with its shipped default filled in.
 *
 * @param config - A configuration as written
 * @param view - The view
 * @returns A comparable description, or `'nothing'` where the view draws no weather
 */
function drawn(config: Record<string, unknown>, view: Types.EffectiveView) {
  const weather = ViewConfig.drawnViewWeather(buildConfig(config as Partial<Types.Config>), view);
  const position = resolveWeatherPosition(weather);
  if (!weather?.entity || position === 'none') return 'nothing';
  const withDefaults = ViewConfig.resolveViewWeather(
    buildConfig({ weather_entity: weather.entity, list: { weather } } as Partial<Types.Config>),
    'list',
  );
  return {
    entity: weather.entity,
    position,
    date: position === 'event' ? undefined : withDefaults?.date,
    event: position === 'date' ? undefined : withDefaults?.event,
  };
}

describe('the converted card draws what the old one drew', () => {
  const OLD: Array<Record<string, unknown>> = [
    { weather: { entity: ENTITY } },
    { weather: { entity: ENTITY, position: 'date' } },
    { weather: { entity: ENTITY, position: 'event', event: { show_temp: false } } },
    {
      weather: {
        entity: ENTITY,
        position: 'both',
        date: { show_low_temp: true, icon_size: '20' },
        event: { daily_forecast_fallback: false, max_lines: 2, color: '#ff0000' },
      },
    },
    { weather: { entity: ENTITY, position: 'none' } },
    { weather: { entity: ENTITY, position: '' } },
    { weather: { entity: ENTITY, position: null } },
    { weather: { entity: ENTITY, position: 'top' } },
    { weather: { entity: ENTITY, unknown_option: 1 } },
    { weather: { position: 'both' } },
    { weather: { entity: ENTITY }, list: { weather: { position: 'none' } } },
    { weather: { entity: ENTITY }, weather_entity: 'weather.office' },
    { view: 'column', weather: { entity: ENTITY, position: 'event' } },
    { view: 'month', toolbar: { show: true }, weather: { entity: ENTITY, position: 'both' } },
  ];

  it.each(OLD.map((config) => [JSON.stringify(config), config]))(
    '%s',
    (_name, before: Record<string, unknown>) => {
      const after = migrateWeatherFormat(before).config;
      for (const view of VIEWS) {
        expect(drawn(after, view), view).toEqual(drawn(before, view));
      }
      for (const everyView of [false, true]) {
        expect(
          ViewConfig.weatherForecastTypes(buildConfig(after as Partial<Types.Config>), everyView),
        ).toEqual(
          ViewConfig.weatherForecastTypes(buildConfig(before as Partial<Types.Config>), everyView),
        );
      }
    },
  );

  it('converts every configuration once', () => {
    for (const before of OLD) {
      const once = migrateWeatherFormat(before);
      const twice = migrateWeatherFormat(once.config);
      expect(twice.converted).toBe(false);
      expect(twice.config).toEqual(once.config);
    }
  });

  it('fills a half-converted card’s empty layouts with the options left at the top', () => {
    // The author moved the entity and left the rest: read per layout, the card drew nothing.
    const before = { weather_entity: ENTITY, weather: { position: 'both' } };
    expect(VIEWS.map((view) => drawn(before, view))).toEqual([
      'nothing',
      'nothing',
      'nothing',
      'nothing',
    ]);

    const result = migrateWeatherFormat({
      ...before,
      column: { weather: { position: 'event' } },
    });
    expect(result.config).toEqual({
      weather_entity: ENTITY,
      column: { weather: { position: 'event' } },
      list: { weather: { position: 'both' } },
      time_grid: { weather: { position: 'both' } },
    });
    // Columns kept its own weather, which the card already drew; the other two are new to it.
    expect(result.filled).toEqual(['list', 'grid']);
    expect(result.drawn).toBe(false);
  });
});

/**
 * The weather a mounted card draws, as markup: every day's and every event's, in order.
 *
 * @param card - A mounted card
 * @returns Their serialized elements
 */
function weatherMarkup(card: HTMLElement): string[] {
  return [...card.shadowRoot!.querySelectorAll('.weather, .event-weather')].map(
    (element) => element.outerHTML,
  );
}

describe('the converted card draws the same markup, on the real card', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-17T10:00:00Z'));
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    document.body.replaceChildren();
    globalThis.ResizeObserver = originalResizeObserver;
    vi.useRealTimers();
  });

  it.each([
    { weather: { entity: ENTITY } },
    {
      weather: {
        entity: ENTITY,
        position: 'both',
        date: { show_low_temp: true },
        event: { show_temp: false, max_lines: 1 },
      },
    },
  ])('%j', async (before) => {
    const after = migrateWeatherFormat(before).config;
    let drawnSomewhere = 0;
    // Month at a phone's width, where it draws the day list its weather would show in. The
    // switcher makes every layout reachable, so each card holds the forecasts whichever it draws,
    // and a layout drawing none is a decision rather than a missing forecast.
    const switcher = { toolbar: { show: true } };
    for (const [view, width] of [
      ['list', 1200],
      ['column', 1200],
      ['grid', 1200],
      ['month', 375],
    ] as const) {
      const old = await mount({ ...before, ...switcher, view }, width);
      const expected = weatherMarkup(old.card);
      const types = old.conn.live();
      expect(types.length, view).toBeGreaterThan(0);
      document.body.replaceChildren();

      const converted = await mount({ ...after, ...switcher, view }, width);
      expect(converted.card.effectiveView).toBe(view);
      expect(weatherMarkup(converted.card), view).toEqual(expected);
      expect(converted.conn.live(), view).toEqual(types);
      document.body.replaceChildren();
      drawnSomewhere += expected.length;
    }
    // A comparison of two empty cards would prove nothing.
    expect(drawnSomewhere).toBeGreaterThan(0);
  });
});
