import { describe, expect, it } from 'vitest';

import {
  addDays,
  dateValue,
  dayDifference,
  moveStart,
  parseDate,
  restoreTimes,
  setAllDay,
  timeValue,
  timesFromEntry,
  validTimes,
  withDate,
  withTime,
  writeTimes,
} from '../src/interaction/event-times';

/**
 * An event's span between what Home Assistant stores, what the popover edits, and what it
 * writes back. The unit project runs under UTC; `event-times.dst.test.ts` repeats the parts a
 * zone or a clock change could move.
 */

describe('timesFromEntry', () => {
  it('reads an all-day event as local dates, its end the last day it covers', () => {
    const times = timesFromEntry('2026-11-20', '2026-11-23')!;
    expect(times.allDay).toBe(true);
    expect(dateValue(times.start)).toBe('2026-11-20');
    expect(dateValue(times.end)).toBe('2026-11-22');
    expect(times.start.getHours()).toBe(0);
  });

  it('reads a one-day all-day event as starting and ending on that day', () => {
    const times = timesFromEntry('2026-11-20', '2026-11-21')!;
    expect(dateValue(times.start)).toBe('2026-11-20');
    expect(dateValue(times.end)).toBe('2026-11-20');
  });

  it('never lets an all-day end fall before its start, nor fail on a missing end', () => {
    expect(dateValue(timesFromEntry('2026-11-20', '2026-11-20')!.end)).toBe('2026-11-20');
    expect(dateValue(timesFromEntry('2026-11-20', '')!.end)).toBe('2026-11-20');
  });

  it('reads a timed event as its two instants', () => {
    const times = timesFromEntry('2026-11-03T17:00:00+01:00', '2026-11-03T18:30:00+01:00')!;
    expect(times.allDay).toBe(false);
    expect(times.start.toISOString()).toBe('2026-11-03T16:00:00.000Z');
    expect(times.end.toISOString()).toBe('2026-11-03T17:30:00.000Z');
  });

  it('gives up on a start it cannot read, and ends an endless event where it starts', () => {
    expect(timesFromEntry('not a date', '2026-11-03')).toBeUndefined();
    expect(timesFromEntry('2026-11-3', '2026-11-04')).toBeUndefined();
    const times = timesFromEntry('2026-11-03T17:00:00Z', 'nope')!;
    expect(times.end.getTime()).toBe(times.start.getTime());
  });
});

describe('writeTimes', () => {
  it('writes an all-day event as dates, its end the day after its last day', () => {
    expect(
      writeTimes({ allDay: true, start: new Date(2026, 10, 20), end: new Date(2026, 10, 22) }),
    ).toEqual({ dtstart: '2026-11-20', dtend: '2026-11-23' });
  });

  it('writes a timed event as two UTC times to the second', () => {
    expect(
      writeTimes({
        allDay: false,
        start: new Date('2026-11-03T16:00:30.500Z'),
        end: new Date('2026-11-03T17:30:00Z'),
      }),
    ).toEqual({ dtstart: '2026-11-03T16:00:30Z', dtend: '2026-11-03T17:30:00Z' });
  });

  it('round-trips an all-day event unchanged', () => {
    const times = timesFromEntry('2026-12-31', '2027-01-02')!;
    expect(writeTimes(times)).toEqual({ dtstart: '2026-12-31', dtend: '2027-01-02' });
  });
});

