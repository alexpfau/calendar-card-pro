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

import { describe, expect, it } from 'vitest';

import * as Types from '../src/config/types';
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
