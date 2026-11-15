import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type { CalendarEventData } from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import { groupEventsByDay } from '../src/utils/events';

/**
 * The time text of a grid block whose event runs past midnight, under real zones (#768).
 *
 * Named `*.dst.test.ts`, so it runs under `Europe/Berlin`, `Australia/Sydney`,
 * `America/New_York` and `Atlantic/Azores`, and never under the `unit` project's UTC. There a
 * local day and a UTC day are the same day, so a day count read from UTC dates is right on
 * every date and the first two cases below cannot fail.
 *
 * The first block reads "22:05 - 1:35 (+1)": the count is of local calendar days, from the
 * start date to the date the end falls on. Two fixtures pin "local" in both directions: an
 * event crossing local midnight but not UTC midnight must count a day, and one crossing UTC
 * midnight but not local midnight must not. Both are in January, when all four zones are off
 * UTC (the Azores sit on UTC itself all summer), and both hold in every zone: reading the
 * count from UTC dates fails both of them in all four.
 *
 * Then the zone's own transition nights, found at run time because no date is one in every
 * zone, and built from date components rather than stepped with `setDate`, which in the
 * Azores carries the 01:00 of a day with no 00:00 onto every later day. A count of elapsed
 * days instead of calendar days agrees with every one-night fixture; spanning two nights
 * across the 23-hour day is what separates them. The last two cases have teeth only in the
 * Azores, whose clocks change at midnight: there an end at the first instant of the spring
 * day reads 1:00, and an end an hour into the autumn day reads 0:00 a second time. Neither
 * is the midnight after the start, so both keep their count.
 */

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The local days of `year` that are not 24 hours long. */
function transitionDays(
  year: number,
): Array<{ year: number; month: number; date: number; hours: number }> {
  const found: Array<{ year: number; month: number; date: number; hours: number }> = [];
  for (let month = 0; month < 12; month++) {
    for (let date = 1; date <= 31; date++) {
      const day = new Date(year, month, date);
      if (day.getMonth() !== month) break;
      const hours = (new Date(year, month, date + 1).getTime() - day.getTime()) / 3_600_000;
      if (hours !== 24) found.push({ year, month, date, hours });
    }
  }
  return found;
}

/** The wall-clock reading the card writes for `instant` on a 24-hour clock, from `Intl`. */
function wall(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${Number(value('hour'))}:${value('minute')}`;
}

function event(start: Date, end: Date): CalendarEventData {
  return {
    summary: 'Late match',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    _entityId: 'calendar.personal',
  };
}

/**
 * Render a two-day grid from the event's start day, the whole day drawn.
 *
 * @returns The time text of each block, its bidi isolates removed
 */
function blockTimes(source: CalendarEventData): string[] {
  const start = new Date(source.start.dateTime!);
  vi.setSystemTime(new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12));
  // Blocks, which are what this file reads. Over two nights across the 23-hour day, an event
  // under a day of elapsed time still ends later on the clock than it started, a calendar day
  // on, so it would be drawn as a banner by default (`multiday_banners`).
  const config = buildConfig({
    view: 'grid',
    days_to_show: 2,
    time_24h: true,
    time_grid: { start_time: '00:00', end_time: '24:00', multiday_banners: false },
  });
  const days = groupEventsByDay([source], config, false, 'en', 'grid');
  const container = document.createElement('div');
  render(renderGridGroupedEvents(days, resolveEffectiveConfig(config, 'grid'), 'en'), container);
  return Array.from(container.querySelectorAll('.grid-event:not(.grid-event-overflow)')).map(
    (block) =>
      (block.querySelector('.time-actual')?.textContent ?? '')
        .replace(/[\u2066\u2068\u2069]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

describe('the day count on a grid block running past midnight', () => {
  it('runs under a zone that is off UTC in January and changes its clocks', () => {
    expect(new Date(2026, 0, 14).getTimezoneOffset()).not.toBe(0);
    expect(new Date(2026, 0, 14).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 14).getTimezoneOffset(),
    );
    expect(transitionDays(2026).map(({ hours }) => hours)).toEqual(
      expect.arrayContaining([23, 25]),
    );
  });

  it('counts a day across local midnight that is not UTC midnight', () => {
    const start = new Date(2026, 0, 14, 23, 30);
    const end = new Date(2026, 0, 15, 0, 30);
    // The control: in UTC the event never leaves its day.
    expect(start.getUTCDate()).toBe(end.getUTCDate());

    expect(blockTimes(event(start, end))).toEqual(['23:30 - 0:30 (+1)', '']);
  });

  it('counts no day across UTC midnight that is not local midnight', () => {
    const start = new Date(Date.UTC(2026, 0, 14, 23, 30));
    const end = new Date(Date.UTC(2026, 0, 15, 0, 30));
    // The control: in UTC the event does cross midnight, and locally it does not.
    expect(start.getUTCDate()).not.toBe(end.getUTCDate());
    expect(start.getDate()).toBe(end.getDate());

    expect(blockTimes(event(start, end))).toEqual([`${wall(start)} - ${wall(end)}`]);
  });

  it.each([
    { name: 'forward', hours: 23 },
    { name: 'back', hours: 25 },
  ])('counts one day over the night the clocks go $name', ({ hours }) => {
    const day = transitionDays(2026).find((found) => found.hours === hours)!;
    const start = new Date(day.year, day.month, day.date - 1, 22);
    const end = new Date(day.year, day.month, day.date, 3);

    expect(blockTimes(event(start, end))).toEqual(['22:00 - 3:00 (+1)', '']);
  });

  it('counts calendar days, not elapsed ones, over two nights across the 23-hour day', () => {
    const day = transitionDays(2026).find((found) => found.hours === 23)!;
    const start = new Date(day.year, day.month, day.date - 1, 23, 30);
    const end = new Date(day.year, day.month, day.date + 1, 0, 15);
    // The control: under two days apart in elapsed time.
    expect(end.getTime() - start.getTime()).toBeLessThan(86_400_000);

    expect(blockTimes(event(start, end))).toEqual(['23:30 - 0:15 (+2)', '']);
  });

  /**
   * The Azores fall back from 1:00 to 0:00, so their autumn day reads 0:00 twice. An end at
   * the second is an hour past midnight and keeps its count; elsewhere the same instant reads
   * 1:00, which keeps it as well.
   */
  it('counts the day for an end an hour into the autumn day', () => {
    const day = transitionDays(2026).find((found) => found.hours === 25)!;
    const start = new Date(day.year, day.month, day.date - 1, 22);
    const end = new Date(new Date(day.year, day.month, day.date).getTime() + 3_600_000);

    expect(blockTimes(event(start, end))).toEqual([`22:00 - ${wall(end)} (+1)`, '']);
  });

  /**
   * The Azores change at midnight, so their spring day has no 00:00 and starts at 01:00. An
   * event until that first instant ends at "1:00", and "22:00 - 1:00" with no day would read
   * as an end before the start, so it counts the day its end falls on, as the popover writes
   * it. Elsewhere the same construction ends at an ordinary 00:00, the midnight after it
   * starts, which needs no count; this pins that as well.
   */
  it('counts the day for an end at the first instant of the spring day unless it reads 0:00', () => {
    const day = transitionDays(2026).find((found) => found.hours === 23)!;
    const start = new Date(day.year, day.month, day.date - 1, 22);
    const end = new Date(day.year, day.month, day.date);
    const expected = wall(end) === '0:00' ? '22:00 - 0:00' : `22:00 - ${wall(end)} (+1)`;

    expect(blockTimes(event(start, end))).toEqual([expected]);
  });
});
