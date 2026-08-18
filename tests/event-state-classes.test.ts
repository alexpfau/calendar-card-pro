import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Column from '../src/rendering/column';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * The event element's state classes are public API, and only list view was guarding them.
 *
 * `event-first`, `event-middle`, `event-last` and `past-event` are what the card's own
 * stylesheet and every card-mod recipe hang rounded corners, separators and dimming on.
 * `.past-event .event-content { opacity: 0.6 }` in `styles.ts` is not a hook a user has
 * to opt into — it is how the card shows that an event has already happened, so losing
 * the class makes finished events look identical to upcoming ones.
 *
 * Both renderers compute these classes independently: `render.ts` for the list row and
 * `column.ts` for the grid cell. Nothing shared enforces that they agree.
 *
 * ## Why this was invisible
 *
 * List view is covered by a committed DOM snapshot, so replacing `event-middle` or
 * `past-event` with `false` there fails 14 and 1 snapshot tests respectively. Column view
 * has 63 tests and no snapshot at all; its assertions target structure and content, and
 * none of them reads these classes. Both column mutations survived the entire suite.
 *
 * That asymmetry is what makes this a coverage gap rather than dead code: the list twin
 * dying proves the class is observable, so the column twin surviving can only mean
 * nothing was looking.
 *
 * ## Why the first day, and why boolean runs
 *
 * The frozen Wednesday carries five events — an all-day, a finished one, one in progress
 * and two upcoming — which is the smallest set that exercises first, middle, last and
 * past at once. Asserting the whole boolean run per class keeps each presence paired with
 * the absences around it, so a class that is always on cannot pass either.
 *
 * Only the first day is compared across views. Column view splits multi-day events by
 * default and list view does not, so the later days legitimately differ in count; the
 * shared day is what makes a like-for-like comparison meaningful.
 */

/** Three days from the frozen Wednesday, with finished events kept so `past-event` appears. */
const LIST_CONFIG = { days_to_show: 3, show_past_events: true };

/** Empty days off so the grid renders the same day set list view does. */
const COLUMN_CONFIG = {
  ...LIST_CONFIG,
  view: 'column' as const,
  column: { show_empty_days: false },
};

function render(config: Types.Config, view: 'list' | 'column'): HTMLElement {
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'column'
      ? Column.renderColumnGroupedEvents(days, config, 'en', undefined, null)
      : Render.renderGroupedEvents(days, config, 'en', undefined, null),
    container,
  );
  return container;
}

/** Class lists for every event in the first rendered day, in document order. */
function firstDayEventClasses(view: 'list' | 'column'): string[][] {
  const container = render(buildConfig(view === 'column' ? COLUMN_CONFIG : LIST_CONFIG), view);
  const day = container.querySelector(view === 'column' ? '.day-column' : '.day-table');
  if (day === null) throw new Error(`no day container rendered for ${view} view`);
  return Array.from(day.querySelectorAll('.event')).map((element) =>
    Array.from(element.classList).sort(),
  );
}

const has = (classes: string[][], name: string): boolean[] =>
  classes.map((entry) => entry.includes(name));

describe('event state classes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([['list'], ['column']] as const)('marks position within the day in %s view', (view) => {
    const classes = firstDayEventClasses(view);
    expect(classes).toHaveLength(5);
    expect(has(classes, 'event-first')).toEqual([true, false, false, false, false]);
    expect(has(classes, 'event-middle')).toEqual([false, true, true, true, false]);
    expect(has(classes, 'event-last')).toEqual([false, false, false, false, true]);
  });

  it.each([['list'], ['column']] as const)(
    'marks only the finished event as past in %s view',
    (view) => {
      // 08:00–09:00 has ended at the frozen 10:00; 09:30–11:00 is still running and must
      // not be dimmed, which is what the surrounding falses pin.
      expect(has(firstDayEventClasses(view), 'past-event')).toEqual([
        false,
        true,
        false,
        false,
        false,
      ]);
    },
  );

  it('agrees between the two views on every event state class', () => {
    // A card-mod rule written against one view has to keep matching in the other.
    expect(firstDayEventClasses('column')).toEqual(firstDayEventClasses('list'));
  });

  it('does not call an event past at the instant it ends', () => {
    // `now > endDateTime`, not `>=`. The boundary is one millisecond wide and survived a
    // mutation sweep, while the all-day branch beside it — `today > endDate` — is pinned
    // by the fixtures above; this makes the timed path carry the same convention rather
    // than leaving the two free to drift apart.
    //
    // Both halves are asserted, so the test cannot pass on a card that has stopped
    // marking anything past at all.
    const endsExactlyNow: Types.CalendarEventData = {
      start: { dateTime: '2026-06-17T09:00:00.000Z' },
      end: { dateTime: FROZEN_NOW.toISOString() },
      summary: 'ends-now',
      _entityId: 'calendar.personal',
    };
    const endedAMillisecondAgo: Types.CalendarEventData = {
      start: { dateTime: '2026-06-17T09:00:00.000Z' },
      end: { dateTime: new Date(FROZEN_NOW.getTime() - 1).toISOString() },
      summary: 'ended',
      _entityId: 'calendar.personal',
    };

    const config = buildConfig({ days_to_show: 1, show_past_events: true });
    const days = EventUtils.groupEventsByDay(
      [endsExactlyNow, endedAMillisecondAgo],
      config,
      false,
      'en',
    );
    const container = document.createElement('div');
    litRender(Render.renderGroupedEvents(days, config, 'en', undefined, null), container);

    const past = Array.from(container.querySelectorAll('.event')).map((element) =>
      element.classList.contains('past-event'),
    );

    expect(past).toEqual([false, true]);
  });
});
