import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/**
 * `groupEventsByDay` resolves the `column:` block itself, at its own boundary,
 * rather than trusting every caller to have done it first.
 *
 * Roughly a dozen override-capable options are read inside the function and its
 * helpers. Before this, some went through a resolver and the rest read the
 * config directly, so a caller that passed a raw config got a mix: a few
 * options honoured the `column:` block and the others quietly ignored it. Every
 * production call site did pass the resolved config, so nothing was visibly
 * broken — but that is a property of the callers, not of the function, and it
 * is the same shape as the multi-day splitting defect that *was* reachable.
 *
 * These tests therefore pass a deliberately **raw** config. Each one pairs the
 * column assertion with the same config rendered as a list, so a case cannot
 * pass by the override having no effect in either view.
 */

/** A timed event that has already finished relative to {@link FROZEN_NOW}. */
function pastEvent(): Types.CalendarEventData {
  return {
    start: { dateTime: '2026-06-17T08:00:00.000Z' },
    end: { dateTime: '2026-06-17T09:00:00.000Z' },
    summary: 'Already Over',
    _entityId: 'calendar.personal',
  };
}

/** Every summary rendered for the given view, flattened across days. */
function summaries(
  events: Types.CalendarEventData[],
  config: Types.Config,
  view: Types.EffectiveView,
): (string | undefined)[] {
  return EventUtils.groupEventsByDay(events, config, false, 'en', view).flatMap((day) =>
    day.events.map((event) => event.summary),
  );
}

describe('groupEventsByDay resolves the column block itself', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  it('honours a column empty_day_text override on a raw config', () => {
    const config = buildConfig({
      view: 'column',
      days_to_show: 2,
      show_empty_days: true,
      empty_day_text: 'TOP',
      column: { empty_day_text: 'COL' },
    } as Partial<Types.Config>);

    expect(summaries([], config, 'column')).toContain('COL');
    expect(summaries([], config, 'column')).not.toContain('TOP');

    // Control: the same raw config in list view must still read the top-level
    // value, proving the assertion above tracks the view rather than the block
    // simply winning everywhere.
    expect(summaries([], config, 'list')).toContain('TOP');
  });

  it('honours a column show_past_events override on a raw config', () => {
    const config = buildConfig({
      view: 'column',
      days_to_show: 2,
      show_past_events: true,
      column: { show_past_events: false },
    } as Partial<Types.Config>);

    expect(summaries([pastEvent()], config, 'column')).not.toContain('Already Over');

    // Control: list view keeps the finished event, so the column result is the
    // override taking effect and not the event being filtered for some other
    // reason.
    expect(summaries([pastEvent()], config, 'list')).toContain('Already Over');
  });
});
