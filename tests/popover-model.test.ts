import { describe, expect, it } from 'vitest';

import {
  type Draft,
  type PopoverParams,
  draftFromParams,
  draftProblem,
  eventWrite,
  isDirty,
  spanText,
  writtenRule,
} from '../src/interaction/popover-model';

/**
 * The popover's draft: what it opens with, when a close has something to save, what Home
 * Assistant would refuse, and the event the write sends. Runs under UTC, so a local time and
 * its UTC form are the same number here; `event-times.dst.test.ts` covers the zones.
 */

const base: Omit<PopoverParams, 'mode'> = {
  calendarId: 'calendar.ben',
  canEdit: true,
  canDelete: true,
  calendars: [{ id: 'calendar.ben', name: 'Ben', color: '#3366cc' }],
  language: 'en',
  hour24: true,
  dark: false,
  updated: () => undefined,
};

const opened = (entry: NonNullable<PopoverParams['entry']>): Draft =>
  draftFromParams({ ...base, mode: 'event', entry })!;

const SWIM = {
  summary: 'Swim',
  dtstart: '2026-11-03T16:00:00+00:00',
  dtend: '2026-11-03T17:00:00+00:00',
  location: 'Riverside Pool',
  description: 'Bring goggles',
  uid: 'u1',
};

const WEEKLY = {
  ...SWIM,
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
  recurrence_id: '20261103T160000Z',
};

describe('draftFromParams', () => {
  it('opens an event with its stored fields, times and rule', () => {
    const draft = opened(WEEKLY);
    expect(draft).toMatchObject({
      calendarId: 'calendar.ben',
      summary: 'Swim',
      location: 'Riverside Pool',
      description: 'Bring goggles',
      storedRule: 'FREQ=WEEKLY;BYDAY=TU',
    });
    expect(draft.times).toEqual({
      allDay: false,
      start: new Date('2026-11-03T16:00:00Z'),
      end: new Date('2026-11-03T17:00:00Z'),
    });
    expect(draft.repeat).toMatchObject({
      kind: 'rule',
      rule: { freq: 'weekly', weekdays: ['TU'] },
    });
  });

  it('opens a new event empty, at the times the card chose', () => {
    const times = {
      allDay: false,
      start: new Date('2026-11-04T09:00:00Z'),
      end: new Date('2026-11-04T10:00:00Z'),
    };
    expect(draftFromParams({ ...base, mode: 'new', times })).toEqual({
      calendarId: 'calendar.ben',
      summary: '',
      location: '',
      description: '',
      times,
      repeat: { kind: 'none' },
    });
  });

  it('starts a new event without times at the current hour, for an hour', () => {
    const draft = draftFromParams({ ...base, mode: 'new' }, new Date('2026-11-04T09:41:12Z'))!;
    expect(draft.times).toEqual({
      allDay: false,
      start: new Date('2026-11-04T09:00:00Z'),
      end: new Date('2026-11-04T10:00:00Z'),
    });
  });

  it('opens nothing for an event it cannot read', () => {
    expect(draftFromParams({ ...base, mode: 'event' })).toBeUndefined();
    expect(
      draftFromParams({ ...base, mode: 'event', entry: { ...SWIM, dtstart: 'tomorrow' } }),
    ).toBeUndefined();
  });
});

describe('isDirty', () => {
  const original = opened(WEEKLY);

  it('finds nothing to save in the draft it opened with', () => {
    expect(isDirty(opened(WEEKLY), original)).toBe(false);
  });

  it.each<[string, (draft: Draft) => Draft]>([
    ['a title', (d) => ({ ...d, summary: 'Swim lesson' })],
    ['a location', (d) => ({ ...d, location: '' })],
    ['a description', (d) => ({ ...d, description: 'Bring a towel' })],
    ['a calendar', (d) => ({ ...d, calendarId: 'calendar.anna' })],
    ['a start', (d) => ({ ...d, times: { ...d.times, start: new Date('2026-11-03T15:30:00Z') } })],
    ['an end', (d) => ({ ...d, times: { ...d.times, end: new Date('2026-11-03T17:15:00Z') } })],
    ['all day', (d) => ({ ...d, times: { ...d.times, allDay: true } })],
    ['the repeat', (d) => ({ ...d, repeat: { kind: 'none' } })],
  ])('finds a change to %s', (_name, change) => {
    expect(isDirty(change(opened(WEEKLY)), original)).toBe(true);
  });
});

describe('draftProblem', () => {
  it.each<[string, Partial<Draft>, string | undefined]>([
    ['a titled event', {}, undefined],
    ['no title', { summary: '' }, 'missing'],
    ['a title of spaces', { summary: '   ' }, 'missing'],
    ['no calendar', { calendarId: '' }, 'missing'],
    [
      'an end before its start',
      {
        times: {
          allDay: false,
          start: new Date('2026-11-03T16:00:00Z'),
          end: new Date('2026-11-03T15:00:00Z'),
        },
      },
      'duration',
    ],
  ])('reads %s as %j', (_name, change, problem) => {
    expect(draftProblem({ ...opened(SWIM), ...change })).toBe(problem);
  });
});

