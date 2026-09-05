import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, WEATHER, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as EventUtils from '../src/utils/events';

/**
 * The grid view's DOM.
 *
 * Property tests, not a snapshot, for the same reason `column-dom.test.ts` gives: there
 * is no prior output for a new view to be equal to, so a snapshot would assert only
 * that today's markup equals today's markup.
 *
 * The properties pinned here are the ones the three issues in `epic:time-grid` actually
 * asked for — a block sized by its duration (#206), events on an hour axis at their real
 * start time (#300), and a now line on today (#325) — plus the structural claim that
 * makes the layout hold together: every row resolves against **one** column template, so
 * the axis measures the columns it is drawn beside.
 *
 * The clock is frozen because today/weekend classification and the now line all read it.
 */

/** Local dates, so a fixture means the same wall-clock time in every zone. */
function timed(
  day: number,
  from: string,
  to: string,
  summary: string,
  entity = 'calendar.personal',
): Types.CalendarEventData {
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(2026, 5, day, h, m).toISOString();
  };

  return {
    start: { dateTime: at(from) },
    end: { dateTime: at(to) },
    summary,
    _entityId: entity,
  };
}

function timedRange(
  startDay: number,
  from: string,
  endDay: number,
  to: string,
  summary: string,
  entity = 'calendar.personal',
): Types.CalendarEventData {
  const at = (day: number, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(2026, 5, day, h, m).toISOString();
  };

  return {
    start: { dateTime: at(startDay, from) },
    end: { dateTime: at(endDay, to) },
    summary,
    _entityId: entity,
  };
}

function allDay(from: string, to: string, summary: string): Types.CalendarEventData {
  return { start: { date: from }, end: { date: to }, summary, _entityId: 'calendar.personal' };
}

function renderGrid(
  events: Types.CalendarEventData[],
  config: Types.Config = buildConfig({ view: 'grid', days_to_show: 3 }),
  hass: Types.Hass | null = null,
  weatherForecasts: Types.WeatherForecasts | undefined = undefined,
): HTMLElement {
  // Both of these mirror what the card host does, and skipping either renders something
  // the card never would. `groupEventsByDay` resolves per-view overrides, so grouping
  // another way produces days the grid would not have. And the renderer is handed the
  // *effective* config: without `resolveEffectiveConfig` the grid's divergent defaults —
  // `event_background_opacity` above all — never arrive, and every block renders
  // untinted while the card shows them tinted.
  const effective = ViewConfig.resolveEffectiveConfig(config, 'grid');
  const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'grid');
  const container = document.createElement('div');
  litRender(
    Grid.renderGridGroupedEvents(days, effective, 'en', weatherForecasts, hass, FROZEN_NOW),
    container,
  );
  return container;
}

function renderGridDays(
  days: Types.EventsByDay[],
  config: Types.Config = buildConfig({ view: 'grid', days_to_show: days.length }),
): HTMLElement {
  const effective = ViewConfig.resolveEffectiveConfig(config, 'grid');
  const container = document.createElement('div');
  litRender(
    Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, FROZEN_NOW),
    container,
  );
  return container;
}

function gridDay(day: number, events: Types.CalendarEventData[] = []): Types.EventsByDay {
  const date = new Date(2026, 5, day);

  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    day,
    month: date.toLocaleDateString('en-US', { month: 'long' }),
    timestamp: date.getTime(),
    events,
    weekNumber: null,
    monthNumber: date.getMonth(),
  };
}

/** The `top`/`height` a block was given, as numbers. */
function geometry(element: Element): { top: number; height: number } {
  const style = (element as HTMLElement).style;
  return { top: Number.parseFloat(style.top), height: Number.parseFloat(style.height) };
}

function requireElement<T extends Element = Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  expect(element, `expected to find ${selector}`).not.toBeNull();
  return element as T;
}

/** True when the week-number cell is present but hidden. */
function isHidden(cell: Element): boolean {
  return (cell.getAttribute('style') ?? '').replace(/\s/g, '').includes('visibility:hidden');
}

