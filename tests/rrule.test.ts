import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COUNT,
  buildRRule,
  defaultEnd,
  defaultRule,
  describeRRule,
  monthlyOptions,
  parseRRule,
} from '../src/interaction/rrule';
import type { MonthlyMode, RepeatRule } from '../src/interaction/rrule';

/**
 * Recurrence rules as Home Assistant's own event editor reads, writes and words them.
 *
 * Every expected string here is what Home Assistant's frontend produces for the same choice,
 * read from `ha-recurrence-rule-editor.ts` and `recurrence.ts` and from the `rrule` package
 * it delegates to. When this file was written each one was also checked against `rrule`
 * 2.8.1, the version Home Assistant pins, by driving its `optionsToString` and `toText` the
 * way Home Assistant does. The card does not depend on that package, so the strings are
 * pinned here by value.
 *
 * Nothing in this file depends on the local zone: every date is built from local fields and
 * read back the same way. A timed `UNTIL` and a UTC one do depend on it, and live in
 * `rrule.dst.test.ts`.
 */

/** A Tuesday, the 4th: off the days any monthly fixture names, so none is normalized. */
const START = new Date(2025, 10, 4, 9, 30);

const PREFIX = 'ui.components.calendar.event.rrule.';

/** `ui.components.calendar.event.rrule` from Home Assistant's `src/translations/en.json`. */
const EN: Record<string, string> = {
  every: 'every',
  years: 'years',
  year: 'year',
  months: 'months',
  month: 'month',
  weeks: 'weeks',
  week: 'week',
  weekdays: 'weekdays',
  weekday: 'weekday',
  days: 'days',
  day: 'day',
  until: 'until',
  for: 'for',
  in: 'in',
  on: 'on',
  'on the': 'on the',
  and: 'and',
  or: 'or',
  at: 'at',
  last: 'last',
  time: 'time',
  times: 'times',
};

/** Home Assistant's `localize` over that table: an empty string for a key it does not hold. */
const localizeEn = (key: string) =>
  key.startsWith(PREFIX) ? (EN[key.slice(PREFIX.length)] ?? '') : '';

const rule = (partial: Partial<RepeatRule> & Pick<RepeatRule, 'freq'>): RepeatRule => ({
  interval: 1,
  weekdays: [],
  end: { kind: 'never' },
  ...partial,
});

//-----------------------------------------------------------------------------
// READING
//-----------------------------------------------------------------------------

