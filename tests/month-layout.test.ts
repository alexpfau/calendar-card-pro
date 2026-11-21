/**
 * Month's occupancy model (`utils/month-layout.ts`): which line each bar and line takes in a
 * week row, and what each day cannot show at a capacity.
 *
 * The rows are built the way grouping builds them, through Grid's own daily coverage
 * (`splitGridEventByDay`), so a bar here carries the same `_gridSource` a real one does. Every
 * expectation names lines and days by value, so an item that moves, appears or goes fails.
 */

import { describe, expect, it } from 'vitest';

import type * as Types from '../src/config/types';
import * as GridUtils from '../src/utils/grid';
import { type MonthWeekLayout, isMonthBar, layoutMonthWeek } from '../src/utils/month-layout';

/** Monday, November 16, 2026, and the six days after it. */
const STARTS = Array.from({ length: 7 }, (_, index) => new Date(2026, 10, 16 + index));
const WEEK_END = new Date(2026, 10, 23);

/** A local `YYYY-MM-DD`, `offset` days from Monday. */
function date(offset: number): string {
  const day = new Date(2026, 10, 16 + offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** An all-day event from one day of the week, `days` long. */
function allDay(summary: string, from: number, days = 1): Types.CalendarEventData {
  return { summary, start: { date: date(from) }, end: { date: date(from + days) } };
}

/** A timed event on a day of the week, from one wall-clock time to another `days` later. */
function timed(
  summary: string,
  day: number,
  from: string,
  to: string,
  days = 0,
): Types.CalendarEventData {
  const at = (offset: number, hhmm: string) => {
    const [hours, minutes] = hhmm.split(':').map(Number);
    return new Date(2026, 10, 16 + offset, hours, minutes).toISOString();
  };
  return { summary, start: { dateTime: at(day, from) }, end: { dateTime: at(day + days, to) } };
}

/**
 * A week row's days, as grouping hands them over: each event split by Grid's coverage, and
 * each segment on the day it starts.
 *
 * @param events - The week's events
 * @param banners - Timed events `multiday_banners` draws as bars
 * @returns Seven lists of events, Monday first
 */
function row(
  events: Types.CalendarEventData[],
  banners: ReadonlySet<Types.CalendarEventData> = new Set(),
): Types.CalendarEventData[][] {
  const days: Types.CalendarEventData[][] = STARTS.map(() => []);
  for (const event of events) {
    for (const segment of GridUtils.splitGridEventByDay(event, STARTS[0], WEEK_END)) {
      const start = segment.start.dateTime
        ? new Date(segment.start.dateTime)
        : new Date(`${segment.start.date}T00:00:00`);
      const column = STARTS.findIndex(
        (day) => day.getTime() === GridUtils.startOfDay(start).getTime(),
      );
      days[column].push(banners.has(event) ? { ...segment, _gridBanner: true } : segment);
    }
  }
  return days;
}

/** Each item as `title kind columns@line`, visible ones only unless asked. */
function drawn(layout: MonthWeekLayout, all = false): string[] {
  return layout.placements
    .filter((placement) => all || placement.visible)
    .map(({ item, line, visible }) => {
      const { columnIndex, span } = item.placement;
      const columns = span === 1 ? `${columnIndex}` : `${columnIndex}-${columnIndex + span - 1}`;
      return `${item.event.summary} ${item.kind} ${columns}@${line}${all && !visible ? ' hidden' : ''}`;
    });
}

/** Each day's "+N", or 0 where it draws none. */
function more(layout: MonthWeekLayout): number[] {
  return layout.days.map((day) => (day.more ? day.hidden.length : 0));
}

describe('bars and lines', () => {
  it('tells a bar from a line', () => {
    expect(isMonthBar(allDay('Holiday', 0))).toBe(true);
    expect(isMonthBar(timed('Dentist', 0, '09:00', '10:00'))).toBe(false);
    expect(isMonthBar({ ...timed('Trip', 0, '09:00', '10:00', 2), _gridBanner: true })).toBe(true);
  });

  it('places bars first, each on the lowest line free across its days, then the lines', () => {
    const layout = layoutMonthWeek(
      row([
        timed('Dentist', 0, '09:00', '10:00'),
        allDay('Trip', 0, 3),
        allDay('Ben off', 1),
        timed('Gym', 3, '18:00', '19:00'),
      ]),
      STARTS,
      4,
    );
    expect(drawn(layout)).toEqual([
      'Trip bar 0-2@0',
      'Ben off bar 1@1',
      'Dentist line 0@1',
      'Gym line 3@0',
    ]);
    expect(more(layout)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('orders bars by first day, then the longer, then the earlier event, then the title', () => {
    const layout = layoutMonthWeek(
      row([
        allDay('Zoo', 2),
        allDay('Anna off', 2),
        allDay('Course', 2, 3),
        // Both from the week before, so both start on Monday's column with the same span: the
        // one whose event starts earlier goes first, though its title sorts later.
        { summary: 'Absence', start: { date: '2026-11-14' }, end: { date: date(3) } },
        { summary: 'Leave', start: { date: '2026-11-12' }, end: { date: date(3) } },
      ]),
      STARTS,
      9,
    );
    expect(drawn(layout)).toEqual([
      'Leave bar 0-2@0',
      'Absence bar 0-2@1',
      'Course bar 2-4@2',
      'Anna off bar 2@3',
      'Zoo bar 2@4',
    ]);
  });

  it('marks a bar continuing from the week before or into the next', () => {
    const layout = layoutMonthWeek(
      row([
        { summary: 'Leave', start: { date: '2026-11-12' }, end: { date: date(2) } },
        { summary: 'Fair', start: { date: date(5) }, end: { date: '2026-11-25' } },
      ]),
      STARTS,
      4,
    );
    expect(layout.placements.map(({ item }) => [item.event.summary, item.placement])).toEqual([
      ['Leave', { columnIndex: 0, span: 2, continuesBefore: true, continuesAfter: false }],
      ['Fair', { columnIndex: 5, span: 2, continuesBefore: false, continuesAfter: true }],
    ]);
    // A bar carries its whole event's dates, as Grid's banner does.
    expect(layout.placements[0].item.event.start).toEqual({ date: '2026-11-12' });
  });

  it('draws a timed event multiday_banners marks as one bar, and a shorter one as lines', () => {
    const trip = timed('Trip', 1, '10:00', '12:00', 2);
    const layout = layoutMonthWeek(
      row([trip, timed('Flight', 4, '22:00', '06:00', 1)], new Set([trip])),
      STARTS,
      4,
    );
    expect(drawn(layout)).toEqual(['Trip bar 1-3@0', 'Flight line 4@0', 'Flight line 5@0']);
  });

  it('gives an overnight event a line on each day, the later one continuing from the first', () => {
    const layout = layoutMonthWeek(
      row([
        timed('Late show', 2, '22:30', '01:30', 1),
        timed('Breakfast', 3, '08:00', '09:00'),
        timed('Standup', 3, '07:30', '07:45'),
      ]),
      STARTS,
      4,
    );
    // The later day's part starts at its midnight, so it leads the day.
    expect(drawn(layout)).toEqual([
      'Late show line 2@0',
      'Late show line 3@0',
      'Standup line 3@1',
      'Breakfast line 3@2',
    ]);
    const parts = layout.placements
      .filter(({ item }) => item.event.summary === 'Late show')
      .map(({ item }) => item.placement);
    expect(parts).toEqual([
      { columnIndex: 2, span: 1, continuesBefore: false, continuesAfter: true },
      { columnIndex: 3, span: 1, continuesBefore: true, continuesAfter: false },
    ]);
  });

  it('draws nothing for an empty-day placeholder', () => {
    const placeholder: Types.CalendarEventData = {
      ...allDay('No events', 0),
      _isEmptyDay: true,
    };
    const days = row([]);
    days[0].push(placeholder);
    days[1].push({ ...timed('Nothing', 1, '09:00', '10:00'), _isEmptyDay: true });
    expect(layoutMonthWeek(days, STARTS, 4).placements).toEqual([]);
  });
});

describe('breaks in a bar', () => {
  it('splits a bar where a day leaves its event out, as days_of_week does', () => {
    const days = row([allDay('Course', 0, 5)]);
    days[2] = [];
    const layout = layoutMonthWeek(days, STARTS, 4);
    expect(drawn(layout)).toEqual(['Course bar 0-1@0', 'Course bar 3-4@0']);
    expect(layout.placements.map(({ item }) => item.placement)).toEqual([
      { columnIndex: 0, span: 2, continuesBefore: false, continuesAfter: true },
      { columnIndex: 3, span: 2, continuesBefore: true, continuesAfter: false },
    ]);
  });

  it('splits a bar where the calendars a deduplicated event stands for change', () => {
    const anna = { entityId: 'calendar.anna' };
    const ben = { entityId: 'calendar.ben' };
    const days = row([allDay('Vacation', 0, 3)]).map((events, column) =>
      events.map((event) => ({ ...event, _mergedFrom: column < 2 ? [anna, ben] : [anna] })),
    );
    const layout = layoutMonthWeek(days, STARTS, 4);
    expect(drawn(layout)).toEqual(['Vacation bar 0-1@0', 'Vacation bar 2@0']);
    expect(layout.placements.map(({ item }) => item.placement)).toEqual([
      { columnIndex: 0, span: 2, continuesBefore: false, continuesAfter: true },
      { columnIndex: 2, span: 1, continuesBefore: true, continuesAfter: false },
    ]);
    expect(layout.placements.map(({ item }) => item.event._mergedFrom)).toEqual([
      [anna, ben],
      [anna],
    ]);
  });
});

describe('a capacity', () => {
  it('shows a day whole while its items fit, and keeps the last line for "+N" once not', () => {
    // Six events on five lines draw four and "+2 more".
    const busy = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'].map((at, index) =>
      timed(`Meeting ${index + 1}`, 1, at, at.replace(':00', ':30')),
    );
    const five = ['08:00', '09:00', '10:00', '11:00', '12:00'].map((at, index) =>
      timed(`Call ${index + 1}`, 4, at, at.replace(':00', ':30')),
    );
    const layout = layoutMonthWeek(row([...busy, ...five]), STARTS, 5);

    expect(drawn(layout)).toEqual([
      'Meeting 1 line 1@0',
      'Meeting 2 line 1@1',
      'Meeting 3 line 1@2',
      'Meeting 4 line 1@3',
      'Call 1 line 4@0',
      'Call 2 line 4@1',
      'Call 3 line 4@2',
      'Call 4 line 4@3',
      'Call 5 line 4@4',
    ]);
    expect(more(layout)).toEqual([0, 2, 0, 0, 0, 0, 0]);
    expect(layout.days[1].hidden.map((item) => item.event.summary)).toEqual([
      'Meeting 5',
      'Meeting 6',
    ]);
    expect(layout.days[4]).toEqual({ hidden: [], more: false });
  });

  it('hides a bar on every day where one of its days cannot show it', () => {
    // Monday to Tuesday on line 0 pushes Tuesday to Thursday onto line 1, and Wednesday's two
    // lines onto 0 and 2. At two lines Wednesday cannot show line 2, so it keeps line 1 for
    // "+N", which hides the bar there, and so on its other days, which then keep theirs.
    const layout = layoutMonthWeek(
      row([
        allDay('Visit', 0, 2),
        allDay('Course', 1, 3),
        timed('Dentist', 2, '09:00', '10:00'),
        timed('Gym', 2, '18:00', '19:00'),
      ]),
      STARTS,
      2,
    );
    expect(drawn(layout, true)).toEqual([
      'Visit bar 0-1@0',
      'Course bar 1-3@1 hidden',
      'Dentist line 2@0',
      'Gym line 2@2 hidden',
    ]);
    expect(more(layout)).toEqual([0, 1, 2, 1, 0, 0, 0]);
    expect(layout.days[3].hidden.map((item) => item.event.summary)).toEqual(['Course']);

    // With a line more, every day shows everything.
    const roomy = layoutMonthWeek(
      row([
        allDay('Visit', 0, 2),
        allDay('Course', 1, 3),
        timed('Dentist', 2, '09:00', '10:00'),
        timed('Gym', 2, '18:00', '19:00'),
      ]),
      STARTS,
      3,
    );
    expect(drawn(roomy, true).some((entry) => entry.endsWith('hidden'))).toBe(false);
    expect(more(roomy)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('at one line shows a day of one item and gives a busier day only "+N"', () => {
    const layout = layoutMonthWeek(
      row([
        allDay('Holiday', 0),
        timed('Dentist', 2, '09:00', '10:00'),
        timed('Gym', 2, '18:00', '19:00'),
        allDay('Course', 4, 2),
        timed('Call', 5, '09:00', '09:30'),
      ]),
      STARTS,
      1,
    );
    // Saturday's call takes line 1 under the course, so Saturday cannot show it, and the course
    // goes on Friday as well.
    expect(drawn(layout, true)).toEqual([
      'Holiday bar 0@0',
      'Course bar 4-5@0 hidden',
      'Dentist line 2@0 hidden',
      'Gym line 2@1 hidden',
      'Call line 5@1 hidden',
    ]);
    expect(more(layout)).toEqual([0, 0, 2, 0, 1, 2, 0]);
  });

  it('at no line shows nothing, and has no line to say "+N" on', () => {
    const layout = layoutMonthWeek(
      row([allDay('Holiday', 0), timed('Dentist', 2, '09:00', '10:00')]),
      STARTS,
      0,
    );
    expect(drawn(layout)).toEqual([]);
    expect(layout.days.map((day) => [day.hidden.length, day.more])).toEqual([
      [1, false],
      [0, false],
      [1, false],
      [0, false],
      [0, false],
      [0, false],
      [0, false],
    ]);
  });
});

describe('an item set in larger text', () => {
  /** Each item as `title columns@first line+lines`, hidden ones marked. */
  const spans = (layout: MonthWeekLayout): string[] =>
    layout.placements.map(
      ({ item, line, lines, visible }) =>
        `${item.event.summary} ${item.placement.columnIndex}@${line}+${lines}${visible ? '' : ' hidden'}`,
    );
  const big = (event: Types.CalendarEventData) => (event.summary?.startsWith('Big') ? 2 : 1);

  it('takes as many lines as it is tall, and shows only where all of them fit', () => {
    const layout = layoutMonthWeek(
      row([allDay('Big one', 2), allDay('Big two', 2), allDay('Small', 2)]),
      STARTS,
      4,
      big,
    );
    // Lines 0 and 1, then 2 and 3, then 4. The small one does not fit, so Wednesday keeps line 3
    // for "+N more", which the second big one reaches into.
    expect(spans(layout)).toEqual(['Big one 2@0+2', 'Big two 2@2+2 hidden', 'Small 2@4+1 hidden']);
    expect(more(layout)).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });

  it('keeps its lines from the items of the days it shares a line with', () => {
    const layout = layoutMonthWeek(
      row([
        allDay('Big trip', 1, 2),
        timed('Gym', 1, '18:00', '19:00'),
        timed('Swim', 2, '18:00', '19:00'),
        timed('Call', 3, '09:00', '09:30'),
      ]),
      STARTS,
      4,
      big,
    );
    // The bar covers Tuesday and Wednesday on lines 0 and 1, so their lines start under it;
    // Thursday's starts at the top.
    expect(spans(layout)).toEqual(['Big trip 1@0+2', 'Gym 1@2+1', 'Swim 2@2+1', 'Call 3@0+1']);
    expect(more(layout)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