/** One entry per grid day column: the rendered week number, or null when the cell is hidden. */
function visibleWeekNumbers(container: ParentNode): Array<string | null> {
  return Array.from(container.querySelectorAll('.column-week-number')).map((cell) =>
    isHidden(cell) ? null : (cell.textContent?.trim() ?? ''),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the grid shares one column template', () => {
  // The structural claim. Every row placed against the same template is what keeps the
  // axis aligned with the columns; laying the rows out independently is the classic way
  // for an hour scale to end up a few pixels out from what it is measuring.
  it('puts the axis in the first track and one track per day after it', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);
    const grid = container.querySelector<HTMLElement>('.grid-container');

    expect(grid?.style.gridTemplateColumns).toBe('3.5em repeat(3, minmax(0, 1fr))');
  });

  it('places every row against that template by column and row', () => {
    const container = renderGrid([allDay('2026-06-17', '2026-06-19', 'Trip')]);

    expect(
      container.querySelector<HTMLElement>('.grid-day-header')?.style.gridRow,
      'day headers are row 2',
    ).toBe('2');
    expect(
      container.querySelector<HTMLElement>('.grid-allday-band')?.style.gridRow,
      'the all-day band is row 3',
    ).toBe('3');
    expect(
      container.querySelector<HTMLElement>('.grid-day-body')?.style.gridRow,
      'the time body is row 4',
    ).toBe('4');
  });

  it('offsets day tracks by one to clear the axis gutter', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);
    const columns = Array.from(container.querySelectorAll<HTMLElement>('.grid-day-body')).map(
      (element) => element.style.gridColumn,
    );

    expect(columns).toEqual(['2', '3', '4']);
  });

  it('renders nothing but an empty container for no days', () => {
    const container = document.createElement('div');
    litRender(
      Grid.renderGridGroupedEvents([], buildConfig({ view: 'grid' }), 'en', undefined, null),
      container,
    );

    expect(container.querySelector('.grid-container')).not.toBeNull();
    expect(container.querySelectorAll('.grid-event')).toHaveLength(0);
  });
});