describe('parseRRule', () => {
  it.each([undefined, null, '', '   '])('reads %j as no rule', (value) => {
    expect(parseRRule(value)).toEqual({ kind: 'none' });
  });

  // Every shape Home Assistant's editor can show, in the form it writes it.
  it.each<[string, RepeatRule]>([
    ['FREQ=DAILY', rule({ freq: 'daily' })],
    ['FREQ=DAILY;INTERVAL=3', rule({ freq: 'daily', interval: 3 })],
    ['FREQ=DAILY;COUNT=30', rule({ freq: 'daily', end: { kind: 'after', count: 30 } })],
    ['FREQ=WEEKLY', rule({ freq: 'weekly' })],
    ['FREQ=WEEKLY;BYDAY=TU', rule({ freq: 'weekly', weekdays: ['TU'] })],
    ['FREQ=WEEKLY;BYDAY=TU,MO', rule({ freq: 'weekly', weekdays: ['TU', 'MO'] })],
    [
      'FREQ=WEEKLY;INTERVAL=2;COUNT=13;BYDAY=MO,WE',
      rule({
        freq: 'weekly',
        interval: 2,
        weekdays: ['MO', 'WE'],
        end: { kind: 'after', count: 13 },
      }),
    ],
    ['FREQ=MONTHLY', rule({ freq: 'monthly' })],
    ['FREQ=MONTHLY;BYMONTHDAY=20', rule({ freq: 'monthly', monthly: { kind: 'day', day: 20 } })],
    ['FREQ=MONTHLY;BYMONTHDAY=31', rule({ freq: 'monthly', monthly: { kind: 'day', day: 31 } })],
    ['FREQ=MONTHLY;BYMONTHDAY=-1', rule({ freq: 'monthly', monthly: { kind: 'last-day' } })],
    [
      'FREQ=MONTHLY;BYDAY=+2SU',
      rule({ freq: 'monthly', monthly: { kind: 'weekday', nth: 2, weekday: 'SU' } }),
    ],
    [
      'FREQ=MONTHLY;BYDAY=-1FR',
      rule({ freq: 'monthly', monthly: { kind: 'weekday', nth: -1, weekday: 'FR' } }),
    ],
    [
      'FREQ=MONTHLY;INTERVAL=2;COUNT=12;BYDAY=+4SA',
      rule({
        freq: 'monthly',
        interval: 2,
        monthly: { kind: 'weekday', nth: 4, weekday: 'SA' },
        end: { kind: 'after', count: 12 },
      }),
    ],
    ['FREQ=YEARLY', rule({ freq: 'yearly' })],
    ['FREQ=YEARLY;INTERVAL=2', rule({ freq: 'yearly', interval: 2 })],
    ['FREQ=YEARLY;COUNT=5', rule({ freq: 'yearly', end: { kind: 'after', count: 5 } })],
    [
      'FREQ=WEEKLY;BYDAY=TU;UNTIL=20260115',
      rule({ freq: 'weekly', weekdays: ['TU'], end: { kind: 'on', until: '2026-01-15' } }),
    ],
  ])('reads %s', (text, expected) => {
    expect(parseRRule(text)).toEqual({ kind: 'rule', rule: expected });
  });

  // Forms Home Assistant's editor does not write but reads the same way.
  it.each<[string, RepeatRule]>([
    ['RRULE:FREQ=DAILY', rule({ freq: 'daily' })],
    ['rrule:freq=weekly;byday=tu', rule({ freq: 'weekly', weekdays: ['TU'] })],
    ['BYDAY=TU;FREQ=WEEKLY', rule({ freq: 'weekly', weekdays: ['TU'] })],
    ['FREQ=DAILY;INTERVAL=1', rule({ freq: 'daily' })],
    [' FREQ=DAILY ; COUNT=2 ;', rule({ freq: 'daily', end: { kind: 'after', count: 2 } })],
    [
      'FREQ=MONTHLY;BYDAY=2SU',
      rule({ freq: 'monthly', monthly: { kind: 'weekday', nth: 2, weekday: 'SU' } }),
    ],
    ['FREQ=MONTHLY;BYMONTHDAY=+15', rule({ freq: 'monthly', monthly: { kind: 'day', day: 15 } })],
    // A floating DATE-TIME is its written date, whatever the hour.
    [
      'FREQ=DAILY;UNTIL=20260115T000000',
      rule({ freq: 'daily', end: { kind: 'on', until: '2026-01-15' } }),
    ],
    [
      'FREQ=DAILY;UNTIL=20260115T235959',
      rule({ freq: 'daily', end: { kind: 'on', until: '2026-01-15' } }),
    ],
    // WKST only matters to a weekly rule with an interval and a BYDAY; elsewhere it is dropped.
    ['FREQ=DAILY;WKST=SU', rule({ freq: 'daily' })],
    ['FREQ=WEEKLY;BYDAY=TU,TH;WKST=SU', rule({ freq: 'weekly', weekdays: ['TU', 'TH'] })],
    ['FREQ=WEEKLY;INTERVAL=2;WKST=SU', rule({ freq: 'weekly', interval: 2 })],
    [
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;WKST=MO',
      rule({ freq: 'weekly', interval: 2, weekdays: ['TU', 'TH'] }),
    ],
    [
      'FREQ=MONTHLY;BYDAY=-1FR;WKST=SU',
      rule({ freq: 'monthly', monthly: { kind: 'weekday', nth: -1, weekday: 'FR' } }),
    ],
  ])('reads %j', (text, expected) => {
    expect(parseRRule(text)).toEqual({ kind: 'rule', rule: expected });
  });

  it.each([
    // Parts the editor has no control for.
    'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
    'FREQ=YEARLY;BYMONTH=3',
    'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=1',
    'FREQ=YEARLY;BYYEARDAY=100',
    'FREQ=YEARLY;BYWEEKNO=20',
    'FREQ=DAILY;BYHOUR=9',
    'FREQ=DAILY;BYMINUTE=30',
    'FREQ=MONTHLY;BYMONTHDAY=1,15',
    'FREQ=DAILY;X-NAME=1',
    'FREQ=DAILY;RSCALE=GREGORIAN',
    // BY parts on a frequency that does not take them.
    'FREQ=DAILY;BYDAY=MO,TU',
    'FREQ=YEARLY;BYDAY=+1MO',
    'FREQ=WEEKLY;BYMONTHDAY=1',
    'FREQ=YEARLY;BYMONTHDAY=1',
    'FREQ=DAILY;BYMONTHDAY=1',
    // Sub-daily or unknown frequencies, or none.
    'FREQ=HOURLY',
    'FREQ=MINUTELY',
    'FREQ=SECONDLY',
    'FREQ=FORTNIGHTLY',
    'INTERVAL=2',
    'FREQ',
    'every week',
    // Weekly weekdays the editor cannot pick.
    'FREQ=WEEKLY;BYDAY=1MO',
    'FREQ=WEEKLY;BYDAY=MO,MO',
    'FREQ=WEEKLY;BYDAY=MO,,TU',
    'FREQ=WEEKLY;BYDAY=XX',
    // Monthly days and ordinals the editor does not offer.
    'FREQ=MONTHLY;BYDAY=MO',
    'FREQ=MONTHLY;BYDAY=+5FR',
    'FREQ=MONTHLY;BYDAY=-2FR',
    'FREQ=MONTHLY;BYDAY=0FR',
    'FREQ=MONTHLY;BYDAY=+1MO,+3MO',
    'FREQ=MONTHLY;BYMONTHDAY=0',
    'FREQ=MONTHLY;BYMONTHDAY=32',
    'FREQ=MONTHLY;BYMONTHDAY=-2',
    'FREQ=MONTHLY;BYMONTHDAY=15;BYDAY=+1MO',
    // WKST changing which weeks a fortnightly rule lands in.
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;WKST=SU',
    'FREQ=WEEKLY;INTERVAL=3;BYDAY=FR;WKST=SA',
    'FREQ=DAILY;WKST=XX',
    // Malformed numbers, ends and repeats.
    'FREQ=WEEKLY;INTERVAL=0',
    'FREQ=WEEKLY;INTERVAL=-1',
    'FREQ=WEEKLY;INTERVAL=1.5',
    'FREQ=WEEKLY;INTERVAL=abc',
    'FREQ=DAILY;COUNT=0',
    'FREQ=DAILY;COUNT=',
    'FREQ=DAILY;COUNT=5;UNTIL=20260101',
    'FREQ=DAILY;UNTIL=20260230',
    'FREQ=DAILY;UNTIL=20261301',
    'FREQ=DAILY;UNTIL=2026-01-15',
    'FREQ=DAILY;UNTIL=20260115T250000Z',
    'FREQ=DAILY;FREQ=WEEKLY',
    'FREQ=DAILY;freq=daily',
    'DTSTART:20250101T090000Z\nRRULE:FREQ=DAILY',
    'EXRULE:FREQ=DAILY',
    '  FREQ=HOURLY  ',
    'RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU,WE,TH,FR',
  ])('keeps %j verbatim as a custom rule', (raw) => {
    expect(parseRRule(raw)).toEqual({ kind: 'custom', raw });
  });
});

