import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Entities from '../src/rendering/editor/entities';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import { generateCustomPropertiesObject } from '../src/rendering/styles';
import * as TextScale from '../src/rendering/text-scale';
import * as EventUtils from '../src/utils/events';
import * as CascadeThreshold from '../src/utils/grid-cascade-threshold';

/**
 * A calendar's `text_scale`: its events draw their text and icons that many times the card's
 * size, by writing the card's size properties again on their own element.
 *
 * The suite is built from default config, where no calendar carries a scale, so every rendered
 * case here turns one on. Happy-dom lays nothing out, so what is asserted is what an event
 * writes; how large the browser then draws it, and how the grid's fit ladders treat it, is
 * checked in a browser.
 */

const WORK = 'calendar.work';
const HOME = 'calendar.home';

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

function allDay(day: number, summary: string, entity: string) {
  const date = (d: number) => `2026-06-${String(d).padStart(2, '0')}`;
  return {
    start: { date: date(day) },
    end: { date: date(day + 1) },
    summary,
    _entityId: entity,
  } as Types.CalendarEventData;
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

function renderView(
  view: Types.EffectiveView,
  config: Types.Config,
  events: Types.CalendarEventData[],
  thresholds?: number | CascadeThreshold.CascadeThresholds,
): HTMLElement {
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(stamped(events, config), config, false, 'en', view);
  const container = document.createElement('div');
  const template =
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, FROZEN_NOW, thresholds)
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en')
        : Render.renderGroupedEvents(days, effective, 'en');
  litRender(template, container);
  return container;
}

/** The value of one custom property in an element's own style, or undefined. */
function ownProperty(element: Element, property: string): string | undefined {
  const match = new RegExp(`${property}:\\s*([^;]+)`).exec(element.getAttribute('style') ?? '');
  return match?.[1].trim();
}

/** The event element whose text includes `summary`. */
function eventNamed(container: HTMLElement, selector: string, summary: string): Element {
  const found = [...container.querySelectorAll(selector)].find((element) =>
    element.textContent?.includes(summary),
  );
  expect(found, `no ${selector} for ${summary}`).toBeDefined();
  return found!;
}

describe('text_scale in the configuration', () => {
  it.each([
    [0.75, 0.75],
    ['0.8', 0.8],
    [2, 2],
    [0, undefined],
    [-1, undefined],
    ['abc', undefined],
    [true, undefined],
    [Infinity, undefined],
    [null, undefined],
  ])('reads %j as %j', (written, read) => {
    const [entry] = Config.normalizeEntities([
      { entity: WORK, text_scale: written } as unknown as Types.EntityConfig,
    ]);
    expect(entry.text_scale).toBe(read);
  });
});

describe('scaling a font size', () => {
  it.each([
    ['14px', 0.5, '7px'],
    // Not px, which every default is: a px-only implementation would agree with the defaults.
    ['1.5em', 0.5, '0.75em'],
    ['2rem', 1.5, '3rem'],
    ['120%', 0.5, '0.6em'],
    ['larger', 2, '2.4em'],
    ['calc(10px + 1em)', 2, 'calc(2 * (calc(10px + 1em)))'],
    ['var(--size, 12px)', 0.5, 'calc(0.5 * (var(--size, 12px)))'],
    ['14px !important', 0.5, '7px !important'],
  ])('%s at %s is %s', (size, scale, scaled) => {
    expect(ViewConfig.scaleTextSize(size, scale)).toBe(scaled);
  });

  it('scales what the rule falls back to for a CSS-wide keyword, which leaves it unset', () => {
    // An event size's rule has no fallback, so its text inherits: half of that is 0.5em.
    expect(ViewConfig.scaleTextSize('initial', 0.5)).toBe('0.5em');
    expect(ViewConfig.scaleTextSize('inherit', 2)).toBe('2em');
    // The weather text's rule falls back to 12px.
    expect(ViewConfig.scaleTextSize('unset', 0.5, '12px')).toBe('6px');
  });

  it('takes a keyword in a var() fallback at the size browsers draw it as well', () => {
    expect(ViewConfig.scaleTextSize('var(--missing, large)', 0.95)).toBe(
      'calc(0.95 * (var(--missing, 18px)))',
    );
    // A name that merely contains a keyword is left alone.
    expect(ViewConfig.scaleTextSize('var(--large-text, 14px)', 0.5)).toBe(
      'calc(0.5 * (var(--large-text, 14px)))',
    );
  });

  it('takes an absolute keyword at the size browsers draw it, so smaller is always smaller', () => {
    // At the CSS Fonts table `scaleFontSize` uses for boxes, large is 19.2px and 0.95 of it
    // 18.24px: larger than the 18px large is drawn at.
    const large = Number.parseFloat(ViewConfig.scaleTextSize('large', 0.95));
    expect(large).toBeCloseTo(17.1, 9);
    expect(large).toBeLessThan(18);
    expect(ViewConfig.scaleTextSize('x-small', 2)).toBe('20px');
    expect(ViewConfig.scaleTextSize('MEDIUM', 0.5)).toBe('8px');
  });
});

