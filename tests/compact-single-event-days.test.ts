/**
 * A day holding one real event is not an empty day.
 *
 * The compact block tests `day.events.length === 1 && day.events[0]._isEmptyDay` in three
 * places to exempt placeholder days from the event budget. Both halves matter, and only
 * one of them is load-bearing today: placeholders are created *after* this block runs, so
 * `_isEmptyDay` is never true here and the conjunction is always false. Measured, not
 * assumed — replacing either operand with `false` at any of the three sites changes
 * nothing across a 1,279-config differential.
 *
 * What that leaves exposed is the first operand standing alone. Relaxing either `&&` to
 * `||` makes *every single-event day* take the placeholder path: in the default branch
 * they are pushed without being counted, so the budget stops applying entirely, and in the
 * complete-days branch they are skipped, so they never enter `daysStarted` and vanish. The
 * full suite saw neither.
 *
 * This is not a test of dead code. It pins the property that survives whatever happens to
 * the ordering — a day with one real event counts against `compact_events_to_show` like
 * any other — which is exactly the assertion that would fail if placeholder creation were
 * ever moved ahead of this block and the exemption started matching real days.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/** One event on each of three consecutive days, so every day holds exactly one. */
const ONE_PER_DAY: Types.CalendarEventData[] = ['18', '19', '20'].map((day) => ({
  start: { dateTime: `2026-06-${day}T09:00:00.000Z` },
  end: { dateTime: `2026-06-${day}T10:00:00.000Z` },
  summary: `day-${day}`,
  _entityId: 'calendar.personal',
}));

/** Days carrying at least one real event, and the summaries shown, in order. */
function shown(overrides: Partial<Types.Config>): { days: number; summaries: string[] } {
  const config = buildConfig({
    days_to_show: 7,
    start_date: '2026-06-17',
    compact_events_to_show: 2,
    ...overrides,
  });

  const grouped = EventUtils.groupEventsByDay(ONE_PER_DAY, config, false, 'en', 'list');
  const real = grouped
    .map((day) => day.events.filter((event) => !event._isEmptyDay))
    .filter((events) => events.length > 0);

  return {
    days: real.length,
    summaries: real.flatMap((events) => events.map((event) => event.summary ?? '?')),
  };
}

describe('compact_events_to_show counts single-event days', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops at the budget rather than exempting them', () => {
    // Relaxing the empty-day test at the passthrough site pushes each single-event day
    // without counting it, so all three days render and the budget stops meaning anything.
    expect(shown({ compact_events_complete_days: false })).toEqual({
      days: 2,
      summaries: ['day-18', 'day-19'],
    });
  });

  it('keeps them when whole days are requested', () => {
    // The complete-days branch reaches the same answer by a different route, and the
    // matching relaxation there drops every single-event day instead of exempting it —
    // the opposite failure, invisible to the assertion above.
    expect(shown({ compact_events_complete_days: true })).toEqual({
      days: 2,
      summaries: ['day-18', 'day-19'],
    });
  });

  it('shows all three once the budget is raised', () => {
    // The control. Both assertions above are satisfied by a card that simply renders two
    // days whatever it is asked for; this is what makes the number a budget.
    expect(shown({ compact_events_to_show: 3 })).toEqual({
      days: 3,
      summaries: ['day-18', 'day-19', 'day-20'],
    });
  });

  it('is not applied at all when the card is expanded', () => {
    // The second control: compact limits are the collapsed-state behavior, so a fixture
    // that produced two days regardless of `isExpanded` would not be exercising them.
    const config = buildConfig({
      days_to_show: 7,
      start_date: '2026-06-17',
      compact_events_to_show: 2,
    });
    const grouped = EventUtils.groupEventsByDay(ONE_PER_DAY, config, true, 'en', 'list');
    const real = grouped
      .map((day) => day.events.filter((event) => !event._isEmptyDay))
      .filter((events) => events.length > 0);

    expect(real).toHaveLength(3);
  });

  it('drops per-entity compact_events_to_show once expanded too', () => {
    // Entity caps live in the same `compactLimitsApply` gate as the card-wide budget
    // (`!isExpanded && viewAppliesCompactLimits`). Expanding used to be documented as
    // keeping them while only lifting the global limit; both halves must clear together.
    const config = buildConfig({
      days_to_show: 7,
      start_date: '2026-06-17',
      entities: [{ entity: 'calendar.personal', compact_events_to_show: 1 }],
    });
    const matched = config.entities[0];
    const tagged = ONE_PER_DAY.map((event) => ({
      ...event,
      _matchedConfig: typeof matched === 'object' ? matched : undefined,
    }));

    const collapsed = EventUtils.groupEventsByDay(tagged, config, false, 'en', 'list')
      .flatMap((day) => day.events.filter((event) => !event._isEmptyDay))
      .map((event) => event.summary);
    const expanded = EventUtils.groupEventsByDay(tagged, config, true, 'en', 'list')
      .flatMap((day) => day.events.filter((event) => !event._isEmptyDay))
      .map((event) => event.summary);

    expect(collapsed).toEqual(['day-18']);
    expect(expanded).toEqual(['day-18', 'day-19', 'day-20']);
  });
});