//-----------------------------------------------------------------------------
// WRITING
//-----------------------------------------------------------------------------

describe('buildRRule', () => {
  // The same shapes as above, each written back exactly as read: the part order is
  // `rrule`'s `optionsToString` over the options object `_computeRRule` builds.
  it.each<[string, boolean]>([
    ['FREQ=DAILY', false],
    ['FREQ=DAILY;INTERVAL=3', false],
    ['FREQ=DAILY;COUNT=30', false],
    ['FREQ=WEEKLY', false],
    ['FREQ=WEEKLY;BYDAY=TU', false],
    ['FREQ=WEEKLY;BYDAY=TU,MO', false],
    ['FREQ=WEEKLY;INTERVAL=2;COUNT=13;BYDAY=MO,WE', false],
    ['FREQ=MONTHLY', false],
    ['FREQ=MONTHLY;BYMONTHDAY=20', false],
    ['FREQ=MONTHLY;BYMONTHDAY=31', false],
    ['FREQ=MONTHLY;BYMONTHDAY=-1', false],
    ['FREQ=MONTHLY;BYDAY=+2SU', false],
    ['FREQ=MONTHLY;BYDAY=-1FR', false],
    ['FREQ=MONTHLY;INTERVAL=2;COUNT=12;BYDAY=+4SA', false],
    ['FREQ=YEARLY', false],
    ['FREQ=YEARLY;INTERVAL=2', false],
    ['FREQ=YEARLY;COUNT=5', false],
    ['FREQ=WEEKLY;BYDAY=TU;UNTIL=20260115', true],
    ['FREQ=MONTHLY;INTERVAL=3;BYDAY=-1FR;UNTIL=20261231', true],
  ])('writes %s back as read', (text, allDay) => {
    const parsed = parseRRule(text);
    if (parsed.kind !== 'rule') throw new Error(`${text} did not parse`);
    expect(buildRRule(parsed.rule, { allDay, start: START })).toBe(text);
  });

  it.each([
    ['rrule:freq=weekly;byday=tu', 'FREQ=WEEKLY;BYDAY=TU'],
    ['BYDAY=TU;INTERVAL=1;FREQ=WEEKLY', 'FREQ=WEEKLY;BYDAY=TU'],
    // `rrule`'s `Weekday.toString` signs a positive ordinal.
    ['FREQ=MONTHLY;BYDAY=2SU', 'FREQ=MONTHLY;BYDAY=+2SU'],
    // The start's own day of the month is written bare, as Home Assistant's first choice is.
    ['FREQ=MONTHLY;BYMONTHDAY=4', 'FREQ=MONTHLY'],
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;WKST=MO', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH'],
    ['FREQ=DAILY;WKST=SU', 'FREQ=DAILY'],
    ['UNTIL=20260115T093000;FREQ=WEEKLY;BYDAY=TU', 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20260115'],
  ])('writes %j as Home Assistant would, %s', (text, expected) => {
    const parsed = parseRRule(text);
    if (parsed.kind !== 'rule') throw new Error(`${text} did not parse`);
    expect(buildRRule(parsed.rule, { allDay: true, start: START })).toBe(expected);
  });

  it('keeps weekdays in the order given, once each', () => {
    // Home Assistant keeps them in a Set, so it writes them in the order they were picked.
    const weekly = rule({ freq: 'weekly', weekdays: ['TH', 'MO', 'TH', 'SU'] });
    expect(buildRRule(weekly, { allDay: false, start: START })).toBe('FREQ=WEEKLY;BYDAY=TH,MO,SU');
  });

  it('reads weekdays only for a weekly rule and the monthly choice only for a monthly one', () => {
    const extras = { weekdays: ['MO' as const], monthly: { kind: 'last-day' as const } };
    expect(buildRRule(rule({ freq: 'daily', ...extras }), { allDay: false, start: START })).toBe(
      'FREQ=DAILY',
    );
    expect(buildRRule(rule({ freq: 'weekly', ...extras }), { allDay: false, start: START })).toBe(
      'FREQ=WEEKLY;BYDAY=MO',
    );
    expect(buildRRule(rule({ freq: 'monthly', ...extras }), { allDay: false, start: START })).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=-1',
    );
    expect(buildRRule(rule({ freq: 'yearly', ...extras }), { allDay: false, start: START })).toBe(
      'FREQ=YEARLY',
    );
  });

  it("writes an all-day event's end as a DATE, whatever the time of the start", () => {
    const weekly = rule({
      freq: 'weekly',
      weekdays: ['TU'],
      end: { kind: 'on', until: '2026-01-15' },
    });
    for (const start of [new Date(2025, 10, 4), new Date(2025, 10, 4, 23, 59, 59)]) {
      expect(buildRRule(weekly, { allDay: true, start })).toBe(
        'FREQ=WEEKLY;BYDAY=TU;UNTIL=20260115',
      );
    }
  });

  it.each<[string, RepeatRule]>([
    ['interval 0', rule({ freq: 'daily', interval: 0 })],
    ['interval 1.5', rule({ freq: 'daily', interval: 1.5 })],
    ['count 0', rule({ freq: 'daily', end: { kind: 'after', count: 0 } })],
    ['a February 30th', rule({ freq: 'daily', end: { kind: 'on', until: '2026-02-30' } })],
    ['an RFC 5545 date', rule({ freq: 'daily', end: { kind: 'on', until: '20260115' } })],
    ['day 0', rule({ freq: 'monthly', monthly: { kind: 'day', day: 0 } })],
    ['day 32', rule({ freq: 'monthly', monthly: { kind: 'day', day: 32 } })],
    [
      'a 5th weekday',
      rule({ freq: 'monthly', monthly: { kind: 'weekday', nth: 5, weekday: 'MO' } }),
    ],
    [
      'a 0th weekday',
      rule({ freq: 'monthly', monthly: { kind: 'weekday', nth: 0, weekday: 'MO' } }),
    ],
    ['a weekday name', rule({ freq: 'weekly', weekdays: ['MON' as 'MO'] })],
  ])('refuses %s', (_label, invalid) => {
    expect(() => buildRRule(invalid, { allDay: true, start: START })).toThrow(RangeError);
  });

  it('refuses an invalid start', () => {
    expect(() =>
      buildRRule(rule({ freq: 'daily' }), { allDay: false, start: new Date(NaN) }),
    ).toThrow(RangeError);
  });
});

