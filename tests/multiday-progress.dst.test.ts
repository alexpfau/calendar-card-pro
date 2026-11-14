import { render as litRender } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import { buildEventPresentation } from '../src/rendering/presentation';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * Progress on the days of a timed event split across several.
 *
 * Each day's row shows the bar while its own day is under way — as it always did — but
 * fills it over the whole event, so the bar only grows from one day to the next. Before,
 * the first and last rows measured their own slice (a bar that fell back at midnight).
 *
 * In list and column view that is a night shorter than a day, with a first and a last day: an
 * event a day or longer draws its day counter there instead of a bar (#281), and only such an
 * event has a middle day. Grid keeps the bar on every block of a longer event, and fills it
 * over the whole event too.
 *
 * A `*.dst.test.ts`, because the slices are local days and the fill is measured in absolute
 * time: a day of 23 or 25 hours must not tip either. The expected values are derived from
 * the wall-clock instants with plain millisecond arithmetic, and each one is checked against
 * the slice-local value it must differ from, so the assertion cannot pass by measuring the
 * day.
 */

/** Tue 20 Oct 2026 20:00 to Wed 21 Oct 08:00, local: a first and a last day, under a day. */
const START = new Date(2026, 9, 20, 20, 0);
const END = new Date(2026, 9, 21, 8, 0);

const EVENT: Types.CalendarEventData = {
  summary: 'Ben night shift',
  start: { dateTime: START.toISOString() },
  end: { dateTime: END.toISOString() },
  _entityId: 'calendar.personal',
};

/** Tue 20 Oct 2026 20:00 to Thu 22 Oct 08:00, local: a first, a middle and a last day. */
const LONG_START = new Date(2026, 9, 20, 20, 0);
const LONG_END = new Date(2026, 9, 22, 8, 0);

const LONG: Types.CalendarEventData = {
  summary: 'Ben night shifts',
  start: { dateTime: LONG_START.toISOString() },
  end: { dateTime: LONG_END.toISOString() },
  _entityId: 'calendar.personal',
};

/** Whole-event progress at an instant, the way the bar rounds it. */
function wholeAt(now: Date, start = START, end = END): number {
  return Math.floor(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100);
}

const BASE: Partial<Types.Config> = {
  start_date: '2026-10-20',
  days_to_show: 3,
  show_past_events: true,
  show_progress_bar: true,
  show_now_indicator: true,
  split_multiday_events: true,
};

/** The rows the event draws, one per local day, with what each presents. */
function rowsAt(now: Date, view: Types.EffectiveView = 'list', event = EVENT) {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const config = buildConfig({ view, ...BASE });
  const effective = ViewConfig.resolveEffectiveConfig(config, view);

  return EventUtils.groupEventsByDay([event], config, false, 'en', view)
    .flatMap((day) => day.events)
    .filter((row) => row.summary === event.summary)
    .map((row) => {
      const parts = buildEventPresentation(row, effective, 'en').contentParts;
      return { row, progress: parts.progressPercentage, now: parts.nowLabel };
    });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the test zone', () => {
  it('observes daylight saving time', () => {
    // Under UTC every day is 24 hours and nothing here could tip; fail loudly rather than
    // pass by proving nothing.
    const january = new Date(2026, 0, 15).getTimezoneOffset();
    const july = new Date(2026, 6, 15).getTimezoneOffset();
    expect(january).not.toBe(july);
  });
});