describe('the grid hour axis follows the same clock convention as event times', () => {
  function hassWithLocale(
    language: string,
    time_format: NonNullable<Types.Hass['locale']>['time_format'],
  ) {
    return {
      states: {},
      callApi: vi.fn(),
      callService: vi.fn(),
      locale: { language, time_format },
    } satisfies Types.Hass;
  }

  function axisLabels(container: ParentNode): string[] {
    return Array.from(container.querySelectorAll('.grid-axis-label')).map(
      (label) => label.textContent?.trim() ?? '',
    );
  }

  it('honors show_current_week_number, which grid ignored entirely', () => {
    // `gridDay` fixes `weekNumber: null`, so every other grid DOM test returns early from
    // `renderWeekNumbers` and the pill is never drawn once. That is why an option the
    // reference documents globally, and which list and column both honor, did nothing
    // here: the suite could not render the thing it governs. Give the days a real week
    // number so the band is actually reachable.
    const withWeek = (days: Types.EventsByDay[]) => days.map((day) => ({ ...day, weekNumber: 23 }));
    const base = { view: 'grid' as const, days_to_show: 2, show_week_numbers: 'iso' as const };

    const shown = renderGridDays(withWeek([gridDay(3), gridDay(4)]), buildConfig(base));
    expect(shown.querySelector('.column-week-number')).not.toBeNull();
    expect(shown.textContent).toContain('23');

    const hidden = renderGridDays(
      withWeek([gridDay(3), gridDay(4)]),
      buildConfig({ ...base, show_current_week_number: false }),
    );
    expect(hidden.querySelector('.column-week-number')).toBeNull();
  });

  it('renders one week-number cell per day track, offset past the axis gutter', () => {
    const days = [
      { ...gridDay(19), weekNumber: 25 },
      { ...gridDay(20), weekNumber: 25 },
      { ...gridDay(21), weekNumber: 25 },
      { ...gridDay(22), weekNumber: 26 },
    ];
    const container = renderGridDays(
      days,
      buildConfig({ view: 'grid', days_to_show: days.length, show_week_numbers: 'iso' }),
    );
    const cells = Array.from(container.querySelectorAll<HTMLElement>('.column-week-number'));

    expect(cells).toHaveLength(days.length);
    expect(cells.map((cell) => cell.style.gridColumn)).toEqual(['2', '3', '4', '5']);
    expect(cells.map((cell) => cell.style.gridRow)).toEqual(['1', '1', '1', '1']);
  });

  it('shows a second week boundary above the date column it opens', () => {
    const days = [
      { ...gridDay(19), weekNumber: 25 },
      { ...gridDay(20), weekNumber: 25 },
      { ...gridDay(21), weekNumber: 25 },
      { ...gridDay(22), weekNumber: 26 },
    ];
    const container = renderGridDays(
      days,
      buildConfig({ view: 'grid', days_to_show: days.length, show_week_numbers: 'iso' }),
    );

    expect(visibleWeekNumbers(container)).toEqual(['25', null, null, '26']);
  });

  it('suppresses only the first grid week when show_current_week_number is false', () => {
    const days = [
      { ...gridDay(19), weekNumber: 25 },
      { ...gridDay(20), weekNumber: 25 },
      { ...gridDay(21), weekNumber: 25 },
      { ...gridDay(22), weekNumber: 26 },
    ];
    const container = renderGridDays(
      days,
      buildConfig({
        view: 'grid',
        days_to_show: days.length,
        show_week_numbers: 'iso',
        show_current_week_number: false,
      }),
    );

    expect(visibleWeekNumbers(container)).toEqual([null, null, null, '26']);
  });

  it('uses the Home Assistant locale to resolve system time format', () => {
    // Danish, not German. Both are 24-hour, so either proves the axis resolved `'system'`
    // through the locale rather than falling back — but Danish writes its separator as a
    // full stop, so it is the one that also proves the *card's own* formatter drew the
    // event. While these times went through `Intl` the German assertion below passed
    // unchanged, because `14:00` is the one rendering the two agree on character for
    // character; Danish would have read `14.00` and said so.
    const container = renderGrid(
      [timed(17, '14:00', '15:00', 'Review')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        grid: { start_time: '14:00', end_time: '16:00' },
      }),
      hassWithLocale('da', 'language'),
    );

    const axisText = axisLabels(container);

    expect(axisText[0]).not.toContain('PM');
    expect(axisText[0]).toBe('14');
    expect(container.textContent).toContain('14:00');
    expect(container.textContent).not.toContain('14.00');
  });

  it.each([
    ['de', true, ['6', '7']],
    ['en', true, ['6', '7']],
    ['de', false, ['6 AM', '7 AM']],
    ['en', false, ['6 AM', '7 AM']],
  ] as const)('keeps %s axis labels compact in %s-hour mode', (language, use24h, expected) => {
    const container = renderGrid(
      [timed(17, '06:00', '07:00', 'Breakfast')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        time_24h: use24h,
        grid: { start_time: '06:00', end_time: '08:00' },
      }),
      hassWithLocale(language, 'language'),
    );

    expect(axisLabels(container)).toEqual(expected);
  });
});

describe('events sit at their clock time (#300)', () => {
  it('places a block by its start time as a percentage of the band', () => {
    // Default band is 07:00-22:00, i.e. 900 minutes. 09:00 is 120 minutes in.
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);
    const { top } = geometry(container.querySelector('.grid-event')!);

    expect(top).toBeCloseTo((120 / 900) * 100, 6);
  });

  it('uses percentages, never pixels', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);
    const style = container.querySelector<HTMLElement>('.grid-event')!.style;

    // The whole point of percentage geometry: a fixed card height compresses the grid
    // with no re-math, and nothing can disagree with the now line about a pixel scale.
    expect(style.top).toMatch(/%$/);
    expect(style.height).toMatch(/%$/);
  });

  it('marks a block that starts before the band', () => {
    // Tomorrow, not today: this event ends at 08:00 and the frozen clock is 10:00, so on
    // today it would be filtered as past before the renderer ever saw it.
    const container = renderGrid([timed(18, '06:00', '08:00', 'Early')]);
    const block = container.querySelector('.grid-event')!;

    expect(block.classList.contains('clipped-top')).toBe(true);
    expect(geometry(block).top).toBe(0);
  });

  it('marks a block that runs past the band', () => {
    const container = renderGrid([timed(17, '21:00', '23:30', 'Late')]);

    expect(container.querySelector('.grid-event')!.classList.contains('clipped-bottom')).toBe(true);
  });

  it('draws nothing for an event wholly outside the band', () => {
    const container = renderGrid([timed(17, '02:00', '03:00', 'Night shift')]);

    expect(container.querySelectorAll('.grid-event')).toHaveLength(0);
  });
});

