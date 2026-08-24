import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

const CALENDAR = 'calendar.personal';
const LOCATION = 'Community Hall';
const DESCRIPTION = 'Bring membership card';

type TestEvent = Types.CalendarEventData & { summary: string };

function renderList(events: Types.CalendarEventData[], config: Types.Config): HTMLElement {
  const days = EventUtils.groupEventsByDay(events, config, false, 'en');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en'), container);
  return container;
}

/** iCal all-day ends are exclusive, so a single-day event on the 18th ends on the 19th. */
function allDayEvent(start: string, endExclusive: string, summary: string): TestEvent {
  return {
    start: { date: start },
    end: { date: endExclusive },
    summary,
    location: LOCATION,
    description: DESCRIPTION,
    _entityId: CALENDAR,
  };
}

function timedEvent(summary: string): TestEvent {
  return {
    start: { dateTime: '2026-06-18T09:00:00.000Z' },
    end: { dateTime: '2026-06-18T10:00:00.000Z' },
    summary,
    location: LOCATION,
    description: DESCRIPTION,
    _entityId: CALENDAR,
  };
}

function rowFor(container: ParentNode, title: string): Element {
  const titleElement = Array.from(container.querySelectorAll('.event-title')).find(
    (element) => element.textContent?.trim() === title,
  );
  expect(titleElement).toBeDefined();
  const row = titleElement?.closest('td.event');
  expect(row).not.toBeNull();
  return row as Element;
}

function fieldText(row: ParentNode, selector: '.location' | '.description'): string | null {
  return row.querySelector(`${selector} span`)?.textContent?.trim() ?? null;
}

function rowForEvent(event: TestEvent, overrides: Partial<Types.Config> = {}): Element {
  return rowFor(
    renderList(
      [event],
      buildConfig({
        days_to_show: 8,
        show_description: true,
        ...overrides,
      }),
    ),
    event.summary,
  );
}

