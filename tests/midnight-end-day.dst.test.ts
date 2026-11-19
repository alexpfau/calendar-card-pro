/**
 * A timed event ending exactly at a day's first moment belongs to the day before, in every view
 * and in every model of "this day's events", under every zone the suite runs in.
 *
 * Home Assistant never returns an event that ends where a request starts, so until Month this
 * never reached the card: a load began on the first day a view draws. Month's union load starts at
 * its grid's first row, weeks earlier, so a List or Column page starting on Saturday now holds an
 * event running Friday 20:00 to Saturday 00:00, and its grouping treated an end at the window's
 * first moment as ongoing there. So did Month's day model, which lists a day as a window of one.
 *
 * Two nights: an ordinary Friday night, and Saturday 28 March 2026, whose next day has no 00:00
 * in the Azores (the clocks go from 00:00 to 01:00), so that day's first moment is 01:00 and an
 * event ending then ends at the boundary there. Every end is built as `new Date(y, m, d)`, the
 * first moment of the next day in the zone under test.
 */
import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as MonthRender from '../src/rendering/month';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';
import * as MonthDay from '../src/utils/month-day';

const ANNA = 'calendar.anna';
const MONDAY = 1;

describe('the zone', () => {
  it('moves its offset between January and July, or this file proves nothing', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });
});

/** A day's local date. */
const key = (date: Date): string => FormatUtils.getLocalDateKey(date);

const NIGHTS = [
  {
    label: 'an ordinary Friday night',
    evening: new Date(2026, 11, 4),
    next: new Date(2026, 11, 5),
  },
  {
    label: 'the night before the Azores’ spring day, which has no 00:00',
    evening: new Date(2026, 2, 28),
    next: new Date(2026, 2, 29),
  },
];

describe.each(NIGHTS)('on $label', ({ evening, next }) => {
  const at = (day: Date, hour: number, minute = 0): string =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).toISOString();

  /** Evening to the next day's first moment. */
  const toMidnight: Types.CalendarEventData = {
    summary: 'To midnight',
    start: { dateTime: at(evening, 20) },
    end: { dateTime: next.toISOString() },
  };
  /** The same evening, half an hour past it: still on the next day. */
  const pastMidnight: Types.CalendarEventData = {
    summary: 'Past midnight',
    start: { dateTime: at(evening, 21) },
    end: { dateTime: new Date(next.getTime() + 30 * 60_000).toISOString() },
  };
  /** A reminder at the next day's first moment: an instant of that day. */
  const reminder: Types.CalendarEventData = {
    summary: 'Reminder',
    start: { dateTime: next.toISOString() },
    end: { dateTime: next.toISOString() },
  };
  /** An all-day event on the evening's day alone: its end date is the next day, exclusive. */
  const allDay: Types.CalendarEventData = {
    summary: 'All day',
    start: { date: key(evening) },
    end: { date: key(next) },
  };
  /** An all-day event over both days. */
  const weekend: Types.CalendarEventData = {
    summary: 'Weekend',
    start: { date: key(evening) },
    end: { date: key(new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1)) },
  };
  const RAW = [toMidnight, pastMidnight, reminder, allDay, weekend];

  /** The days each event is grouped on, by summary. */
  const daysOf = (grouped: Types.EventsByDay[]): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    for (const day of grouped) {
      for (const event of day.events) {
        if (event._isEmptyDay || !event.summary) continue;
        (result[event.summary] ??= []).push(key(new Date(day.timestamp)));
      }
    }
    return result;
  };

  const processed = (config: Types.Config): Types.CalendarEventData[] =>
    EventUtils.processEvents(
      RAW.map((event) => ({ ...event, _entityId: ANNA })),
      config,
    );

  describe.each(['list', 'column', 'grid'] as const)(
    '%s, a window opening the next day',
    (view) => {
      const config = ViewConfig.resolveEffectiveConfig(
        buildConfig({
          view,
          entities: [ANNA],
          start_date: key(next),
          days_to_show: 3,
          show_past_events: true,
        }),
        view,
      );
      const grouped = daysOf(
        EventUtils.groupEventsByDay(processed(config), config, false, 'en', view),
      );

      it('leaves out an event ending at its first moment', () => {
        expect(grouped['To midnight']).toBeUndefined();
      });

      it('keeps an event running past it, a reminder at it and the all-day event over it', () => {
        expect(grouped['Past midnight']).toEqual([key(next)]);
        expect(grouped['Reminder']).toEqual([key(next)]);
        expect(grouped['All day']).toBeUndefined();
        expect(grouped['Weekend']?.[0]).toBe(key(next));
      });
    },
  );

  describe.each(['list', 'column', 'grid'] as const)(
    '%s, a window opening that evening',
    (view) => {
      const config = ViewConfig.resolveEffectiveConfig(
        buildConfig({
          view,
          entities: [ANNA],
          start_date: key(evening),
          days_to_show: 3,
          show_past_events: true,
        }),
        view,
      );
      const grouped = daysOf(
        EventUtils.groupEventsByDay(processed(config), config, false, 'en', view),
      );

      it('draws the event ending at midnight on its own day alone', () => {
        expect(grouped['To midnight']).toEqual([key(evening)]);
      });
    },
  );

  describe('Month', () => {
    const config = ViewConfig.resolveEffectiveConfig(
      buildConfig({ view: 'month', entities: [ANNA], first_day_of_week: 'monday' }),
      'month',
    );
    const events = processed(config);
    const rows = ViewConfig.monthHomeRowsStart(evening, MONDAY);

    it('lists the next day without it, as its own panel and as one of the six weeks', () => {
      expect(
        MonthDay.monthDayEvents(events, config, next, 'en').map((event) => event.summary),
      ).not.toContain('To midnight');
      expect(
        MonthDay.monthDayEvents(events, config, evening, 'en').map((event) => event.summary),
      ).toContain('To midnight');

      const lists = MonthDay.monthDayLists(events, config, rows, ViewConfig.MONTH_DAYS, 'en');
      const index = (day: Date) => FormatUtils.getCalendarDayDiff(rows, day);
      expect(lists[index(next)].map((event) => event.summary)).not.toContain('To midnight');
      expect(lists[index(evening)].map((event) => event.summary)).toContain('To midnight');
    });

    it('draws it on the evening alone in the weeks', () => {
      const drawn = { ...config, start_date: key(rows), days_to_show: ViewConfig.MONTH_DAYS };
      const days = EventUtils.groupEventsByDay(events, drawn, false, 'en', 'month');
      const weeks = MonthRender.monthWeeks(days, rows, 4);
      const placedOn = weeks.flatMap((week) =>
        week.layout.placements
          .filter((placement) => placement.item.event.summary === 'To midnight')
          .map((placement) => key(week.starts[placement.item.placement.columnIndex])),
      );
      expect(placedOn).toEqual([key(evening)]);
    });
  });
});
