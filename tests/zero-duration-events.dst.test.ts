import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { formatEventTime, formatEventTimeParts } from '../src/utils/format';

/**
 * The one #625 case only a real zone can show: the hour that repeats when the clocks go back.
 *
 * An event that starts and ends in the same minute now shows its start time once, and the
 * test that decides it compares minutes, not the two printed readings. The readings look like
 * the same question and are not. Across the change, 02:30 before it and 02:30 after it print
 * identically an hour apart, and an event running between them lasts an hour; collapsing it
 * to one reading would describe a moment, beside a grid that draws it an hour tall. `TZ=UTC`
 * has no repeated hour, so the unit project passes either way — swapping the minute test for
 * a comparison of the printed readings leaves it green and fails here, in all three zones.
 *
 * No zone is uniquely required. Each has a fall-back, so any one of them catches that
 * substitution; the three only make the fixture land at three different local hours.
 *
 * The oracle is `Intl.DateTimeFormat` rather than the `Date` getters the formatter is built
 * from, so the control below checks the fixture instead of restating the implementation.
 */

const ZONE = process.env.TZ ?? 'UTC';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The wall clock in the runner's zone, derived independently of the `Date` getters. */
function wallClock(date: Date): { day: string; hour: number; minute: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: get('minute'),
  };
}

/** What the card prints for an instant: the hour unpadded, as `time_two_digit_hours` is off. */
function reading(date: Date, use24h: boolean): string {
  const { hour, minute } = wallClock(date);

  return use24h ? `${hour}:${minute}` : `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** The first instant of 2026 at which this zone's clocks have just gone back an hour. */
function fallBack(): Date {
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += HOUR) {
    if (new Date(t).getTimezoneOffset() > new Date(t - HOUR).getTimezoneOffset()) {
      return new Date(t);
    }
  }

  throw new Error(`no fall-back in 2026 for ${ZONE}`);
}

function timed(start: Date, end: Date, summary: string): Types.CalendarEventData {
  return {
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    summary,
    _entityId: 'calendar.personal',
  };
}

// Guard. Under UTC there is no fall-back, `fallBack()` throws, and everything below would
// otherwise fail for a reason that says nothing about the card.
it('runs in a timezone with different January and July offsets', () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
    new Date(2026, 6, 1).getTimezoneOffset(),
  );
});

describe('an hour-long event across the clocks going back', () => {
  /** Built per test, so a zone with no fall-back fails the tests rather than the collection. */
  function fixture() {
    const change = fallBack();
    const start = new Date(change.getTime() - 30 * MINUTE);
    const end = new Date(change.getTime() + 30 * MINUTE);

    return { start, end, shift: timed(start, end, 'Night shift') };
  }

  it('CONTROL: lasts an hour, on one day, and reads the same clock at both ends', () => {
    // Without this a fixture that never repeats a reading would let the assertions below
    // pass for an implementation that compares printed text.
    const { start, end } = fixture();

    expect(end.getTime() - start.getTime()).toBe(HOUR);
    expect(wallClock(end)).toEqual(wallClock(start));
  });

  it.each([
    ['24-hour', true],
    ['12-hour', false],
  ])('keeps both readings on a %s clock', (_clock, use24h) => {
    const { start, shift } = fixture();
    const config = buildConfig({ time_24h: use24h });
    const at = reading(start, use24h);

    expect(formatEventTime(shift, config, 'en')).toBe(`${at} - ${at}`);
    expect(formatEventTimeParts(shift, config, 'en').end).toBe(` - ${at}`);
  });

  it('still reads a reminder inside the repeated hour once', () => {
    const { start, end } = fixture();
    const config = buildConfig({ time_24h: true });

    expect(formatEventTime(timed(start, start, 'Reminder'), config, 'en')).toBe(
      reading(start, true),
    );
    expect(formatEventTime(timed(end, end, 'Reminder'), config, 'en')).toBe(reading(end, true));
  });
});