//-----------------------------------------------------------------------------
// DEFAULTS
//-----------------------------------------------------------------------------

describe('defaultRule', () => {
  // Home Assistant's `_computeRRule` once a frequency is picked: `_onRepeatSelected` keeps
  // the interval at 1, `_computeWeekday` has already put the start's weekday in the set, and
  // the monthly choice is still unset, so a fresh monthly rule writes no BY part.
  it.each<[RepeatRule['freq'], RepeatRule, string]>([
    ['daily', rule({ freq: 'daily' }), 'FREQ=DAILY'],
    ['weekly', rule({ freq: 'weekly', weekdays: ['TU'] }), 'FREQ=WEEKLY;BYDAY=TU'],
    ['monthly', rule({ freq: 'monthly', monthly: { kind: 'day', day: 4 } }), 'FREQ=MONTHLY'],
    ['yearly', rule({ freq: 'yearly' }), 'FREQ=YEARLY'],
  ])('starts a %s rule as Home Assistant does', (freq, expected, text) => {
    expect(defaultRule(freq, START)).toEqual(expected);
    expect(buildRRule(defaultRule(freq, START), { allDay: false, start: START })).toBe(text);
  });

  it.each([
    [new Date(2026, 0, 4), 'SU'],
    [new Date(2026, 0, 5), 'MO'],
    [new Date(2026, 0, 10), 'SA'],
  ])("repeats weekly on the start's weekday, %s", (start, weekday) => {
    expect(buildRRule(defaultRule('weekly', start), { allDay: true, start })).toBe(
      `FREQ=WEEKLY;BYDAY=${weekday}`,
    );
  });
});

