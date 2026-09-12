import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEventData } from '../src/config/types';
import { getRelativeTimeString } from '../src/translations/dayjs';
import { TRANSLATIONS } from '../src/translations/localize';
import { getCountdownString } from '../src/utils/format';

function timedEvent(start: string): CalendarEventData {
  return {
    summary: 'Workshop',
    start: { dateTime: start },
    end: { dateTime: new Date(new Date(start).getTime() + 3600000).toISOString() },
  };
}

const FRIDAY = timedEvent('2026-09-11T08:00:00Z');
const SATURDAY = timedEvent('2026-09-12T12:00:00Z');

describe('calendar-day countdowns', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T20:13:42Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('counts consecutive dates despite different start times (issue 344 follow-up)', () => {
    expect(getCountdownString(FRIDAY, 'da')).toBe('om 3 dage');
    expect(getCountdownString(SATURDAY, 'da')).toBe('om 4 dage');
  });

  it('keeps both day counts stable for every minute of the current date', () => {
    const midnight = new Date('2026-09-08T00:00:00Z').getTime();
    for (let minute = 0; minute < 1440; minute++) {
      vi.setSystemTime(midnight + minute * 60000);
      expect(getCountdownString(FRIDAY), `Friday at minute ${minute}`).toBe('in 3 days');
      expect(getCountdownString(SATURDAY), `Saturday at minute ${minute}`).toBe('in 4 days');
    }
    vi.setSystemTime(new Date('2026-09-09T00:00:00Z'));
    expect(getCountdownString(FRIDAY)).toBe('in 2 days');
    expect(getCountdownString(SATURDAY)).toBe('in 3 days');
  });

  it('says tomorrow at both ends of the next date, regardless of elapsed hours', () => {
    for (const hour of ['00:00', '08:00', '12:00', '20:00', '23:59']) {
      vi.setSystemTime(new Date(`2026-09-08T${hour}:00Z`));
      for (const start of ['00:00', '08:00', '12:00', '23:59']) {
        expect(
          getCountdownString(timedEvent(`2026-09-09T${start}:00Z`)),
          `${hour} -> ${start}`,
        ).toBe('tomorrow');
      }
    }
  });

  it('switches from tomorrow to a clock countdown at midnight', () => {
    const event = timedEvent('2026-09-09T00:10:00Z');
    vi.setSystemTime(new Date('2026-09-08T23:50:00Z'));
    expect(getCountdownString(event)).toBe('tomorrow');
    vi.setSystemTime(new Date('2026-09-09T00:00:00Z'));
    expect(getCountdownString(event)).toBe('in 10 minutes');
    vi.setSystemTime(new Date('2026-09-09T00:10:00Z'));
    expect(getCountdownString(event)).toBeNull();
  });

  it.each([
    { start: '00:00:30', expected: 'in a few seconds' },
    { start: '00:01:00', expected: 'in a minute' },
    { start: '00:20:00', expected: 'in 20 minutes' },
    { start: '01:00:00', expected: 'in an hour' },
    { start: '01:29:59', expected: 'in an hour' },
    { start: '01:30:00', expected: 'in 2 hours' },
    { start: '21:29:59', expected: 'in 21 hours' },
    { start: '21:30:00', expected: 'in 22 hours' },
    { start: '22:00:00', expected: 'in 22 hours' },
    { start: '23:00:00', expected: 'in 23 hours' },
    { start: '23:59:59', expected: 'in 24 hours' },
  ])('keeps a same-day start at $start in clock units: $expected', ({ start, expected }) => {
    vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
    expect(getCountdownString(timedEvent(`2026-09-08T${start}Z`))).toBe(expected);
  });

  it.each([
    { now: '2026-09-08T23:59:00Z', start: '2026-09-10T00:01:00Z', expected: 'in 2 days' },
    { now: '2026-12-31T23:50:00Z', start: '2027-01-01T00:10:00Z', expected: 'tomorrow' },
    { now: '2026-12-31T23:50:00Z', start: '2027-01-02T08:00:00Z', expected: 'in 2 days' },
    { now: '2028-02-28T23:50:00Z', start: '2028-03-01T08:00:00Z', expected: 'in 2 days' },
    { now: '2026-02-28T23:50:00Z', start: '2026-03-01T08:00:00Z', expected: 'tomorrow' },
    { now: '2026-09-08T20:13:00Z', start: '2026-10-08T08:00:00Z', expected: 'in a month' },
    { now: '2026-09-08T20:13:00Z', start: '2027-09-08T08:00:00Z', expected: 'in a year' },
  ])('counts dates from $now to $start as $expected', ({ now, start, expected }) => {
    vi.setSystemTime(new Date(now));
    expect(getCountdownString(timedEvent(start))).toBe(expected);
  });

  it('uses the same tomorrow label for timed, all-day, and split rows', () => {
    const timed = timedEvent('2026-09-09T08:00:00Z');
    const allDay: CalendarEventData = {
      start: { date: '2026-09-09' },
      end: { date: '2026-09-10' },
    };
    for (const event of [
      timed,
      allDay,
      { ...timed, _isMultiDaySegment: true },
      { ...allDay, _isMultiDaySegment: true },
    ]) {
      expect(getCountdownString(event)).toBe('tomorrow');
    }
  });

  it('anchors both dates before choosing natural units at a month boundary', () => {
    for (const hour of ['00:00', '12:00', '23:59']) {
      vi.setSystemTime(new Date(`2026-09-08T${hour}:00Z`));
      for (const start of ['00:00', '12:00', '23:59']) {
        expect(getCountdownString(timedEvent(`2026-10-03T${start}:00Z`))).toBe('in 25 days');
        expect(getCountdownString(timedEvent(`2026-10-04T${start}:00Z`))).toBe('in a month');
      }
    }
  });

  it.each([
    { start: '2026-10-08', end: '2026-10-15', expected: 'in a month' },
    { start: '2027-09-08', end: '2027-09-15', expected: 'in a year' },
  ])('keeps natural wording for distant timed, all-day and split rows: $expected', (row) => {
    const timed: CalendarEventData = {
      ...timedEvent(`${row.start}T08:00:00Z`),
      end: { dateTime: `${row.end}T12:00:00Z` },
    };
    const allDay: CalendarEventData = {
      start: { date: row.start },
      end: { date: row.end },
    };
    for (const event of [
      timed,
      allDay,
      { ...timed, _isMultiDaySegment: true },
      { ...allDay, _isMultiDaySegment: true },
    ]) {
      expect(getCountdownString(event)).toBe(row.expected);
    }
  });

  it('continues to suppress started events, empty rows, and missing starts', () => {
    for (const event of [
      timedEvent('2026-09-08T20:13:42Z'),
      timedEvent('2026-09-08T08:00:00Z'),
      { start: { date: '2026-09-08' }, end: { date: '2026-09-09' } },
      { ...FRIDAY, _isEmptyDay: true },
      { start: {}, end: {} },
    ]) {
      expect(getCountdownString(event)).toBeNull();
    }
  });

  it.each([
    { language: 'en', tomorrow: 'tomorrow', twoDays: 'in 2 days' },
    { language: 'en-GB', tomorrow: 'tomorrow', twoDays: 'in 2 days' },
    { language: 'DA', tomorrow: 'i morgen', twoDays: 'om 2 dage' },
    { language: 'de-DE', tomorrow: 'morgen', twoDays: 'in 2 Tagen' },
    { language: 'fr', tomorrow: 'demain', twoDays: 'dans 2 jours' },
    { language: 'zh-cn', tomorrow: '明天', twoDays: '2 天内' },
    { language: 'zh-tw', tomorrow: '明天', twoDays: '2 天內' },
    { language: 'klingon', tomorrow: 'tomorrow', twoDays: 'in 2 days' },
    { language: 'not_a_locale', tomorrow: 'tomorrow', twoDays: 'in 2 days' },
  ])('localizes $language without replacing numeric days with date words', (row) => {
    expect(getCountdownString(timedEvent('2026-09-09T08:00:00Z'), row.language)).toBe(row.tomorrow);
    expect(getCountdownString(timedEvent('2026-09-10T08:00:00Z'), row.language)).toBe(row.twoDays);
  });

  it('resolves tomorrow, natural dates and long-hour countdowns in every card language', () => {
    const languages = Object.keys(TRANSLATIONS);
    expect(languages.length).toBeGreaterThanOrEqual(35);
    const reference = new Date('2026-09-08T00:00:00Z');
    for (const language of languages) {
      const calendar = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
      const numeric = new Intl.RelativeTimeFormat(language, { numeric: 'always' });
      vi.setSystemTime(reference);
      expect(getCountdownString(timedEvent('2026-09-09T08:00:00Z'), language), language).toBe(
        calendar.format(1, 'day'),
      );
      for (const date of ['2026-09-10', '2026-10-08', '2027-09-08']) {
        expect(getCountdownString(timedEvent(`${date}T08:00:00Z`), language), language).toBe(
          getRelativeTimeString(new Date(`${date}T00:00:00Z`), language, reference),
        );
      }
      expect(getCountdownString(timedEvent('2026-09-08T23:00:00Z'), language), language).toBe(
        numeric.format(23, 'hour'),
      );
    }
  });
});
