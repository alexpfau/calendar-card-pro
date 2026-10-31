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
 * the first and last rows measured their own slice (a bar that fell back at midnight), and a
 * middle row, rewritten as all-day by the splitter, drew no bar at all while the event ran.
 *
 * A `*.dst.test.ts`, because the slices are local days and the fill is measured in absolute
 * time: a day of 23 or 25 hours must not tip either. The expected values are derived from
 * the wall-clock instants with plain millisecond arithmetic, and each one is checked against
 * the slice-local value it must differ from, so the assertion cannot pass by measuring the
 * day.
 */

/** Tue 20 Oct 2026 20:00 to Thu 22 Oct 08:00, local: a first, a middle and a last day. */
const START = new Date(2026, 9, 20, 20, 0);
const END = new Date(2026, 9, 22, 8, 0);

const EVENT: Types.CalendarEventData = {
  summary: 'Ben night shifts',
  start: { dateTime: START.toISOString() },
  end: { dateTime: END.toISOString() },
  _entityId: 'calendar.personal',
};

/** Whole-event progress at an instant, the way the bar rounds it. */
function wholeAt(now: Date): number {
  return Math.floor(((now.getTime() - START.getTime()) / (END.getTime() - START.getTime())) * 100);
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
  it('splits into a first, a middle and a last day', () => {
    // The denominator: without a middle row the cases below would say nothing about it.
    const rows = rowsAt(new Date(2026, 9, 21, 10, 30));
    expect(rows).toHaveLength(3);
    expect(rows[1].row.start.date, 'the middle row is not in the all-day shape').toBeDefined();
  });

  it('fills the middle day over the whole event, without a Now label', () => {
    const now = new Date(2026, 9, 21, 10, 30);
    const [first, middle, last] = rowsAt(now);

    // The control: the day's own progress differs, so equality below means "whole event".
    const dayStart = new Date(2026, 9, 21).getTime();
    const dayEnd = new Date(2026, 9, 22).getTime();
    const daySlice = Math.floor(((now.getTime() - dayStart) / (dayEnd - dayStart)) * 100);
    expect(wholeAt(now)).not.toBe(daySlice);

    expect(middle.progress).toBe(wholeAt(now));
    // A middle day still reads as all-day, and an all-day row is never marked "Now".
    expect(middle.now).toBeNull();

    // Only today's row draws the bar.
    expect(first.progress).toBeNull();
    expect(last.progress).toBeNull();
  });

  it('fills the first day over the whole event, not its own evening', () => {
    const now = new Date(2026, 9, 20, 22, 0);
    const [first, middle] = rowsAt(now);

    const slice = Math.floor(
      ((now.getTime() - START.getTime()) /
        (new Date(2026, 9, 20, 23, 59, 59, 999).getTime() - START.getTime())) *
        100,
    );
    expect(wholeAt(now)).not.toBe(slice);

    expect(first.progress).toBe(wholeAt(now));
    expect(first.now, 'the first day is timed and under way').not.toBeNull();
    expect(middle.progress).toBeNull();
  });

  it('fills the last day over the whole event, so the bar only grows', () => {
    const wednesday = rowsAt(new Date(2026, 9, 21, 23, 0))[1].progress;
    const now = new Date(2026, 9, 22, 4, 0);
    const last = rowsAt(now)[2];

    expect(last.progress).toBe(wholeAt(now));
    expect(last.progress!).toBeGreaterThan(wednesday!);
  });

  it('fills the column view the same way', () => {
    const now = new Date(2026, 9, 21, 10, 30);
    expect(rowsAt(now, 'column')[1].progress).toBe(wholeAt(now));
  });

  it('draws the bar on the middle row and no Now label there', () => {
    const now = new Date(2026, 9, 21, 10, 30);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const config = buildConfig({ view: 'list', ...BASE });
    const days = EventUtils.groupEventsByDay([EVENT], config, false, 'en', 'list');
    const container = document.createElement('div');
    litRender(Render.renderGroupedEvents(days, config, 'en', undefined, null), container);

    const rows = [...container.querySelectorAll('.event')].filter((node) =>
      node.textContent?.includes(EVENT.summary!),
    );
    expect(rows).toHaveLength(3);

    const middle = rows[1];
    const fill = middle.querySelector<HTMLElement>('.progress-bar-filled');
    expect(fill, 'the middle row draws no bar').not.toBeNull();
    expect(fill!.style.width).toBe(`${wholeAt(now)}%`);
    expect(middle.querySelector('.now-indicator')).toBeNull();
    expect(rows[0].querySelector('.progress-bar')).toBeNull();
    expect(rows[2].querySelector('.progress-bar')).toBeNull();
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
    const days = EventUtils.groupEventsByDay([EVENT], config, false, 'en', 'grid');
    const container = document.createElement('div');
    litRender(Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, now), container);

    const percent = `${wholeAt(now)}%`;
    const names = [...container.querySelectorAll('.grid-event-accessible')]
      .map((node) => node.getAttribute('aria-label') ?? '')
      .filter((name) => name.includes(EVENT.summary!));
    expect(names.length, 'the event drew fewer than three blocks').toBe(3);

    // Today's block alone, and with the whole-event figure.
    expect(names.filter((name) => name.includes('%'))).toHaveLength(1);
    expect(names[1]).toContain(percent);

    const fills = [...container.querySelectorAll<HTMLElement>('.progress-bar-filled')];
    expect(fills.map((fill) => fill.style.width)).toEqual([percent]);
  });
});
