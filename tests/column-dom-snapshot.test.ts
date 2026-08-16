import { render as litRender } from 'lit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, SINGLE_EVENT, WEATHER, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Column from '../src/rendering/column';
import * as EventUtils from '../src/utils/events';

/**
 * Serialized column-view markup, one snapshot per branch that changes the shape.
 *
 * The list view has had a snapshot since it was written; the column view, added in v4,
 * has only targeted assertions. That difference is measurable rather than theoretical.
 * Mutating each key of the list view's two `classMap` objects and each of its six style
 * bindings -- fifteen mutations -- was caught every time, by fifteen to nineteen tests
 * apiece, almost entirely by the snapshot. The same sweep against the column view left
 * three class keys and two style bindings alive, and each had to be found by hand and
 * guarded individually.
 *
 * A snapshot is the only thing that covers markup nobody thought to assert, which is
 * exactly the markup that breaks quietly. The column view is new, so it will change more
 * than the list view will.
 *
 * These are intentionally in their own file: `column-dom.test.ts` holds sixty-odd targeted
 * assertions, and mixing a snapshot in would mean re-reading a large diff whenever one of
 * those fails for an unrelated reason.
 *
 * When a snapshot changes, read the diff and confirm the change was intended before
 * updating it -- see AGENTS.md. Deleting the file is never the fix.
 */
function serialize(container: HTMLElement): string {
  return container.innerHTML
    .replace(/<!--\?lit\$[0-9]+\$-->/g, '')
    .replace(/<!---->/g, '')
    .replace(/>\s+</g, '>\n<')
    .trim();
}

function renderColumn(
  events: Types.CalendarEventData[],
  config: Types.Config,
  { language = 'en', weather }: { language?: string; weather?: Types.WeatherForecasts } = {},
): string {
  // 'column' is deliberate: `groupEventsByDay` resolves per-view overrides, so grouping
  // the list way would render column markup from list-grouped days.
  const days = EventUtils.groupEventsByDay(events, config, false, language, 'column');
  const container = document.createElement('div');
  litRender(Column.renderColumnGroupedEvents(days, config, language, weather, null), container);
  return serialize(container);
}

describe('column view DOM', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  it('renders the default configuration', () => {
    expect(renderColumn(EVENTS, buildConfig())).toMatchSnapshot();
  });

  it('renders a single event', () => {
    expect(renderColumn(SINGLE_EVENT, buildConfig())).toMatchSnapshot();
  });

  it('renders with no events', () => {
    expect(renderColumn([], buildConfig())).toMatchSnapshot();
  });

  it('suppresses empty day columns', () => {
    // `show_empty_days` defaults to true for this view (`view.ts:353`), the opposite of the
    // list view, so `true` here would have re-rendered the default and asserted nothing.
    expect(
      renderColumn(SINGLE_EVENT, buildConfig({ column: { show_empty_days: false } })),
    ).toMatchSnapshot();
  });

  it('renders past events', () => {
    expect(renderColumn(EVENTS, buildConfig({ show_past_events: true }))).toMatchSnapshot();
  });

  it('renders unsplit multi-day events', () => {
    // Splitting is forced on for this view (`view.ts:354`), so only the column override that
    // turns it back off produces markup the default case does not already cover.
    expect(
      renderColumn(EVENTS, buildConfig({ column: { split_multiday_events: false } })),
    ).toMatchSnapshot();
  });

  it('renders the optional content rows', () => {
    expect(
      renderColumn(
        EVENTS,
        buildConfig({
          show_location: true,
          show_description: true,
          show_countdown: true,
          show_week_numbers: 'iso',
          show_progress_bar: true,
        }),
      ),
    ).toMatchSnapshot();
  });

  it('renders day, week and month separators', () => {
    // All three separator widths default to zero, so without them `renderColumnSeparator`
    // never runs and the `column-separator-${kind}` suffix is never serialized. Twenty days
    // from the frozen mid-June date is enough to cross both a week and a month boundary.
    expect(
      renderColumn(
        EVENTS,
        buildConfig({
          days_to_show: 20,
          day_separator_width: '1px',
          week_separator_width: '2px',
          month_separator_width: '3px',
        }),
      ),
    ).toMatchSnapshot();
  });

  it('renders weather on both surfaces', () => {
    expect(
      renderColumn(EVENTS, buildConfig({ weather: { entity: 'weather.home', position: 'both' } }), {
        weather: WEATHER,
      }),
    ).toMatchSnapshot();
  });

  it('renders a single day', () => {
    // Compact mode is deliberately list-scoped (`view.ts:161-162`) and would render the
    // default column markup, so the day count is the axis that varies here instead.
    expect(renderColumn(EVENTS, buildConfig({ days_to_show: 1 }))).toMatchSnapshot();
  });
});
