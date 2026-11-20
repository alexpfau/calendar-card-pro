/**
 * Weather per layout (backlog item 339): `weather_entity` and each layout's own `weather:`.
 *
 * Four halves, each against the real code path:
 *
 * - **Resolution.** `resolveViewWeather` gives each view its weather, so every renderer reading
 *   `config.weather` off the resolved configuration draws per layout without knowing it. A card
 *   whose top-level `weather:` names an entity keeps v5's reading exactly: the same object in
 *   List, Columns and Grid, none in Month, and the layouts' blocks ignored.
 * - **Drawing.** The real card, its forecasts delivered by a fake `weather/subscribe_forecast`
 *   stream rather than set by hand, so a layout that draws weather is shown to have subscribed
 *   data, and one that draws none is paired with one that does in the same configuration.
 * - **Subscriptions.** One subscription per forecast type every reachable view needs, so a
 *   layout switch, a narrow screen's list and an edit that keeps the union never subscribe
 *   again; the editor's preview subscribes for every layout, so opening a layout's page does not
 *   either.
 * - **Validation.** What the console says about weather written where the card ignores it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import {
  type Card,
  ENTITY,
  RecordingResizeObserver,
  drawn,
  flush,
  makeConnection,
  mount,
  resize,
} from './helpers/weather-card';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Logger from '../src/utils/logger';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  deprecation: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

const VIEWS: Types.EffectiveView[] = ['list', 'column', 'grid', 'month'];

//-----------------------------------------------------------------------------
// RESOLUTION
//-----------------------------------------------------------------------------

describe('resolveViewWeather', () => {
  it('keeps weather written before v6 as it was in List, Columns and Grid, and off in Month', () => {
    const config = buildConfig({
      weather: { entity: ENTITY, position: 'both', event: { show_temp: false } },
      weather_entity: 'weather.office',
      list: { weather: { position: 'none' } },
      month: { weather: { position: 'event' } },
    });

    for (const view of VIEWS) {
      // The same object, so every renderer and the editor read exactly what they read before v6.
      expect(ViewConfig.resolveViewWeather(config, view), view).toBe(config.weather);
    }
    for (const view of ['list', 'column', 'grid'] as const) {
      expect(ViewConfig.drawnViewWeather(config, view), view).toBe(config.weather);
    }
    // Month draws none of it, as it never has.
    const month = ViewConfig.drawnViewWeather(config, 'month');
    expect(month?.position).toBe('none');
    expect(month?.entity).toBe(ENTITY);
    expect(ViewConfig.drawnViewWeather(config, 'month')).toBe(month);
  });

  it('draws each layout as its own block says, from weather_entity, and nothing elsewhere', () => {
    const config = buildConfig({
      weather_entity: ENTITY,
      list: { weather: { position: 'event', event: { show_conditions: false } } },
      time_grid: { weather: { position: 'date', date: { show_low_temp: true } } },
    });

    const list = ViewConfig.resolveViewWeather(config, 'list');
    expect(list).toMatchObject({ entity: ENTITY, position: 'event' });
    expect(list?.event?.show_conditions).toBe(false);
    // Every part keeps its shipped details where the block names none.
    expect(list?.event?.show_temp).toBe(true);
    expect(list?.date?.show_high_temp).toBe(true);

    expect(ViewConfig.resolveViewWeather(config, 'grid')).toMatchObject({
      entity: ENTITY,
      position: 'date',
      date: { show_low_temp: true, show_conditions: true },
    });
    expect(ViewConfig.resolveViewWeather(config, 'column')).toMatchObject({
      entity: ENTITY,
      position: 'none',
    });
    expect(ViewConfig.resolveViewWeather(config, 'month')).toMatchObject({
      entity: ENTITY,
      position: 'none',
    });
  });

  it('gives Month the forecast beside events only', () => {
    const position = (written: Types.WeatherPosition) =>
      ViewConfig.resolveViewWeather(
        buildConfig({ weather_entity: ENTITY, month: { weather: { position: written } } }),
        'month',
      )?.position;

    expect(position('event')).toBe('event');
    expect(position('both')).toBe('event');
    expect(position('date')).toBe('none');
    expect(position('none')).toBe('none');
  });

  it('takes the entity from the card, never from a layout', () => {
    const config = buildConfig({
      weather_entity: ENTITY,
      column: { weather: { entity: 'weather.office', position: 'event' } } as never,
    });
    expect(ViewConfig.resolveViewWeather(config, 'column')?.entity).toBe(ENTITY);

    // With no entity anywhere a layout draws nothing, whatever its block says.
    const none = buildConfig({ column: { weather: { position: 'event' } } });
    expect(ViewConfig.resolveViewWeather(none, 'column')).toBe(none.weather);
    expect(none.weather?.entity).toBeUndefined();
  });

  it('reads a blank or cleared position as none, where the old block read it as date', () => {
    for (const position of ['', null, undefined]) {
      const config = buildConfig({
        weather_entity: ENTITY,
        list: { weather: { position, date: { show_low_temp: true } } as never },
      });
      expect(ViewConfig.resolveViewWeather(config, 'list')?.position, String(position)).toBe(
        'none',
      );
    }
  });

  it('coerces a layout’s lengths as the top level’s, under the same option paths', () => {
    const config = buildConfig({
      weather_entity: ENTITY,
      list: { weather: { position: 'event', event: { icon_size: '20', font_size: 16 } } as never },
    });
    const event = ViewConfig.resolveViewWeather(config, 'list')?.event;
    expect(event?.icon_size).toBe('20px');
    expect(event?.font_size).toBe('16px');
    // Bare px only for the length a number stands for; em stays em.
    const em = buildConfig({
      weather_entity: ENTITY,
      list: { weather: { position: 'event', event: { icon_size: '1.5em' } } },
    });
    expect(ViewConfig.resolveViewWeather(em, 'list')?.event?.icon_size).toBe('1.5em');
  });

  it('answers the same object for the same configuration, and a new one for a new block', () => {
    const config = buildConfig({
      weather_entity: ENTITY,
      list: { weather: { position: 'event' } },
    });
    const first = ViewConfig.resolveViewWeather(config, 'list');
    expect(ViewConfig.resolveViewWeather(config, 'list')).toBe(first);

    config.list = { weather: { position: 'date' } };
    expect(ViewConfig.resolveViewWeather(config, 'list')?.position).toBe('date');
  });

  it('lays the view’s weather onto the configuration resolved for it', () => {
    const config = buildConfig({
      weather_entity: ENTITY,
      time_grid: { weather: { position: 'date' } },
    });
    expect(ViewConfig.resolveEffectiveConfig(config, 'grid').weather?.position).toBe('date');
    expect(ViewConfig.resolveViewOption(config, 'weather', 'grid')?.position).toBe('date');
    expect(ViewConfig.resolveEffectiveConfig(config, 'list').weather?.position).toBe('none');

    // A card whose weather List reads as written keeps its identity there, which every cache
    // comparing configurations by reference relies on.
    const asBefore = buildConfig({ weather: { entity: ENTITY } });
    expect(ViewConfig.resolveEffectiveConfig(asBefore, 'list')).toBe(asBefore);
    const noWeather = buildConfig({});
    expect(ViewConfig.resolveEffectiveConfig(noWeather, 'list')).toBe(noWeather);
  });
});

describe('weatherForecastTypes', () => {
  it('subscribes for every view the card can show, together', () => {
    const switcher = { toolbar: { show: true } };
    const types = (config: Partial<Types.Config>, everyView = false) =>
      ViewConfig.weatherForecastTypes(buildConfig(config), everyView);

    // List draws the day's forecast, Grid none: only List is reachable, so daily alone.
    expect(
      types({
        weather_entity: ENTITY,
        list: { weather: { position: 'date' } },
        time_grid: { weather: { position: 'event' } },
      }),
    ).toEqual(['daily']);
    // With the switcher every layout is reachable, so Grid's events need the hourly one too.
    expect(
      types({
        ...switcher,
        weather_entity: ENTITY,
        list: { weather: { position: 'date' } },
        time_grid: { weather: { position: 'event' } },
      }),
    ).toEqual(['daily', 'hourly']);
    // The editor's preview counts every layout whatever is reachable.
    expect(
      types({ weather_entity: ENTITY, time_grid: { weather: { position: 'event' } } }, true),
    ).toEqual(['daily', 'hourly']);
    // Columns falling back to List on a narrow screen: List is reachable, with its own weather.
    expect(
      types({ view: 'column', weather_entity: ENTITY, list: { weather: { position: 'date' } } }),
    ).toEqual(['daily']);
    // No layout shows weather: nothing, though the card names an entity.
    expect(types({ weather_entity: ENTITY })).toEqual([]);
  });

  it('subscribes as v5 did for weather written before it, Month aside', () => {
    const types = (config: Partial<Types.Config>) =>
      ViewConfig.weatherForecastTypes(buildConfig(config));

    expect(types({ weather: { entity: ENTITY } })).toEqual(['daily']);
    expect(types({ view: 'grid', weather: { entity: ENTITY, position: 'event' } })).toEqual([
      'daily',
      'hourly',
    ]);
    expect(types({ weather: { entity: ENTITY, position: 'none' } })).toEqual([]);
    // Month never drew it, so a card that can show Month alone needs no forecast.
    expect(types({ view: 'month', weather: { entity: ENTITY } })).toEqual([]);
  });
});

//-----------------------------------------------------------------------------
// THE CARD
//-----------------------------------------------------------------------------

const originalResizeObserver = globalThis.ResizeObserver;

describe('the card draws each layout’s weather', () => {
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

  it('draws weather written before v6 as v5 did in List, Columns and Grid, and none in Month', async () => {
    const weather = { entity: ENTITY, position: 'both' };
    for (const view of ['list', 'column', 'grid'] as const) {
      const { card } = await mount({ view, weather });
      expect(card.effectiveView).toBe(view);
      const { days, events } = drawn(card);
      expect(days, view).toBeGreaterThan(0);
      expect(events, view).toBeGreaterThan(0);
      document.body.replaceChildren();
    }
    // Month at a phone's width draws its day list, where Month's own weather would show. The
    // switcher makes List reachable, so the forecasts arrive and Month has them to draw: without
    // them an empty month would prove nothing.
    const { card, conn } = await mount({ view: 'month', toolbar: { show: true }, weather }, 375);
    expect(card.effectiveView).toBe('month');
    expect(conn.live()).toEqual(['daily', 'hourly']);
    expect(drawn(card)).toEqual({ days: 0, events: 0 });
  });

  it('draws each layout as its own weather says, from one entity', async () => {
    const config = {
      weather_entity: ENTITY,
      list: { weather: { position: 'event' } },
      time_grid: { weather: { position: 'date' } },
      month: { weather: { position: 'event' } },
    };

    const list = (await mount({ ...config, view: 'list' })).card;
    expect(drawn(list).days).toBe(0);
    expect(drawn(list).events).toBeGreaterThan(0);
    document.body.replaceChildren();

    const grid = (await mount({ ...config, view: 'grid' })).card;
    expect(drawn(grid).days).toBeGreaterThan(0);
    expect(drawn(grid).events).toBe(0);
    document.body.replaceChildren();

    // Columns holds no weather of its own, so it draws none, beside the two that do.
    const column = (await mount({ ...config, view: 'column' })).card;
    expect(drawn(column)).toEqual({ days: 0, events: 0 });
    document.body.replaceChildren();

    const month = (await mount({ ...config, view: 'month' }, 375)).card;
    expect(month.effectiveView).toBe('month');
    expect(drawn(month).events).toBeGreaterThan(0);
  });

  it('draws no weather in a layout that sets none, though the card names an entity', async () => {
    const { card, conn } = await mount({ weather_entity: ENTITY });
    expect(drawn(card)).toEqual({ days: 0, events: 0 });
    expect(conn.subs).toEqual([]);
  });

  it('draws List’s weather where Columns falls back to List on a narrow screen', async () => {
    const config = {
      view: 'column',
      weather_entity: ENTITY,
      column: { weather: { position: 'event' } },
      list: { weather: { position: 'date' } },
    };
    const { card } = await mount(config, 1200);
    expect(card.effectiveView).toBe('column');
    expect(drawn(card)).toMatchObject({ days: 0 });
    expect(drawn(card).events).toBeGreaterThan(0);

    await resize(card, 300);
    expect(card.effectiveView).toBe('list');
    expect(drawn(card).days).toBeGreaterThan(0);
    expect(drawn(card).events).toBe(0);
  });
});

describe('forecast subscriptions follow the views the card can show', () => {
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

  const SWITCHER = {
    toolbar: { show: true },
    weather_entity: ENTITY,
    list: { weather: { position: 'date' } },
    time_grid: { weather: { position: 'event' } },
  };

  it('never subscribes again when the layout switches or a narrow screen falls back', async () => {
    const { card, conn } = await mount({ ...SWITCHER, view: 'list' });
    expect(conn.live()).toEqual(['daily', 'hourly']);
    const opened = conn.subs.length;

    for (const view of ['grid', 'month', 'column', 'list'] as const) {
      card._chooseView(view);
      await card.updateComplete;
      await flush();
      expect(card.effectiveView, view).toBe(view);
    }
    // Columns, then too narrow for them: List stands in, and comes back out.
    card._chooseView('column');
    await card.updateComplete;
    await resize(card, 300);
    expect(card.effectiveView).toBe('list');
    await resize(card, 1200);
    expect(card.effectiveView).toBe('column');

    expect(conn.subs.length).toBe(opened);
    expect(conn.subs.every((sub) => sub.unsubscribed === 0)).toBe(true);
  });

  it('subscribes again only when an edit changes the forecasts the views need', async () => {
    const { card, conn } = await mount({
      weather_entity: ENTITY,
      list: { weather: { position: 'event' } },
    });
    expect(conn.live()).toEqual(['daily', 'hourly']);
    const opened = conn.subs.length;

    // Event details change, the forecasts needed do not.
    card.setConfig({
      entities: ['calendar.anna'],
      weather_entity: ENTITY,
      list: { weather: { position: 'both', event: { show_temp: false } } },
    });
    await card.updateComplete;
    await flush();
    expect(conn.subs.length).toBe(opened);

    // From events to days drops the hourly forecast: one setup, without blanking the data.
    card.setConfig({
      entities: ['calendar.anna'],
      weather_entity: ENTITY,
      list: { weather: { position: 'date' } },
    });
    await card.updateComplete;
    await flush();
    expect(conn.live()).toEqual(['daily']);
    await card.updateComplete;
    expect(drawn(card).days).toBeGreaterThan(0);
  });

  it('keeps one subscription in the editor’s preview while it draws each layout in turn', async () => {
    const config = { weather_entity: ENTITY, time_grid: { weather: { position: 'event' } } };
    RecordingResizeObserver.instances = [];
    const conn = makeConnection();
    const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
    vi.spyOn(card, 'updateEvents').mockResolvedValue();
    card.preview = true;
    card.setConfig({ entities: ['calendar.anna'], ...config, view: 'list' });
    card.hass = {
      states: {},
      locale: { language: 'en' },
      callApi: async () => [],
      connection: conn.connection,
    } as unknown as Types.Hass;
    card.isInitialLoad = false;
    document.body.appendChild(card);
    await card.updateComplete;
    await flush();
    expect(conn.live()).toEqual(['daily', 'hourly']);
    const opened = conn.subs.length;

    // A layout's page hands the preview's card the configuration with `view` replaced.
    for (const view of VIEWS) {
      card.setConfig({ entities: ['calendar.anna'], ...config, view });
      await card.updateComplete;
      await flush();
    }
    expect(conn.subs.length).toBe(opened);
  });

  it('blanks the forecast and subscribes again when the entity changes', async () => {
    const { card, conn } = await mount({ weather: { entity: ENTITY } });
    expect(conn.subs.map((sub) => sub.entityId)).toEqual([ENTITY]);

    card.setConfig({
      entities: ['calendar.anna'],
      weather_entity: 'weather.office',
      list: { weather: { position: 'date' } },
    });
    await card.updateComplete;
    await flush();
    expect(conn.subs[0].unsubscribed).toBe(1);
    expect(conn.live()).toEqual(['daily']);
    expect(conn.subs[conn.subs.length - 1]?.entityId).toBe('weather.office');
  });
});

//-----------------------------------------------------------------------------
// VALIDATION
//-----------------------------------------------------------------------------

describe('what the console says about weather the card ignores', () => {
  const warn = vi.mocked(Logger.warn);

  beforeEach(() => {
    warn.mockClear();
  });

  const messages = (config: Partial<Types.Config>): string[] => {
    warn.mockClear();
    ViewConfig.validateWeather(buildConfig(config));
    return warn.mock.calls.map((call) => String(call[0]));
  };

  it('names weather_entity beside the weather written before v6', () => {
    expect(messages({ weather: { entity: ENTITY }, weather_entity: 'weather.office' })).toEqual([
      expect.stringContaining('Ignoring "weather_entity"'),
    ]);
  });

  it('names a layout’s entity, a top-level block without one, and a block that is no object', () => {
    expect(
      messages({
        weather_entity: ENTITY,
        weather: { position: 'both' },
        list: { weather: { entity: 'weather.office' } } as never,
        column: { weather: true } as never,
      }),
    ).toEqual([
      expect.stringContaining('top-level "weather:" options'),
      expect.stringContaining('"list.weather.entity"'),
      expect.stringContaining('"column.weather"'),
    ]);
  });

  it('names an unusable length in a layout’s weather by its path there', () => {
    expect(
      messages({
        weather_entity: ENTITY,
        time_grid: { weather: { position: 'date', date: { icon_size: '300%' } } },
      }),
    ).toEqual([expect.stringContaining('time_grid.weather.date.icon_size')]);
  });

  it('says nothing about weather written as the card reads it', () => {
    expect(messages({ weather: { entity: ENTITY, position: 'both' } })).toEqual([]);
    expect(messages({ weather_entity: ENTITY, list: { weather: { position: 'event' } } })).toEqual(
      [],
    );
    expect(messages({})).toEqual([]);
  });
});