describe('defaultEnd', () => {
  it("holds Home Assistant's DEFAULT_COUNT", () => {
    expect(DEFAULT_COUNT).toEqual({ daily: 30, weekly: 13, monthly: 12, yearly: 5 });
  });

  it.each<[RepeatRule['freq'], number]>([
    ['daily', 30],
    ['weekly', 13],
    ['monthly', 12],
    ['yearly', 5],
  ])('ends a %s rule after %i occurrences', (freq, count) => {
    expect(defaultEnd('after', freq, START)).toEqual({ kind: 'after', count });
  });

  it('never ends by default', () => {
    expect(defaultEnd('never', 'weekly', START)).toEqual({ kind: 'never' });
  });

  // `untilValue`: that many periods from today, through `date-fns`' `addDays`, `addWeeks`,
  // `addMonths` and `addYears`, which land on a shorter month's last day.
  it.each<[Date, RepeatRule['freq'], string]>([
    [new Date(2026, 0, 31, 12), 'daily', '2026-03-02'],
    [new Date(2026, 0, 31, 12), 'weekly', '2026-05-02'],
    [new Date(2026, 0, 31, 12), 'monthly', '2027-01-31'],
    [new Date(2026, 0, 31, 12), 'yearly', '2031-01-31'],
    [new Date(2024, 1, 29, 12), 'monthly', '2025-02-28'],
    [new Date(2024, 1, 29, 12), 'yearly', '2029-02-28'],
    [new Date(2025, 11, 31, 23, 59), 'daily', '2026-01-30'],
    [new Date(2025, 11, 31, 23, 59), 'weekly', '2026-04-01'],
  ])('from %s ends a %s rule on %s', (today, freq, until) => {
    expect(defaultEnd('on', freq, today)).toEqual({ kind: 'on', until });
  });
});