describe('all-day location and description rows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows location and description rows on an all-day event at their true defaults', () => {
    const row = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'));

    expect(fieldText(row, '.location')).toBe(LOCATION);
    expect(fieldText(row, '.description')).toBe(DESCRIPTION);
  });

  it('hides location rows on single-day and multi-day all-day events when turned off', () => {
    const single = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'), {
      show_location_allday: false,
    });
    const multi = rowForEvent(allDayEvent('2026-06-18', '2026-06-21', 'Festival'), {
      show_location_allday: false,
    });

    expect(fieldText(single, '.location')).toBeNull();
    expect(fieldText(multi, '.location')).toBeNull();
  });

  it('hides description rows on single-day and multi-day all-day events when turned off', () => {
    const single = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'), {
      show_description_allday: false,
    });
    const multi = rowForEvent(allDayEvent('2026-06-18', '2026-06-21', 'Festival'), {
      show_description_allday: false,
    });

    expect(fieldText(single, '.description')).toBeNull();
    expect(fieldText(multi, '.description')).toBeNull();
  });

  it('leaves timed event rows visible when both all-day suppressors are off', () => {
    const row = rowForEvent(timedEvent('Timed workshop'), {
      show_location_allday: false,
      show_description_allday: false,
    });

    expect(fieldText(row, '.location')).toBe(LOCATION);
    expect(fieldText(row, '.description')).toBe(DESCRIPTION);
  });

  describe('the two time-row switches divide the all-day events between them', () => {
    /*
     * `show_single_allday_time` never covered a multi-day all-day event, which is correct --
     * that row reads "All day, until Fri 29" and carries an end date nothing else on the row
     * shows, where a single-day one reads only "All day" and repeats whatever the badge says.
     * The gap is that until now there was no way to hide the second kind at all.
     *
     * The pair is asserted as a PARTITION rather than one at a time, because the two failure
     * modes are opposite and each looks fine from the other's test: a widened single key
     * would take the end date away from someone who only wanted the redundant line gone, and
     * a mis-scoped multi key would leave the redundant line behind. Every arm below therefore
     * names what the OTHER kind of event does under the same config.
     */
    const timeRow = (row: ParentNode) =>
      row.querySelector('.time-actual')?.textContent?.trim() || null;

    const single = () => allDayEvent('2026-06-18', '2026-06-19', 'Bin day');
    const multi = () => allDayEvent('2026-06-22', '2026-06-25', 'Festival');

    it('shows both time rows at the true defaults', () => {
      const c = renderList([single(), multi()], buildConfig({ days_to_show: 10 }));

      expect(timeRow(rowFor(c, 'Bin day'))).toBeTruthy();
      expect(timeRow(rowFor(c, 'Festival'))).toBeTruthy();
    });

    it('hides only the single-day row when only the single key is off', () => {
      const c = renderList(
        [single(), multi()],
        buildConfig({ days_to_show: 10, show_single_allday_time: false }),
      );

      expect(timeRow(rowFor(c, 'Bin day'))).toBeNull();
      // The end date survives, which is the whole reason these are two options.
      expect(timeRow(rowFor(c, 'Festival'))).toBeTruthy();
    });

    it('hides only the multi-day row when only the multi key is off', () => {
      const c = renderList(
        [single(), multi()],
        buildConfig({ days_to_show: 10, show_multiday_allday_time: false }),
      );

      expect(timeRow(rowFor(c, 'Bin day'))).toBeTruthy();
      expect(timeRow(rowFor(c, 'Festival'))).toBeNull();
    });

    it('hides both when both are off', () => {
      const c = renderList(
        [single(), multi()],
        buildConfig({
          days_to_show: 10,
          show_single_allday_time: false,
          show_multiday_allday_time: false,
        }),
      );

      expect(timeRow(rowFor(c, 'Bin day'))).toBeNull();
      expect(timeRow(rowFor(c, 'Festival'))).toBeNull();
    });

    it('hands every segment to the SINGLE key once splitting is on', () => {
      // Documented in `presentation.ts` and on the feature page, and until now asserted
      // nowhere. Splitting cuts a multi-day event into one row per day, so every row occupies
      // a single day, `isMultiDayAllDayEvent` is false for all of them, and the multi-day key
      // stops applying entirely. Worth pinning precisely because it is surprising: a user who
      // turns on the multi-day switch to hide a festival's time row sees nothing happen if
      // they also split.
      const festival = () => allDayEvent('2026-06-22', '2026-06-25', 'Festival');
      const shown = (config: Partial<Types.Config>) =>
        Array.from(
          renderList([festival()], buildConfig({ days_to_show: 12, ...config })).querySelectorAll(
            'td.event',
          ),
        )
          .map((row) => (timeRow(row) ? 'T' : '-'))
          .join('');

      // Unsplit: one row, and the multi key is what governs it.
      expect(shown({ split_multiday_events: false })).toBe('T');
      expect(shown({ split_multiday_events: false, show_multiday_allday_time: false })).toBe('-');

      // Split: three rows, and the multi key no longer reaches them...
      expect(shown({ split_multiday_events: true })).toBe('TTT');
      expect(shown({ split_multiday_events: true, show_multiday_allday_time: false })).toBe('TTT');

      // ...while the single key now governs all three.
      expect(shown({ split_multiday_events: true, show_single_allday_time: false })).toBe('---');
    });

    it('leaves a TIMED multi-day event alone whatever either key says', () => {
      // The boundary the maintainer drew explicitly. A meeting running Monday evening to
      // Friday morning shows real times, and neither of these is about it.
      const c = renderList(
        [
          {
            start: { dateTime: '2026-06-22T17:00:00.000Z' },
            end: { dateTime: '2026-06-25T10:00:00.000Z' },
            summary: 'Conference',
            _entityId: CALENDAR,
          } as TestEvent,
        ],
        buildConfig({
          days_to_show: 10,
          split_multiday_events: false,
          show_single_allday_time: false,
          show_multiday_allday_time: false,
        }),
      );

      expect(timeRow(rowFor(c, 'Conference'))).toBeTruthy();
    });
  });

  it('leaves the middle days of a split timed event alone', () => {
    // Those days ARE all-day: `splitMultiDayEvent` rewrites them as `start: { date }` because
    // the event occupies the whole of them, which is why the badge marks them and should.
    // These two must not follow it there. Dropping a row because the pill beside it already
    // says "all day" removes a repetition; dropping the VENUE from day 2 of a 3-day
    // conference loses information the other two days still show, and the result reads as a
    // fault -- present, absent, present.
    //
    // Measured before the guard existed, with both suppressors off and splitting on:
    // loc/desc, NONE/NONE, NONE/NONE, loc/desc across the four rows.
    const container = renderList(
      [
        {
          start: { dateTime: '2026-06-18T17:00:00.000Z' },
          end: { dateTime: '2026-06-21T10:00:00.000Z' },
          summary: 'Conference',
          location: LOCATION,
          description: DESCRIPTION,
          _entityId: CALENDAR,
        } as TestEvent,
      ],
      buildConfig({
        days_to_show: 8,
        show_description: true,
        split_multiday_events: true,
        show_location_allday: false,
        show_description_allday: false,
      }),
    );

    const rows = Array.from(container.querySelectorAll('td.event'));

    // The control: splitting has to have actually happened, or this asserts nothing.
    expect(rows.length).toBeGreaterThan(2);

    for (const [index, row] of rows.entries()) {
      expect(fieldText(row, '.location'), `row ${index}`).toBe(LOCATION);
      expect(fieldText(row, '.description'), `row ${index}`).toBe(DESCRIPTION);
    }
  });

  it('keeps location and description suppression independent', () => {
    const noLocation = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'), {
      show_location_allday: false,
    });
    const noDescription = rowForEvent(allDayEvent('2026-06-18', '2026-06-19', 'Members day'), {
      show_description_allday: false,
    });

    expect(fieldText(noLocation, '.location')).toBeNull();
    expect(fieldText(noLocation, '.description')).toBe(DESCRIPTION);
    expect(fieldText(noDescription, '.location')).toBe(LOCATION);
    expect(fieldText(noDescription, '.description')).toBeNull();
  });
});
