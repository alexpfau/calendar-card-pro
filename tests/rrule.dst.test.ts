import { describe, expect, it } from 'vitest';

import {
  buildRRule,
  defaultEnd,
  defaultRule,
  describeRRule,
  monthlyOptions,
  parseRRule,
} from '../src/interaction/rrule';
import type { RepeatRule } from '../src/interaction/rrule';

/**
 * Recurrence rules where the browser's zone decides the answer.
 *
 * The card shows and edits times in the browser's zone, so a rule's end date is a local date,
 * a timed `UNTIL` is that date at the start's local wall-clock time written in UTC, and a
 * start's weekday and day of the month are local. Under the `unit` project's `TZ=UTC` local
 * and UTC readings are the same number, so reading `getUTCDate()` where `getDate()` belongs,
 * or parsing a `DATE` as UTC midnight, passes there and is wrong for nearly everyone else.
 *
 * Planted when this file was written, reading a UTC end with UTC getters, writing a timed end
 * with `setUTCFullYear`, taking a start's weekday with `getUTCDay` and reading today with UTC
 * getters each failed under all three zones, so no zone is the only guard for those. Reading
 * a `DATE` end as UTC midnight failed under New York alone: it lands a day early only behind
 * UTC. The expected instants are worked out from each zone's offsets, January and July, not
 * from the `Date` arithmetic under test. The Azores, an hour behind UTC in winter and on it in
 * summer, came later, with the one end below that falls on a different date there.
 */

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The expected value for the zone this run is under; a zone without one fails. */
function forZone<T>(values: Record<string, T>): T {
  if (!(ZONE in values)) throw new Error(`No expected value for ${ZONE}`);
  return values[ZONE];
}

const weekly = (until: string): RepeatRule => ({
  freq: 'weekly',
  interval: 1,
  weekdays: ['TU'],
  end: { kind: 'on', until },
});