describe('a split timed event', () => {
  it('splits into a first and a last day', () => {
    // The denominator: without two rows the cases below would say nothing about either.
    expect(rowsAt(new Date(2026, 9, 20, 22, 0))).toHaveLength(2);
  });

  it('fills the first day over the whole event, not its own evening', () => {
    const now = new Date(2026, 9, 20, 22, 0);
    const [first, last] = rowsAt(now);

    const slice = Math.floor(
      ((now.getTime() - START.getTime()) /
        (new Date(2026, 9, 20, 23, 59, 59, 999).getTime() - START.getTime())) *
        100,
    );
    expect(wholeAt(now)).not.toBe(slice);

    expect(first.progress).toBe(wholeAt(now));
    expect(first.now, 'the first day is timed and under way').not.toBeNull();
    expect(last.progress).toBeNull();
  });

  it('fills the last day over the whole event, so the bar only grows', () => {
    const tuesday = rowsAt(new Date(2026, 9, 20, 23, 0))[0].progress;
    const now = new Date(2026, 9, 21, 4, 0);
    const [first, last] = rowsAt(now);

    const slice = Math.floor(
      ((now.getTime() - new Date(2026, 9, 21).getTime()) /
        (END.getTime() - new Date(2026, 9, 21).getTime())) *
        100,
    );
    expect(wholeAt(now)).not.toBe(slice);

    expect(last.progress).toBe(wholeAt(now));
    expect(last.progress!).toBeGreaterThan(tuesday!);
    expect(first.progress).toBeNull();
  });

  it('fills the column view the same way', () => {
    const now = new Date(2026, 9, 21, 4, 0);
    expect(rowsAt(now, 'column')[1].progress).toBe(wholeAt(now));
  });

  it('draws the bar on the row under way alone', () => {
    const now = new Date(2026, 9, 21, 4, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const config = buildConfig({ view: 'list', ...BASE });
    const days = EventUtils.groupEventsByDay([EVENT], config, false, 'en', 'list');
    const container = document.createElement('div');
    litRender(Render.renderGroupedEvents(days, config, 'en', undefined, null), container);

    const rows = [...container.querySelectorAll('.event')].filter((node) =>
      node.textContent?.includes(EVENT.summary!),
    );
    expect(rows).toHaveLength(2);

    const fill = rows[1].querySelector<HTMLElement>('.progress-bar-filled');
    expect(fill, 'the last row draws no bar').not.toBeNull();
    expect(fill!.style.width).toBe(`${wholeAt(now)}%`);
    expect(rows[0].querySelector('.progress-bar')).toBeNull();
  });

  it('draws the day counter instead of a bar when it lasts a day or longer', () => {
    // The control is the night above: the same harness draws its bar.
    const now = new Date(2026, 9, 21, 10, 30);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const config = buildConfig({ view: 'list', ...BASE });
    const days = EventUtils.groupEventsByDay([LONG], config, false, 'en', 'list');
    const container = document.createElement('div');
    litRender(Render.renderGroupedEvents(days, config, 'en', undefined, null), container);

    const rows = [...container.querySelectorAll('.event')].filter((node) =>
      node.textContent?.includes(LONG.summary!),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.querySelector('.day-counter')?.textContent?.trim())).toEqual([
      'Day 1 of 3',
      'Day 2 of 3',
      'Day 3 of 3',
    ]);
    expect(container.querySelector('.progress-bar')).toBeNull();
    // A middle day still reads as all-day, and an all-day row is never marked "Now".
    expect(rows[1].querySelector('.now-indicator')).toBeNull();
  });

  it('leaves a split all-day event without a bar', () => {
    const away: Types.CalendarEventData = {
      summary: 'Anna away',
      start: { date: '2026-10-20' },
      end: { date: '2026-10-23' },
      _entityId: 'calendar.personal',
    };
    const rows = rowsAt(new Date(2026, 9, 21, 10, 30), 'list', away);

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((entry) => entry.progress)).toEqual(rows.map(() => null));
  });
});

describe('a timed event across days in grid', () => {
  it('fills today’s block over the whole event, and says so in its name alone', () => {
    const now = new Date(2026, 9, 21, 10, 30);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const config = buildConfig({ view: 'grid', ...BASE });
    const effective = ViewConfig.resolveEffectiveConfig(config, 'grid');
    const days = EventUtils.groupEventsByDay([LONG], config, false, 'en', 'grid');
    const container = document.createElement('div');
    litRender(Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, now), container);

    const percent = `${wholeAt(now, LONG_START, LONG_END)}%`;
    const names = [...container.querySelectorAll('.grid-event-accessible')]
      .map((node) => node.getAttribute('aria-label') ?? '')
      .filter((name) => name.includes(LONG.summary!));
    expect(names.length, 'the event drew fewer than three blocks').toBe(3);

    // Today's block alone, and with the whole-event figure.
    expect(names.filter((name) => name.includes('%'))).toHaveLength(1);
    expect(names[1]).toContain(percent);

    const fills = [...container.querySelectorAll<HTMLElement>('.progress-bar-filled')];
    expect(fills.map((fill) => fill.style.width)).toEqual([percent]);
  });
});
