import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as EventUtils from '../src/utils/events';

/**
 * Multi-day splitting is view-scoped, and these tests drive the *real* pipeline
 * — `fetchEventData` then `groupEventsByDay` — rather than handing pre-built
 * fixtures to the renderer.
 *
 * That distinction is the whole point of the file. Splitting used to run twice:
 * unconditionally at fetch time against the raw card config, and again at group
 * time against the view-resolved config. Grouping can only ever *add* segments,
 * never merge them back, so the first pass silently won any disagreement:
 *
 * ```yaml
 * split_multiday_events: true      # list view wants split
 * column:
 *   split_multiday_events: false   # column view wants one entry
 * ```
 *
 * resolved correctly to `false`, and the card still painted the event on every
 * covered day. The existing column DOM test did not catch it because it set no
 * top-level `true` and never went through `fetchEventData`, so the two passes
 * never had anything to disagree about.
 *
 * Splitting now happens only in `groupEventsByDay`. Anything asserting on the
 * shape of `fetchEventData`'s output would therefore be testing the wrong seam,
 * so every case here counts the days the event actually lands on.
 */

/** The one `hass` surface `fetchEvents` touches. */
function fakeHass(events: Types.CalendarEventData[]): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async () => events,
  } as unknown as Types.Hass;
}

/** An all-day event covering `start` up to — but not including — `end`. */
function allDay(summary: string, start: string, end: string): Types.CalendarEventData {
  return {
    start: { date: start },
    end: { date: end },
    summary,
    _entityId: 'calendar.personal',
  };
}

/** A timed event. Both endpoints are local-time ISO strings, deliberately without a
 * zone suffix, so "midnight" means midnight wherever the suite happens to run. */
function timed(summary: string, start: string, end: string): Types.CalendarEventData {
  return {
    start: { dateTime: start },
    end: { dateTime: end },
    summary,
    _entityId: 'calendar.personal',
  };
}

/**
 * Run the card's own path: fetch with the raw config, group with the resolved
 * one. Counts *days carrying the event* rather than non-empty days — column
 * view defaults to `show_empty_days: true` and pads every day with a synthetic
 * placeholder, so a non-empty-day count is vacuous there.
 */
async function daysShowing(
  event: Types.CalendarEventData,
  config: Types.Config,
  view: Types.EffectiveView,
  instanceId: string,
): Promise<number> {
  const { events } = await EventUtils.fetchEventData(fakeHass([event]), config, instanceId);
  const grouped = EventUtils.groupEventsByDay(
    events,
    ViewConfig.resolveEffectiveConfig(config, view),
    false,
    'en',
    view,
  );
  return grouped.filter((day) => day.events.some((entry) => entry.summary === event.summary))
    .length;
}

describe('multi-day splitting is resolved per view', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  // Wednesday through Friday, inclusive — an all-day end date is exclusive.
  const conference = allDay('Conference', '2026-06-17', '2026-06-20');

  it('splits in list view only when the top-level option asks for it', async () => {
    await expect(daysShowing(conference, buildConfig({}), 'list', 'list-off')).resolves.toBe(1);
    await expect(
      daysShowing(conference, buildConfig({ split_multiday_events: true }), 'list', 'list-on'),
    ).resolves.toBe(3);
  });

  it('splits in column view by default, without a top-level opt-in', async () => {
    await expect(
      daysShowing(conference, buildConfig({ view: 'column' }), 'column', 'col-default'),
    ).resolves.toBe(3);
  });

  it('honours the column escape hatch even when the top-level option is on', async () => {
    // The regression: `true` at fetch time used to pre-split the event, and no
    // later stage could put it back together.
    const config = buildConfig({
      view: 'column',
      split_multiday_events: true,
      column: { split_multiday_events: false },
    });

    expect(ViewConfig.resolveViewOption(config, 'split_multiday_events', 'column')).toBe(false);
    await expect(daysShowing(conference, config, 'column', 'col-escape')).resolves.toBe(1);
  });

  it('honours the column escape hatch when the top-level option is off', async () => {
    const config = buildConfig({
      view: 'column',
      column: { split_multiday_events: false },
    });

    await expect(daysShowing(conference, config, 'column', 'col-escape-off')).resolves.toBe(1);
  });

  it('lets a per-entity opt-in win over a card-level opt-out in list view', async () => {
    // `shouldSplitEvent` reads `_matchedConfig` ahead of the card-level value,
    // so the splitter has to run even when the card-level answer is `false`.
    const config = buildConfig({
      entities: [{ entity: 'calendar.personal', split_multiday_events: true }],
    });

    await expect(daysShowing(conference, config, 'list', 'entity-on')).resolves.toBe(3);
  });

  it('drops segments that fall past the requested window', async () => {
    // Segments used to be created upstream of the fetch-time window filter and
    // were trimmed by it. Days are selected with `.slice()` over days that *have*
    // events, so an untrimmed tail does not merely append — it pushes real days
    // out of the card.
    const overrun = allDay('Overrun', '2026-06-19', '2026-06-26');
    const config = buildConfig({ view: 'column', days_to_show: 3 });

    await expect(daysShowing(overrun, config, 'column', 'window-bound')).resolves.toBe(1);
  });

  it('does not create a phantom day for an event ending at exactly midnight', async () => {
    // An event ending at 00:00 occupies no time on the following day. The entry
    // guard compared the end against the last millisecond of the start day, so
    // 00:00:00.000 cleared it by exactly 1 ms, the event was treated as multi-day,
    // and an unconditional final segment with `start === end` landed in the next
    // day's bucket. Column view forces splitting on, so it saw this by default.
    const overnight = timed('Overnight', '2026-06-17T23:00:00', '2026-06-18T00:00:00');

    await expect(
      daysShowing(overnight, buildConfig({ split_multiday_events: true }), 'list', 'midnight-list'),
    ).resolves.toBe(1);
    await expect(
      daysShowing(overnight, buildConfig({ view: 'column' }), 'column', 'midnight-column'),
    ).resolves.toBe(1);
  });

  it('still splits an event that runs one minute past midnight', async () => {
    // The control for the case above. Without it, a guard that simply refused to
    // split anything ending near midnight would pass the regression while breaking
    // every genuine overnight event.
    const overnight = timed('Overnight', '2026-06-17T23:00:00', '2026-06-18T00:01:00');

    await expect(
      daysShowing(overnight, buildConfig({ split_multiday_events: true }), 'list', 'past-mid-list'),
    ).resolves.toBe(2);
  });
});
