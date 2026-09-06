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
  const language = config.language ?? 'en';
  const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'grid');
  const container = document.createElement('div');
  litRender(
    Grid.renderGridGroupedEvents(days, effective, language, weatherForecasts, hass, FROZEN_NOW),
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

    expect(grid?.style.gridTemplateColumns).toBe('max-content repeat(3, minmax(0, 1fr))');
    expect(grid?.style.overflowX).toBe('');
  });

  it('keeps positive, horizontally scrollable tracks when cramp runs out of width', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 7,
        time_grid: { min_days_to_show: 7, min_days_fallback: 'cramp', axis_width: '4em' },
      }),
    );
    const grid = requireElement<HTMLElement>(container, '.grid-container');

    expect(grid.style.gridTemplateColumns).toBe('4em repeat(7, minmax(2rem, 1fr))');
    expect(grid.style.overflowX).toBe('auto');
    expect(grid.tabIndex).toBe(0);
    expect(container.querySelectorAll('.grid-day-body')).toHaveLength(7);
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

  it('places all-day banners on the same day tracks as the time body', () => {
    const container = renderGrid([
      timed(17, '09:00', '10:00', 'Standup'),
      allDay('2026-06-17', '2026-06-18', 'Workshop'),
      allDay('2026-06-17', '2026-06-20', 'Trip'),
    ]);
    const band = requireElement<HTMLElement>(container, '.grid-allday-band');
    const bodyColumns = Array.from(container.querySelectorAll<HTMLElement>('.grid-day-body')).map(
      (element) => element.style.gridColumn,
    );
    const banners = Array.from(container.querySelectorAll<HTMLElement>('.grid-banner'));

    expect(
      band.style.gridTemplateColumns,
      'the band must reuse the parent grid tracks, not repeat an empty max-content gutter',
    ).toBe('subgrid');
    expect(banners.map((banner) => banner.style.gridColumn)).toEqual(['2 / span 3', '2 / span 1']);
    expect(banners[1].style.gridColumn.split(' / ')[0]).toBe(bodyColumns[0]);
  });

  it('carries shared day-state classes onto the grid header', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);
    const headers = Array.from(container.querySelectorAll('.grid-day-header'));

    expect(headers.map((header) => header.classList.contains('today'))).toEqual([
      true,
      false,
      false,
    ]);
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