describe('a block is sized by its duration (#206)', () => {
  // The defining property of the view, and the whole of what #206 asked for.
  it('makes a two-hour event twice the height of a one-hour event', () => {
    const container = renderGrid([
      timed(17, '09:00', '10:00', 'One hour'),
      timed(17, '13:00', '15:00', 'Two hours'),
    ]);

    const [first, second] = Array.from(container.querySelectorAll('.grid-event')).map(geometry);

    expect(second.height).toBeCloseTo(first.height * 2, 6);
  });

  it('scales height with the band, not with a fixed pixel rate', () => {
    const narrow = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        grid: { start_time: '08:00', end_time: '12:00' },
      }),
    );

    // One hour of a four-hour band is 25%, where in the default fifteen-hour band it is
    // a third of that. A pixel-per-minute scale would report the same number for both.
    expect(geometry(narrow.querySelector('.grid-event')!).height).toBeCloseTo(25, 6);
  });

  it('emits geometry that stays inside the visible band', () => {
    const container = renderGrid(
      [timed(17, '16:00', '17:00', 'Ends on the line')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        grid: { start_time: '15:00', end_time: '17:00' },
      }),
    );

    const { top, height } = geometry(requireElement(container, '.grid-event'));

    // This pins the renderer's percentage declaration. It cannot prove browser pixel
    // alignment by itself — happy-dom does no layout — so `stylesheet.test.ts` also pins
    // the `box-sizing` rule that keeps padding and borders inside this emitted height.
    expect(top + height).toBeCloseTo(100, 6);
    expect(top + height).toBeLessThanOrEqual(100.000001);
  });
});

describe('timed multi-day events stay in the time grid', () => {
  function blockTexts(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.grid-event:not(.grid-event-overflow)')).map(
      (event) => event.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  it('renders a three-day timed event in every touched day column', () => {
    const container = renderGrid([timedRange(17, '09:00', 19, '17:00', 'Conference')]);
    const columns = Array.from(container.querySelectorAll('.grid-day-body'));

    expect(
      columns.map(
        (column) => column.querySelectorAll('.grid-event:not(.grid-event-overflow)').length,
      ),
    ).toEqual([1, 1, 1]);
    expect(container.querySelectorAll('.grid-banner')).toHaveLength(0);
  });

  it('renders a single-midnight crossing in both touched day columns', () => {
    const container = renderGrid([timedRange(17, '21:30', 18, '08:30', 'Late support')]);
    const columns = Array.from(container.querySelectorAll('.grid-day-body'));

    expect(
      columns.map(
        (column) => column.querySelectorAll('.grid-event:not(.grid-event-overflow)').length,
      ),
    ).toEqual([1, 1, 0]);
    expect(container.querySelectorAll('.grid-banner')).toHaveLength(0);
  });

  it('keeps timed middle segments out of the all-day band even when list splitting is enabled', () => {
    const container = renderGrid(
      [timedRange(17, '09:00', 19, '17:00', 'Conference')],
      buildConfig({ view: 'grid', days_to_show: 3, split_multiday_events: true }),
    );

    expect(container.querySelectorAll('.grid-event:not(.grid-event-overflow)')).toHaveLength(3);
    expect(container.querySelectorAll('.grid-banner')).toHaveLength(0);
  });

  it('keeps single-day timed event labels unchanged', () => {
    const container = renderGrid(
      [timed(17, '14:00', '16:00', 'Workshop')],
      buildConfig({ view: 'grid', days_to_show: 3, time_24h: true }),
    );

    expect(blockTexts(container)).toEqual(['Workshop 14:00 - 16:00']);
  });

  it('shows only the start time on a multi-day timed event first segment', () => {
    const container = renderGrid(
      [timedRange(17, '14:00', 19, '11:00', 'Conference Trip')],
      buildConfig({ view: 'grid', days_to_show: 3, time_24h: true }),
    );

    expect(blockTexts(container)[0]).toBe('Conference Trip 14:00');
  });

  it('shows title only on multi-day timed continuation segments', () => {
    const container = renderGrid(
      [timedRange(17, '14:00', 19, '11:00', 'Conference Trip')],
      buildConfig({ view: 'grid', days_to_show: 3, time_24h: true }),
    );

    expect(blockTexts(container).slice(1)).toEqual(['Conference Trip', 'Conference Trip']);
  });

  it('shows a Tuesday start time and title-only Wednesday and Thursday continuations', () => {
    const event = timedRange(23, '22:00', 25, '02:00', 'Overnight Migration');
    const container = renderGridDays(
      [gridDay(23, [event]), gridDay(24), gridDay(25)],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        time_24h: true,
        grid: { start_time: '00:00', end_time: '24:00' },
      }),
    );

    expect(blockTexts(container)).toEqual([
      'Overnight Migration 22:00',
      'Overnight Migration',
      'Overnight Migration',
    ]);
  });

  it('keeps later timed columns populated when empty grid days are hidden', () => {
    const container = renderGrid(
      [timed(18, '09:00', '10:00', 'Thursday Review'), timed(21, '09:00', '10:00', 'Sunday Plan')],
      buildConfig({ view: 'grid', days_to_show: 7, grid: { show_empty_days: false } }),
    );
    const columns = Array.from(container.querySelectorAll('.grid-day-body'));

    expect(columns).toHaveLength(2);
    expect(columns[0].textContent).toContain('Thursday Review');
    expect(columns[1].textContent).toContain('Sunday Plan');
  });
});

