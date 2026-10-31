/**
 * Regression tests for `formatTime`.
 *
 * Every clock time the card draws goes through this function, and it had no test of its own.
 * It was exercised only transitively, through suites that render an event and would notice a
 * string changing — which covers the ordinary hours and misses precisely the two that are
 * hard: 12-hour clocks have no 0 and no 13, so noon and midnight are the only inputs where
 * `hours >= 12` and `hours % 12 || 12` do anything interesting.
 *
 * Mutation testing measured the consequence. Nine mutants, six killed by the existing suite,
 * three alive:
 *
 *   - `hours >= 12` → `hours > 12` renders noon as `12:00 AM`
 *   - `hours % 12 || 12` → `hours % 12` renders midnight as `0:00 AM`
 *   - the `use24h = true` default flipped to `false`, which would silently switch clock
 *     format for every user who never configured one
 *
 * All three survived 1,458 tests. Padding and branch selection were already covered and are
 * asserted here too, so the file states the whole contract rather than only the holes.
 *
 * Dates are built with the local-time constructor on purpose: `formatTime` reads
 * `getHours()`, so this way the intended wall-clock hour is the input in any timezone and the
 * assertions hold under the DST zones as well as UTC.
 */

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { formatEventTimeParts, formatTime } from '../src/utils/format';

/** A date whose local wall-clock time is exactly `hours:minutes`, in any timezone. */
const at = (hours: number, minutes = 0) => new Date(2026, 5, 17, hours, minutes);

describe('formatTime', () => {
  describe('12-hour clock', () => {
    // The whole day, so the two boundaries are asserted in the company of the hours that
    // already worked. 0 and 12 are the cases the suite could not see.
    const expected = [
      '12:00 AM', // midnight — not `0:00 AM`
      '1:00 AM',
      '2:00 AM',
      '3:00 AM',
      '4:00 AM',
      '5:00 AM',
      '6:00 AM',
      '7:00 AM',
      '8:00 AM',
      '9:00 AM',
      '10:00 AM',
      '11:00 AM',
      '12:00 PM', // noon — not `12:00 AM`
      '1:00 PM',
      '2:00 PM',
      '3:00 PM',
      '4:00 PM',
      '5:00 PM',
      '6:00 PM',
      '7:00 PM',
      '8:00 PM',
      '9:00 PM',
      '10:00 PM',
      '11:00 PM',
    ];

    it.each(expected.map((text, hour) => [hour, text]))('renders %i as %s', (hour, text) => {
      expect(formatTime(at(hour as number), false)).toBe(text);
    });

    it('places midnight and noon in the correct half of the day', () => {
      // Stated separately from the table because these two are the entire point: a 12-hour
      // clock has no `0` and no `13`, so both are special cases rather than arithmetic.
      expect(formatTime(at(0), false)).toBe('12:00 AM');
      expect(formatTime(at(12), false)).toBe('12:00 PM');
    });

    it('pads the hour only when asked', () => {
      expect(formatTime(at(9, 5), false)).toBe('9:05 AM');
      expect(formatTime(at(9, 5), false, true)).toBe('09:05 AM');
    });
  });

  describe('24-hour clock', () => {
    it('keeps midnight and noon distinct', () => {
      expect(formatTime(at(0), true)).toBe('0:00');
      expect(formatTime(at(12), true)).toBe('12:00');
      expect(formatTime(at(23, 59), true)).toBe('23:59');
    });

    it('pads the hour only when asked', () => {
      expect(formatTime(at(9, 5), true)).toBe('9:05');
      expect(formatTime(at(9, 5), true, true)).toBe('09:05');
    });

    it('renders the same digits whatever the locale, on every time_24h setting', () => {
      // The regression this pins ran the other way round. A grid fix made the axis and the
      // events agree on 12-versus-24, which was right, and reached for
      // `Intl.DateTimeFormat` to do it, which was not: the card's own formatter was the
      // only thing list and column had ever used, so every user who never set `time_24h`
      // -- the shipped default is `'system'` -- silently moved onto `Intl`. Danish renders
      // `9.05`, Japanese prefixes `午前`, and English 24-hour pads to `09:05` under
      // `hour: 'numeric'`, which also made `time_two_digit_hours` a no-op for the largest
      // cohort of all. A later fix narrowed the gate back and left the formatter, so the
      // default cohort was still affected.
      //
      // Danish is the discriminator: it is the setting where `Intl` differs from this
      // card by a character a reader would notice, and the previous test picked
      // `time_24h: true`, an explicit value the gate never selected -- it passed with the
      // regression live. `'system'` is the value that matters, so it is asserted first.
      const event: Types.CalendarEventData = {
        start: { dateTime: at(9, 5).toISOString() },
        end: { dateTime: at(10, 5).toISOString() },
        summary: 'Review',
      };
      const danish = {
        states: {},
        callApi: async () => undefined,
        callService: () => undefined,
        locale: { language: 'da', time_format: '24' },
      } as unknown as Types.Hass;

      expect(formatEventTimeParts(event, buildConfig(), 'en', danish).text).toBe('9:05 - 10:05');
      expect(formatEventTimeParts(event, buildConfig({ time_24h: true }), 'en', danish).text).toBe(
        '9:05 - 10:05',
      );
      expect(formatEventTimeParts(event, buildConfig({ time_24h: false }), 'en', danish).text).toBe(
        '9:05 AM - 10:05 AM',
      );
    });

    it('still pads to two digits for an English 24-hour card', () => {
      // `Intl` renders `hour: 'numeric'` and `hour: '2-digit'` identically for `en` under
      // a 24-hour cycle -- both `09:05` -- so while the card formatted through it this
      // option distinguished nothing at all for the commonest configuration there is.
      //
      // The first assertion is the falsifier and the second is the documentation, which
      // is worth saying because the obvious reading is the wrong way round: if `Intl`
      // gives `09:05` for both settings, then the line expecting `9:05` is the only one
      // it can fail. Restoring the `Intl` branch fails line one and leaves line two
      // green. Do not drop line one as the redundant half of a pair.
      const event: Types.CalendarEventData = {
        start: { dateTime: at(9, 5).toISOString() },
        end: { dateTime: at(10, 5).toISOString() },
        summary: 'Review',
      };
      const english = {
        states: {},
        callApi: async () => undefined,
        callService: () => undefined,
        locale: { language: 'en', time_format: '24' },
      } as unknown as Types.Hass;

      expect(formatEventTimeParts(event, buildConfig(), 'en', english).text).toBe('9:05 - 10:05');
      expect(
        formatEventTimeParts(event, buildConfig({ time_two_digit_hours: true }), 'en', english)
          .text,
      ).toBe('09:05 - 10:05');
    });
  });

  it('defaults to the 24-hour clock', () => {
    // Callers that omit the argument get 24-hour time. Flipping this default would change
    // the clock format for everyone who never configured one, which no other test would see.
    expect(formatTime(at(13, 30))).toBe('13:30');
    expect(formatTime(at(13, 30))).not.toContain('PM');
  });
});