describe('monthlyOptions', () => {
  // `getMonthlyRepeatItems`, and what picking each one writes. Its first item carries no
  // `bymonthday`, so `_onMonthlyDetailSelected` clears the monthly state and Home Assistant
  // writes a bare FREQ=MONTHLY for it.
  it.each<[string, Date, MonthlyMode[], string[]]>([
    [
      'mid-month: the day and the nth weekday',
      new Date(2026, 0, 15),
      [
        { kind: 'day', day: 15 },
        { kind: 'weekday', nth: 3, weekday: 'TH' },
      ],
      ['FREQ=MONTHLY', 'FREQ=MONTHLY;BYDAY=+3TH'],
    ],
    [
      'a 5th weekday: the last weekday instead of the 5th',
      new Date(2026, 0, 29),
      [
        { kind: 'day', day: 29 },
        { kind: 'weekday', nth: -1, weekday: 'TH' },
      ],
      ['FREQ=MONTHLY', 'FREQ=MONTHLY;BYDAY=-1TH'],
    ],
    [
      'a 4th weekday that is also the last: both',
      new Date(2026, 0, 26),
      [
        { kind: 'day', day: 26 },
        { kind: 'weekday', nth: 4, weekday: 'MO' },
        { kind: 'weekday', nth: -1, weekday: 'MO' },
      ],
      ['FREQ=MONTHLY', 'FREQ=MONTHLY;BYDAY=+4MO', 'FREQ=MONTHLY;BYDAY=-1MO'],
    ],
    [
      'the last day of the month',
      new Date(2026, 0, 31),
      [{ kind: 'day', day: 31 }, { kind: 'weekday', nth: -1, weekday: 'SA' }, { kind: 'last-day' }],
      ['FREQ=MONTHLY', 'FREQ=MONTHLY;BYDAY=-1SA', 'FREQ=MONTHLY;BYMONTHDAY=-1'],
    ],
    [
      'the last day, also a 4th weekday',
      new Date(2026, 1, 28),
      [
        { kind: 'day', day: 28 },
        { kind: 'weekday', nth: 4, weekday: 'SA' },
        { kind: 'weekday', nth: -1, weekday: 'SA' },
        { kind: 'last-day' },
      ],
      [
        'FREQ=MONTHLY',
        'FREQ=MONTHLY;BYDAY=+4SA',
        'FREQ=MONTHLY;BYDAY=-1SA',
        'FREQ=MONTHLY;BYMONTHDAY=-1',
      ],
    ],
  ])('%s', (_label, start, options, written) => {
    expect(monthlyOptions(start)).toEqual(options);
    const texts = options.map((monthly) =>
      buildRRule(rule({ freq: 'monthly', monthly }), { allDay: false, start }),
    );
    expect(texts).toEqual(written);
  });
});

