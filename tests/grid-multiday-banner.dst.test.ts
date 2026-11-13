import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type { CalendarEventData } from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import { groupEventsByDay } from '../src/utils/events';
import { fullDaySpan, getLocalDateKey } from '../src/utils/format';

/**
 * A timed event a full day or longer as one banner in grid's all-day band (`multiday_banners`),
 * under real zones.
 *
 * Named `*.dst.test.ts`, so it runs under `Europe/Berlin`, `Australia/Sydney`,
 * `America/New_York` and `Atlantic/Azores`, and never under the `unit` project's UTC, where a
 * day is always 24 hours and a wall clock never repeats or skips.
 *
 * "A full day" is read on the wall clock: the end falls on a later date, at or after the
 * start's time of day on the next date. So a day the clocks change is as long as the calendar
 * says. Across the 23-hour day a day from noon to noon qualifies; across the 25-hour day half
 * an hour short of noon does not, though it lasts longer than 24 hours. And in the hour the
 * clocks go back, a reading can repeat: from 2:45 to the second 2:30 is 24 hours 45 minutes,
 * and still not a full day, which a test against the start plus one calendar day lets through.
 * Every zone here repeats an hour, so that case has teeth in all four.
 *
 * Which days a banner covers is the dates the event takes up time on, so an end at a day's
 * first moment leaves that day out and draws no time. The last two cases have teeth only in
 * the Azores, whose clocks change at midnight: their spring day has no 0:00 and starts at
 * 1:00, and their autumn day reads 0:00 twice, the second an hour into the day, which counts
 * that day and draws its time.
 *
 * The times a banner draws are checked against `Intl.DateTimeFormat`, not against the `Date`
 * getters it is built from, so they are not restated from the implementation. January's
 * fixture is off UTC in every zone, so a banner reading UTC hours fails there.
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

/** The instant the clocks go back on `day`, to the quarter hour: where the offset changes. */
function fallBack(day: { year: number; month: number; date: number }): Date {
  const start = new Date(day.year, day.month, day.date).getTime();
  const offset = new Date(start).getTimezoneOffset();
  for (let at = start; at < start + 26 * 3_600_000; at += 15 * 60_000) {
    if (new Date(at).getTimezoneOffset() !== offset) return new Date(at);
  }
  throw new Error(`no change of offset on ${day.year}-${day.month + 1}-${day.date}`);
}

function event(start: Date, end: Date): CalendarEventData {
  return {
    summary: 'On call',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    _entityId: 'calendar.personal',
  };
}

/** What grid draws for `source` over `days` days from `first`: its banners and its blocks. */
function draw(source: CalendarEventData, first: Date, days: number) {
  vi.setSystemTime(first);
  const config = buildConfig({
    view: 'grid',
    start_date: getLocalDateKey(first),
    days_to_show: days,
    time_24h: true,
    time_grid: { start_time: '00:00', end_time: '24:00' },
  });
  const grouped = groupEventsByDay([source], config, false, 'en', 'grid');
  const container = document.createElement('div');
  render(renderGridGroupedEvents(grouped, resolveEffectiveConfig(config, 'grid'), 'en'), container);
  return {
    banners: [...container.querySelectorAll<HTMLElement>('.grid-banner-timed')].map((banner) => ({
      column: banner.style.gridColumn,
      times: [...banner.querySelectorAll('.grid-banner-time')].map(
        (time) => time.textContent?.replace(/[\u2068\u2069]/g, '').trim() ?? '',
      ),
    })),
    blocks: container.querySelectorAll('.grid-event:not(.grid-event-overflow)').length,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('runs in a zone whose offset differs from UTC and changes with the season', () => {
  const january = new Date(2026, 0, 15, 12).getTimezoneOffset();
  const july = new Date(2026, 6, 15, 12).getTimezoneOffset();
  expect(january).not.toBe(july);
  expect(january).not.toBe(0);
});

describe('timed banners under clock changes', () => {
  const spring = transitionDays(2026).find((day) => day.hours === 23)!;
  const fall = transitionDays(2026).find((day) => day.hours === 25)!;
  const on = (day: typeof spring, offset: number, hour = 0, minute = 0) =>
    new Date(day.year, day.month, day.date + offset, hour, minute);

  it('draws the times as the local wall clock reads them', () => {
    const start = new Date(2026, 0, 12, 10);
    const end = new Date(2026, 0, 16, 16);
    expect(draw(event(start, end), new Date(2026, 0, 11), 7).banners).toEqual([
      { column: '3 / span 5', times: [wall(start), wall(end)] },
    ]);
  });

  it('counts a day from noon to noon across the 23-hour day as a full day', () => {
    const start = on(spring, -1, 12);
    const end = on(spring, 0, 12);
    expect(end.getTime() - start.getTime()).toBeLessThan(86_400_000);
    expect(fullDaySpan(event(start, end).start, event(start, end).end)?.days).toBe(2);
    expect(draw(event(start, end), on(spring, -1), 3).banners).toEqual([
      { column: '2 / span 2', times: [wall(start), wall(end)] },
    ]);
  });

  it('keeps half an hour short of noon across the 25-hour day in the hours', () => {
    const start = on(fall, -1, 12);
    const end = on(fall, 0, 11, 30);
    expect(end.getTime() - start.getTime()).toBeGreaterThan(86_400_000);
    expect(draw(event(start, end), on(fall, -1), 3)).toEqual({ banners: [], blocks: 2 });
  });

  it('reads a repeated hour on the wall clock: to its second reading is not yet a full day', () => {
    const back = fallBack(fall);
    const hour = Number(wall(back).split(':')[0]);
    const start = on(fall, -1, hour, 45);
    // The second time the clock reads half past that hour, 24 hours 45 minutes on.
    const short = new Date(back.getTime() + 30 * 60_000);
    expect(wall(short)).toBe(`${hour}:30`);
    expect(short.getTime() - start.getTime()).toBe((24 * 60 + 45) * 60_000);
    expect(draw(event(start, short), on(fall, -1), 3)).toEqual({ banners: [], blocks: 2 });

    // Ten to the hour, the second time: on the wall clock that is past a full day.
    const full = new Date(back.getTime() + 50 * 60_000);
    expect(draw(event(start, full), on(fall, -1), 3).banners).toHaveLength(1);
  });

  it('leaves out the spring day for an end at its first moment, and draws no time there', () => {
    const start = on(spring, -2, 10);
    const end = on(spring, 0);
    expect(draw(event(start, end), on(spring, -2), 4).banners).toEqual([
      { column: '2 / span 2', times: [wall(start)] },
    ]);
  });

  it('counts the autumn day for an end where its clock goes back, and draws its time', () => {
    const start = on(fall, -2, 10);
    const end = fallBack(fall);
    expect(draw(event(start, end), on(fall, -2), 4).banners).toEqual([
      { column: '2 / span 3', times: [wall(start), wall(end)] },
    ]);
  });
});
