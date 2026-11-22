/**
 * A month's words after the device's zone changes, without a reload.
 *
 * The month and the toolbar keep their `Intl` date formats for as long as the page is open, and a
 * format keeps the zone it was made in. Each test here writes its words once, so the formats are
 * made in the zone the project runs under, then moves the process to `Pacific/Kiritimati`, east of
 * every zone the suite runs in, as a trip abroad moves a tablet, and writes them again. A format
 * still reading the old zone sees the new zone's local midnight on the day before, so November's
 * 1st reads as October 31 and the month as October.
 *
 * Node takes a new `process.env.TZ` at once for `Date` and for every format made after it, and
 * leaves a format made before it in its old zone, as a browser does. That is the seam: it moves
 * the zone in process, which the card cannot tell from a real change.
 *
 * The oracle is the date the test asks for, written as literal words. Names are invented.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as ViewConfig from '../src/config/view';
import * as Month from '../src/rendering/month';
import * as EventUtils from '../src/utils/events';
import * as Paging from '../src/utils/paging';

/** East of Berlin, Sydney, New York and the Azores alike, all year. */
const AWAY = 'Pacific/Kiritimati';

const home = process.env.TZ;

/** Writes the words in the project's zone, then in `AWAY`, with the formats made in the first. */
function acrossTheMove<T>(write: () => T): [T, T] {
  const before = write();
  process.env.TZ = AWAY;
  return [before, write()];
}

/** November 2026 as the card draws it, with no events, Mondays first. */
function renderNovember(): HTMLElement {
  const rowsStart = ViewConfig.monthHomeRowsStart(new Date(2026, 10, 1), 1);
  const config = buildConfig({
    view: 'month',
    first_day_of_week: 'monday',
    start_date: Paging.pageKey(rowsStart),
    days_to_show: ViewConfig.MONTH_DAYS,
  });
  const days = EventUtils.groupEventsByDay([], config, false, 'en', 'month');
  const container = document.createElement('div');
  litRender(
    Month.renderMonthGroupedEvents(
      days,
      rowsStart,
      ViewConfig.resolveEffectiveConfig(config, 'month'),
      'en',
    ),
    container,
  );
  return container;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 15, 12));
});

afterEach(() => {
  process.env.TZ = home;
  vi.useRealTimers();
});

describe('the zone these tests run under', () => {
  // Sanity: these tests only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2026, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2026, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
  });

  it('moves to a zone whose midnight is the day before in its own', () => {
    const [before, after] = acrossTheMove(() => new Date(2026, 10, 1).getTime());
    expect(after).toBeLessThan(before);
  });
});

describe('a month’s words after the zone changes', () => {
  it('names a day in full as it did', () => {
    expect(acrossTheMove(() => Month.monthDayTitle(new Date(2026, 10, 1), 'en'))).toEqual([
      'Sunday, November 1, 2026',
      'Sunday, November 1, 2026',
    ]);
  });

  it('shortens a day’s title as it did', () => {
    const [before, after] = acrossTheMove(() => Month.monthDayTitles(new Date(2026, 10, 1), 'en'));
    expect(after).toEqual(before);
    expect(after.slice(-2)).toEqual(['Nov 1', '1']);
  });

  it('names a cell as it did', () => {
    expect(acrossTheMove(() => Month.monthCellName(new Date(2026, 10, 1), 2, 'en'))).toEqual([
      'Sunday, November 1, 2026, 2 events',
      'Sunday, November 1, 2026, 2 events',
    ]);
  });

  it('draws the 1st as "Nov 1", its weekday headers and the grid’s month as they were', () => {
    const read = () => {
      const container = renderNovember();
      const first = [...container.querySelectorAll('.month-date')].find((date) =>
        /Nov/.test(date.textContent ?? ''),
      );
      return {
        first: first?.textContent?.replace(/\s+/g, ' ').trim(),
        weekdays: [...container.querySelectorAll('.month-weekday')].map((day) =>
          day.getAttribute('aria-label'),
        ),
        grid: container.querySelector('.month-container')?.getAttribute('aria-label'),
      };
    };
    const [before, after] = acrossTheMove(read);
    expect(after).toEqual(before);
    expect(after.first).toBe('Nov 1');
    expect(after.weekdays[0]).toBe('Monday');
    expect(after.grid).toBe('November 2026');
  });
});

describe('the toolbar’s words after the zone changes', () => {
  it('names the month as it did', () => {
    expect(acrossTheMove(() => Paging.monthHeading(new Date(2026, 10, 1), 'en'))).toEqual([
      'November 2026',
      'November 2026',
    ]);
  });

  it('names a page and a day as it did', () => {
    const write = () => [
      Paging.rangeLabel({ start: new Date(2026, 10, 1), days: 7 }, 'en', new Date(2026, 9, 15)),
      Paging.rangeLabel({ start: new Date(2026, 11, 28), days: 7 }, 'en', new Date(2026, 9, 15)),
      Paging.rangeLabel({ start: new Date(2026, 10, 1), days: 1 }, 'en', new Date(2026, 9, 15)),
      Paging.dayName(new Date(2026, 10, 1), 'en'),
    ];
    const [before, after] = acrossTheMove(write);
    expect(after).toEqual(before);
    // `Intl` writes thin spaces around a range's dash.
    expect(after.map((words) => words.replace(/\s/g, ' '))).toEqual([
      'Nov 1 – 7',
      'Dec 28 – Jan 3',
      'Sun, Nov 1',
      'Sun, Nov 1',
    ]);
  });
});
