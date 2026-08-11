import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as EventUtils from '../src/utils/events';

/**
 * Week numbers in the column view.
 *
 * `show_week_numbers` defaults to `null`, so every assertion here has to turn it on
 * explicitly. That is the point of the file: an option that is off by default renders
 * nothing and is invisible to a suite built from default config, which is exactly how
 * four branches went unprotected before (AGENTS.md).
 *
 * ## Clock
 *
 * Frozen for the same reason as the other DOM gates — today/tomorrow classification
 * reads the wall clock. The fixtures below are dated relative to that freeze
 * (2026-06-17, a Wednesday) so a run in August still sees the same week boundary.
 *
 * ## Why these particular properties
 *
 * The load-bearing claim is that **every** column emits a week-number cell, hidden on
 * the ones that do not start a week. An empty grid area collapses, so emitting only on
 * week starts would give those columns a taller header and stagger the whole row of
 * dates — the one thing the column view exists to prevent. That is a property no
 * screenshot review reliably catches, because it only shows up on the specific day
 * spans that straddle a boundary.
 */

/** A timed event on a given date, in UTC to match the pinned zone. */
function timed(date: string, summary: string): Types.CalendarEventData {
  return {
    start: { dateTime: `${date}T09:00:00.000Z` },
    end: { dateTime: `${date}T10:00:00.000Z` },
    summary,
    _entityId: 'calendar.personal',
  };
}

/**
 * Four consecutive days straddling a week boundary.
 *
 * 2026-06-17 is a Wednesday, so Sat 20th and Sun 21st sit in one week and Mon 22nd
 * opens the next. With the default `first_day_of_week` this gives exactly one interior
 * boundary — enough to tell "hidden on non-starts" apart from "hidden everywhere".
 */
const ACROSS_A_WEEK: Types.CalendarEventData[] = [
  timed('2026-06-19', 'Friday'),
  timed('2026-06-20', 'Saturday'),
  timed('2026-06-21', 'Sunday'),
  timed('2026-06-22', 'Monday'),
];

/** Three days entirely inside one week, none of which opens it. */
const INSIDE_ONE_WEEK: Types.CalendarEventData[] = [
  timed('2026-06-17', 'Wednesday'),
  timed('2026-06-18', 'Thursday'),
  timed('2026-06-19', 'Friday'),
];

function renderColumns(
  events: Types.CalendarEventData[],
  overrides: Partial<Types.Config> = {},
): HTMLElement {
  // Resolve the `column:` block first, exactly as `calendar-card-pro.ts` does before
  // it calls either of these — grouping and rendering both take the effective config,
  // so a harness that passed the raw one would silently see no override at all.
  const config = ViewConfig.resolveEffectiveConfig(
    buildConfig({ days_to_show: 7, ...overrides }),
    'column',
  );
  const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'column');
  const container = document.createElement('div');
  litRender(Column.renderColumnGroupedEvents(days, config, 'en'), container);
  return container;
}

/** True when the cell is present but hidden. `styleMap` emits no space after the colon. */
function isHidden(cell: Element): boolean {
  return (cell.getAttribute('style') ?? '').replace(/\s/g, '').includes('visibility:hidden');
}

/** One entry per column: the rendered week number, or null when the cell is hidden. */
function visibleWeekNumbers(container: ParentNode): Array<string | null> {
  return Array.from(container.querySelectorAll('.column-week-number')).map((cell) =>
    isHidden(cell) ? null : (cell.textContent?.trim() ?? ''),
  );
}

describe('column view week numbers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders no week row at all when week numbers are off', () => {
    const container = renderColumns(ACROSS_A_WEEK);

    expect(container.querySelectorAll('.day-column').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.column-week-number')).toHaveLength(0);
    expect(container.querySelectorAll('.column-date-content.with-week-number')).toHaveLength(0);
  });

  it('emits a cell in every column, so headers cannot stagger', () => {
    const container = renderColumns(ACROSS_A_WEEK, { show_week_numbers: 'iso' });
    const columns = container.querySelectorAll('.day-column');

    expect(columns.length).toBeGreaterThan(1);
    expect(container.querySelectorAll('.column-week-number')).toHaveLength(columns.length);

    // The class gates the extra grid row, so it has to be on every header too --
    // otherwise the cells exist but land in the wrong area in some columns.
    expect(container.querySelectorAll('.column-date-content.with-week-number')).toHaveLength(
      columns.length,
    );
  });

  it('shows the number only on the column that starts a week', () => {
    const container = renderColumns(ACROSS_A_WEEK, { show_week_numbers: 'iso' });
    const shown = visibleWeekNumbers(container);

    // First column is a week start by construction; Monday opens the next one.
    expect(shown.filter((value) => value !== null)).toHaveLength(2);
    expect(shown[0]).not.toBeNull();
    expect(shown.at(-1)).not.toBeNull();
    expect(shown.slice(1, -1).every((value) => value === null)).toBe(true);
  });

  it('renders a hidden cell with its own real week number, not a blank', () => {
    // Truthfulness rather than aesthetics: the cell is hidden, so nothing reads it
    // today -- but a future change that reveals it must not reveal a placeholder.
    const container = renderColumns(ACROSS_A_WEEK, { show_week_numbers: 'iso' });
    const cells = Array.from(container.querySelectorAll('.column-week-number'));
    const hidden = cells.filter(isHidden);

    expect(hidden.length).toBeGreaterThan(0);
    hidden.forEach((cell) => {
      expect(cell.textContent?.trim()).toMatch(/^[0-9]+$/);
    });
  });

  it('reuses the list view pill class, so one set of colours styles both views', () => {
    const container = renderColumns(ACROSS_A_WEEK, { show_week_numbers: 'iso' });
    const pill = container.querySelector('.column-week-number .week-number');

    expect(pill).not.toBeNull();
  });

  it('suppresses only the first column when show_current_week_number is false', () => {
    const container = renderColumns(ACROSS_A_WEEK, {
      show_week_numbers: 'iso',
      show_current_week_number: false,
    });
    const shown = visibleWeekNumbers(container);

    expect(shown[0]).toBeNull();
    expect(shown.at(-1)).not.toBeNull();
  });

  it('drops the row entirely when no column would fill it', () => {
    // A span wholly inside a week already in progress: the only week start is the
    // first column, and that is the one `show_current_week_number: false` hides. The
    // row would otherwise reserve blank space in every column for a number none of
    // them shows.
    const container = renderColumns(INSIDE_ONE_WEEK, {
      show_week_numbers: 'iso',
      show_current_week_number: false,
    });

    expect(container.querySelectorAll('.day-column').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.column-week-number')).toHaveLength(0);
  });

  it('honours show_week_numbers set inside a column block', () => {
    const container = renderColumns(ACROSS_A_WEEK, {
      show_week_numbers: null,
      column: { show_week_numbers: 'iso' },
    });

    expect(container.querySelectorAll('.column-week-number').length).toBeGreaterThan(0);
  });

  it('honours show_current_week_number set inside a column block', () => {
    const container = renderColumns(ACROSS_A_WEEK, {
      show_week_numbers: 'iso',
      column: { show_current_week_number: false },
    });

    expect(visibleWeekNumbers(container)[0]).toBeNull();
  });
});
