/**
 * All-day date parsing must round-trip through the local calendar day.
 *
 * `parseAllDayDate('2026-06-17')` builds `new Date(2026, 5, 17)` — **local** midnight —
 * and `getLocalDateKey()` reads the local calendar fields back out. The two are exact
 * inverses, and the card leans on that everywhere it matches an all-day event to a day
 * bucket or to a weather forecast.
 *
 * The tempting simplification is `new Date(dateString)`, which the ISO-8601 date-only
 * form parses as **UTC** midnight. In any zone behind UTC that lands on the previous
 * local day, so every all-day event in the Americas would render one day early.
 *
 * This file exists because the unit project cannot see that. It runs under `TZ=UTC`,
 * where local midnight and UTC midnight are the same instant and both implementations
 * agree on every input. Planting that exact one-line change left all 1,352 unit tests
 * green — the mutation was completely unguarded. Only a DST project, which runs in a
 * real zone, can falsify it, so the regression has to live here.
 */
import { describe, expect, it } from 'vitest';

import * as FormatUtils from '../src/utils/format';

/**
 * Dates spanning both DST transitions in each project zone plus ordinary days.
 *
 * The transition dates matter because that is where a naive UTC parse and a local
 * construction diverge by an extra hour on top of the base offset, and where a zone
 * whose transition happens at midnight has no local midnight at all.
 */
const DATES = [
  '2026-01-01',
  '2026-03-28',
  '2026-03-29', // Europe/Berlin DST begins
  '2026-03-30',
  '2026-04-04',
  '2026-04-05', // Australia/Sydney DST ends
  '2026-04-06',
  '2026-06-17',
  '2026-10-03',
  '2026-10-04', // Australia/Sydney DST begins
  '2026-10-05',
  '2026-10-24',
  '2026-10-25', // Europe/Berlin DST ends
  '2026-10-26',
  '2026-12-31',
];

describe('parseAllDayDate round-trips through the local calendar day', () => {
  it.each(DATES)('preserves %s', (key) => {
    expect(FormatUtils.getLocalDateKey(FormatUtils.parseAllDayDate(key))).toBe(key);
  });

  it('produces a local midnight, not a UTC one', () => {
    // The falsifier. The round-trip above is necessary but not sufficient: an
    // implementation that returned UTC midnight would still round-trip in any zone
    // *ahead* of UTC, which includes both project zones for part of the year. Asserting
    // the local clock fields directly is what makes this fail in every zone.
    const parsed = FormatUtils.parseAllDayDate('2026-06-17');

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(5);
    expect(parsed.getDate()).toBe(17);
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
  });

  it('disagrees with a UTC parse wherever the zone is not UTC', () => {
    // The control. If this suite were ever silently rerouted to run under `TZ=UTC`, the
    // two constructions would coincide and the assertions above would pass for the wrong
    // reason. This fails loudly in that case instead.
    expect(process.env.TZ).toBeDefined();
    expect(process.env.TZ).not.toBe('UTC');
    expect(new Date('2026-06-17').getTime()).not.toBe(
      FormatUtils.parseAllDayDate('2026-06-17').getTime(),
    );
  });
});
