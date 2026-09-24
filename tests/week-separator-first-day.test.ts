import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * Where the week rule lands under `first_day_of_week: sunday` (#621).
 *
 * The separator does not read `first_day_of_week` directly — it fires wherever
 * `day.weekNumber` changes — so the option only reaches it through the number.
 * `show_week_numbers` defaults to `null`, and that default is the whole bug:
 * `getWeekNumber` falls back to ISO when no method is configured, ISO weeks are
 * Monday-anchored, and the Sunday correction in `calculateWeekNumberWithMajorityRule`
 * was gated on `show_week_numbers === 'iso'` rather than on the method actually used.
 * So a card that hides week numbers and draws the rule — the reporter's config, and the
 * only combination in which the rule is visible without a number beside it — put the
 * boundary before Monday.
 *
 * Every assertion here therefore has to leave `show_week_numbers` at its default at least
 * once: turning it on is what made the bug invisible to the existing week-number gates.
 *
 * Reported against Asia/Jerusalem, and the reporter reasonably suspected a UTC-offset
 * bug of the kind v4.0.0 fixed. It is not one — it reproduces under `TZ=UTC`, which is
 * why this file is not a `.dst.test.ts`.
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
 * Thu 2026-06-18 through Wed 2026-06-24, the reporter's span shifted onto the suite's
 * frozen week. It holds both candidate boundaries — Sat→Sun and Sun→Mon — so a run can
 * tell "moved to the right place" apart from "stopped drawing one".
 */
const ACROSS_BOTH_BOUNDARIES: Types.CalendarEventData[] = [
  timed('2026-06-18', 'Thursday'),
  timed('2026-06-19', 'Friday'),
  timed('2026-06-20', 'Saturday'),
  timed('2026-06-21', 'Sunday'),
  timed('2026-06-22', 'Monday'),
  timed('2026-06-23', 'Tuesday'),
  timed('2026-06-24', 'Wednesday'),
];

function group(overrides: Partial<Types.Config>, view: Types.EffectiveView = 'list') {
  const config = ViewConfig.resolveEffectiveConfig(
    buildConfig({ days_to_show: 7, first_day_of_week: 'sunday', ...overrides }),
    view,
  );
  return {
    config,
    days: EventUtils.groupEventsByDay(ACROSS_BOTH_BOUNDARIES, config, false, 'en', view),
  };
}

/** The weekday names on which the week number changes, as the separators follow it. */
function boundaryWeekdays(days: Types.EventsByDay[]): string[] {
  return days
    .filter((day, index) => index > 0 && day.weekNumber !== days[index - 1].weekNumber)
    .map((day) => new Date(day.timestamp).toUTCString().slice(0, 3));
}

describe('week separator under first_day_of_week: sunday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('breaks the week before Sunday when week numbers are hidden', () => {
    const { days } = group({ week_separator_width: '5px' });

    expect(boundaryWeekdays(days)).toEqual(['Sun']);
  });

  it('breaks the week before Sunday for every week-number mode', () => {
    for (const mode of [null, 'iso', 'simple'] as const) {
      const { days } = group({ show_week_numbers: mode });

      expect(boundaryWeekdays(days), `show_week_numbers: ${mode}`).toEqual(['Sun']);
    }
  });

  it('still breaks before Monday when the week starts on Monday', () => {
    for (const mode of [null, 'iso', 'simple'] as const) {
      const { days } = group({ first_day_of_week: 'monday', show_week_numbers: mode });

      expect(boundaryWeekdays(days), `show_week_numbers: ${mode}`).toEqual(['Mon']);
    }
  });

  it('draws the list-view rule above Sunday, not above Monday', () => {
    const { config, days } = group({ week_separator_width: '5px' });
    const container = document.createElement('div');
    litRender(Render.renderGroupedEvents(days, config, 'en'), container);

    const marked = [...container.querySelectorAll('.week-separator, .day-table')].reduce<string[]>(
      (acc, node, index, nodes) => {
        if (!node.classList.contains('week-separator')) return acc;
        const next = nodes[index + 1];
        const label = next?.querySelector('.weekday')?.textContent?.trim();
        if (label) acc.push(label);
        return acc;
      },
      [],
    );

    expect(marked).toEqual(['Sun']);
  });

  it('draws the column-view rule above Sunday, not above Monday', () => {
    const { config, days } = group({ week_separator_width: '5px' }, 'column');
    const container = document.createElement('div');
    litRender(Column.renderColumnGroupedEvents(days, config, 'en'), container);

    // Rules live in gutters rather than as siblings of the column they open, so the day a
    // rule belongs to is read off the shared grid track rather than off document order.
    const ruled = [...container.querySelectorAll<HTMLElement>('.column-separator-week')].map(
      (rule) => rule.style.gridColumn,
    );

    expect(ruled).toHaveLength(1);

    const columns = [...container.querySelectorAll<HTMLElement>('.day-column')];
    const openingDay = columns.find((column) => column.style.gridColumn === ruled[0]);

    expect(openingDay?.textContent).toContain('Sun');
  });

  it('draws the grid-view rule above Sunday, not above Monday', () => {
    const { config, days } = group({ week_separator_width: '5px' }, 'grid');
    const container = document.createElement('div');
    litRender(
      Grid.renderGridGroupedEvents(days, config, 'en', undefined, null, FROZEN_NOW),
      container,
    );

    // The grid draws its rules into gutters rather than above a column, so the day a rule
    // belongs to is read off the shared grid column index rather than off sibling order.
    const ruled = [...container.querySelectorAll<HTMLElement>('.grid-separator-week')].map(
      (rule) => rule.style.gridColumn,
    );

    expect(ruled).toHaveLength(1);

    const headers = [...container.querySelectorAll<HTMLElement>('.grid-day-header')];
    const openingDay = headers.find((header) => header.style.gridColumn === ruled[0]);

    expect(openingDay?.textContent).toContain('Sun');
  });
});