describe('overlapping events share the column', () => {
  it('puts two overlapping events side by side', () => {
    const container = renderGrid([
      timed(17, '09:00', '11:00', 'Review'),
      timed(17, '10:00', '12:00', 'Interview'),
    ]);

    // Read the emitted attribute, not `style.width`: happy-dom's CSSOM discards a
    // `calc()` containing a custom property, so the property reads empty for a
    // declaration the browser accepts. The assertion is about what the renderer wrote.
    const widths = Array.from(container.querySelectorAll('.grid-event')).map((element) =>
      element.getAttribute('style'),
    );

    expect(widths).toHaveLength(2);
    for (const width of widths) {
      expect(width).toContain('50%');
    }
  });

  it('leaves a lone event the full width', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);

    expect(container.querySelector('.grid-event')!.getAttribute('style')).toContain('100%');
  });

  it('collapses the excess past the cap into one block that says how many', () => {
    const container = renderGrid(
      [
        timed(17, '09:00', '12:00', 'A'),
        timed(17, '09:15', '12:00', 'B'),
        timed(17, '09:30', '12:00', 'C'),
        timed(17, '09:45', '12:00', 'D'),
      ],
      buildConfig({ view: 'grid', days_to_show: 3, grid: { max_simultaneous_events: 2 } }),
    );

    const overflow = container.querySelector('.grid-event-overflow');

    expect(overflow, 'the cap should produce an overflow block').not.toBeNull();
    expect(overflow!.classList.contains('grid-event')).toBe(true);
    expect(overflow!.textContent?.trim()).toBe('+2');
  });

  // A cap that drops events silently is worse than no cap, because the card then lies
  // about the day rather than merely crowding it.
  it('names the events it hides on the overflow block', () => {
    const container = renderGrid(
      [
        timed(17, '09:00', '12:00', 'A'),
        timed(17, '09:15', '12:00', 'Hidden one'),
        timed(17, '09:30', '12:00', 'Hidden two'),
      ],
      buildConfig({ view: 'grid', days_to_show: 3, grid: { max_simultaneous_events: 1 } }),
    );

    const title = container.querySelector('.grid-event-overflow')!.getAttribute('title');

    expect(title).toContain('Hidden one');
    expect(title).toContain('Hidden two');
  });
});