describe('a fixed content height compresses the band, a max height does not', () => {
  // The event blocks are already percentages (see "uses percentages, never pixels"), but a
  // percentage of what? The body row is `hour_height * bandHours` pixels by default, a fixed
  // scale that cannot shrink, so a `height` smaller than the content scrolled instead of
  // compressing -- the feature `docs/features/grid-view.md` and the `.grid-container`
  // stylesheet comment both promise. Compression needs the body row to become fractional
  // AND the container stretched to a definite `100%` so the `1fr` has room to resolve.
  function bodyHeightVar(container: ParentNode): string {
    return requireElement<HTMLElement>(container, '.grid-container').style.getPropertyValue(
      '--calendar-card-grid-body-height',
    );
  }
  function containerHeight(container: ParentNode): string {
    return requireElement<HTMLElement>(container, '.grid-container').style.height;
  }
  const oneEvent = [timed(17, '09:00', '10:00', 'Standup')];

  it('keeps a pixel scale and no container height at the default auto height', () => {
    const container = renderGrid(oneEvent, buildConfig({ view: 'grid', days_to_show: 3 }));

    expect(bodyHeightVar(container)).toMatch(/^calc\(/);
    expect(containerHeight(container)).toBe('');
  });

  it('switches the body row to a fraction and stretches the container under a fixed height', () => {
    const container = renderGrid(
      oneEvent,
      buildConfig({ view: 'grid', days_to_show: 3, height: '400px' }),
    );

    expect(bodyHeightVar(container)).toBe('minmax(50%, 1fr)');
    expect(containerHeight(container)).toBe('100%');
    expect(
      requireElement<HTMLElement>(container, '.grid-container').style.getPropertyValue(
        '--calendar-card-grid-allday-height',
      ),
    ).toBe('minmax(0, auto)');
  });

  it('makes a tall all-day band keyboard-scrollable without dropping its admitted banners', () => {
    const events = Array.from({ length: 6 }, (_, index) =>
      allDay('2026-06-17', '2026-06-19', `Workshop ${index}`),
    );
    const container = renderGrid(
      events,
      buildConfig({
        view: 'grid',
        height: '12rem',
        time_grid: { allday_band_max_rows: 6 },
      }),
    );

    expect(bodyHeightVar(container)).toBe('minmax(50%, 1fr)');
    expect(container.querySelectorAll('.grid-banner')).toHaveLength(6);

    const band = requireElement<HTMLElement>(container, '.grid-allday-band');
    expect(band.tabIndex).toBe(0);
    // A tab stop with no accessible name is announced as nothing useful, so the band is
    // named wherever it is focusable. `group`, not `region`: the latter is a landmark and
    // would list a card-internal strip of banners beside the page's own navigation.
    expect(band.getAttribute('role')).toBe('group');
    expect(band.getAttribute('aria-label')).toBe('All day');
  });

  it('leaves the band unfocusable and unlabelled when it cannot scroll', () => {
    // The control for the case above. The name is tied to the tab stop, not to the band:
    // an unfocusable band is read through its banners and needs no group of its own, so a
    // role and label that appeared unconditionally would be noise on every default card.
    const container = renderGrid(
      [allDay('2026-06-17', '2026-06-19', 'Workshop')],
      buildConfig({ view: 'grid' }),
    );

    const band = requireElement<HTMLElement>(container, '.grid-allday-band');
    expect(band.hasAttribute('tabindex')).toBe(false);
    expect(band.hasAttribute('role')).toBe(false);
    expect(band.hasAttribute('aria-label')).toBe(false);
  });

  it('leaves a max height on the pixel scale so it caps and scrolls rather than compresses', () => {
    const container = renderGrid(
      oneEvent,
      buildConfig({ view: 'grid', days_to_show: 3, max_height: '400px' }),
    );

    expect(bodyHeightVar(container)).toMatch(/^calc\(/);
    expect(containerHeight(container)).toBe('');
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
        time_grid: { start_time: '14:00', end_time: '16:00' },
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
        time_grid: { start_time: '06:00', end_time: '08:00' },
      }),
      hassWithLocale(language, 'language'),
    );

    expect(axisLabels(container)).toEqual(expected);
  });

  it('keeps axis labels inside a compressed body while preserving their clock position', () => {
    const container = renderGrid(
      [timed(17, '21:00', '22:00', 'Late review')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        height: '100px',
        time_grid: { start_time: '07:00', end_time: '22:00' },
      }),
    );
    const labels = Array.from(container.querySelectorAll<HTMLElement>('.grid-axis-label'));

    expect(labels).toHaveLength(15);
    expect(labels[0].style.getPropertyValue('--calendar-card-grid-axis-label-top')).toBe('0%');
    expect(labels.at(-1)?.style.getPropertyValue('--calendar-card-grid-axis-label-top')).toBe(
      '93.33333333333333%',
    );
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

    // The whole point of percentage geometry: a fixed content height compresses the grid
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

  it('dims a past timed block when past events are shown', () => {
    const container = renderGrid(
      [timed(17, '08:00', '09:00', 'Past standup')],
      buildConfig({ view: 'grid', show_past_events: true, days_to_show: 3 }),
    );

    expect(container.querySelector('.grid-event')!.classList.contains('past-event')).toBe(true);
  });

  it("keeps today's finished timed blocks in grid view by default", () => {
    const container = renderGrid(
      [timed(17, '08:00', '09:00', 'Past standup')],
      buildConfig({ view: 'grid', days_to_show: 3 }),
    );

    const block = container.querySelector('.grid-event');
    expect(block?.textContent).toContain('Past standup');
    expect(block?.classList.contains('past-event')).toBe(true);
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
        time_grid: { start_time: '08:00', end_time: '12:00' },
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
        time_grid: { start_time: '15:00', end_time: '17:00' },
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

  it('omits countdowns from multi-day timed continuation segments', () => {
    const container = renderGrid(
      [timedRange(17, '14:00', 19, '11:00', 'Conference Trip')],
      buildConfig({ view: 'grid', days_to_show: 3, show_countdown: true, time_24h: true }),
    );
    const blocks = Array.from(container.querySelectorAll('.grid-event:not(.grid-event-overflow)'));

    expect(blocks[0].querySelector('.time-text > .time-countdown')).not.toBeNull();
    expect(blocks.slice(1).map((block) => block.querySelector('.time-countdown'))).toEqual([
      null,
      null,
    ]);
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
        time_grid: { start_time: '00:00', end_time: '24:00' },
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
      buildConfig({ view: 'grid', days_to_show: 7, time_grid: { show_empty_days: false } }),
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
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { max_simultaneous_events: 2 } }),
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
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { max_simultaneous_events: 1 } }),
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

  it('leaves the axis gutter empty beside the all-day band', () => {
    // The band carried a translated `all day` label here for one build. It was dropped
    // because it cost the gutter its width -- the axis sizes to its widest label, and
    // that label was far wider than any hour -- while telling the reader something a row
    // of banners above the hour grid already says.
    const container = renderGrid([allDay('2026-06-17', '2026-06-18', 'Public holiday')]);

    expect(container.querySelector('.grid-allday-axis')).toBeNull();
    expect(container.querySelectorAll('.grid-banner')).toHaveLength(1);
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
    // The other end terminates inside the window, so it must not be marked. The stylesheet
    // rounds an unmarked end fully and squares a marked one, so a banner carrying both
    // classes says nothing about where it starts or ends.
    expect(banner.classList.contains('continues-before')).toBe(false);
  });

  it('marks a banner that began before the first column, and only that end', () => {
    // The default window opens on the frozen today, so an event starting three days
    // earlier is clipped at the leading edge and terminates inside it.
    const container = renderGrid([allDay('2026-06-14', '2026-06-19', 'Long trip')]);
    const banner = container.querySelector('.grid-banner')!;

    expect(banner.classList.contains('continues-before')).toBe(true);
    expect(banner.classList.contains('continues-after')).toBe(false);
  });

  it('marks neither end of a banner that starts and ends on screen', () => {
    const banner = renderGrid([allDay('2026-06-18', '2026-06-20', 'Workshop')]).querySelector(
      '.grid-banner',
    )!;

    expect(banner.classList.contains('continues-before')).toBe(false);
    expect(banner.classList.contains('continues-after')).toBe(false);
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

  it('keeps distinct all-day events when their visible fields are identical', () => {
    // Calendar payloads carry no stable event id, so equal title, calendar and dates do not
    // establish identity. The grid used that lossy tuple to suppress copies it assumed came
    // from day expansion, but only timed events are expanded: two genuinely distinct all-day
    // entries collapsed into one banner. They overlap and therefore must occupy two rows.
    const container = renderGrid([
      allDay('2026-06-17', '2026-06-18', 'Day off'),
      allDay('2026-06-17', '2026-06-18', 'Day off'),
    ]);
    const banners = Array.from(container.querySelectorAll<HTMLElement>('.grid-banner'));

    expect(banners).toHaveLength(2);
    expect(banners.map((banner) => banner.style.gridRow)).toEqual(['1', '2']);
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

  it('honors the all-day band row cap exactly and silently drops the next banner', () => {
    const days = [
      gridDay(17, [
        allDay('2026-06-17', '2026-06-20', 'Trip'),
        allDay('2026-06-17', '2026-06-18', 'Workshop'),
        allDay('2026-06-17', '2026-06-18', 'Birthday'),
      ]),
      gridDay(18),
      gridDay(19),
    ];
    const container = renderGridDays(
      days,
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { allday_band_max_rows: 2 } }),
    );
    const banners = Array.from(container.querySelectorAll<HTMLElement>('.grid-banner'));

    expect(banners).toHaveLength(2);
    expect(banners.map((banner) => banner.textContent?.trim())).toEqual(['Trip', 'Workshop']);
    expect(container.textContent).not.toContain('Birthday');
    expect(requireElement<HTMLElement>(container, '.grid-allday-band').style.gridTemplateRows).toBe(
      'repeat(2, auto)',
    );
  });

  it('still renders a one-row all-day band when the cap is 1', () => {
    const container = renderGridDays(
      [
        gridDay(17, [
          allDay('2026-06-17', '2026-06-20', 'Trip'),
          allDay('2026-06-18', '2026-06-19', 'Hidden conflict'),
        ]),
        gridDay(18),
        gridDay(19),
      ],
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { allday_band_max_rows: 1 } }),
    );

    expect(container.querySelectorAll('.grid-banner')).toHaveLength(1);
    expect(container.textContent).toContain('Trip');
    expect(container.textContent).not.toContain('Hidden conflict');
    expect(requireElement<HTMLElement>(container, '.grid-allday-band').style.gridTemplateRows).toBe(
      'repeat(1, auto)',
    );
  });

  it('sizes the all-day band from rows actually used rather than the configured cap', () => {
    const container = renderGrid(
      [allDay('2026-06-17', '2026-06-18', 'Only banner')],
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { allday_band_max_rows: 3 } }),
    );

    expect(requireElement<HTMLElement>(container, '.grid-allday-band').style.gridTemplateRows).toBe(
      'repeat(1, auto)',
    );
  });

  it('keeps a later multi-day banner when empty grid days are hidden', () => {
    const container = renderGrid(
      [
        timed(18, '09:00', '10:00', 'Thursday Review'),
        allDay('2026-06-21', '2026-06-23', 'Sunday Trip'),
        timed(22, '09:00', '10:00', 'Monday Review'),
      ],
      buildConfig({ view: 'grid', days_to_show: 7, time_grid: { show_empty_days: false } }),
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

  function separatorSummary(overrides: Partial<Types.Config>) {
    const container = renderGrid(EVENTS, spanConfig({ days_to_show: 30, ...overrides }));
    const rules = separators(container);

    return {
      day: rules.filter((rule) => rule.classList.contains('grid-separator-day')),
      week: rules.filter((rule) => rule.classList.contains('grid-separator-week')),
      month: rules.filter((rule) => rule.classList.contains('grid-separator-month')),
    };
  }

  it.each([
    ['defaults', {}, 29, 0, 0, '0.5px'],
    ['card-level day width 3px', { day_separator_width: '3px' }, 29, 0, 0, '0.5px'],
    ['card-level day width 0px', { day_separator_width: '0px' }, 29, 0, 0, '0.5px'],
    ['week width 4px', { week_separator_width: '4px' }, 25, 4, 0, '4px'],
    ['month width 5px', { month_separator_width: '5px' }, 28, 0, 1, '5px'],
  ] as const)(
    'matches the 30-day separator probe for %s',
    (_label, overrides, expectedDay, expectedWeek, expectedMonth, appliedWidth) => {
      const summary = separatorSummary(overrides);

      expect(summary.day).toHaveLength(expectedDay);
      expect(summary.week).toHaveLength(expectedWeek);
      expect(summary.month).toHaveLength(expectedMonth);

      const applied =
        summary.month[0]?.style.width ??
        summary.week[0]?.style.width ??
        summary.day[0]?.style.width;
      expect(applied).toBe(appliedWidth);
    },
  );

  it('draws day separators by default in grid view', () => {
    const container = renderGrid(EVENTS, spanConfig());
    const rules = separators(container);

    // Grid view overrides `day_separator_width` to a 0.5px hairline, unlike list and
    // column view, because a time grid with no vertical rulings leaves the shared axis
    // visually detached from its day columns.
    expect(rules).toHaveLength(14);
    expect(rules.every((rule) => rule.classList.contains('grid-separator-day'))).toBe(true);
    expect(new Set(rules.map((rule) => rule.style.width))).toEqual(new Set(['0.5px']));
  });

  it('uses the existing day separator options for grid rules', () => {
    const config = spanConfig({ day_separator_width: '0px', day_separator_color: 'rgb(1, 2, 3)' });
    // Both halves of the rule are grid-divergent defaults, so both are set in the block.
    // A top-level value reaches neither, which is what the assertions below also prove.
    config.time_grid = { day_separator_width: '2px', day_separator_color: 'rgb(4, 5, 6)' };

    const container = renderGrid(EVENTS, config);
    const rule = requireElement<HTMLElement>(container, '.grid-separator-day');

    expect(rule.style.width).toBe('2px');
    expect(rule.style.backgroundColor).toBe('rgb(4, 5, 6)');
  });

  it('rules the grid in the divider gray the horizontal rules use', () => {
    // `.grid-rules` paints `var(--divider-color)`, so the verticals carry the same token
    // rather than the card-level `var(--secondary-text-color)`, which is a text hue and
    // drew them several times heavier than the lines they cross.
    const plain = requireElement<HTMLElement>(
      renderGrid(EVENTS, spanConfig()),
      '.grid-separator-day',
    );

    expect(plain.style.backgroundColor).toBe('var(--divider-color)');

    // The divergent-default half: a card-level color is for the list and column layouts
    // and does not reach grid, exactly as the card-level width does not.
    const cardLevel = requireElement<HTMLElement>(
      renderGrid(EVENTS, spanConfig({ day_separator_color: 'rgb(1, 2, 3)' })),
      '.grid-separator-day',
    );

    expect(cardLevel.style.backgroundColor).toBe('var(--divider-color)');
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
    // `day_spacing` is a grid-divergent default, so the gutter is set in the block. A
    // card-level value would leave the rule centered on grid's own 2px and the assertion
    // would be about a gutter the card never asked for.
    const config = spanConfig();
    config.time_grid = { day_spacing: '20px' };
    const container = renderGrid(EVENTS, config);
    const rules = separators(container);

    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].style.gridColumn).toBe('3');
    expect(rules[0].style.gridRow).toBe('4');
    expect(rules[0].style.marginInlineStart).toBe('calc(-0.5 * (20px + 0.5px))');
  });

  it('tints the weekend columns by default, and paints nothing when switched off', () => {
    const container = requireElement<HTMLElement>(
      renderGrid(EVENTS, spanConfig()),
      '.grid-container',
    );

    expect(container.style.getPropertyValue('--calendar-card-grid-weekend')).toBe(
      'color-mix(in srgb, var(--primary-text-color) 4%, transparent)',
    );

    // Two off spellings, both of which a user reaches for, and neither of which should
    // write a property: an unset property lets the stylesheet's own `transparent`
    // fallback stand, where writing `transparent` would override it with a no-op.
    for (const off of ['transparent', 'none', '  ']) {
      const config = spanConfig();
      config.time_grid = { weekend_background_color: off };

      expect(
        requireElement<HTMLElement>(
          renderGrid(EVENTS, config),
          '.grid-container',
        ).style.getPropertyValue('--calendar-card-grid-weekend'),
        `"${off}" must paint nothing`,
      ).toBe('');
    }

    // ...and a value that does paint is written through unchanged.
    const custom = spanConfig();
    custom.time_grid = { weekend_background_color: 'rgb(1, 2, 3)' };

    expect(
      requireElement<HTMLElement>(
        renderGrid(EVENTS, custom),
        '.grid-container',
      ).style.getPropertyValue('--calendar-card-grid-weekend'),
    ).toBe('rgb(1, 2, 3)');
  });

  it('starts from a gutter that lets a block meet its day rule', () => {
    // The whole rule sits inside the gutter at the default: centered at 1px from the
    // boundary with a 0.5px width, so it spans 0.75px to 1.25px and touches neither
    // column. At `0px` it would straddle the boundary instead, and it paints above the
    // day bodies.
    const rule = separators(renderGrid(EVENTS, spanConfig()))[0];

    expect(rule.style.marginInlineStart).toBe('calc(-0.5 * (2px + 0.5px))');
    expect(
      requireElement<HTMLElement>(renderGrid(EVENTS, spanConfig()), '.grid-container').style
        .columnGap,
    ).toBe('2px');

    // Card-level spacing belongs to the list and column layouts and does not reach grid.
    const cardLevel = renderGrid(EVENTS, spanConfig({ day_spacing: '40px' }));

    expect(requireElement<HTMLElement>(cardLevel, '.grid-container').style.columnGap).toBe('2px');
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
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { show_now_line: false } }),
    );

    expect(container.querySelectorAll('.grid-now-line')).toHaveLength(0);
  });

  it('draws no line when the current time is outside the band', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        time_grid: { start_time: '14:00', end_time: '18:00' },
      }),
    );

    expect(container.querySelectorAll('.grid-now-line')).toHaveLength(0);
  });
});

