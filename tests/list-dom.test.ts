import { readFileSync } from 'node:fs';

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, SINGLE_EVENT, WEATHER, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * Phase 0 Stage 2 — the list-view DOM equality gate.
 *
 * Phase 1 extracts the list's leaf renderers into shared functions so the column view
 * can reuse them. The list's own DOM is supposed to come out **byte-identical**; that
 * is the entire safety argument for calling Phase 1 low-risk. This file is what makes
 * that claim checkable instead of asserted.
 *
 * ## What is rendered, and into what
 *
 * The pipeline under test is `groupEventsByDay` → `renderGroupedEvents` → Lit, which is
 * exactly what `calendar-card-pro.ts` `render()` does for the populated case. The card
 * element itself is deliberately **not** constructed. Doing so would require a fake
 * `hass`, a mocked `callApi` (`events.ts:1167`), and awaiting an async fetch — none of
 * which this gate is about, and all of which could fail for reasons unrelated to the
 * DOM. Rendering the pure functions directly isolates the surface Phase 1 changes.
 *
 * The two functions kept together on purpose: grouping decides day boundaries,
 * ordering and which events survive, and rendering turns that into the table. A change
 * to either shows up here, which is what "the list DOM must not change" means.
 *
 * ## Clock
 *
 * `render.ts` reads the current date to decide today, weekend and past-event state
 * (`events.ts` calls `new Date()` in eight places), so the same fixture serialized on
 * two different days produces two different DOMs. Fake timers freeze `Date.now()` and
 * the `new Date()` constructor globally, which covers dayjs too since dayjs has no
 * independent clock. This needs **zero production changes** — no `now` parameter
 * threaded through the very functions Phase 1 is extracting.
 *
 * ## Baselines and the update path
 *
 * Snapshots are committed under `tests/__snapshots__/`. A change to list DOM therefore
 * appears in the PR diff as a snapshot change a reviewer has to look at, which is the
 * point — an intended change is approved by reviewing that diff and re-running with
 * `npx vitest run -u`. A gate with no sanctioned update path gets deleted the first
 * time the DOM legitimately changes; this one has one, and it is loud.
 */

/**
 * Lit leaves three kinds of comment marker in the DOM. Verified by inspecting real
 * output rather than assumed, because stripping a marker that never appears is dead
 * code that reads like a guarantee:
 *
 * - `<!--?lit$095926250$-->` — carries a **per-render random id**. Left in, every
 *   snapshot would differ from every other run. This strip is what makes the gate
 *   possible at all.
 * - `<!---->` — an empty marker; no information, removed for readability.
 * - `<!--?-->` — deterministic, and marks where a conditional branch sits.
 *   Deliberately **kept**: it is stable across runs, and its presence or absence is
 *   real signal about which branch rendered.
 *
 * Whitespace between tags is collapsed onto separate lines so a diff points at the
 * element that changed rather than at one enormous line.
 */
function serialize(container: HTMLElement): string {
  return container.innerHTML
    .replace(/<!--\?lit\$[0-9]+\$-->/g, '')
    .replace(/<!---->/g, '')
    .replace(/>\s+</g, '>\n<')
    .trim();
}

/** Runs the real pipeline and returns normalized markup. */
interface RenderOpts {
  isExpanded?: boolean;
  language?: string;
  weather?: Types.WeatherForecasts;
  hass?: Types.Hass | null;
}

function renderListContainer(
  events: Types.CalendarEventData[],
  config: Types.Config,
  { isExpanded = false, language = 'en', weather, hass }: RenderOpts = {},
): HTMLElement {
  const days = EventUtils.groupEventsByDay(events, config, isExpanded, language);
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, language, weather, hass), container);
  return container;
}

function renderList(
  events: Types.CalendarEventData[],
  config: Types.Config,
  opts: RenderOpts = {},
): string {
  const container = renderListContainer(events, config, opts);
  return serialize(container);
}

