/**
 * Event text in its own calendar's accent color.
 *
 * The feature is a **value**, not a mode: `accent` written into one of the five governed
 * color options means "this event's own calendar accent". A literal could not express it —
 * one literal is one color, and this needs one per calendar — and a flag that greyed the
 * fields out would leave five controls looking editable and doing nothing.
 *
 * The mechanism is the cascade. Each of those colors already reaches its text through a
 * custom property read from an ancestor, so the event element sets the same property to
 * its own accent and overrides it for that event's subtree and nothing else. What this
 * file pins is therefore mostly *which element carries which property*, plus the two
 * places that must **not** take an accent because they belong to no calendar: an empty-day
 * row, and the grid's `+N` overflow block.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { ACCENT_TEXT_OPTIONS, accentTextProperties } from '../src/rendering/accent-text';
import * as Column from '../src/rendering/column';
import { walkSchema } from '../src/rendering/editor/panels';
import { buildEventsSchema } from '../src/rendering/editor/schemas/events';
import * as Synthetic from '../src/rendering/editor/synthetic';
import { applyFormChange } from '../src/rendering/editor/value';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import { generateCustomPropertiesObject } from '../src/rendering/styles';
import { ACCENT_TEXT_SENTINEL } from '../src/utils/entity-colors';
import * as EventUtils from '../src/utils/events';

const WORK = '#e8a33d';
const HOME = '#7b1fa2';

/** Two events, one per configured calendar, inside the frozen window. */
const PAIR = () => [
  timed(17, '09:00', '10:00', 'Standup', 'calendar.work'),
  timed(17, '14:00', '15:00', 'Dentist', 'calendar.home'),
];

function timed(day: number, from: string, to: string, summary: string, entity: string) {
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(2026, 5, day, h, m).toISOString();
  };

  return {
    start: { dateTime: at(from) },
    end: { dateTime: at(to) },
    summary,
    _entityId: entity,
  } as Types.CalendarEventData;
}

function twoCalendars(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({
    entities: [
      { entity: 'calendar.work', accent_color: WORK },
      { entity: 'calendar.home', accent_color: HOME },
    ],
    days_to_show: 3,
    ...overrides,
  } as Partial<Types.Config>);
}

/** Stamp the calendar settings the fetch path would have written onto each event. */
function stamped(events: Types.CalendarEventData[], config: Types.Config) {
  return events.map((event) => {
    const match = (config.entities ?? []).find(
      (entry) => typeof entry === 'object' && entry.entity === event._entityId,
    );
    return match === undefined
      ? event
      : ({ ...event, _matchedConfig: match } as Types.CalendarEventData);
  });
}

function renderView(view: Types.EffectiveView, config: Types.Config, events = EVENTS): HTMLElement {
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(stamped(events, config), config, false, 'en', view);
  const container = document.createElement('div');
  const template =
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, FROZEN_NOW)
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en')
        : Render.renderGroupedEvents(days, effective, 'en');
  litRender(template, container);
  return container;
}

/** Every accent custom property an element carries, by name. */
function accentPropertiesOf(element: Element): Record<string, string> {
  const style = element.getAttribute('style') ?? '';
  const found: Record<string, string> = {};
  for (const [, property] of ACCENT_TEXT_OPTIONS) {
    const match = new RegExp(`${property}:\\s*([^;]+)`).exec(style);
    if (match) found[property] = match[1].trim();
  }
  return found;
}