describe('all-day events go in the band, not the body', () => {
  it('draws an all-day event as a banner rather than a block', () => {
    const container = renderGrid([allDay('2026-06-17', '2026-06-18', 'Public holiday')]);

    expect(container.querySelectorAll('.grid-banner')).toHaveLength(1);
    expect(container.querySelectorAll('.grid-event')).toHaveLength(0);
  });

  // One banner across its days, rather than one chip per day, is what makes a multi-day
  // event read as a single thing.
  it('spans a multi-day event across its columns as one banner', () => {
    const container = renderGrid([allDay('2026-06-17', '2026-06-20', 'Conference')]);
    const banners = container.querySelectorAll<HTMLElement>('.grid-banner');

    expect(banners).toHaveLength(1);
    expect(banners[0].style.gridColumn).toBe('2 / span 3');
  });

  it('marks a banner that runs past the last column', () => {
    const container = renderGrid([allDay('2026-06-18', '2026-06-25', 'Long trip')]);
    const banner = container.querySelector('.grid-banner')!;

    expect(banner.classList.contains('continues-after')).toBe(true);
  });

  it('stacks two overlapping banners onto separate rows', () => {
    const container = renderGrid([
      allDay('2026-06-17', '2026-06-20', 'Conference'),
      allDay('2026-06-18', '2026-06-19', 'Bin day'),
    ]);

    const rows = Array.from(container.querySelectorAll<HTMLElement>('.grid-banner')).map(
      (element) => element.style.gridRow,
    );

    expect(new Set(rows).size, 'overlapping banners must not share a row').toBe(2);
  });

  it('packs two non-overlapping banners onto the same row', () => {
    const container = renderGrid([
      allDay('2026-06-17', '2026-06-18', 'Monday thing'),
      allDay('2026-06-19', '2026-06-20', 'Wednesday thing'),
    ]);

    const rows = Array.from(container.querySelectorAll<HTMLElement>('.grid-banner')).map(
      (element) => element.style.gridRow,
    );

    expect(new Set(rows).size).toBe(1);
  });

  it('keeps a later multi-day banner when empty grid days are hidden', () => {
    const container = renderGrid(
      [
        timed(18, '09:00', '10:00', 'Thursday Review'),
        allDay('2026-06-21', '2026-06-23', 'Sunday Trip'),
        timed(22, '09:00', '10:00', 'Monday Review'),
      ],
      buildConfig({ view: 'grid', days_to_show: 7, grid: { show_empty_days: false } }),
    );
    const banner = requireElement<HTMLElement>(container, '.grid-banner');

    expect(banner.textContent).toContain('Sunday Trip');
    expect(banner.style.gridColumn).toBe('3 / span 2');
  });

  it('costs no height when there are no all-day events', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);

    expect(container.querySelector('.grid-allday-band')).toBeNull();
  });
});