function timedEvent(
  date: string,
  startHour: string,
  endHour: string,
  summary: string,
  extra: Partial<Types.CalendarEventData> = {},
): Types.CalendarEventData {
  return {
    start: { dateTime: `${date}T${startHour}:00.000Z` },
    end: { dateTime: `${date}T${endHour}:00.000Z` },
    summary,
    _entityId: 'calendar.personal',
    ...extra,
  };
}

function requireElement<T extends Element = Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  expect(element).not.toBeNull();
  return element as T;
}

function eventCellByTitle(container: ParentNode, title: string): HTMLTableCellElement {
  const titleElement = Array.from(container.querySelectorAll('.event-title')).find(
    (element) => element.textContent?.trim() === title,
  );
  expect(titleElement).toBeDefined();
  const cell = titleElement?.closest('td.event');
  expect(cell).not.toBeNull();
  return cell as HTMLTableCellElement;
}

function expectStyleColor(element: Element, expectedColor: string): void {
  const style = element.getAttribute('style')?.replace(/\s/g, '') ?? '';
  expect(style).toContain(`color:${expectedColor}`);
}

describe('list view DOM', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('freezes the clock, so these snapshots are reproducible on any day', () => {
    // Guards the mechanism the rest of the file depends on. Without this, a broken
    // freeze surfaces as every snapshot failing at once with no stated cause.
    expect(new Date().toISOString()).toBe('2026-06-17T10:00:00.000Z');
  });

  it('renders the default configuration', () => {
    expect(renderList(EVENTS, buildConfig())).toMatchSnapshot();
  });

  it('renders a single event', () => {
    expect(renderList(SINGLE_EVENT, buildConfig())).toMatchSnapshot();
  });

  it('renders an empty calendar', () => {
    expect(renderList([], buildConfig())).toMatchSnapshot();
  });

  it('renders empty days when show_empty_days is on', () => {
    // A distinct render branch: placeholder events carry `_isEmptyDay` and are
    // rendered differently from real ones.
    expect(renderList(SINGLE_EVENT, buildConfig({ show_empty_days: true }))).toMatchSnapshot();
  });

  it('renders past events when show_past_events is on', () => {
    // Off by default, so without this the past-event branch is never serialized and
    // the `Past standup` fixture would be silently filtered before reaching the DOM.
    expect(renderList(EVENTS, buildConfig({ show_past_events: true }))).toMatchSnapshot();
  });

  it('renders week numbers and separators when enabled', () => {
    expect(
      renderList(
        EVENTS,
        buildConfig({
          days_to_show: 10,
          show_week_numbers: 'iso',
          week_separator_width: '1px',
          day_separator_width: '1px',
        }),
      ),
    ).toMatchSnapshot();
  });

  it('renders split multi-day events', () => {
    // `split_multiday_events` changes how the Conference fixture is decomposed across
    // days, which is one of the paths Phase 1's shared renderers must preserve.
    expect(renderList(EVENTS, buildConfig({ split_multiday_events: true }))).toMatchSnapshot();
  });

  it('renders compact mode', () => {
    expect(
      renderList(EVENTS, buildConfig({ compact_days_to_show: 2, compact_events_to_show: 3 })),
    ).toMatchSnapshot();
  });

  it('renders location and end time when enabled', () => {
    expect(
      renderList(EVENTS, buildConfig({ show_location: true, show_end_time: true })),
    ).toMatchSnapshot();
  });

  it('renders in a non-English language', () => {
    // Weekday and month names come from the translation layer, so this pins the join
    // between rendering and i18n that `check-i18n.mjs` cannot see.
    expect(
      renderList(EVENTS, buildConfig({ language: 'de' }), { language: 'de' }),
    ).toMatchSnapshot();
  });

  // Weather is pinned in its own block because Phase 1 extracts it FIRST, and because it
  // is the one part of the render that stays inert unless forecasts are supplied — the
  // rest of this file would pass unchanged against a completely broken weather renderer.

  it('renders weather on the date column', () => {
    // `position: 'date'` drives `findDailyForecast` inside `renderDateColumn`
    // (`render.ts:526-575`) — the exact block Phase 1 lifts out first.
    expect(
      renderList(EVENTS, buildConfig({ weather: { entity: 'weather.home', position: 'date' } }), {
        weather: WEATHER,
      }),
    ).toMatchSnapshot();
  });

  it('renders weather on events', () => {
    // A separate render site (`renderEventWeather`, `render.ts:1050+`) reading the
    // hourly forecast. Pinned separately so an extraction that fixes one and breaks the
    // other cannot pass.
    expect(
      renderList(EVENTS, buildConfig({ weather: { entity: 'weather.home', position: 'event' } }), {
        weather: WEATHER,
      }),
    ).toMatchSnapshot();
  });

  it('renders weather in both positions with the opt-in fields on', () => {
    // `show_low_temp` is opt-in and off by default, so without this snapshot the low
    // temp branch would be extracted with no baseline at all. `position: 'both'` also
    // pins that the two render sites coexist.
    expect(
      renderList(
        EVENTS,
        buildConfig({
          weather: {
            entity: 'weather.home',
            position: 'both',
            date: { show_low_temp: true, show_high_temp: true, show_conditions: true },
            event: { show_conditions: true, show_high_temp: true },
          },
        }),
        { weather: WEATHER },
      ),
    ).toMatchSnapshot();
  });

  it('suppresses the low temp when a UV index is shown', () => {
    // `showLowTemp` is `show_low_temp === true && !showUvIndex && templow !== undefined`
    // (`render.ts:545-546`) — an interaction between two independent flags, which is
    // exactly the kind of condition an extraction silently drops. Both flags are on
    // here, so the snapshot must contain `weather-uv-index` and must NOT contain
    // `weather-temp-low`; the assertions below state that outright rather than trusting
    // a reader to notice an absence in 1300 lines of snapshot.
    const out = renderList(
      EVENTS,
      buildConfig({
        weather: {
          entity: 'weather.home',
          position: 'both',
          date: { show_low_temp: true, show_uv_index: true },
          event: { show_uv_index: true },
        },
      }),
      { weather: WEATHER },
    );

    expect(out).toContain('weather-uv-index');
    expect(out).not.toContain('weather-temp-low');
    expect(out).toMatchSnapshot();
  });

  // The remaining branches below are all **off by default**, which is exactly why they need
  // naming: a snapshot suite built from default config renders none of them, and would go on
  // passing while the code behind them was extracted incorrectly or lost entirely. The weather
  // gap was the first instance of this; these are the rest of it.

  it('renders the today indicator', () => {
    // `today_indicator` defaults to `false`, so `renderTodayIndicator` returns `nothing` in
    // every other test — and `parseIndicatorPosition` (`render.ts:358-382`) is only reachable
    // through it. That function is one of Phase 1's four **named** extraction targets, so
    // without this case the gate would have been silent on a quarter of the work it exists to
    // protect. Asserted directly as well as snapshotted, so "renders nothing" cannot pass.
    const out = renderList(EVENTS, buildConfig({ today_indicator: 'dot' }));

    expect(out).toContain('today-indicator-container');
    expect(out).toMatchSnapshot();
  });

  it('renders a custom today indicator position', () => {
    // `parseIndicatorPosition` turns a CSS-like `"x y"` string into inline styles (documented
    // in README.md:841-843; default `'15% 50%'`). Pinning a non-default position is what
    // distinguishes "the function ran" from "the function ran and its output reached the DOM".
    const out = renderList(
      EVENTS,
      buildConfig({ today_indicator: 'mdi:star', today_indicator_position: '85% 15%' }),
    );

    expect(out).toContain('today-indicator-container');
    expect(out).toContain('left:85%');
    expect(out).toContain('top:15%');
    expect(out).toMatchSnapshot();
  });

  it('renders countdown and progress bar', () => {
    // Both default to `false`. The progress bar additionally requires a *running* event, which
    // is why the fixture set contains one straddling `FROZEN_NOW` — without it this config
    // would render no bar and the snapshot would look like coverage while providing none.
    // Both branches live in the `.event-content` subtree, Phase 1's third extraction target.
    //
    // Note for whoever extracts this: `show_progress_bar` is checked **twice** — once at
    // `render.ts:902` when computing `progressPercentage`, and again at `:954`/`:973` when
    // rendering. Either guard alone is dead code, because the first already forces
    // `progressPercentage` to `null`. Mutation-testing confirmed this: removing either one
    // in isolation changes no output at all, while removing both fails 13 of these 18 tests.
    // The redundancy is harmless, but it means a Phase 1 extraction that keeps only one of
    // the two guards is still correct — don't treat dropping one as a regression.
    const out = renderList(EVENTS, buildConfig({ show_countdown: true, show_progress_bar: true }));

    expect(out).toContain('progress-bar');
    expect(out).toMatchSnapshot();
  });

  it('pins date color precedence for base, weekend, today, and empty overrides', () => {
    const saturdayEvent = [timedEvent('2026-06-20', '12:00', '13:00', 'Weekend lunch')];
    const weekdayEvent = [timedEvent('2026-06-18', '12:00', '13:00', 'Weekday lunch')];
    const todayEvent = [timedEvent('2026-06-17', '14:00', '15:00', 'Today meeting')];

    let container = renderListContainer(
      saturdayEvent,
      buildConfig({
        days_to_show: 5,
        weekday_color: 'var(--weekday-base)',
        day_color: 'var(--day-base)',
        month_color: 'var(--month-base)',
        weekend_weekday_color: 'var(--weekday-weekend)',
        weekend_day_color: 'var(--day-weekend)',
        weekend_month_color: 'var(--month-weekend)',
      }),
    );
    let dateColumn = requireElement(container, '.date-column');
    expect(dateColumn.classList.contains('weekend')).toBe(true);
    expectStyleColor(requireElement(dateColumn, '.weekday'), 'var(--weekday-weekend)');
    expectStyleColor(requireElement(dateColumn, '.day'), 'var(--day-weekend)');
    expectStyleColor(requireElement(dateColumn, '.month'), 'var(--month-weekend)');

    container = renderListContainer(
      weekdayEvent,
      buildConfig({
        days_to_show: 5,
        weekday_color: 'var(--weekday-base)',
        day_color: 'var(--day-base)',
        month_color: 'var(--month-base)',
        weekend_weekday_color: 'var(--weekday-weekend)',
        weekend_day_color: 'var(--day-weekend)',
        weekend_month_color: 'var(--month-weekend)',
      }),
    );
    dateColumn = requireElement(container, '.date-column');
    expect(dateColumn.classList.contains('weekend')).toBe(false);
    expectStyleColor(requireElement(dateColumn, '.weekday'), 'var(--weekday-base)');
    expectStyleColor(requireElement(dateColumn, '.day'), 'var(--day-base)');
    expectStyleColor(requireElement(dateColumn, '.month'), 'var(--month-base)');

    container = renderListContainer(
      todayEvent,
      buildConfig({
        days_to_show: 5,
        weekday_color: 'var(--weekday-base)',
        day_color: 'var(--day-base)',
        month_color: 'var(--month-base)',
        today_weekday_color: 'var(--weekday-today)',
        today_day_color: 'var(--day-today)',
        today_month_color: 'var(--month-today)',
      }),
    );
    dateColumn = requireElement(container, '.date-column');
    expectStyleColor(requireElement(dateColumn, '.weekday'), 'var(--weekday-today)');
    expectStyleColor(requireElement(dateColumn, '.day'), 'var(--day-today)');
    expectStyleColor(requireElement(dateColumn, '.month'), 'var(--month-today)');

    container = renderListContainer(
      saturdayEvent,
      buildConfig({
        days_to_show: 5,
        weekday_color: 'var(--weekday-base)',
        day_color: 'var(--day-base)',
        month_color: 'var(--month-base)',
        weekend_weekday_color: '',
        weekend_day_color: '',
        weekend_month_color: '',
      }),
    );
    dateColumn = requireElement(container, '.date-column');
    expectStyleColor(requireElement(dateColumn, '.weekday'), 'var(--weekday-base)');
    expectStyleColor(requireElement(dateColumn, '.day'), 'var(--day-base)');
    expectStyleColor(requireElement(dateColumn, '.month'), 'var(--month-base)');

    vi.setSystemTime(new Date('2026-06-20T10:00:00.000Z'));
    container = renderListContainer(
      saturdayEvent,
      buildConfig({
        weekday_color: 'var(--weekday-base)',
        day_color: 'var(--day-base)',
        month_color: 'var(--month-base)',
        weekend_weekday_color: 'var(--weekday-weekend)',
        weekend_day_color: 'var(--day-weekend)',
        weekend_month_color: 'var(--month-weekend)',
        today_weekday_color: 'var(--weekday-today)',
        today_day_color: 'var(--day-today)',
        today_month_color: 'var(--month-today)',
      }),
    );
    dateColumn = requireElement(container, '.date-column');
    expectStyleColor(requireElement(dateColumn, '.weekday'), 'var(--weekday-today)');
    expectStyleColor(requireElement(dateColumn, '.day'), 'var(--day-today)');
    expectStyleColor(requireElement(dateColumn, '.month'), 'var(--month-today)');
  });

  it('renders countdown without time with an empty time-actual shell', () => {
    const container = renderListContainer(
      [timedEvent('2026-06-17', '14:00', '15:00', 'No time countdown')],
      buildConfig({ show_time: false, show_countdown: true }),
    );
    const cell = eventCellByTitle(container, 'No time countdown');
    const timeActual = requireElement(cell, '.time-actual');
    const countdown = requireElement(cell, '.time-countdown');

    expect(timeActual.children).toHaveLength(0);
    expect(timeActual.textContent?.trim()).toBe('');
    expect(countdown.textContent?.trim()).toBe('in 4 hours');
  });

  it('renders progress without time with an empty time-actual shell', () => {
    const container = renderListContainer(
      [timedEvent('2026-06-17', '09:30', '11:00', 'Running hidden time')],
      buildConfig({ show_time: false, show_progress_bar: true }),
    );
    const cell = eventCellByTitle(container, 'Running hidden time');
    const timeActual = requireElement(cell, '.time-actual');

    expect(timeActual.children).toHaveLength(0);
    expect(timeActual.textContent?.trim()).toBe('');
    expect(requireElement(cell, '.progress-bar')).toBeTruthy();
    expect(cell.querySelector('.time-countdown')).toBeNull();
  });

  it('defaults one-token today indicator position to vertical center', () => {
    const container = renderListContainer(
      SINGLE_EVENT,
      buildConfig({ today_indicator: 'dot', today_indicator_position: '85%' }),
    );
    const indicator = requireElement(container, '.today-indicator');
    const style = indicator.getAttribute('style')?.replace(/\s/g, '') ?? '';

    expect(style).toContain('left:85%');
    expect(style).toContain('top:50%');
  });

  it('omits the month element when show_month is false', () => {
    const container = renderListContainer(SINGLE_EVENT, buildConfig({ show_month: false }));

    expect(container.querySelector('.date-column .month')).toBeNull();
  });

  it('renders descriptions only when show_description is enabled', () => {
    const event = timedEvent('2026-06-17', '14:00', '15:00', 'Described appointment', {
      description: 'Bring <b>ID</b>',
    });

    let container = renderListContainer([event], buildConfig());
    expect(
      eventCellByTitle(container, 'Described appointment').querySelector('.description'),
    ).toBeNull();

    container = renderListContainer([event], buildConfig({ show_description: true }));
    const description = requireElement(
      eventCellByTitle(container, 'Described appointment'),
      '.description',
    );

    expect(requireElement(description, 'ha-icon').getAttribute('icon')).toBe(
      'mdi:information-outline',
    );
    expect(requireElement(description, 'span').textContent?.trim()).toBe('Bring ID');
  });

  it('omits locations when show_location is false', () => {
    const container = renderListContainer(
      [
        timedEvent('2026-06-17', '14:00', '15:00', 'Hidden location appointment', {
          location: '12 High Street',
        }),
      ],
      buildConfig({ show_location: false }),
    );

    expect(
      eventCellByTitle(container, 'Hidden location appointment').querySelector('.location'),
    ).toBeNull();
  });

  it('honors false flags in date-column weather', () => {
    const container = renderListContainer(
      SINGLE_EVENT,
      buildConfig({
        weather: {
          entity: 'weather.home',
          position: 'date',
          date: { show_conditions: false, show_high_temp: false },
        },
      }),
      { weather: WEATHER },
    );
    const weather = requireElement(container, '.date-column .weather');

    expect(weather.querySelector('ha-icon')).toBeNull();
    expect(weather.querySelector('.weather-temp-high')).toBeNull();
    expect(weather.textContent?.trim()).toBe('');
  });

  it('honors false flags in event weather', () => {
    const container = renderListContainer(
      [timedEvent('2026-06-17', '14:00', '15:00', 'Weather without icon or temp')],
      buildConfig({
        weather: {
          entity: 'weather.home',
          position: 'event',
          event: { show_conditions: false, show_temp: false },
        },
      }),
      { weather: WEATHER },
    );
    const weather = requireElement(
      eventCellByTitle(container, 'Weather without icon or temp'),
      '.event-weather',
    );

    expect(weather.querySelector('ha-icon')).toBeNull();
    expect(weather.textContent?.trim()).toBe('');
  });

  it('suppresses timed event weather when daily fallback is disabled', () => {
    const container = renderListContainer(
      [timedEvent('2026-06-18', '15:00', '16:00', 'No fallback weather')],
      buildConfig({
        weather: {
          entity: 'weather.home',
          position: 'event',
          event: { daily_forecast_fallback: false },
        },
      }),
      { weather: WEATHER },
    );

    expect(
      eventCellByTitle(container, 'No fallback weather').querySelector('.event-weather'),
    ).toBeNull();
  });

  it('suppresses event weather for past events that are still rendered', () => {
    const container = renderListContainer(
      [timedEvent('2026-06-17', '08:00', '09:00', 'Past weather suppressed')],
      buildConfig({
        show_past_events: true,
        weather: { entity: 'weather.home', position: 'event' },
      }),
      { weather: WEATHER },
    );

    const cell = eventCellByTitle(container, 'Past weather suppressed');

    expect(cell.querySelector('.event-weather')).toBeNull();
    expect(requireElement(cell, '.summary-row').children).toHaveLength(1);
  });

  it('suppresses event weather when no forecast matches', () => {
    const container = renderListContainer(
      [timedEvent('2026-06-21', '12:00', '13:00', 'No forecast weather')],
      buildConfig({ weather: { entity: 'weather.home', position: 'event' } }),
      { weather: WEATHER },
    );

    const cell = eventCellByTitle(container, 'No forecast weather');

    expect(cell.querySelector('.event-weather')).toBeNull();
    expect(requireElement(cell, '.summary-row').children).toHaveLength(1);
  });

  it('preserves no-output idioms at extraction seams', () => {
    const renderSource = readFileSync(`${process.cwd()}/src/rendering/render.ts`, 'utf8');
    const eventWeatherSource = renderSource.slice(
      renderSource.indexOf('function renderEventWeather'),
    );

    expect(renderSource).toMatch(
      /\$\{eventLocation\s*\? html`[\s\S]*?`\s*: ''\}\s*\$\{eventDescription/,
    );
    expect(renderSource).toMatch(/\$\{eventDescription\s*\? html`[\s\S]*?`\s*: ''\}\s*<\/div>/);
    expect(renderSource).toMatch(
      /progressPercentage !== null && config\.show_progress_bar[\s\S]*?: nothing\}\s*\$\{eventLocation/,
    );
    expect(eventWeatherSource.match(/return html``;/g)).toHaveLength(3);
  });
});
