import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Column from '../src/rendering/column';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * The width the progress bar is actually filled to, in each of the three places it can be
 * drawn.
 *
 * `progress-bar-fill` and `progress-bar-width` sound like the same subject and are not.
 * The other file guards `--calendar-card-progress-bar-width`, which is how wide the empty
 * track is. This one guards `style="width: N%"` on `.progress-bar-filled`, which is how
 * much of that track is coloured in -- the only part of the bar that carries information.
 *
 * There are three emissions of it, not one, because the bar renders differently depending
 * on what is beside it. List view passes no placement and gets the `inline` default, so
 * the bar shares the time row; but with `show_time: false` there is no time text to sit
 * next to, so it falls through to a third branch that stacks it under an empty time slot.
 * Column view passes `progressPlacement: 'row'` and gets a row of its own.
 *
 * Two of those three were already pinned. The stacked one was not: replacing its width
 * with a constant left all 1,642 tests green, because no test had ever combined
 * `show_progress_bar: true` with `show_time: false`. A bar frozen at a constant percentage
 * is worse than an absent one -- it keeps looking like a live reading of how far along the
 * event is while no longer being one.
 *
 * At the frozen now the running fixture event is 30 minutes into its 90, so every branch
 * that renders a live bar must report 33%.
 */
const RUNNING_FILL = 'width: 33%';

function renderFills(
  overrides: Record<string, unknown>,
  view: 'list' | 'column',
): { fills: string[]; rows: number } {
  const config = buildConfig(
    view === 'column' ? { ...overrides, view: 'column' } : overrides,
  ) as Types.Config;
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
  const container = document.createElement('div');

  litRender(
    view === 'column'
      ? Column.renderColumnGroupedEvents(days, config, 'en', undefined, null)
      : Render.renderGroupedEvents(days, config, 'en', undefined, null),
    container,
  );

  return {
    fills: Array.from(container.querySelectorAll('.progress-bar-filled')).map(
      (element) => (element as HTMLElement).getAttribute('style') ?? '',
    ),
    rows: container.querySelectorAll('.progress-bar-row').length,
  };
}

const WITH_BAR = { days_to_show: 3, show_progress_bar: true };
const COLUMN_DAYS = { column: { show_empty_days: false } };

describe('progress bar fill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports elapsed time on the time row in list view', () => {
    // The default list placement: the bar sits beside the time text.
    expect(renderFills(WITH_BAR, 'list')).toEqual({ fills: [RUNNING_FILL], rows: 0 });
  });

  it('reports elapsed time when list view has no time text to sit beside', () => {
    // The branch nothing covered. `show_time: false` removes the text the inline bar
    // shares a row with, so the bar takes a third code path of its own -- and until this
    // assertion existed, that path could report any width at all without failing.
    expect(renderFills({ ...WITH_BAR, show_time: false }, 'list')).toEqual({
      fills: [RUNNING_FILL],
      rows: 0,
    });
  });

  it('reports elapsed time on its own row in column view', () => {
    // Column view is narrow, so the bar gets a row rather than sharing one. The row class
    // is asserted alongside the width because it is what distinguishes this placement
    // from the two list ones, all three of which draw the same element.
    expect(renderFills({ ...WITH_BAR, ...COLUMN_DAYS }, 'column')).toEqual({
      fills: [RUNNING_FILL],
      rows: 1,
    });
  });

  it.each(['list', 'column'] as const)('draws no bar at all in %s view when disabled', (view) => {
    // The paired absence. Without it, a change that drew the bar unconditionally would
    // satisfy all three assertions above and still be wrong for the default config, where
    // `show_progress_bar` is off.
    //
    // `show_progress_bar` is checked twice on the way here -- once in `presentation.ts`,
    // which passes `null` rather than a percentage when the flag is off, and again in
    // `leaves.ts`, which re-checks the flag beside the null test. Either check alone is
    // enough, so removing one is invisible and this assertion only fails when both go.
    // That is a property of the source, not a hole in the test: no assertion can tell the
    // two apart while they mask each other.
    expect(
      renderFills(
        view === 'column' ? { days_to_show: 3, ...COLUMN_DAYS } : { days_to_show: 3 },
        view,
      ),
    ).toEqual({
      fills: [],
      rows: 0,
    });
  });
});