describe('the axis', () => {
  it('uses the default time band as the control row for block-key probes', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3 }),
    );

    expect(geometry(container.querySelector('.grid-event')!).top).toBeCloseTo((120 / 900) * 100, 6);
  });

  it('reads the time band from the time_grid block', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { start_time: '09:00' } }),
    );

    expect(geometry(container.querySelector('.grid-event')!).top).toBeCloseTo(0, 6);
  });

  it('ignores the former grid block key', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        grid: { start_time: '09:00' },
      } as unknown as Partial<Types.Config>),
    );

    expect(geometry(container.querySelector('.grid-event')!).top).toBeCloseTo((120 / 900) * 100, 6);
  });

  it('labels each whole hour in the band and never the closing one', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        time_24h: true,
        time_grid: { start_time: '08:00', end_time: '11:00' },
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
        time_grid: { start_time: '08:00', end_time: '12:00' },
      }),
    );

    const nineOClock = Array.from(container.querySelectorAll<HTMLElement>('.grid-axis-label')).find(
      (element) => element.textContent?.trim() === '9',
    );
    const block = container.querySelector<HTMLElement>('.grid-event')!;

    // A label laid out by one rule and a block by another is exactly how an axis ends up
    // measuring nothing.
    expect(
      Number.parseFloat(nineOClock!.style.getPropertyValue('--calendar-card-grid-axis-label-top')),
    ).toBeCloseTo(Number.parseFloat(block.style.top), 6);
  });

  it('rules once an hour by default, so every rule on the card carries a label', () => {
    const hourly = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3 }),
    );
    const rules = hourly.querySelector<HTMLElement>('.grid-rules')!;
    const slotPct = rules.style.getPropertyValue('--calendar-card-grid-slot-pct');
    const hourPct = rules.style.getPropertyValue('--calendar-card-grid-hour-pct');

    // Two gradients are always painted. At the default they coincide exactly, which is
    // what "one rule per hour" means in the rendered output — the slot gradient adds no
    // rule of its own between two hours.
    expect(slotPct).toBe(hourPct);
    expect(rules.style.getPropertyValue('--calendar-card-grid-slot-offset')).toBe(
      rules.style.getPropertyValue('--calendar-card-grid-hour-offset'),
    );

    // The arm that must differ, so the equality above is a property of the default and
    // not of the arithmetic: half-hourly rules put a second rule between every pair.
    const halfHourly = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { slot_minutes: 30 } }),
    );
    const denser = halfHourly.querySelector<HTMLElement>('.grid-rules')!;

    expect(denser.style.getPropertyValue('--calendar-card-grid-slot-pct')).not.toBe(
      denser.style.getPropertyValue('--calendar-card-grid-hour-pct'),
    );
    expect(Number.parseFloat(denser.style.getPropertyValue('--calendar-card-grid-slot-pct'))).toBe(
      Number.parseFloat(slotPct) / 2,
    );
  });

  it('aligns slot and hour rules to clock boundaries in a half-past band', () => {
    const container = renderGrid(
      [timed(17, '07:00', '08:00', 'Standup')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        time_grid: { start_time: '06:30', end_time: '09:00', slot_minutes: 20 },
      }),
    );
    const rules = container.querySelector<HTMLElement>('.grid-rules')!;

    // 06:40 is 10 minutes into the 150-minute band; 07:00 is 30 minutes in.
    expect(
      Number.parseFloat(rules.style.getPropertyValue('--calendar-card-grid-slot-offset')),
    ).toBeCloseTo((10 / 150) * 100, 6);
    expect(
      Number.parseFloat(rules.style.getPropertyValue('--calendar-card-grid-hour-offset')),
    ).toBeCloseTo((30 / 150) * 100, 6);
  });

  it('drops the labels when they are switched off but keeps the scale', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { show_axis_labels: false } }),
    );

    expect(container.querySelectorAll('.grid-axis-label')).toHaveLength(0);
    expect(container.querySelector('.grid-rules')).not.toBeNull();
  });

  it('keeps the labels off when an all-day event is also on screen', () => {
    // The fixture above has no all-day event, and for one build that was the difference
    // between a passing test and a true one. The axis was rendered whenever a band
    // existed, so that it could hold an `all day` caption in the gutter; the caption was
    // later removed and the widened condition stayed. Hour labels then vanished on a day
    // with nothing all-day and came back the moment one appeared.
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup'), allDay('2026-06-17', '2026-06-18', 'Holiday')],
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { show_axis_labels: false } }),
    );

    expect(container.querySelectorAll('.grid-banner')).toHaveLength(1);
    expect(container.querySelectorAll('.grid-axis-label')).toHaveLength(0);
  });

  it('sizes the gutter from the hour labels alone, band or no band', () => {
    // The hidden sizer is the only thing contributing width to a `max-content` gutter, and
    // it used to carry the translated all-day caption too. So the column that numbers the
    // hours was as wide as `ganztagig` whenever any all-day event existed -- in German,
    // measurably wider than in English on identical hours.
    const sizerText = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('.grid-axis-sizer span')).map((span) =>
        span.textContent?.trim(),
      );

    const withBand = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup'), allDay('2026-06-17', '2026-06-18', 'Feiertag')],
      buildConfig({ view: 'grid', days_to_show: 3, language: 'de' }),
    );
    const withoutBand = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3, language: 'de' }),
    );

    expect(withBand.querySelectorAll('.grid-banner')).toHaveLength(1);
    expect(sizerText(withBand)).not.toContain('ganztägig');
    expect(sizerText(withBand)).toEqual(sizerText(withoutBand));
  });

  it('falls back to the default band when a bound is unparseable', () => {
    const container = renderGrid(
      [timed(17, '09:00', '10:00', 'Standup')],
      buildConfig({ view: 'grid', days_to_show: 3, time_grid: { start_time: 'nonsense' } }),
    );

    // 07:00-22:00, so 09:00 is 120 minutes into a 900-minute band. A half-honoured band
    // would put it somewhere else entirely.
    expect(geometry(container.querySelector('.grid-event')!).top).toBeCloseTo((120 / 900) * 100, 6);
  });
});