//-----------------------------------------------------------------------------
// WORDING
//-----------------------------------------------------------------------------

describe('describeRRule', () => {
  // `renderRRuleAsText` over Home Assistant's English, including `rrule`'s quirks: the plural
  // test is `n % 100 !== 1`, a fortnightly every-day rule reads "2 weeks days", and the
  // ordinal suffixes Home Assistant has no words for come out empty.
  it.each([
    ['FREQ=DAILY', 'Every day'],
    ['FREQ=DAILY;INTERVAL=2', 'Every 2 days'],
    ['FREQ=DAILY;INTERVAL=11', 'Every 11 days'],
    ['FREQ=DAILY;INTERVAL=101', 'Every 101 day'],
    ['FREQ=DAILY;COUNT=1', 'Every day for 1 time'],
    ['FREQ=DAILY;COUNT=30', 'Every day for 30 times'],
    ['FREQ=DAILY;COUNT=101', 'Every day for 101 time'],
    ['FREQ=WEEKLY', 'Every week'],
    ['FREQ=WEEKLY;INTERVAL=2', 'Every 2 weeks'],
    ['FREQ=WEEKLY;BYDAY=TU', 'Every week on Tuesday'],
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO', 'Every 2 weeks on Monday, Wednesday'],
    ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'Every weekday'],
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=FR,TH,WE,TU,MO', 'Every 2 weeks on weekdays'],
    ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', 'Every day'],
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR,SA,SU', 'Every 2 weeks days'],
    ['FREQ=WEEKLY;INTERVAL=3;COUNT=2;BYDAY=FR', 'Every 3 weeks on Friday for 2 times'],
    ['FREQ=MONTHLY', 'Every month'],
    ['FREQ=MONTHLY;INTERVAL=3', 'Every 3 months'],
    ['FREQ=MONTHLY;BYMONTHDAY=15', 'Every month on the 15'],
    ['FREQ=MONTHLY;BYMONTHDAY=-1', 'Every month on the last'],
    ['FREQ=MONTHLY;BYDAY=+2SU', 'Every month on the 2 Sunday'],
    ['FREQ=MONTHLY;BYDAY=-1FR', 'Every month on the last Friday'],
    ['FREQ=MONTHLY;INTERVAL=2;BYDAY=+1MO', 'Every 2 months on the 1 Monday'],
    ['FREQ=YEARLY', 'Every year'],
    ['FREQ=YEARLY;INTERVAL=2', 'Every 2 years'],
    ['FREQ=YEARLY;COUNT=5', 'Every year for 5 times'],
    ['FREQ=WEEKLY;BYDAY=TU;UNTIL=20260115', 'Every week on Tuesday until January 15, 2026'],
    [
      'FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20261231T093000',
      'Every month on the last Friday until December 31, 2026',
    ],
  ])('words %s as %j', (text, expected) => {
    expect(describeRRule(text, localizeEn, 'en')).toBe(expected);
  });

  // A `localize` that marks what it returns shows which words came through it: everything
  // not in brackets is a number, a day or month name from `Intl`, or `rrule`'s comma.
  describe('takes every word from localize', () => {
    const marked = (key: string) => `[${key.slice(PREFIX.length)}]`;

    it.each([
      [
        'FREQ=WEEKLY;BYDAY=TU;UNTIL=20260115',
        '[every] [week] [on] Tuesday [until] January 15, 2026',
      ],
      ['FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO', '[every] 2 [weeks] [on] Monday, Wednesday'],
      ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', '[every] [weekday]'],
      ['FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR', '[every] 3 [weeks] [on] [weekdays]'],
      ['FREQ=DAILY;COUNT=1', '[every] [day] [for] 1 [time]'],
      ['FREQ=DAILY;INTERVAL=4;COUNT=3', '[every] 4 [days] [for] 3 [times]'],
      ['FREQ=MONTHLY;BYDAY=+2SU', '[every] [month] [on the] 2[nd] Sunday'],
      ['FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR', '[every] 2 [months] [on the] [last] Friday'],
      ['FREQ=MONTHLY;BYMONTHDAY=1', '[every] [month] [on the] 1[st]'],
      ['FREQ=MONTHLY;BYMONTHDAY=3', '[every] [month] [on the] 3[rd]'],
      ['FREQ=MONTHLY;BYMONTHDAY=11', '[every] [month] [on the] 11[th]'],
      ['FREQ=MONTHLY;BYMONTHDAY=22', '[every] [month] [on the] 22[nd]'],
      ['FREQ=MONTHLY;BYMONTHDAY=-1', '[every] [month] [on the] [last]'],
      ['FREQ=YEARLY', '[every] [year]'],
      ['FREQ=YEARLY;INTERVAL=5', '[every] 5 [years]'],
    ])('%s', (text, expected) => {
      const keys: string[] = [];
      const record = (key: string) => {
        keys.push(key);
        return marked(key);
      };
      expect(describeRRule(text, record, 'en')).toBe(expected);
      expect(keys.every((key) => key.startsWith(PREFIX))).toBe(true);
    });
  });

  it('names days and dates in the locale', () => {
    const marked = (key: string) => `[${key.slice(PREFIX.length)}]`;
    expect(describeRRule('FREQ=WEEKLY;BYDAY=SU,SA,FR,TH;UNTIL=20260115', marked, 'de')).toBe(
      '[every] [week] [on] Donnerstag, Freitag, Samstag, Sonntag [until] 15. Januar 2026',
    );
    expect(describeRRule('FREQ=WEEKLY;BYDAY=WE,TU,MO', marked, 'de')).toBe(
      '[every] [week] [on] Montag, Dienstag, Mittwoch',
    );
    expect(describeRRule('FREQ=WEEKLY;BYDAY=SU,SA,FR,TH', localizeEn, 'en')).toBe(
      'Every week on Thursday, Friday, Saturday, Sunday',
    );
    expect(describeRRule('FREQ=MONTHLY;BYDAY=-1SU', localizeEn, 'de')).toBe(
      'Every month on the last Sonntag',
    );
  });

  it('capitalizes the first letter as Home Assistant does', () => {
    const lower = (key: string) => (key === `${PREFIX}every` ? 'jede' : localizeEn(key));
    expect(describeRRule('FREQ=YEARLY', lower, 'de')).toBe('Jede year');
  });

  it.each([
    ['an empty word', (key: string) => (key === `${PREFIX}until` ? '' : localizeEn(key))],
    [
      'a word answered with its key',
      (key: string) => (key === `${PREFIX}on` ? key : localizeEn(key)),
    ],
    ['no words at all', (key: string) => key],
  ])('gives up on %s rather than show a gap', (_label, localize) => {
    expect(describeRRule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20260115', localize, 'en')).toBeUndefined();
  });

  it('leaves an unknown ordinal suffix out, as Home Assistant does', () => {
    // Home Assistant has no `st`, `nd`, `rd` or `th`. Answered with an empty string or with
    // the key itself, a suffix is left out rather than making the wording give up.
    const keyForUnknown = (key: string) => localizeEn(key) || key;
    expect(describeRRule('FREQ=MONTHLY;BYDAY=+3TH', keyForUnknown, 'en')).toBe(
      'Every month on the 3 Thursday',
    );
    expect(describeRRule('FREQ=MONTHLY;BYDAY=+3TH', localizeEn, 'en')).toBe(
      'Every month on the 3 Thursday',
    );
  });

  it.each([undefined, null, '', 'FREQ=HOURLY', 'FREQ=YEARLY;BYMONTH=3', 'FREQ=DAILY;BYDAY=MO'])(
    'does not word %j',
    (text) => {
      expect(describeRRule(text, localizeEn, 'en')).toBeUndefined();
    },
  );

  it('does not word a rule in a locale Intl rejects', () => {
    expect(describeRRule('FREQ=WEEKLY;BYDAY=TU', localizeEn, 'not a locale!')).toBeUndefined();
  });
});