describe('the governed option table', () => {
  it('names the property each option is actually rendered through', () => {
    // The two-list hazard, closed by reconciliation rather than by a second list: the
    // table is only correct if every row names the property `generateCustomPropertiesObject`
    // writes that option to. A mismatch would set a property nothing reads, so the accent
    // would silently not apply to that one field.
    const distinct = new Map<string, string>([
      ['event_color', 'rgb(1, 0, 0)'],
      ['time_color', 'rgb(2, 0, 0)'],
      ['location_color', 'rgb(3, 0, 0)'],
      ['description_color', 'rgb(4, 0, 0)'],
      ['progress_bar_color', 'rgb(5, 0, 0)'],
    ]);

    expect([...distinct.keys()]).toEqual(ACCENT_TEXT_OPTIONS.map(([key]) => key));

    const props = generateCustomPropertiesObject(
      buildConfig(Object.fromEntries(distinct) as Partial<Types.Config>),
    );

    for (const [key, property] of ACCENT_TEXT_OPTIONS) {
      expect(props[property], `${key} is not rendered through ${property}`).toBe(distinct.get(key));
    }
  });

  it('substitutes the shipped default at card level, never the sentinel itself', () => {
    // The sentinel is not a color. Written to the card element it would make every rule
    // that substitutes the property invalid at computed-value time — including the rules
    // an empty-day row and the `+N` block are drawn by, which take no accent.
    const props = generateCustomPropertiesObject(
      buildConfig(
        Object.fromEntries(
          ACCENT_TEXT_OPTIONS.map(([key]) => [key, ACCENT_TEXT_SENTINEL]),
        ) as Partial<Types.Config>,
      ),
    );

    for (const [key, property] of ACCENT_TEXT_OPTIONS) {
      expect(props[property]).toBe(DEFAULT_CONFIG[key as keyof Types.Config]);
      expect(props[property]).not.toBe(ACCENT_TEXT_SENTINEL);
    }
  });

  it('gives an empty-day row no accent, whatever the config asks for', () => {
    const config = buildConfig(
      Object.fromEntries(
        ACCENT_TEXT_OPTIONS.map(([key]) => [key, ACCENT_TEXT_SENTINEL]),
      ) as Partial<Types.Config>,
    );

    // The arms must differ, or this passes on a helper that returns nothing at all.
    expect(accentTextProperties(config, WORK, false)).not.toEqual({});
    expect(accentTextProperties(config, WORK, true)).toEqual({});
  });
});

describe('accent event text, view by view', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tints a grid block and a grid banner in their own calendar colors by default', () => {
    const container = renderView('grid', twoCalendars(), [
      timed(17, '09:00', '10:00', 'Standup', 'calendar.work'),
      timed(17, '14:00', '15:00', 'Dentist', 'calendar.home'),
      {
        start: { date: '2026-06-17' },
        end: { date: '2026-06-18' },
        summary: 'Holiday',
        _entityId: 'calendar.home',
      } as Types.CalendarEventData,
    ]);

    const blocks = [...container.querySelectorAll('.grid-event:not(.grid-event-overflow)')];
    const banner = container.querySelector('.grid-banner')!;

    expect(blocks.length, 'no blocks rendered').toBe(2);

    // Every governed property, on every event box, holding that event's own accent — and
    // the two blocks must differ, which is the whole claim. One color for all of them
    // would satisfy a per-field assertion and be the feature not working.
    const all = Object.fromEntries(ACCENT_TEXT_OPTIONS.map(([, p]) => [p, WORK]));
    expect(accentPropertiesOf(blocks[0])).toEqual(all);
    expect(accentPropertiesOf(blocks[1])).toEqual(
      Object.fromEntries(ACCENT_TEXT_OPTIONS.map(([, p]) => [p, HOME])),
    );
    expect(accentPropertiesOf(banner)).toEqual(
      Object.fromEntries(ACCENT_TEXT_OPTIONS.map(([, p]) => [p, HOME])),
    );
  });

  it.each(['list' as const, 'column' as const])('leaves %s view untinted by default', (view) => {
    const container = renderView(view, twoCalendars(), PAIR());
    const cells = [...container.querySelectorAll('td.event, .column-events > .event')];

    expect(cells.length, `no ${view} event elements rendered`).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(accentPropertiesOf(cell)).toEqual({});
    }
  });

  it.each(['list' as const, 'column' as const])(
    'honors the sentinel per field when %s view opts in',
    (view) => {
      // Per-field opt-in falls out of the sentinel being a value: one governed option set
      // to `accent` tints one thing, and the other four keep their own colors.
      const container = renderView(
        view,
        twoCalendars({ time_color: ACCENT_TEXT_SENTINEL }),
        PAIR(),
      );
      const cell = container.querySelector('td.event, .column-events > .event')!;

      expect(accentPropertiesOf(cell)).toEqual({ '--calendar-card-color-time': WORK });
    },
  );

  it('drops the title\u2019s inline color so the property it would fight can win', () => {
    // The title is the one governed field colored inline rather than through its property.
    // Left alone it would emit `color: accent`, which is not a color: the browser discards
    // the declaration and the right thing happens by accident. Dropping the attribute
    // hands the question to `.event-title`'s own `var(--calendar-card-color-event)`, which
    // the event element has just set to this calendar's accent.
    const plain = renderView('list', twoCalendars(), PAIR()).querySelector('.event-title')!;
    const sentinel = renderView(
      'list',
      twoCalendars({ event_color: ACCENT_TEXT_SENTINEL }),
      PAIR(),
    ).querySelector('.event-title')!;

    expect(plain.getAttribute('style')).toBe(`color: ${DEFAULT_CONFIG.event_color}`);
    expect(sentinel.getAttribute('style')).toBeNull();
  });

  it('keeps an explicit per-calendar title color ahead of the sentinel', () => {
    const config = twoCalendars({ event_color: ACCENT_TEXT_SENTINEL });
    config.entities = [{ entity: 'calendar.work', accent_color: WORK, color: 'rgb(9, 9, 9)' }];

    const title = renderView('list', config, [
      timed(17, '09:00', '10:00', 'Standup', 'calendar.work'),
    ]).querySelector('.event-title')!;

    expect(title.getAttribute('style')).toBe('color: rgb(9, 9, 9)');
  });

  it('gives the empty-day row and the overflow block no accent', () => {
    // Neither belongs to a calendar. The empty-day row carries the first configured
    // calendar's `_entityId`, so without the guard it would take that calendar's color and
    // say something false about a day nothing is on.
    const emptyDay = renderView(
      'list',
      twoCalendars({
        show_empty_days: true,
        days_to_show: 3,
        event_color: ACCENT_TEXT_SENTINEL,
        time_color: ACCENT_TEXT_SENTINEL,
      }),
      [timed(17, '09:00', '10:00', 'Standup', 'calendar.work')],
    );
    const placeholderRow = [...emptyDay.querySelectorAll('td.event')].find((cell) =>
      cell.querySelector('.empty-day-title'),
    );

    expect(placeholderRow, 'fixture produced no empty day').toBeDefined();
    expect(accentPropertiesOf(placeholderRow!)).toEqual({});

    const crowded = renderView(
      'grid',
      twoCalendars({ time_grid: { max_simultaneous_events: 1 } } as Partial<Types.Config>),
      [
        timed(17, '09:00', '11:00', 'Standup', 'calendar.work'),
        timed(17, '09:30', '10:30', 'Dentist', 'calendar.home'),
      ],
    );
    const overflow = crowded.querySelector('.grid-event-overflow')!;

    expect(overflow, 'fixture produced no overflow block').not.toBeNull();
    expect(accentPropertiesOf(overflow)).toEqual({});
  });

  it('pins the grid defaults for all five, so "on in grid" is a value and not a rumour', () => {
    for (const [key] of ACCENT_TEXT_OPTIONS) {
      expect(
        (ViewConfig.TIME_GRID_DEFAULT_OVERRIDES as Record<string, unknown>)[key],
        `${key} must default to the sentinel in grid`,
      ).toBe(ACCENT_TEXT_SENTINEL);
      expect(
        (ViewConfig.COLUMN_DEFAULT_OVERRIDES as Record<string, unknown>)[key],
        `${key} must not default to the sentinel in column view`,
      ).toBeUndefined();
      expect(DEFAULT_CONFIG[key as keyof Types.Config]).not.toBe(ACCENT_TEXT_SENTINEL);
    }
  });
});