describe('separators between grid days', () => {
  function spanConfig(overrides: Partial<Types.Config> = {}): Types.Config {
    return buildConfig({
      view: 'grid',
      days_to_show: 15,
      ...overrides,
    });
  }

  function separators(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('.grid-separator'));
  }

  it('draws day separators by default in grid view', () => {
    const container = renderGrid(EVENTS, spanConfig());
    const rules = separators(container);

    // Grid view overrides `day_separator_width` to 1px, unlike list and column view,
    // because a time grid with no vertical rulings leaves the shared axis visually
    // detached from its day columns.
    expect(rules).toHaveLength(14);
    expect(rules.every((rule) => rule.classList.contains('grid-separator-day'))).toBe(true);
    expect(new Set(rules.map((rule) => rule.style.width))).toEqual(new Set(['1px']));
  });

  it('uses the existing day separator options for grid rules', () => {
    const config = spanConfig({ day_separator_width: '0px', day_separator_color: 'rgb(1, 2, 3)' });
    config.grid = { day_separator_width: '2px' };

    const container = renderGrid(EVENTS, config);
    const rule = requireElement<HTMLElement>(container, '.grid-separator-day');

    expect(rule.style.width).toBe('2px');
    expect(rule.style.backgroundColor).toBe('rgb(1, 2, 3)');
  });

  it('lets week and month separators win over day separators', () => {
    const container = renderGrid(
      EVENTS,
      spanConfig({
        day_separator_width: '1px',
        week_separator_width: '3px',
        week_separator_color: 'rgb(4, 5, 6)',
        month_separator_width: '5px',
        month_separator_color: 'rgb(7, 8, 9)',
      }),
    );

    const weekRules = Array.from(container.querySelectorAll<HTMLElement>('.grid-separator-week'));
    const monthRules = Array.from(container.querySelectorAll<HTMLElement>('.grid-separator-month'));

    expect(weekRules.map((rule) => rule.style.gridColumn)).toEqual(['7', '14']);
    expect(weekRules.map((rule) => rule.style.width)).toEqual(['3px', '3px']);
    expect(weekRules.map((rule) => rule.style.backgroundColor)).toEqual([
      'rgb(4, 5, 6)',
      'rgb(4, 5, 6)',
    ]);
    expect(monthRules.map((rule) => rule.style.gridColumn)).toEqual(['16']);
    expect(monthRules[0].style.width).toBe('5px');
    expect(monthRules[0].style.backgroundColor).toBe('rgb(7, 8, 9)');
    expect(container.querySelectorAll('.grid-separator-day')).toHaveLength(11);
  });

  it('places separators explicitly without displacing grid rows', () => {
    const container = renderGrid(EVENTS, spanConfig({ day_spacing: '20px' }));
    const rules = separators(container);

    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].style.gridColumn).toBe('3');
    expect(rules[0].style.gridRow).toBe('4');
    expect(rules[0].style.marginInlineStart).toBe('calc(-0.5 * (20px + 1px))');
  });

  it('keeps every separator family inside the time body', () => {
    const container = renderGrid(
      EVENTS,
      spanConfig({ week_separator_width: '3px', month_separator_width: '5px' }),
    );

    // The row-span decision is view-specific. In grid view even week/month rules stay out
    // of the label rows and the all-day band, because a larger boundary still cuts a
    // spanning banner visually.
    expect(requireElement<HTMLElement>(container, '.grid-separator-day').style.gridRow).toBe('4');
    expect(requireElement<HTMLElement>(container, '.grid-separator-week').style.gridRow).toBe('4');
    expect(requireElement<HTMLElement>(container, '.grid-separator-month').style.gridRow).toBe('4');
  });

  it('does not cross a genuinely multi-day all-day banner', () => {
    const container = renderGrid(
      [allDay('2026-06-17', '2026-06-20', 'Conference')],
      spanConfig({ days_to_show: 3 }),
    );
    const banner = requireElement<HTMLElement>(container, '.grid-banner');

    expect(banner.style.gridColumn).toBe('2 / span 3');
    for (const rule of separators(container)) {
      expect(rule.style.gridRow).toBe('4');
    }
  });
});

describe('the now line (#325)', () => {
  // FROZEN_NOW is 2026-06-17T10:00Z. The fixture window opens that day, so today is the
  // first column.
  it('draws exactly one line, in today only', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);
    const lines = container.querySelectorAll('.grid-now-line');

    expect(lines).toHaveLength(1);
    expect(lines[0].closest('.grid-day-body')?.classList.contains('today')).toBe(true);
  });

  it('positions the line as a percentage, like the events', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);

    // Same arithmetic as a block starting at the same instant — which is the point. The
    // two disagreeing by an hour on a DST day is a live defect in another card.
    expect(container.querySelector<HTMLElement>('.grid-now-line')!.style.top).toMatch(/%$/);
  });

  it('draws no line when it is switched off', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3, grid: { show_now_line: false } }),
    );

    expect(container.querySelectorAll('.grid-now-line')).toHaveLength(0);
  });

  it('draws no line when the current time is outside the band', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        grid: { start_time: '14:00', end_time: '18:00' },
      }),
    );

    expect(container.querySelectorAll('.grid-now-line')).toHaveLength(0);
  });
});