describe('recurrence rules in the local zone', () => {
  it('runs under a zone that observes DST', () => {
    const january = new Date(2026, 0, 1).getTimezoneOffset();
    const july = new Date(2026, 6, 1).getTimezoneOffset();
    expect(january).not.toBe(july);
  });

  describe("a timed event's end", () => {
    // Berlin is UTC+1 in winter and +2 in summer, New York -5 and -4, Sydney +11 and +10,
    // the Azores -1 and +0.
    it.each([
      [
        'a morning start, ending in winter',
        new Date(2025, 10, 4, 9, 30),
        '2026-01-15',
        {
          'Europe/Berlin': '20260115T083000Z',
          'America/New_York': '20260115T143000Z',
          'Australia/Sydney': '20260114T223000Z',
          'Atlantic/Azores': '20260115T103000Z',
        },
      ],
      [
        'a morning start, ending across a DST change',
        new Date(2025, 10, 4, 9, 30),
        '2026-07-15',
        {
          'Europe/Berlin': '20260715T073000Z',
          'America/New_York': '20260715T133000Z',
          'Australia/Sydney': '20260714T233000Z',
          'Atlantic/Azores': '20260715T093000Z',
        },
      ],
      [
        'an evening start',
        new Date(2025, 10, 4, 21, 30, 15),
        '2026-01-15',
        {
          'Europe/Berlin': '20260115T203015Z',
          'America/New_York': '20260116T023015Z',
          'Australia/Sydney': '20260115T103015Z',
          'Atlantic/Azores': '20260115T223015Z',
        },
      ],
    ])(
      "keeps the start's wall-clock time on the last day, in UTC: %s",
      (_label, start, until, expected) => {
        const text = buildRRule(weekly(until), { allDay: false, start });
        expect(text).toBe(`FREQ=WEEKLY;BYDAY=TU;UNTIL=${forZone(expected)}`);
      },
    );

    it('reads back as the date it was written for', () => {
      const start = new Date(2025, 10, 4, 21, 30);
      for (const until of ['2026-01-15', '2026-03-29', '2026-07-15', '2026-10-25']) {
        const text = buildRRule(weekly(until), { allDay: false, start });
        const parsed = parseRRule(text);
        expect(parsed).toEqual({ kind: 'rule', rule: weekly(until) });
        expect(parsed.kind === 'rule' && buildRRule(parsed.rule, { allDay: false, start })).toBe(
          text,
        );
      }
    });

    it('is a DATE for an all-day event, whatever the zone', () => {
      const start = new Date(2025, 10, 4);
      expect(buildRRule(weekly('2026-01-15'), { allDay: true, start })).toBe(
        'FREQ=WEEKLY;BYDAY=TU;UNTIL=20260115',
      );
    });
  });

  describe('reading an end', () => {
    it.each([
      [
        'FREQ=DAILY;UNTIL=20260114T223000Z',
        {
          'Europe/Berlin': '2026-01-14',
          'America/New_York': '2026-01-14',
          'Australia/Sydney': '2026-01-15',
          'Atlantic/Azores': '2026-01-14',
        },
      ],
      [
        'FREQ=DAILY;UNTIL=20260115T020000Z',
        {
          'Europe/Berlin': '2026-01-15',
          'America/New_York': '2026-01-14',
          'Australia/Sydney': '2026-01-15',
          'Atlantic/Azores': '2026-01-15',
        },
      ],
      [
        'FREQ=DAILY;UNTIL=20260114T233000Z',
        {
          'Europe/Berlin': '2026-01-15',
          'America/New_York': '2026-01-14',
          'Australia/Sydney': '2026-01-15',
          'Atlantic/Azores': '2026-01-14',
        },
      ],
      // The one end on a different date in the Azores than in UTC: 23:30 on the 14th there.
      [
        'FREQ=DAILY;UNTIL=20260115T003000Z',
        {
          'Europe/Berlin': '2026-01-15',
          'America/New_York': '2026-01-14',
          'Australia/Sydney': '2026-01-15',
          'Atlantic/Azores': '2026-01-14',
        },
      ],
    ])('takes the local date a UTC end falls on, %s', (text, expected) => {
      const parsed = parseRRule(text);
      expect(parsed.kind === 'rule' && parsed.rule.end).toEqual({
        kind: 'on',
        until: forZone(expected),
      });
    });

    it.each(['20260115', '20260115T000000', '20260115T233000'])(
      'takes the written date of a DATE or floating end, %s',
      (until) => {
        const parsed = parseRRule(`FREQ=DAILY;UNTIL=${until}`);
        expect(parsed.kind === 'rule' && parsed.rule.end).toEqual({
          kind: 'on',
          until: '2026-01-15',
        });
      },
    );

    it('words the local date a UTC end falls on', () => {
      // Home Assistant words the UTC date here, January 14 in every zone: `rrule`'s `toText`
      // reads `getUTCDate()`. The card words the date its own editor shows.
      const localize = (key: string) => key.replace('ui.components.calendar.event.rrule.', '');
      expect(describeRRule('FREQ=DAILY;UNTIL=20260114T223000Z', localize, 'en')).toBe(
        forZone({
          'Europe/Berlin': 'Every day until January 14, 2026',
          'America/New_York': 'Every day until January 14, 2026',
          'Australia/Sydney': 'Every day until January 15, 2026',
          'Atlantic/Azores': 'Every day until January 14, 2026',
        }),
      );
    });
  });

  describe("a start's weekday and day of the month", () => {
    // Half an hour either side of midnight is a different UTC day in every zone here, but for
    // the Azores, an hour behind UTC in winter, where only the first is.
    it.each([
      [new Date(2026, 0, 31, 23, 30), 'SA'],
      [new Date(2026, 0, 1, 0, 30), 'TH'],
    ])('are local, %s', (start, weekday) => {
      expect(buildRRule(defaultRule('weekly', start), { allDay: false, start })).toBe(
        `FREQ=WEEKLY;BYDAY=${weekday}`,
      );
      expect(buildRRule(defaultRule('monthly', start), { allDay: false, start })).toBe(
        'FREQ=MONTHLY',
      );
    });

    it('decide the monthly choices', () => {
      expect(monthlyOptions(new Date(2026, 0, 31, 23, 30))).toEqual([
        { kind: 'day', day: 31 },
        { kind: 'weekday', nth: -1, weekday: 'SA' },
        { kind: 'last-day' },
      ]);
      expect(monthlyOptions(new Date(2026, 1, 1, 0, 30))).toEqual([
        { kind: 'day', day: 1 },
        { kind: 'weekday', nth: 1, weekday: 'SU' },
      ]);
    });
  });

  describe('the default end date', () => {
    // Counted in calendar days, not 24-hour spans. Each range holds a clock change in at
    // least two of the zones; half an hour from midnight, an hour gained or lost moves a
    // span-based answer onto the wrong day.
    it.each([
      [new Date(2026, 2, 20, 0, 30), 'daily', '2026-04-19'],
      [new Date(2026, 2, 20, 23, 30), 'daily', '2026-04-19'],
      [new Date(2026, 8, 20, 0, 30), 'weekly', '2026-12-20'],
      [new Date(2026, 8, 20, 23, 30), 'weekly', '2026-12-20'],
    ] as const)('from %s, a %s rule ends on %s', (today, freq, until) => {
      expect(defaultEnd('on', freq, today)).toEqual({ kind: 'on', until });
    });
  });
});
