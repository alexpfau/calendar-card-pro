/**
 * `show_weather: false` on one calendar's entry leaves the weather out beside that entry's
 * events, and nowhere else (backlog item 297, #247).
 *
 * Every assertion that the weather is gone is paired with one that it is still drawn for the
 * other calendar in the same render, so a gate that drew no event weather at all cannot pass.
 * The day header's forecast is asserted in each view too, because it belongs to every
 * calendar and the option must not reach it.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, WEATHER, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

const FAMILY = 'calendar.family';
const WORK = 'calendar.work';

const WEATHER_BOTH: Types.WeatherConfig = {
  entity: 'weather.forecast_home',
  position: 'both',
  event: { show_conditions: true, show_temp: true },
};

/**
 * An event stamped as `processEvents` stamps it: with its calendar and the entry it matched.
 *
 * @param entityId - Calendar the event comes from
 * @param config - Card configuration, whose entries are already normalized
 * @param entryIndex - The entry the event matched, among `config.entities`
 * @param event - The event's own fields
 * @returns The stamped event
 */
function stamped(
  entityId: string,
  config: Types.Config,
  entryIndex: number,
  event: Pick<Types.CalendarEventData, 'start' | 'end' | 'summary'>,
): Types.CalendarEventData {
  const entry = config.entities[entryIndex];
  return {
    ...event,
    _entityId: entityId,
    _matchedConfig: typeof entry === 'object' ? entry : undefined,
  };
}

/** A timed event on Jun 17, in UTC as the `unit` project pins it. */
function timedAt(hour: number, summary: string) {
  const pad = String(hour).padStart(2, '0');
  const next = String(hour + 1).padStart(2, '0');
  return {
    start: { dateTime: `2026-06-17T${pad}:00:00.000Z` },
    end: { dateTime: `2026-06-17T${next}:00:00.000Z` },
    summary,
  };
}

/**
 * Render a view as the card host does: grouped for that view, with its effective config.
 *
 * @param view - View to render
 * @param config - Card configuration
 * @param events - Stamped events
 * @returns The rendered container
 */
function renderView(
  view: Types.EffectiveView,
  config: Types.Config,
  events: Types.CalendarEventData[],
): HTMLElement {
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(events, config, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', WEATHER, null, new Date())
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en', WEATHER, null)
        : Render.renderGroupedEvents(days, effective, 'en', WEATHER, null),
    container,
  );
  return container;
}

/** The event box whose title reads `summary`. */
function eventBox(container: HTMLElement, summary: string): Element {
  const boxes = [...container.querySelectorAll('.event')].filter((box) =>
    (box.textContent ?? '').includes(summary),
  );
  expect(boxes, summary).toHaveLength(1);
  return boxes[0];
}

/** The grid's screen-reader name for the block whose title reads `summary`, bidi marks removed. */
function accessibleName(container: HTMLElement, summary: string): string {
  const names = [...container.querySelectorAll('.grid-event-accessible')]
    .map((node) => (node.getAttribute('aria-label') ?? '').replace(/[\u2068\u2069]/g, ''))
    .filter((name) => name.includes(summary));
  expect(names, summary).toHaveLength(1);
  return names[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('show_weather: false on one calendar', () => {
  function twoCalendars(view: Types.EffectiveView) {
    const config = buildConfig({
      view,
      days_to_show: 1,
      entities: [FAMILY, { entity: WORK, show_weather: false }],
      weather: WEATHER_BOTH,
    });
    // 14:00 and 16:00 both have an hourly forecast in the fixture: 24° and 23°.
    const events = [
      stamped(FAMILY, config, 0, timedAt(14, 'Walk with Anna')),
      stamped(WORK, config, 1, timedAt(16, 'Office review')),
    ];
    return renderView(view, config, events);
  }

  it.each(['list', 'column', 'grid'] as const)(
    'leaves the weather out beside that calendar in %s view, and only there',
    (view) => {
      const container = twoCalendars(view);

      expect(eventBox(container, 'Walk with Anna').querySelector('.event-weather')).not.toBeNull();
      expect(eventBox(container, 'Office review').querySelector('.event-weather')).toBeNull();
    },
  );

  it.each(['list', 'column', 'grid'] as const)(
    'keeps the day header forecast in %s view',
    (view) => {
      expect(twoCalendars(view).querySelector('.weather')).not.toBeNull();
    },
  );

  it("leaves it out of the grid block's screen-reader name too", () => {
    const container = twoCalendars('grid');

    expect(accessibleName(container, 'Walk with Anna')).toContain('24\u00b0');
    expect(accessibleName(container, 'Office review')).not.toContain('\u00b0');
  });
});

describe('show_weather belongs to the entry, not the calendar', () => {
  it('keeps the weather on one entry of a calendar listed twice', () => {
    const config = buildConfig({
      days_to_show: 3,
      entities: [
        { entity: WORK, event_type: 'timed', show_weather: false },
        { entity: WORK, event_type: 'all_day' },
      ],
      weather: WEATHER_BOTH,
    });
    const events = [
      stamped(WORK, config, 0, timedAt(16, 'Office review')),
      // Jun 18 is beyond the fixture's hourly forecast, so the daily one answers: 21°.
      stamped(WORK, config, 1, {
        start: { date: '2026-06-18' },
        end: { date: '2026-06-19' },
        summary: 'Team offsite',
      }),
    ];
    const container = renderView('list', config, events);

    expect(eventBox(container, 'Office review').querySelector('.event-weather')).toBeNull();
    expect(eventBox(container, 'Team offsite').querySelector('.event-weather')).not.toBeNull();
  });

  /**
   * A row merged from several calendars carries the entry of the calendar listed first among
   * them, and so does its weather, as its colors and its location already do.
   */
  it.each([
    ['shows it when the calendar listed first shows it', [FAMILY, WORK], true],
    ['leaves it out when the calendar listed first leaves it out', [WORK, FAMILY], false],
  ] as const)('on a merged duplicate, %s', (_name, order, drawn) => {
    const entries = order.map((id) => (id === WORK ? { entity: WORK, show_weather: false } : id));
    const config = buildConfig({
      view: 'list',
      days_to_show: 1,
      entities: entries,
      filter_duplicates: true,
      weather: WEATHER_BOTH,
    });
    const events = order.map((id, index) =>
      stamped(id, config, index, timedAt(14, 'Parents evening')),
    );
    const container = renderView('list', config, events);
    const badge = eventBox(container, 'Parents evening').querySelector('.event-weather');

    expect(badge !== null).toBe(drawn);
  });
});

describe('normalizeEntities and show_weather', () => {
  it('keeps true and false, and drops anything else', () => {
    const normalized = Config.normalizeEntities([
      { entity: 'calendar.a', show_weather: true },
      { entity: 'calendar.b', show_weather: false },
      { entity: 'calendar.c', show_weather: 'false' as unknown as boolean },
      { entity: 'calendar.d' },
    ]);

    expect(normalized.map((entry) => entry.show_weather)).toEqual([
      true,
      false,
      undefined,
      undefined,
    ]);
  });
});