describe('the axis', () => {
  it('labels each whole hour in the band and never the closing one', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        time_24h: true,
        grid: { start_time: '08:00', end_time: '11:00' },
      }),
    );

    const labels = Array.from(container.querySelectorAll('.grid-axis-label')).map((element) =>
      element.textContent?.trim(),
    );

    expect(labels).toEqual(['8', '9', '10']);
  });

  it('positions labels by the same percentages as the events', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        time_24h: true,
        grid: { start_time: '08:00', end_time: '12:00' },
      }),
    );

    const nineOClock = Array.from(container.querySelectorAll<HTMLElement>('.grid-axis-label')).find(
      (element) => element.textContent?.trim() === '9',
    );
    const block = container.querySelector<HTMLElement>('.grid-event')!;

    // A label laid out by one rule and a block by another is exactly how an axis ends up
    // measuring nothing.
    expect(Number.parseFloat(nineOClock!.style.top)).toBeCloseTo(
      Number.parseFloat(block.style.top),
      6,
    );
  });

  it('drops the labels when they are switched off but keeps the scale', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3, grid: { show_axis_labels: false } }),
    );

    expect(container.querySelectorAll('.grid-axis-label')).toHaveLength(0);
    expect(container.querySelector('.grid-rules')).not.toBeNull();
  });

  it('falls back to the default band when a bound is unparseable', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3, grid: { start_time: 'nonsense' } }),
    );

    // 07:00-22:00, so 09:00 is 120 minutes into a 900-minute band. A half-honoured band
    // would put it somewhere else entirely.
    expect(geometry(container.querySelector('.grid-event')!).top).toBeCloseTo((120 / 900) * 100, 6);
  });
});

describe('the grid reuses the shared leaves', () => {
  // The architectural claim the whole view split exists to support. Without this the
  // grid could quietly grow its own copy of the title/time/location markup, and the only
  // symptom would be the views drifting apart one option at a time.
  it('renders event bodies through the shared content leaf', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);

    expect(
      container.querySelector('.grid-event .grid-event-disclosure .event-content'),
    ).not.toBeNull();
  });

  it('marks timed blocks as height-query containers for progressive disclosure', () => {
    const container = renderGrid([
      timed(18, '09:00', '09:30', 'Short sync'),
      timed(18, '10:00', '11:00', 'Long review'),
    ]);
    const blocks = container.querySelectorAll('.grid-event');

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.querySelector('.event-title')).not.toBeNull();
      expect(block.querySelector('.grid-event-disclosure .time')).not.toBeNull();
      // happy-dom does not evaluate container queries, so this proves the renderer emits
      // short and tall blocks into the CSS mechanism. `stylesheet.test.ts` pins the
      // disclosure thresholds that a real browser applies inside the shadow root.
      expect(block.querySelector('.grid-event-disclosure')).not.toBeNull();
    }

    expect(geometry(blocks[0]).height).toBeLessThan(geometry(blocks[1]).height);
  });

  it('renders day headers through the shared column-style header leaf', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        today_indicator: true,
        weather: { entity: 'weather.home', position: 'date' },
        grid: { day_header_separator_width: '2px', day_header_separator_color: 'rgb(1, 2, 3)' },
      }),
      null,
      WEATHER,
    );
    const header = requireElement(container, '.grid-day-header');
    const content = requireElement(header, '.column-date-content');

    expect(requireElement(content, '.weekday')).not.toBeNull();
    expect(requireElement(content, '.day')).not.toBeNull();
    expect(requireElement(content, '.weather').parentElement).toBe(content);
    expect(requireElement(content, '.today-indicator-container.inline')).not.toBeNull();

    const separator = requireElement<HTMLElement>(header, '.column-header-separator');
    expect(separator.style.borderTopWidth).toBe('2px');
    expect(separator.style.borderTopColor).toBe('rgb(1, 2, 3)');
  });

  it('carries the entity accent onto a block, as the other views do', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);
    const style = container.querySelector('.grid-event')!.getAttribute('style') ?? '';

    expect(style).toContain('border-inline-start-color');

    // Grid ships a tinted background by default where the list ships none, so the mere
    // presence of a non-empty `background-color` is the assertion: it can only be there
    // if `event_background_opacity: 20` reached the renderer through the view's
    // divergent defaults.
    //
    // 🚨 Do not tighten this to expect `rgba(`. `convertToRGBA` resolves a hex by reading
    // `getComputedStyle().color` off a temporary element, which happy-dom does not
    // implement — so under test the hex comes back unchanged, while a browser returns
    // `rgba(3, 169, 244, 0.2)`. Asserting the alpha form here fails for a reason that has
    // nothing to do with this view.
    expect(style).toMatch(/background-color:\s*\S/);
  });
});