describe('the event weather badge', () => {
  // The sixth governed field, and the one that is not a row in the table. Its color lives
  // at `weather.event.color`, nested where no per-view default can reach it, and it ships
  // no default at all — absence is already "defer to this surface", so it has three states
  // where the other five have two. What that buys is tested here rather than assumed.
  const WEATHER_PROPERTY = '--calendar-card-weather-event-color';

  // The rendering case below places events against the frozen window, exactly as the
  // view-by-view block above does.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The badge property an event element carries, or `undefined`. */
  function badgeOn(config: Types.Config, accent = WORK): string | undefined {
    return accentTextProperties(config, accent, false)[WEATHER_PROPERTY];
  }

  it('takes the accent on a grid block, where the block text already does', () => {
    // The default grid card, which is the whole point: nothing is configured, the view
    // defaults `event_color` to the sentinel, and the badge follows the text around it.
    const grid = ViewConfig.resolveEffectiveConfig(twoCalendars(), 'grid');

    expect(badgeOn(grid)).toBe(WORK);

    // The arms that must differ, or the assertion above is about a helper that always
    // answers. A list card leaves the badge alone, and so does a grid card whose block
    // text has been given a color of its own.
    expect(badgeOn(ViewConfig.resolveEffectiveConfig(twoCalendars(), 'list'))).toBeUndefined();

    const opted = twoCalendars();
    opted.time_grid = { event_color: 'rgb(1, 2, 3)' } as Types.TimeGridOverrides;

    expect(badgeOn(ViewConfig.resolveEffectiveConfig(opted, 'grid'))).toBeUndefined();
  });

  it('keeps an explicitly configured weather.event.color ahead of the accent', () => {
    // The claim the whole design has to keep. A color written at `weather.event.color` is
    // not the sentinel and is not absent, so neither arm can fire — and the card level
    // still emits it, so it is what the badge is actually painted in.
    const config = twoCalendars();
    config.weather = {
      entity: 'weather.home',
      event: { color: 'rgb(9, 8, 7)' },
    } as Types.Config['weather'];
    const grid = ViewConfig.resolveEffectiveConfig(config, 'grid');

    expect(badgeOn(grid)).toBeUndefined();
    expect(generateCustomPropertiesObject(grid)[WEATHER_PROPERTY]).toBe('rgb(9, 8, 7)');
  });

  it('opts in from any view when the sentinel is written at the nested key', () => {
    // The third state, and the one that makes this a value rather than a grid special
    // case: a list card can ask for it explicitly, exactly as the other five can.
    const config = twoCalendars();
    config.weather = {
      entity: 'weather.home',
      event: { color: ACCENT_TEXT_SENTINEL },
    } as Types.Config['weather'];

    expect(badgeOn(ViewConfig.resolveEffectiveConfig(config, 'list'))).toBe(WORK);
  });

  it('never writes the sentinel to the card element, where it is not a color', () => {
    // `accent` is not a color, so a rule substituting this property would be invalid at
    // computed-value time and the badge would lose its color entirely — including on the
    // rows that take no accent at all. Absence is this option's shipped default, so the
    // substitution is to write nothing and let the stylesheet's fallback stand.
    const config = twoCalendars();
    config.weather = {
      entity: 'weather.home',
      event: { color: ACCENT_TEXT_SENTINEL },
    } as Types.Config['weather'];

    expect(generateCustomPropertiesObject(config)[WEATHER_PROPERTY]).toBeUndefined();
  });

  it('leaves the day-header badge alone in every one of those cases', () => {
    // A different property on a different element, and nothing accent-related is ever
    // written above a day header. Read as a set so an arriving property fails too.
    const grid = ViewConfig.resolveEffectiveConfig(twoCalendars(), 'grid');
    const sentinel = twoCalendars();
    sentinel.weather = {
      entity: 'weather.home',
      event: { color: ACCENT_TEXT_SENTINEL },
      date: { color: 'rgb(4, 4, 4)' },
    } as Types.Config['weather'];

    for (const config of [grid, ViewConfig.resolveEffectiveConfig(sentinel, 'grid')]) {
      expect(
        Object.keys(accentTextProperties(config, WORK, false)).filter((key) =>
          key.includes('weather-date'),
        ),
      ).toEqual([]);
    }

    expect(generateCustomPropertiesObject(sentinel)['--calendar-card-weather-date-color']).toBe(
      'rgb(4, 4, 4)',
    );
  });

  it('paints the badge in the event\u2019s own calendar color, block by block', () => {
    // The end-to-end half, and the one that would catch the property being written to an
    // element the badge does not descend from. Two blocks, two calendars, two colors.
    const container = renderView('grid', twoCalendars(), PAIR());
    const blocks = [...container.querySelectorAll('.grid-event:not(.grid-event-overflow)')];

    expect(blocks.length, 'no blocks rendered').toBe(2);
    expect(
      blocks.map((block) => (block as HTMLElement).style.getPropertyValue(WEATHER_PROPERTY)),
    ).toEqual([WORK, HOME]);

    // ...and the two places that belong to no calendar still take nothing.
    const crowded = renderView(
      'grid',
      twoCalendars({ time_grid: { max_simultaneous_events: 1 } } as Partial<Types.Config>),
      [
        timed(17, '09:00', '11:00', 'Standup', 'calendar.work'),
        timed(17, '09:30', '10:30', 'Dentist', 'calendar.home'),
      ],
    );
    const overflow = crowded.querySelector<HTMLElement>('.grid-event-overflow')!;

    expect(overflow, 'fixture produced no overflow block').not.toBeNull();
    expect(overflow.style.getPropertyValue(WEATHER_PROPERTY)).toBe('');
    expect(accentTextProperties(twoCalendars(), WORK, true)[WEATHER_PROPERTY]).toBeUndefined();
  });
});