describe('editing', () => {
  const start = new Date(2026, 10, 3, 17, 0);
  const end = new Date(2026, 10, 3, 18, 30);

  it('reads and writes input values', () => {
    expect(dateValue(start)).toBe('2026-11-03');
    expect(timeValue(start)).toBe('17:00');
    expect(parseDate('2026-02-30')?.getMonth()).toBe(2);
    expect(parseDate('03.11.2026')).toBeUndefined();
  });

  it('changes the day and keeps the time, or the time and keeps the day', () => {
    expect(withDate(start, '2026-11-05')).toEqual(new Date(2026, 10, 5, 17, 0));
    expect(withTime(start, '09:45')).toEqual(new Date(2026, 10, 3, 9, 45));
    expect(withDate(start, '')).toBeUndefined();
    expect(withTime(start, '25:00')).toBeUndefined();
    expect(withTime(start, '9:5')).toBeUndefined();
  });

  it('moves the end with the start, keeping the length', () => {
    const moved = moveStart({ allDay: false, start, end }, new Date(2026, 10, 4, 9, 0));
    expect(moved.end).toEqual(new Date(2026, 10, 4, 10, 30));
    const allDay = moveStart(
      { allDay: true, start: new Date(2026, 10, 20), end: new Date(2026, 10, 22) },
      new Date(2026, 11, 30),
    );
    expect(dateValue(allDay.end)).toBe('2027-01-01');
  });

  it('switches to all day over the days its times touched, an end at midnight the day before', () => {
    expect(setAllDay({ allDay: false, start, end }, true, 9)).toEqual({
      allDay: true,
      start: new Date(2026, 10, 3),
      end: new Date(2026, 10, 3),
    });
    const overnight = setAllDay(
      { allDay: false, start, end: new Date(2026, 10, 5, 0, 0) },
      true,
      9,
    );
    expect(dateValue(overnight.end)).toBe('2026-11-04');
  });

  it('switches from all day to an hour, keeping every day of a longer event', () => {
    expect(
      setAllDay(
        { allDay: true, start: new Date(2026, 10, 20), end: new Date(2026, 10, 20) },
        false,
        14,
      ),
    ).toEqual({
      allDay: false,
      start: new Date(2026, 10, 20, 14),
      end: new Date(2026, 10, 20, 15),
    });
    // Three days stay three days: from the first at the hour to the last an hour later.
    expect(
      setAllDay(
        { allDay: true, start: new Date(2026, 10, 20), end: new Date(2026, 10, 22) },
        false,
        14,
      ),
    ).toEqual({
      allDay: false,
      start: new Date(2026, 10, 20, 14),
      end: new Date(2026, 10, 22, 15),
    });
    expect(
      setAllDay(
        { allDay: true, start: new Date(2026, 10, 20), end: new Date(2026, 10, 21) },
        false,
        23,
      ),
    ).toEqual({ allDay: false, start: new Date(2026, 10, 20, 23), end: new Date(2026, 10, 22, 0) });
    // The same state asked for again is returned as it is.
    const same = { allDay: false, start, end };
    expect(setAllDay(same, false, 3)).toBe(same);
  });

  it('accepts what Home Assistant accepts', () => {
    expect(validTimes({ allDay: false, start, end })).toBe(true);
    expect(validTimes({ allDay: false, start, end: start })).toBe(false);
    expect(validTimes({ allDay: true, start, end: start })).toBe(true);
    expect(validTimes({ allDay: true, start: end, end: addDays(start, -1) })).toBe(false);
    expect(validTimes({ allDay: false, start: new Date(NaN), end })).toBe(false);
  });
});

describe('dayDifference', () => {
  it('counts calendar days, whatever the time of day', () => {
    expect(dayDifference(new Date(2026, 10, 3, 23), new Date(2026, 10, 5, 1))).toBe(2);
    expect(dayDifference(new Date(2026, 10, 5), new Date(2026, 10, 3))).toBe(-2);
    expect(dayDifference(new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 18))).toBe(0);
  });
});

describe('restoreTimes', () => {
  const before = {
    allDay: false,
    start: new Date(2026, 10, 4, 15, 30),
    end: new Date(2026, 10, 4, 16, 45),
  };
  const allDay = (from: Date, to: Date) => ({ allDay: true, start: from, end: to });

  it('gives back the times as they were on the days they had', () => {
    expect(restoreTimes(setAllDay(before, true, 9), before)).toEqual(before);
    const overnight = {
      allDay: false,
      start: new Date(2026, 10, 4, 23),
      end: new Date(2026, 10, 5, 0, 30),
    };
    expect(restoreTimes(setAllDay(overnight, true, 9), overnight)).toEqual(overnight);
    const toMidnight = {
      allDay: false,
      start: new Date(2026, 10, 4, 23),
      end: new Date(2026, 10, 5),
    };
    expect(restoreTimes(setAllDay(toMidnight, true, 9), toMidnight)).toEqual(toMidnight);
  });

  it('keeps them on the first day the span was moved to', () => {
    expect(restoreTimes(allDay(new Date(2026, 10, 6), new Date(2026, 10, 6)), before)).toEqual({
      allDay: false,
      start: new Date(2026, 10, 6, 15, 30),
      end: new Date(2026, 10, 6, 16, 45),
    });
  });

  it('moves the end by as many days again where the last day moved as well', () => {
    expect(restoreTimes(allDay(new Date(2026, 10, 4), new Date(2026, 10, 6)), before)).toEqual({
      allDay: false,
      start: new Date(2026, 10, 4, 15, 30),
      end: new Date(2026, 10, 6, 16, 45),
    });
  });

  it('keeps its length where the end would come at or before the start', () => {
    const long = { allDay: false, start: new Date(2026, 10, 4, 15), end: new Date(2026, 10, 6, 9) };
    expect(restoreTimes(allDay(new Date(2026, 10, 4), new Date(2026, 10, 4)), long)).toEqual({
      allDay: false,
      start: new Date(2026, 10, 4, 15),
      end: new Date(2026, 10, 6, 9),
    });
    expect(restoreTimes(allDay(new Date(2026, 10, 4), new Date(2026, 10, 3)), before)).toEqual({
      allDay: false,
      start: new Date(2026, 10, 4, 15, 30),
      end: new Date(2026, 10, 4, 16, 45),
    });
  });
});