describe('scaling an icon size', () => {
  it.each([
    ['14px', 0.5, '7px'],
    ['1rem', 2, '2rem'],
    // Drawn inside the scaled text, so a font-relative size follows it already.
    ['1em', 0.5, '1em'],
    ['calc(1em + 2px)', 0.5, 'calc(1em + 1px)'],
    ['min(20px, 1.2em)', 0.5, 'min(10px, 1.2em)'],
    ['var(--icon)', 2, 'calc(2 * (var(--icon)))'],
    ['14px !important', 0.5, '7px !important'],
    // A sign belongs to its length; an angle is no length.
    ['calc(20px + -4px)', 0.5, 'calc(10px + -2px)'],
    ['calc(20px * sin(30deg))', 0.5, 'calc(10px * sin(30deg))'],
    ['calc(2 * 0.5rem)', 2, 'calc(2 * 1rem)'],
  ])('%s at %s is %s', (size, scale, scaled) => {
    expect(ViewConfig.scaleIconSize(size, scale)).toBe(scaled);
  });

  it.each([
    ['1em', 0.5, '0.5em'],
    ['calc(1em + 2px)', 0.5, 'calc(0.5em + 1px)'],
    ['14px', 0.5, '7px'],
  ])('outside the scaled text, scales %s at %s to %s, em included', (size, scale, scaled) => {
    expect(ViewConfig.scaleIconSize(size, scale, false)).toBe(scaled);
  });
});

describe('the sizes a scale multiplies', () => {
  /** Every other size option, and why an event's scale leaves it alone. */
  const LEFT_ALONE: Readonly<Record<string, string>> = {
    title_font_size: 'the card title',
    week_number_font_size: 'the week number, beside the days rather than in an event',
    weekday_font_size: 'the day header',
    day_font_size: 'the day header',
    month_font_size: 'the day header',
    today_indicator_size: 'the today marker, beside the date',
    'weather.date.font_size': "the day header's weather",
    'weather.date.icon_size': "the day header's weather",
  };

  it('accounts for every size option, either scaled or left alone with a reason', () => {
    const sizeOptions = [
      ...Config.LENGTH_OPTIONS_FOLDED_WHEN_UNUSABLE,
      ...Config.FONT_SIZE_OPTIONS_FOLDED_WHEN_UNUSABLE,
    ];

    expect(
      [...TextScale.SCALED_SIZES.map(({ option }) => option), ...Object.keys(LEFT_ALONE)].sort(),
    ).toEqual([...new Set(sizeOptions)].sort());
  });

  it('is pinned by value', () => {
    expect(
      TextScale.SCALED_SIZES.map(({ option, property, kind }) => [option, property, kind]),
    ).toEqual([
      ['event_font_size', '--calendar-card-font-size-event', 'text'],
      ['time_font_size', '--calendar-card-font-size-time', 'text'],
      ['location_font_size', '--calendar-card-font-size-location', 'text'],
      ['description_font_size', '--calendar-card-font-size-description', 'text'],
      ['time_icon_size', '--calendar-card-icon-size-time', 'icon'],
      ['location_icon_size', '--calendar-card-icon-size-location', 'icon'],
      ['description_icon_size', '--calendar-card-icon-size-description', 'icon'],
      ['weather.event.font_size', '--calendar-card-weather-event-font-size', 'text'],
      ['weather.event.icon_size', '--calendar-card-weather-event-icon-size', 'icon'],
    ]);
  });

  it('names the property the card writes each option to', () => {
    // A distinct value per option, so two crossed mappings fail as well as a dropped one.
    TextScale.SCALED_SIZES.forEach(({ option, property }, index) => {
      const value = `${101 + index}px`;
      const nested = /^weather\.event\.(.+)$/.exec(option);
      const config = buildConfig(
        (nested
          ? { weather: { event: { [nested[1]]: value } } }
          : { [option]: value }) as Partial<Types.Config>,
      );
      expect(generateCustomPropertiesObject(config)[property], option).toBe(value);
    });
  });
});