describe('eventWrite', () => {
  it('writes a single event with a trimmed title, at UTC times to the second', () => {
    const draft = { ...opened(SWIM), summary: '  Swim lesson ' };
    expect(eventWrite(draft, opened(SWIM))).toEqual({
      summary: 'Swim lesson',
      dtstart: '2026-11-03T16:00:00Z',
      dtend: '2026-11-03T17:00:00Z',
      description: 'Bring goggles',
      location: 'Riverside Pool',
    });
  });

  it('writes an all-day event as dates, its end the day after the last', () => {
    const entry = { ...SWIM, dtstart: '2026-11-03', dtend: '2026-11-05' };
    expect(eventWrite(opened(entry), opened(entry))).toMatchObject({
      dtstart: '2026-11-03',
      dtend: '2026-11-05',
    });
  });

  it('keeps a stored rule as it was written while the repeat is untouched', () => {
    // An order and a part the popover would never write itself: rebuilding it would change
    // the stored text, and for a rule it cannot represent, the days it repeats on.
    for (const rrule of ['INTERVAL=1;FREQ=WEEKLY;BYDAY=TU', 'FREQ=WEEKLY;BYDAY=TU;BYHOUR=16']) {
      const entry = { ...WEEKLY, rrule };
      const draft = { ...opened(entry), summary: 'Swim lesson' };
      expect(eventWrite(draft, opened(entry), 'THISANDFUTURE').rrule).toBe(rrule);
    }
  });

  it('writes a changed repeat as rebuilt from its parts', () => {
    const original = opened(WEEKLY);
    const draft: Draft = {
      ...original,
      repeat: {
        kind: 'rule',
        rule: { freq: 'daily', interval: 2, weekdays: [], end: { kind: 'after', count: 5 } },
      },
    };
    expect(eventWrite(draft, original, 'THISANDFUTURE').rrule).toBe(
      'FREQ=DAILY;INTERVAL=2;COUNT=5',
    );
  });

  it('leaves the rule out of a change to one occurrence, as Home Assistant does', () => {
    const draft = { ...opened(WEEKLY), summary: 'Swim lesson' };
    expect(eventWrite(draft, opened(WEEKLY), '')).not.toHaveProperty('rrule');
  });

  it("writes a new event's repeat, and none when it has none", () => {
    const times = {
      allDay: false,
      start: new Date('2026-11-04T09:00:00Z'),
      end: new Date('2026-11-04T10:00:00Z'),
    };
    const fresh = { ...draftFromParams({ ...base, mode: 'new', times })!, summary: 'Piano' };
    expect(eventWrite(fresh, undefined)).not.toHaveProperty('rrule');
    const weekly: Draft = {
      ...fresh,
      repeat: {
        kind: 'rule',
        rule: { freq: 'weekly', interval: 1, weekdays: ['WE'], end: { kind: 'never' } },
      },
    };
    expect(eventWrite(weekly, undefined).rrule).toBe('FREQ=WEEKLY;BYDAY=WE');
    expect(writtenRule(weekly)).toBe('FREQ=WEEKLY;BYDAY=WE');
  });
});

describe('spanText', () => {
  const span = (start: string, end: string, allDay = false) => ({
    allDay,
    start: new Date(start),
    end: new Date(end),
  });

  it.each([
    [
      'a timed event on one day, 24-hour',
      span('2026-11-03T16:00:00Z', '2026-11-03T17:30:00Z'),
      true,
      'Nov 3, 2026  16:00 – 17:30',
    ],
    [
      'the same on a 12-hour clock',
      span('2026-11-03T16:00:00Z', '2026-11-03T17:30:00Z'),
      false,
      'Nov 3, 2026  4:00 PM – 5:30 PM',
    ],
    [
      'an event ending at midnight, on its own day',
      span('2026-11-03T22:00:00Z', '2026-11-04T00:00:00Z'),
      true,
      'Nov 3, 2026  22:00 – 00:00',
    ],
    [
      'a timed event over two days',
      span('2026-11-03T22:00:00Z', '2026-11-04T02:00:00Z'),
      true,
      'Nov 3, 2026 22:00 – Nov 4, 2026 02:00',
    ],
    [
      'an all-day event',
      span('2026-11-03T00:00:00Z', '2026-11-03T00:00:00Z', true),
      true,
      'Nov 3, 2026',
    ],
    [
      'an all-day event over three days',
      span('2026-11-03T00:00:00Z', '2026-11-05T00:00:00Z', true),
      true,
      'Nov 3, 2026 – Nov 5, 2026',
    ],
  ])('words %s', (_name, times, hour24, text) => {
    expect(spanText(times, 'en', hour24).replace(/\u202f/g, ' ')).toBe(text);
  });
});
