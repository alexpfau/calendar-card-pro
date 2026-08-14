/**
 * `first_day_of_week` moves the fetch window, and nothing noticed.
 *
 * `start_date` accepts a relative grammar — `start_of_week`, `monday+1w` and friends —
 * and `getTimeWindow` resolves it through `parseStartDateExpression(trimmed,
 * firstDayOfWeek, …)` (`events.ts`). So the *same* `start_date: start_of_week` produces a
 * Sunday window under `first_day_of_week: sunday` and a Monday window under `monday`.
 *
 * That makes it a fetch-affecting option, and `FETCH_TIME_KEYS` in `view.ts` lists it as
 * one. But it appeared in neither of the two places that act on that classification:
 *
 * - `getBaseCacheKey`, so two different windows shared one cache entry
 * - `hasConfigChanged`, so changing it did not even ask for a refetch
 *
 * The result was a card that kept showing the previous week's window after the setting
 * changed, until the cache TTL expired or the page was hard-reloaded. Silent, and easy to
 * read as the option not working at all.
 *
 * These tests pin both halves. They are written against a `start_date` that actually
 * depends on the setting, because one that does not — an absolute `2026-06-17` — cannot
 * tell a fixed key from a correct one.
 */

import { describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/** A config differing from the default only in the fields named. */
function config(overrides: Partial<Types.Config>): Types.Config {
  return {
    ...Config.DEFAULT_CONFIG,
    entities: ['calendar.personal'],
    ...overrides,
  } as Types.Config;
}

describe('first_day_of_week is treated as the fetch-affecting option it is', () => {
  it('changes the cache key when the start date depends on it', () => {
    const sunday = EventUtils.getBaseCacheKey(
      'inst',
      ['calendar.personal'],
      7,
      false,
      'start_of_week',
      'sunday',
    );
    const monday = EventUtils.getBaseCacheKey(
      'inst',
      ['calendar.personal'],
      7,
      false,
      'start_of_week',
      'monday',
    );

    expect(sunday).not.toBe(monday);
  });

  it('still produces a stable key for two configs that agree', () => {
    // The other direction, so the key is not merely being made unique per call.
    const a = EventUtils.getBaseCacheKey(
      'inst',
      ['calendar.personal'],
      7,
      false,
      'start_of_week',
      'monday',
    );
    const b = EventUtils.getBaseCacheKey(
      'inst',
      ['calendar.personal'],
      7,
      false,
      'start_of_week',
      'monday',
    );

    expect(a).toBe(b);
  });

  it('asks for a refetch when it changes', () => {
    const previous = config({ start_date: 'start_of_week', first_day_of_week: 'sunday' });
    const current = config({ start_date: 'start_of_week', first_day_of_week: 'monday' });

    expect(Config.hasConfigChanged(previous, current)).toBe(true);
  });

  it('does not ask for a refetch when nothing data-affecting moved', () => {
    // The control. `event_font_size` is pure presentation, so a change to it must not
    // reach the API — otherwise the assertion above would pass for the wrong reason.
    const previous = config({ first_day_of_week: 'monday', event_font_size: '14px' });
    const current = config({ first_day_of_week: 'monday', event_font_size: '18px' });

    expect(Config.hasConfigChanged(previous, current)).toBe(false);
  });
});