describe('the properties a scaled event writes', () => {
  it('is nothing at a scale of 1, so an unscaled event writes what it always did', () => {
    expect(TextScale.textScaleProperties(buildConfig(), 1)).toEqual({});
  });

  it('is every event size, multiplied, and the room derived from them, and nothing else', () => {
    expect(TextScale.textScaleProperties(buildConfig(), 0.5)).toEqual({
      '--calendar-card-font-size-event': '7px',
      '--calendar-card-font-size-time': '6px',
      '--calendar-card-font-size-location': '6px',
      '--calendar-card-font-size-description': '6px',
      '--calendar-card-icon-size-time': '7px',
      '--calendar-card-icon-size-location': '7px',
      '--calendar-card-icon-size-description': '7px',
      '--calendar-card-weather-event-font-size': '6px',
      '--calendar-card-weather-event-icon-size': '7px',
      '--calendar-card-event-inline-room': '0.875px',
      '--calendar-card-grid-text-inline-room': 'max(0.875px, 0.75px, 0.75px, 0.75px)',
    });
  });

  it('gives the weather badge beside the title an em icon of its own, scaled in full', () => {
    const properties = TextScale.textScaleProperties(
      buildConfig({ weather: { event: { icon_size: '1em' } } } as Partial<Types.Config>),
      0.5,
    );

    // In a row of its own the icon follows the scaled weather text...
    expect(properties['--calendar-card-weather-event-icon-size']).toBeUndefined();
    // ...beside the title it sits in the row's unscaled font.
    expect(properties[TextScale.WEATHER_TITLE_ICON_PROPERTY]).toBe('0.5em');
  });

  it('scales the sizes as configured, in their own units', () => {
    const properties = TextScale.textScaleProperties(
      buildConfig({
        event_font_size: '1.2em',
        time_icon_size: '1em',
        weather: { event: { font_size: '90%' } },
      } as Partial<Types.Config>),
      0.5,
    );

    expect(properties['--calendar-card-font-size-event']).toBe('0.6em');
    expect(properties['--calendar-card-weather-event-font-size']).toBe('0.45em');
    // Follows its own scaled text, so it writes nothing of its own.
    expect(properties['--calendar-card-icon-size-time']).toBeUndefined();
  });

  it('is computed once per configuration and scale', () => {
    const config = buildConfig();
    expect(TextScale.textScaleProperties(config, 2)).toBe(TextScale.textScaleProperties(config, 2));
  });
});

describe('a scaled calendar on the card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const config = (overrides: Partial<Types.Config> = {}) =>
    buildConfig({
      entities: [{ entity: WORK, text_scale: 0.5 }, { entity: HOME }],
      days_to_show: 3,
      ...overrides,
    } as Partial<Types.Config>);

  const EVENTS = [
    timed(17, '09:00', '10:00', 'Standup', WORK),
    timed(17, '14:00', '15:00', 'Dentist', HOME),
    allDay(18, 'Offsite', WORK),
    allDay(18, 'Holiday', HOME),
  ];

  it.each([
    ['list', 'td.event', '7px'],
    ['column', '.column-events > .event', '7px'],
    // Grid draws its titles at 12px by default, so half is 6px.
    ['grid', '.grid-event', '6px'],
  ] as const)(
    'draws its %s events at its scale, and the others at the card size',
    (view, selector, title) => {
      const container = renderView(view, config(), EVENTS);
      const property = '--calendar-card-font-size-event';

      const scaled = eventNamed(container, selector, 'Standup');
      const unscaled = eventNamed(container, selector, 'Dentist');

      expect(ownProperty(scaled, property)).toBe(title);
      expect(ownProperty(unscaled, property)).toBeUndefined();
      // The class the stylesheet keys the scaled event's own room on, and only there.
      expect(scaled.classList.contains(TextScale.TEXT_SCALED_CLASS)).toBe(true);
      expect(unscaled.classList.contains(TextScale.TEXT_SCALED_CLASS)).toBe(false);
    },
  );

  it('draws its all-day banners in grid view at its scale', () => {
    const container = renderView('grid', config(), EVENTS);
    const property = '--calendar-card-font-size-event';

    const scaled = eventNamed(container, '.grid-banner', 'Offsite');

    expect(ownProperty(scaled, property)).toBe('6px');
    expect(scaled.classList.contains(TextScale.TEXT_SCALED_CLASS)).toBe(true);
    expect(ownProperty(eventNamed(container, '.grid-banner', 'Holiday'), property)).toBeUndefined();
  });

  it('never scales an empty-day notice, even with the scaled calendar listed first', () => {
    const container = renderView('list', config({ show_empty_days: true }), EVENTS);
    const notice = container.querySelector('td.event:has(.empty-day-title)');

    expect(notice).not.toBeNull();
    expect(ownProperty(notice!, '--calendar-card-font-size-event')).toBeUndefined();
  });

  it('draws a merged duplicate at the scale of the calendar whose entry won it', () => {
    const shared = (entity: string) => timed(17, '11:00', '12:00', 'School play', entity);
    const merged = (first: number, second: number) =>
      renderView(
        'list',
        config({
          entities: [
            { entity: WORK, text_scale: first },
            { entity: HOME, text_scale: second },
          ],
          filter_duplicates: true,
        } as Partial<Types.Config>),
        [shared(WORK), shared(HOME)],
      );
    const titleSize = (container: HTMLElement) =>
      ownProperty(
        eventNamed(container, 'td.event', 'School play'),
        '--calendar-card-font-size-event',
      );

    expect(titleSize(merged(0.5, 2))).toBe('7px');
    expect(titleSize(merged(2, 0.5))).toBe('28px');
  });
});