/**
 * The editor's one switch for the whole feature.
 *
 * Its state is **computed** from the five options, never stored, which is what makes
 * "user edits one field and the switch silently disagrees" impossible rather than merely
 * unlikely: there is no second value to fall out of step. Everything below is about that
 * property and about the one thing it forces — a view that substitutes its own default
 * for these keys has to be written in its own block, or the switch springs back.
 */
describe('the editor toggle', () => {
  const governed = ACCENT_TEXT_OPTIONS.map(([key]) => key);

  function form(config: Types.Config): boolean {
    return Synthetic.deriveSyntheticData(config).accent_event_text as boolean;
  }

  function toggle(config: Types.Config, value: boolean): Types.Config {
    const before = { ...config, ...Synthetic.deriveSyntheticData(config) } as Record<
      string,
      unknown
    >;
    return applyFormChange(config, before, { ...before, accent_event_text: value }, {}).config;
  }

  it('reads on for a default grid card and off for a default list card', () => {
    // The half a card-level read gets wrong. Grid defaults all five to the sentinel, so a
    // grid card that has never been edited stores none of them — reading the card level
    // would report the switch off on exactly the card the feature is on for.
    expect(form(buildConfig({ view: 'grid' }))).toBe(true);
    expect(form(buildConfig({ view: 'list' }))).toBe(false);
    expect(form(buildConfig({ view: 'column' }))).toBe(false);
  });

  it('reads off the moment one governed field stops being the sentinel', () => {
    for (const key of governed) {
      const config = buildConfig({ view: 'grid' });
      config.time_grid = { [key]: 'rgb(1, 2, 3)' } as Types.TimeGridOverrides;

      expect(form(config), `${key} alone must turn the switch off`).toBe(false);
    }

    // ...and the same from the other direction on a list card: four of five is still off.
    const partial = buildConfig({ view: 'list' });
    for (const key of governed.slice(0, 4)) {
      (partial as unknown as Record<string, unknown>)[key] = ACCENT_TEXT_SENTINEL;
    }

    expect(form(partial)).toBe(false);
  });

  it('turns the whole set on and off in list view', () => {
    const on = toggle(buildConfig({ view: 'list' }), true);

    for (const key of governed) {
      expect((on as unknown as Record<string, unknown>)[key]).toBe(ACCENT_TEXT_SENTINEL);
    }
    expect(form(on)).toBe(true);

    const off = toggle(on, false);

    for (const key of governed) {
      expect((off as unknown as Record<string, unknown>)[key]).toBe(
        DEFAULT_CONFIG[key as keyof Types.Config],
      );
    }
    expect(form(off)).toBe(false);
  });

  it('writes into the grid block, where a card-level write would be ignored', () => {
    // Grid substitutes its own default for these keys, so switching off at the card level
    // alone leaves the grid still drawing accents — and the switch, reading what the card
    // draws, springs straight back on. This is the round trip that proves it does not.
    const off = toggle(buildConfig({ view: 'grid' }), false);
    const block = off.time_grid as Record<string, unknown>;

    expect(block, 'nothing was written into time_grid:').toBeDefined();
    for (const key of governed) {
      expect(block[key], `${key} must be written into the block`).toBe(
        DEFAULT_CONFIG[key as keyof Types.Config],
      );
    }
    expect(form(off), 'the switch sprang back on').toBe(false);

    expect(form(toggle(off, true))).toBe(true);
  });

  it('leaves a column card at the card level, having no divergent default to beat', () => {
    const on = toggle(buildConfig({ view: 'column' }), true);

    expect(on.column).toBeUndefined();
    expect(on.event_color).toBe(ACCENT_TEXT_SENTINEL);
    expect(form(on)).toBe(true);
  });

  it('keeps whatever else the view block already held', () => {
    const config = buildConfig({ view: 'grid' });
    config.time_grid = { hour_height: '64px' } as Types.TimeGridOverrides;

    const block = toggle(config, false).time_grid as Record<string, unknown>;

    expect(block.hour_height).toBe('64px');
  });
});

describe('where the toggle sits', () => {
  it('is the first control in the Event Content panel', () => {
    // Placement is a claim, not an accident: the panel is ordered coarse to fine by scope,
    // and this is the only control that changes what five of the others mean. A reader who
    // meets it *after* picking a color has already picked one that is being overridden —
    // so it has to precede every field it governs, and `event_color` is the first of them.
    // Every governed field is behind its own `show_*` gate, so all four are opened here:
    // a panel that renders only three of them cannot state where the fifth sits.
    const schema = buildEventsSchema({
      config: buildConfig({
        show_time: true,
        show_location: true,
        show_description: true,
        show_progress_bar: true,
      }),
      language: 'en',
      view: 'list',
    });

    expect(schema.length, 'panel rendered nothing').toBeGreaterThan(5);
    expect((schema[0] as { name?: string }).name).toBe('accent_event_text');

    const names = [...walkSchema(schema)].map(({ node }) => node.name);
    for (const [key] of ACCENT_TEXT_OPTIONS) {
      expect(names.indexOf('accent_event_text'), `${key} must come after the toggle`).toBeLessThan(
        names.indexOf(key),
      );
    }
  });
});