describe('the grid reuses the shared leaves', () => {
  /** A `hass` whose formatter localizes conditions the way Home Assistant's does. */
  function weatherHass(): Types.Hass {
    return {
      states: {
        'weather.home': { entity_id: 'weather.home', state: 'sunny', attributes: {} },
      },
      callApi: async () => undefined,
      callService: vi.fn(),
      formatEntityState: (_stateObj: Types.HassEntity, state?: string) =>
        state === 'sunny' ? 'Sunny' : (state ?? ''),
    } as unknown as Types.Hass;
  }

  // The architectural claim the whole view split exists to support. Without this the
  // grid could quietly grow its own copy of the title/time/location markup, and the only
  // symptom would be the views drifting apart one option at a time.
  it('renders event bodies through the shared content leaf', () => {
    const container = renderGrid([timed(17, '09:00', '10:00', 'Standup')]);

    expect(
      container.querySelector('.grid-event .grid-event-disclosure .event-content'),
    ).not.toBeNull();
  });

  it('threads event weather forecasts into timed grid detail rows', () => {
    const container = renderGrid(
      [timed(17, '14:00', '15:00', 'Forecasted review')],
      buildConfig({
        view: 'grid',
        days_to_show: 3,
        weather: {
          entity: 'weather.home',
          position: 'event',
          event: { show_conditions: true, show_temp: true, max_lines: 2 },
        },
      }),
      weatherHass(),
      WEATHER,
    );
    const weather = requireElement(container, '.grid-event .time-location > .event-weather');
    const icon = requireElement<HTMLElement>(weather, 'ha-icon') as HTMLElement & { icon?: string };

    expect(icon.icon).toBe('mdi:weather-sunny');
    expect(weather.textContent).toContain('24°');
    expect(weather.querySelector('.weather-condition')?.textContent?.trim()).toBe('Sunny');
    expect(container.querySelector('.grid-event .summary-row .event-weather')).toBeNull();
  });

  it('gives progress its own row in the timed grid block, as column view does', () => {
    // The last of the three leaf placements to be harmonized with column view, and the one
    // that survived longest because nothing rendered it: an inline bar is a 60px chip
    // right-aligned on the time row, which in a narrow grid column reads as a stray artifact
    // rather than as progress. Column has always placed it on its own row under the title,
    // where it is as wide as the block, and grid now matches.
    const container = renderGrid(
      [timed(17, '09:30', '11:00', 'Running review')],
      buildConfig({ view: 'grid', days_to_show: 3, show_progress_bar: true }),
    );

    expect(container.querySelector('.grid-event .progress-bar-row')).not.toBeNull();
    expect(container.querySelector('.grid-event .time > .progress-bar')).toBeNull();
  });

  it('folds countdowns into the timed grid time text', () => {
    const container = renderGrid(
      [timed(17, '14:00', '15:00', 'Upcoming review')],
      buildConfig({ view: 'grid', days_to_show: 3, show_countdown: true }),
    );

    expect(container.querySelector('.grid-event .time > .time-countdown')).toBeNull();
    expect(container.querySelector('.grid-event .time-text > .time-countdown')).not.toBeNull();
  });

  it('sizes lanes from what the band shows, not from the whole day', () => {
    // Lanes are shared among overlapping events and decide each block's width, so the set
    // they are computed over is a layout decision. Computing it over the whole day let an
    // event nowhere on screen take a lane it would never draw into: a card showing only
    // the evening gave its one visible event half a column, with the other half empty,
    // because a lunchtime meeting outside the band still counted as overlapping it.
    //
    // The out-of-band event has to genuinely overlap the visible one for this to bite,
    // which is why the workshop starts before the band and the lunch sits inside it.
    const config = buildConfig({ view: 'grid', days_to_show: 1 });
    config.time_grid = { start_time: '18:00', end_time: '24:00' };

    const container = renderGrid(
      [timed(17, '08:00', '23:00', 'Long workshop'), timed(17, '12:00', '13:00', 'Lunch')],
      config,
    );
    const blocks = Array.from(container.querySelectorAll<HTMLElement>('.grid-event'));

    expect(blocks).toHaveLength(1);
    expect(blocks[0].textContent).toContain('Long workshop');
    expect(
      blocks[0].getAttribute('style'),
      'the only visible event should own its column',
    ).toContain('calc(100%');
  });

  it('still lanes two events that both reach into the band', () => {
    // The control for the test above: the filter must narrow to the band, not to one event.
    const config = buildConfig({ view: 'grid', days_to_show: 1 });
    config.time_grid = { start_time: '18:00', end_time: '24:00' };

    const container = renderGrid(
      [timed(17, '08:00', '23:00', 'Long workshop'), timed(17, '19:00', '20:00', 'Evening talk')],
      config,
    );
    const blocks = Array.from(container.querySelectorAll<HTMLElement>('.grid-event'));

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.getAttribute('style')).toContain('calc(50%');
    }
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
        time_grid: {
          day_header_separator_width: '2px',
          day_header_separator_color: 'rgb(1, 2, 3)',
        },
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

describe('malformed events do not crash grid rendering', () => {
  it('safely handles events with missing, inverted, or unparseable timestamps and summaries', () => {
    const malformedEvents: Types.CalendarEventData[] = [
      {
        start: {},
        end: {},
        summary: 'Missing dates',
        _entityId: 'calendar.personal',
      } as unknown as Types.CalendarEventData,
      {
        start: { dateTime: 'invalid-date' },
        end: { dateTime: 'invalid-date' },
        summary: 'Invalid dateTime',
        _entityId: 'calendar.personal',
      },
      {
        start: { date: 'not-a-date' },
        end: { date: 'not-a-date' },
        summary: 'Invalid all-day date',
        _entityId: 'calendar.personal',
      },
      {
        start: { dateTime: new Date(2026, 5, 17, 12, 0).toISOString() },
        end: { dateTime: new Date(2026, 5, 17, 10, 0).toISOString() },
        summary: 'Inverted times',
        _entityId: 'calendar.personal',
      },
      {
        start: { dateTime: new Date(2026, 5, 17, 10, 0).toISOString() },
        end: { dateTime: new Date(2026, 5, 17, 11, 0).toISOString() },
        summary: undefined as unknown as string,
        _entityId: 'calendar.personal',
      },
      {
        start: { date: '2026-06-17' },
        end: { date: '2026-06-16' },
        summary: 'Inverted all-day dates',
        _entityId: 'calendar.personal',
      },
    ];

    let container: HTMLElement | undefined;
    expect(() => {
      container = renderGrid(malformedEvents);
    }).not.toThrow();

    // Exactly one of the six fixtures is well-formed — the 10:00-11:00 event whose only
    // problem is a missing summary — so that is the count this must land on. An earlier
    // version asserted `toBeGreaterThanOrEqual(0)`, which a length satisfies by definition:
    // it reads as coverage, cannot fail, and would have stayed green if the malformed
    // entries had been rendered as blocks or if the valid one had been discarded with them.
    const events = container!.querySelectorAll('.grid-event');
    expect(events.length, 'only the well-formed event may reach the grid').toBe(1);
    expect(events[0].textContent).not.toContain('Inverted');
  });
});