describe('the cascade threshold of a scaled calendar', () => {
  it('is measured for each scale, from one measurement', () => {
    // A 48px hour over a 15-hour band, at the 12px grid title.
    const scale = { bodyHeightPx: 48 * 15, fontPx: 12, chromePx: 7 };
    const thresholds = CascadeThreshold.cascadeThresholdsMin(
      scale,
      15 * 60,
      [1, 0.5, 2],
      new Map(),
    );

    expect(Object.fromEntries(thresholds)).toEqual({ 1: 30, 0.5: 30, 2: 60 });
  });

  it("falls back to the card's threshold for a scale it has not measured", () => {
    const thresholds = new Map([
      [1, 35],
      [2, 60],
    ]);

    expect(CascadeThreshold.thresholdForScale(thresholds, 2)).toBe(60);
    expect(CascadeThreshold.thresholdForScale(thresholds, 1.5)).toBe(35);
    expect(CascadeThreshold.thresholdForScale(new Map(), 1.5)).toBe(
      CascadeThreshold.CASCADE_THRESHOLD_FLOOR_MIN,
    );
    expect(CascadeThreshold.thresholdForScale(45, 2)).toBe(45);
  });

  describe('in grid view', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(FROZEN_NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // A long event, and one starting 45 minutes into it from the other calendar.
    const day = (hostCalendar: string, lateCalendar: string) => [
      timed(17, '09:00', '12:00', 'Planning', hostCalendar),
      timed(17, '09:45', '10:15', 'Call', lateCalendar),
    ];
    // Nested over, Planning keeps its text above the call: its text region ends early. Side
    // by side it would be narrowed instead. Not the call's raised class, which a later lane
    // beside an earlier one carries too.
    const nestedOver = (container: HTMLElement) =>
      ownProperty(
        eventNamed(container, '.grid-event', 'Planning'),
        '--calendar-card-grid-text-block-ratio',
      ) !== undefined;
    const scaledCard = buildConfig({
      entities: [{ entity: WORK, text_scale: 2 }, { entity: HOME }],
      days_to_show: 3,
      time_grid: { overlap_layout: 'cascade' },
    } as Partial<Types.Config>);
    const thresholds = new Map([
      [1, 30],
      [2, 60],
    ]);

    it('nests over a scaled event only past its own threshold', () => {
      expect(nestedOver(renderView('grid', scaledCard, day(WORK, HOME), thresholds))).toBe(false);
    });

    it('nests over every other event as before', () => {
      expect(nestedOver(renderView('grid', scaledCard, day(HOME, WORK), thresholds))).toBe(true);
    });
  });
});

describe('the editor field', () => {
  it('stores a number, and nothing when left empty', () => {
    const form = Entities.toEntityFormData({ entity: WORK, text_scale: 0.75 });

    expect(form.text_scale).toBe(0.75);
    expect(Entities.fromEntityFormData(WORK, { ...form, text_scale: '0.8' })).toEqual({
      entity: WORK,
      text_scale: 0.8,
    });
    expect(Entities.fromEntityFormData(WORK, { ...form, text_scale: '' })).toBe(WORK);
  });
});
