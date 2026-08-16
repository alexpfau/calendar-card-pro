/**
 * `first_day_of_week` moves the fetch window, and nothing noticed.
 *
 * `start_date` accepts a relative grammar — `start_of_week`, `monday+1w` and friends —
 * and `getTimeWindow` resolves it through `parseStartDateExpression(trimmed,
 * firstDayOfWeek, …)` (`events.ts`). So the *same* `start_date: start_of_week` produces a
 * Sunday window under `first_day_of_week: sunday` and a Monday window under `monday`.
 *
 * That makes it a fetch-affecting option, and `FETCH_TIME_KEYS` in `view.ts` lists it as
 * one. But it appeared in none of the three places that act on that classification:
 *
 * - `getBaseCacheKey`, so two different windows shared one cache entry
 * - `hasConfigChanged`, so changing it did not even ask for a refetch
 * - `generateDeterministicId`, so the card's query identity did not move with it, and a
 *   refresh that came back empty kept the previous window's events on screen
 *
 * The result was a card that kept showing the previous week's window after the setting
 * changed, until the cache TTL expired or the page was hard-reloaded. Silent, and easy to
 * read as the option not working at all.
 *
 * These tests pin both halves. They are written against a `start_date` that actually
 * depends on the setting, because one that does not — an absolute `2026-06-17` — cannot
 * tell a fixed key from a correct one.
 *
 * A later revision moved the key from the *raw* setting to the *resolved* weekday. The
 * raw value is not an identity: `first_day_of_week: system` is a single string that
 * resolves to a different weekday per Home Assistant profile, so two genuinely different
 * windows still shared one entry under it. The earlier version of this file passed
 * `'sunday'` and `'monday'` as strings and could not see that — two different strings
 * trivially produce two different keys. `getBaseCacheKey` now takes `number`, so the
 * compiler rejects the raw value at the call site and the wiring cannot regress silently.
 */

import { describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';
import * as Helpers from '../src/utils/helpers';

/** A config differing from the default only in the fields named. */
function config(overrides: Partial<Types.Config>): Types.Config {
  return {
    ...Config.DEFAULT_CONFIG,
    entities: ['calendar.personal'],
    ...overrides,
  } as Types.Config;
}

describe('first_day_of_week is treated as the fetch-affecting option it is', () => {
  /** `getBaseCacheKey` with only the resolved weekday varying. */
  function keyFor(firstDayOfWeek: number | undefined, startDate = 'start_of_week'): string {
    return EventUtils.getBaseCacheKey(
      'inst',
      ['calendar.personal'],
      7,
      false,
      startDate,
      firstDayOfWeek,
    );
  }

  it('changes the cache key when the start date depends on it', () => {
    expect(keyFor(0)).not.toBe(keyFor(1));
  });

  it('still produces a stable key for two configs that agree', () => {
    // The other direction, so the key is not merely being made unique per call.
    expect(keyFor(1)).toBe(keyFor(1));
  });

  it('keeps Sunday in the key even though it resolves to zero', () => {
    // The trap the numeric contract introduces. The key used to be appended behind a
    // truthiness test, which is correct for a non-empty string and wrong for `0`:
    // Sunday would have silently produced the same key as "no weekday supplied",
    // reintroducing the collision this file exists to prevent.
    expect(keyFor(0)).not.toBe(keyFor(undefined));
  });

  it('ignores the weekday when the start date does not depend on it', () => {
    // The control for the three above. An absolute start date resolves to the same
    // window whatever the week starts on, so keying on the weekday there would split
    // one cache entry into seven for no reason.
    expect(keyFor(0, '2026-06-17')).toBe(keyFor(1, '2026-06-17'));
  });

  it('resolves system to a different weekday per profile', () => {
    // Why the key takes the resolved value rather than the raw setting: this is one
    // config string, and it is not an identity. Both halves of the composition are
    // asserted — the resolution differs, and the differing results key differently.
    const sunday = FormatUtils.getFirstDayOfWeek('system', { first_weekday: 'sunday' });
    const monday = FormatUtils.getFirstDayOfWeek('system', { first_weekday: 'monday' });

    expect(sunday).not.toBe(monday);
    expect(keyFor(sunday)).not.toBe(keyFor(monday));
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

  it('moves the query identity when it changes', () => {
    // `_instanceId` is what the failed-refresh guard compares to decide whether the
    // events already on screen belong to the query now being asked. It was built
    // without the weekday while `hasConfigChanged` treated the weekday as
    // fetch-affecting, so the two disagreed: a Sunday → Monday change asked for a
    // refetch, the refetch came back empty, and the guard concluded the previous
    // Sunday window was still current and kept it.
    const sunday = Helpers.generateDeterministicId(
      ['calendar.personal'],
      7,
      false,
      'start_of_week',
      'sunday',
    );
    const monday = Helpers.generateDeterministicId(
      ['calendar.personal'],
      7,
      false,
      'start_of_week',
      'monday',
    );

    expect(sunday).not.toBe(monday);
  });

  it('keeps the query identity stable when the weekday does not', () => {
    // The control, in the same shape as the cache-key pair above.
    const a = Helpers.generateDeterministicId(
      ['calendar.personal'],
      7,
      false,
      'start_of_week',
      'monday',
    );
    const b = Helpers.generateDeterministicId(
      ['calendar.personal'],
      7,
      false,
      'start_of_week',
      'monday',
    );

    expect(a).toBe(b);
  });
});
