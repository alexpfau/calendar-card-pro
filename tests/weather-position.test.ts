/**
 * Weather `position` — forecast subscriptions must match what is actually rendered.
 *
 * The visual editor offers four positions including `'none'` ("Nowhere"). Before this
 * suite, `'none'` was absent from the `WeatherConfig['position']` union, so it fell
 * through `getRequiredForecastTypes`'s `!== 'date'` arm and subscribed to *both*
 * forecast streams while rendering nothing — making the cheapest-looking option the
 * most expensive one in the card.
 *
 * The invariant these tests pin: a position never subscribes to a stream it cannot
 * render. `daily` is required exactly when the date column shows weather; `hourly`
 * exactly when the event row does.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, WEATHER, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import * as Types from '../src/config/types';
import * as Column from '../src/rendering/column';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import * as WeatherUtils from '../src/utils/weather';

const ENTITY = 'weather.forecast_home';

/** Every position the visual editor can produce, in the order the select offers them. */
const EDITOR_POSITIONS = ['none', 'date', 'event', 'both'] as const;

function forecastsFor(position?: string): Array<string> {
  return WeatherUtils.getRequiredForecastTypes({
    entity: ENTITY,
    ...(position === undefined ? {} : { position }),
  } as Types.WeatherConfig);
}

describe('getRequiredForecastTypes', () => {
  it('subscribes to nothing without an entity, whatever the position', () => {
    const mismatches: Array<string> = [];
    for (const position of EDITOR_POSITIONS) {
      const got = WeatherUtils.getRequiredForecastTypes({ position } as Types.WeatherConfig);
      if (got.length !== 0) mismatches.push(`${position} -> ${JSON.stringify(got)}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('subscribes to nothing for position "none"', () => {
    expect(forecastsFor('none')).toEqual([]);
  });

  it('subscribes to daily only for position "date"', () => {
    expect(forecastsFor('date')).toEqual(['daily']);
  });

  it('defaults to "date" behaviour when position is omitted', () => {
    expect(forecastsFor(undefined)).toEqual(['daily']);
  });

  it('subscribes to daily and hourly for "event" and "both"', () => {
    expect(forecastsFor('event')).toEqual(['daily', 'hourly']);
    expect(forecastsFor('both')).toEqual(['daily', 'hourly']);
  });

  /**
   * The bug in one assertion: "Nowhere" must never cost more than a position that
   * actually draws something. This is what regressed, and it is the cheapest guard
   * against the same fall-through returning.
   */
  it('never makes "none" more expensive than a rendering position', () => {
    const none = forecastsFor('none').length;
    const mismatches = EDITOR_POSITIONS.filter(
      (p) => p !== 'none' && forecastsFor(p).length < none,
    );
    expect(mismatches).toEqual([]);
    expect(none).toBe(0);
  });

  /**
   * Guards the pairing that the fall-through violated: a stream is subscribed to
   * exactly when some renderer consumes it. `leaves.ts` gates the date badge on
   * `'date' | 'both'` and the event badge on `'event' | 'both'`.
   */
  it('subscribes to a stream only when a renderer consumes it', () => {
    const mismatches: Array<string> = [];
    for (const position of EDITOR_POSITIONS) {
      const got = forecastsFor(position);
      const rendersDate = position === 'date' || position === 'both';
      const rendersEvent = position === 'event' || position === 'both';
      // 'both' keeps the daily stream for the date column; 'event' still needs daily
      // because the per-event forecast falls back to it beyond the hourly horizon.
      const wantsDaily = rendersDate || rendersEvent;
      if (got.includes('daily') !== wantsDaily) {
        mismatches.push(`${position}: daily=${got.includes('daily')} want=${wantsDaily}`);
      }
      if (got.includes('hourly') !== rendersEvent) {
        mismatches.push(`${position}: hourly=${got.includes('hourly')} want=${rendersEvent}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('treats an unknown position as a rendering one rather than silently dropping it', () => {
    // Defensive: an unrecognised value must not resolve to "no forecast", which would
    // hide a future typo behind an empty weather column instead of surfacing it.
    expect(forecastsFor('bogus')).toEqual(['daily', 'hourly']);
  });
});

/**
 * The other half of the same contract, on the render side.
 *
 * The subscription tests above prove `'none'` asks for no forecast stream. That is
 * only half of "renders nothing": the card is handed forecasts whenever *any* card on
 * the dashboard subscribes to them, so a render-side gate that has drifted still draws
 * badges for a card configured to show none. Nothing above can see that — those tests
 * never render.
 *
 * Both gates were measured to be freely widenable at the merged head: relaxing the day
 * header's gate to `position !== 'event'` and the event row's to `position !== 'date'`
 * left the entire suite passing while `'none'` started drawing weather on both
 * surfaces. This is the third link in the chain for an enum option — offered by the
 * editor, stored by the config, and actually *drawn* — and it was the missing one.
 *
 * `'both'` is asserted alongside as the positive control. Without it a gate that
 * rendered nothing at all would satisfy the `'none'` assertions and look correct.
 */
describe('weather position `none` renders no badge', () => {
  // Same freeze as the other DOM suites: day classification and the forecast lookup
  // both read the wall clock, so without it the fixture's forecast keys stop matching
  // the fixture's event days and the positive control below renders nothing.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function containersFor(position: string): { column: HTMLElement; list: HTMLElement } {
    const config = buildConfig({ split_multiday_events: true });
    config.weather = {
      entity: ENTITY,
      position,
      date: { show_conditions: true, show_temp: true },
      event: { show_conditions: true, show_temp: true },
    } as Types.WeatherConfig;

    const render = (view: 'column' | 'list'): HTMLElement => {
      const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
      const container = document.createElement('div');
      litRender(
        view === 'column'
          ? Column.renderColumnGroupedEvents(days, config, 'en', WEATHER, null)
          : Render.renderGroupedEvents(days, config, 'en', WEATHER, null),
        container,
      );
      return container;
    };

    return { column: render('column'), list: render('list') };
  }

  it('draws both badges for `both`, proving the forecasts and fixtures reach the gates', () => {
    const { column, list } = containersFor('both');
    expect(column.querySelectorAll('.weather').length).toBeGreaterThan(0);
    expect(column.querySelectorAll('.event-weather').length).toBeGreaterThan(0);
    expect(list.querySelectorAll('.weather').length).toBeGreaterThan(0);
    expect(list.querySelectorAll('.event-weather').length).toBeGreaterThan(0);
  });

  it('draws neither badge in either view for `none`', () => {
    const { column, list } = containersFor('none');
    expect(column.querySelectorAll('.weather').length).toBe(0);
    expect(column.querySelectorAll('.event-weather').length).toBe(0);
    expect(list.querySelectorAll('.weather').length).toBe(0);
    expect(list.querySelectorAll('.event-weather').length).toBe(0);
  });
});

/**
 * The same contract once more, but reached the way a real dashboard reaches it.
 *
 * `setConfig` deep-merges, so a user block of `weather: { entity: … }` keeps the default
 * `position` rather than blanking it. Both suites above assign `config.weather` directly
 * with the position spelled out, so neither exercises the merge at all — and the omitted
 * case is the one every user who does not spell the option out lands on.
 *
 * This ran against a hand-rolled shallow spread until the merge was made deep. It now
 * calls `mergeConfig` itself, because a fixture that merges differently from production
 * stops testing production the moment the two diverge — which is exactly what happened to
 * the defect below.
 *
 * The two halves disagreed exactly there. `getRequiredForecastTypes` resolved the
 * documented `date` default and subscribed to the daily stream, while the render gates
 * compared `position` raw, matched neither `'date'` nor `'both'`, and drew nothing — the
 * card paid for a forecast it could not display. The subscribe half was already pinned
 * above, which is why this suite stayed green while the render half was broken.
 *
 * Asserting *equivalence with an explicit `'date'`* rather than a bare "renders
 * something" is what keeps this honest: a gate defaulting to the wrong position, and a
 * gate widened to render for every value, each fail one of the two tests below.
 */
describe('weather position omitted from a user config', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Renders both views through the same deep merge `setConfig` performs. */
  function merged(weather: Record<string, unknown>): {
    column: HTMLElement;
    list: HTMLElement;
    config: Types.Config;
  } {
    const userYaml = { ...buildConfig({ split_multiday_events: true }), weather };
    const config = Config.mergeConfig(
      Config.DEFAULT_CONFIG as unknown as Record<string, unknown>,
      userYaml as unknown as Record<string, unknown>,
    ) as unknown as Types.Config;

    const view = (v: 'column' | 'list'): HTMLElement => {
      const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', v);
      const container = document.createElement('div');
      litRender(
        v === 'column'
          ? Column.renderColumnGroupedEvents(days, config, 'en', WEATHER, null)
          : Render.renderGroupedEvents(days, config, 'en', WEATHER, null),
        container,
      );
      return container;
    };

    return { column: view('column'), list: view('list'), config };
  }

  it('renders exactly what an explicit `date` renders', () => {
    const omitted = merged({ entity: ENTITY });
    const explicit = merged({ entity: ENTITY, position: 'date' });

    // Positive control: the explicit config must actually draw something, or two zeroes
    // would satisfy the equivalence below and prove nothing at all.
    expect(explicit.column.querySelectorAll('.weather').length).toBeGreaterThan(0);

    for (const view of ['column', 'list'] as const) {
      for (const badge of ['.weather', '.event-weather'] as const) {
        expect(omitted[view].querySelectorAll(badge).length).toBe(
          explicit[view].querySelectorAll(badge).length,
        );
      }
    }
  });

  it('draws the daily forecast it subscribed to', () => {
    const { config, column, list } = merged({ entity: ENTITY });

    expect(WeatherUtils.getRequiredForecastTypes(config.weather)).toContain('daily');
    expect(column.querySelectorAll('.weather').length).toBeGreaterThan(0);
    expect(list.querySelectorAll('.weather').length).toBeGreaterThan(0);
  });
});
