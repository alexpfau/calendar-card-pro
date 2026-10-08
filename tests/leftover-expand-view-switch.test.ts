/**
 * Leftover isExpanded after list → column/grid must not change empty-day range.
 *
 * Expanding on list is legal, and setConfig does not clear isExpanded. Before
 * expandApplies, the empty-day filter and synthesis arms keyed on bare
 * isExpanded, so a card expanded as a list then switched to column/grid still
 * padded the full window when show_empty_days was false and the calendar was
 * empty — the same layout change the expand gesture gate was meant to prevent.
 *
 * compactLimitsApply already ANDs with viewAppliesCompactLimits. Those empty-day
 * arms now go through expandApplies (list-only) as well. This file pins that
 * leftover flag must not widen column/grid empty range, while list still widens.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  toggleExpanded(): void;
  isExpanded: boolean;
  readonly effectiveView: Types.EffectiveView;
}

describe('leftover isExpanded after leaving list view', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('grouping: leftover expand must not widen empty-day range on column when show_empty_days is false', () => {
    const config = buildConfig({
      view: 'column',
      days_to_show: 7,
      show_empty_days: false,
      column: { show_empty_days: false },
    });

    const collapsed = EventUtils.groupEventsByDay([], config, false, 'en', 'column');
    const leftover = EventUtils.groupEventsByDay([], config, true, 'en', 'column');

    expect(collapsed.length).toBe(1);
    expect(leftover.length).toBe(collapsed.length);
  });

  it('grouping: leftover expand must not widen empty-day range on grid when show_empty_days is false', () => {
    const config = buildConfig({
      view: 'grid',
      days_to_show: 7,
      show_empty_days: false,
      time_grid: { show_empty_days: false },
    });

    const collapsed = EventUtils.groupEventsByDay([], config, false, 'en', 'grid');
    const leftover = EventUtils.groupEventsByDay([], config, true, 'en', 'grid');

    expect(collapsed.length).toBe(1);
    expect(leftover.length).toBe(collapsed.length);
  });

  it('grouping: leftover expand still widens list empty-day range when show_empty_days is false', () => {
    // Control: expand on list must keep doing the thing expand exists for.
    const config = buildConfig({
      view: 'list',
      days_to_show: 7,
      show_empty_days: false,
      compact_events_to_show: 2,
    });

    const collapsed = EventUtils.groupEventsByDay([], config, false, 'en', 'list');
    const expanded = EventUtils.groupEventsByDay([], config, true, 'en', 'list');

    expect(collapsed.length).toBe(1);
    expect(expanded.length).toBe(7);
  });

  it('host: expand on list then switch to column leaves isExpanded true', () => {
    const card = document.createElement('calendar-card-pro-dev') as CardUnderTest;
    card.setConfig({
      entities: ['calendar.test'],
      days_to_show: 7,
      compact_events_to_show: 2,
      tap_action: { action: 'expand' },
    });
    document.body.appendChild(card);
    expect(card.effectiveView).toBe('list');
    card.toggleExpanded();
    expect(card.isExpanded).toBe(true);

    card.setConfig({
      entities: ['calendar.test'],
      view: 'column',
      days_to_show: 7,
      compact_events_to_show: 2,
      show_empty_days: false,
      column: { show_empty_days: false },
      tap_action: { action: 'expand' },
    });
    // Host state may keep the flag; grouping must still ignore it for non-list views.
    expect(card.isExpanded).toBe(true);
    expect(card.effectiveView).toBe('column');
  });
});
