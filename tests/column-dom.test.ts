import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, SINGLE_EVENT, WEATHER, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { COLUMN_DEFAULTS } from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * Phase 4b — the column view's DOM.
 *
 * The list view has a snapshot gate whose job is to prove nothing changed. This file
 * has the opposite job: the column view is new, so there is no prior output to be
 * equal to, and a snapshot of it would only assert that today's markup equals today's
 * markup. Every test here therefore asserts a **property** the column view has to hold
 * — most importantly that it reuses the list view's leaves rather than reimplementing
 * them, which is the entire architectural claim Phases 1 and 2 were built to enable.
 *
 * ## Why the shared-content test is the important one
 *
 * `renderEventContent` deliberately excludes its wrapper element so both views can
 * call it. Nothing enforces that they actually do — the column view could quietly grow
 * its own copy of the title/time/location markup, and the only symptom would be the
 * two views drifting apart over subsequent releases, one option at a time. Comparing
 * the serialized `.event-content` of both views turns that from a convention into a
 * check.
 *
 * ## Clock
 *
 * Same freeze as the list gate, and for the same reason: today/tomorrow/weekend
 * classification reads the wall clock, so an unfrozen run classifies a fixture
 * differently depending on the day it happens to be run.
 */

function serialize(container: HTMLElement): string {
  return container.innerHTML
    .replace(/<!--\?lit\$[0-9]+\$-->/g, '')
    .replace(/<!---->/g, '')
    .replace(/>\s+</g, '>\n<')
    .trim();
}

interface RenderOpts {
  language?: string;
  weather?: Types.WeatherForecasts;
  hass?: Types.Hass | null;
}

function renderColumnContainer(
  events: Types.CalendarEventData[],
  config: Types.Config,
  { language = 'en', weather, hass }: RenderOpts = {},
): HTMLElement {
  // 'column' is deliberate: `groupEventsByDay` resolves per-view overrides, so
  // grouping the list way here would render column DOM from list-grouped days and
  // quietly hide any `column:` override that changes which days exist at all.
  const days = EventUtils.groupEventsByDay(events, config, false, language, 'column');
  const container = document.createElement('div');
  litRender(Column.renderColumnGroupedEvents(days, config, language, weather, hass), container);
  return container;
}

function renderListContainer(
  events: Types.CalendarEventData[],
  config: Types.Config,
  { language = 'en', weather, hass }: RenderOpts = {},
): HTMLElement {
  const days = EventUtils.groupEventsByDay(events, config, false, language, 'list');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, language, weather, hass), container);
  return container;
}

function requireElement<T extends Element = Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  expect(element, `expected to find ${selector}`).not.toBeNull();
  return element as T;
}

/** Serialized `.event-content` blocks in document order. */
function eventContents(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll('.event-content')).map((element) =>
    element.innerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '').replace(/<!---->/g, ''),
  );
}

describe('column view DOM', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('grid container', () => {
    it('emits one track per day', () => {
      const container = renderColumnContainer(EVENTS, buildConfig());
      const grid = requireElement<HTMLElement>(container, '.column-grid');
      const columns = container.querySelectorAll('.day-column');

      expect(columns.length).toBeGreaterThan(0);
      expect(grid.getAttribute('style')).toContain(
        `repeat(${columns.length}, minmax(0, 1fr))`.replace(/\s/g, ' '),
      );
    });

    it('floors every track at zero width, so one long title cannot widen the card', () => {
      // `repeat(N, 1fr)` expands to `minmax(auto, 1fr)`, whose `auto` floor refuses to
      // shrink below the widest content. This is the single most likely regression in
      // the grid definition and is invisible until a user has a long event title.
      const container = renderColumnContainer(EVENTS, buildConfig());
      const style = requireElement(container, '.column-grid').getAttribute('style') ?? '';

      expect(style).toContain('minmax(0, 1fr)');
      expect(style).not.toMatch(/repeat\([0-9]+,\s*1fr\)/);
    });

    it('applies the default day gap without a column block', () => {
      const container = renderColumnContainer(EVENTS, buildConfig());
      const style = requireElement(container, '.column-grid').getAttribute('style') ?? '';

      expect(style.replace(/\s/g, '')).toContain(
        `column-gap:${COLUMN_DEFAULTS.day_gap}`.replace(/\s/g, ''),
      );
    });

    it('applies a configured day gap', () => {
      const config = buildConfig();
      config.column = { day_gap: '32px' };

      const container = renderColumnContainer(EVENTS, config);
      const style = requireElement(container, '.column-grid').getAttribute('style') ?? '';

      expect(style.replace(/\s/g, '')).toContain('column-gap:32px');
    });
  });

  describe('day header', () => {
    it('wraps the date parts in its own container, not the list view class', () => {
      // `.date-content` is dead CSS on the list path — nothing emits it. The column
      // view must therefore bring its own wrapper rather than reviving that class,
      // because adding one to the list path would change the list DOM.
      const container = renderColumnContainer(SINGLE_EVENT, buildConfig());

      expect(container.querySelector('.column-date-content')).not.toBeNull();
      expect(container.querySelector('.date-content')).toBeNull();
    });

    it('carries the same date parts the list view renders', () => {
      const config = buildConfig();
      const column = renderColumnContainer(SINGLE_EVENT, config);
      const list = renderListContainer(SINGLE_EVENT, config);

      for (const part of ['.weekday', '.day', '.month']) {
        expect(requireElement(column, part).textContent).toBe(
          requireElement(list, part).textContent,
        );
      }
    });

    it('places the weather badge inside the header', () => {
      const config = buildConfig();
      config.weather = {
        entity: 'weather.home',
        position: 'date',
        date: { show_conditions: true },
      };

      const container = renderColumnContainer(SINGLE_EVENT, config, { weather: WEATHER });
      const header = container.querySelector('.column-date-content');

      // Asserted unconditionally, and that is the whole point of this test. It first
      // shipped guarded by `if (badge)` because `show_conditions` had been written onto
      // `weather` itself rather than onto `weather.date`, so no badge was ever produced
      // and the assertion never ran. `tsc` caught the misplaced key; vitest alone did
      // not, because a guarded assertion that never executes still reports as a pass.
      const badge = container.querySelector('.weather');
      expect(badge).not.toBeNull();
      expect(header?.contains(badge)).toBe(true);
    });

    it('moves the event weather badge off the title row and into its own row', () => {
      // Two gaps in one. `position: 'event'` had never been exercised in the column view
      // at all -- the test above covers only `position: 'date'` -- and the badge's own-row
      // placement is a markup decision no other test can see.
      //
      // Written as a differential against the list view rather than as a bare containment
      // check, because the placement is only meaningful relative to the other view: the
      // point is that the same leaf emits the badge in two different parents. Asserting
      // only the column side would still pass if the list view drifted to match it.
      const config = buildConfig({ show_location: true });
      config.weather = {
        entity: 'weather.home',
        position: 'event',
        event: { show_conditions: true, show_temp: true },
      };

      const column = renderColumnContainer(EVENTS, config, { weather: WEATHER });
      const list = renderListContainer(EVENTS, config, { weather: WEATHER });

      const columnBadge = column.querySelector('.event-weather');
      const listBadge = list.querySelector('.event-weather');
      expect(columnBadge).not.toBeNull();
      expect(listBadge).not.toBeNull();

      // Column: under the description, sharing the icon gutter with time/location.
      expect(columnBadge?.closest('.time-location')).not.toBeNull();
      expect(columnBadge?.closest('.summary-row')).toBeNull();

      // List: unchanged, on the title row beside the summary.
      expect(listBadge?.closest('.summary-row')).not.toBeNull();
      expect(listBadge?.closest('.time-location')).toBeNull();

      // Exactly one badge per event -- the placement is exclusive, not additive. Guards
      // the failure mode where a future edit adds the row without suppressing the title
      // badge, which renders correctly at a glance and duplicates every forecast.
      expect(column.querySelectorAll('.event-weather').length).toBe(
        list.querySelectorAll('.event-weather').length,
      );
    });
  });

  describe('per-view overrides', () => {
    it('honours a column override of show_empty_days', () => {
      // The override plumbing's only end-to-end proof. `show_empty_days` is resolved
      // inside `groupEventsByDay`, so an override that never reaches it validates
      // clean and does nothing — the silent no-op spec E-1 forbids. Asserting on the
      // list side too is what makes this a test of the *override* rather than of the
      // option: same config, two views, different output.
      const config = buildConfig();
      config.show_empty_days = false;
      config.column = { show_empty_days: true };

      const columnDays = EventUtils.groupEventsByDay(SINGLE_EVENT, config, false, 'en', 'column');
      const listDays = EventUtils.groupEventsByDay(SINGLE_EVENT, config, false, 'en', 'list');

      expect(columnDays.length).toBeGreaterThan(listDays.length);
      expect(listDays.length).toBe(1);
    });

    it('lets a column override of false beat an inherited true', () => {
      // The direction that a `!== false` or `=== true` idiom gets wrong. Spec E-4.
      const config = buildConfig();
      config.show_empty_days = true;
      config.column = { show_empty_days: false };

      const columnDays = EventUtils.groupEventsByDay(SINGLE_EVENT, config, false, 'en', 'column');
      const listDays = EventUtils.groupEventsByDay(SINGLE_EVENT, config, false, 'en', 'list');

      expect(columnDays.length).toBeLessThan(listDays.length);
      expect(columnDays.length).toBe(1);
    });

    it('inherits the top-level value when the column block is silent', () => {
      const config = buildConfig();
      config.show_empty_days = true;
      config.column = { day_gap: '4px' };

      const columnDays = EventUtils.groupEventsByDay(SINGLE_EVENT, config, false, 'en', 'column');
      const listDays = EventUtils.groupEventsByDay(SINGLE_EVENT, config, false, 'en', 'list');

      expect(columnDays.length).toBe(listDays.length);
    });
  });

  describe('threading through to the leaves', () => {
    it('formats times through the Home Assistant locale when asked', () => {
      // `hass` was declared by this file's render harness and threaded into the
      // renderer, but never actually supplied by a test — so deleting it from the
      // `buildEventPresentation` call passed the whole suite. It only bites when
      // `time_24h: 'system'`, which is the one path that reads `hass.locale`.
      const config = buildConfig();
      config.time_24h = 'system';

      const hass = {
        states: {},
        callApi: async () => undefined,
        callService: () => undefined,
        locale: { language: 'en', time_format: '12' },
      } as unknown as Types.Hass;

      const twelve = renderColumnContainer(SINGLE_EVENT, config, { hass });
      const twentyFour = renderColumnContainer(SINGLE_EVENT, config, {
        hass: { ...hass, locale: { language: 'en', time_format: '24' } } as unknown as Types.Hass,
      });

      const twelveText = requireElement(twelve, '.time').textContent ?? '';
      const twentyFourText = requireElement(twentyFour, '.time').textContent ?? '';

      expect(twelveText).toMatch(/[ap]m/i);
      expect(twentyFourText).not.toMatch(/[ap]m/i);
      expect(twelveText).not.toBe(twentyFourText);
    });

    it('renders a per-event weather badge', () => {
      // The column view's other weather position. Only `position: 'date'` was covered,
      // which leaves the event-level badge — a different call site, in a different
      // renderer — entirely unprotected.
      const config = buildConfig();
      config.weather = {
        entity: 'weather.home',
        position: 'event',
        event: { show_conditions: true, show_temp: true },
      };

      const container = renderColumnContainer(EVENTS, config, { weather: WEATHER });
      const badge = container.querySelector('.column-events .event-weather');

      expect(badge).not.toBeNull();
      // Positioned inside an event row, not in the header, which is the whole
      // distinction between the two weather positions. The two use different class
      // names (`.event-weather` vs `.weather`), so this also pins that column view
      // reaches the event-level render site and not the date-level one.
      expect(container.querySelector('.column-date-content .weather')).toBeNull();
    });
  });

  describe('header separator', () => {
    it('renders no rule by default', () => {
      // B2 originally ruled this visible, on the argument that the element exists only
      // in column view and is structural rather than decorative. Live review overturned
      // that: beside the coloured accent bars on each event, a full-width rule reads as
      // a table border. B2 was formally amended and the rule now ships off, in line
      // with every list separator.
      //
      // The gap it used to sit in survives it -- see the day_header_gap test below.
      // That is the whole point of the reversal: switching the rule off must not also
      // collapse the space between a header and its events.
      const container = renderColumnContainer(EVENTS, buildConfig());

      expect(container.querySelectorAll('.day-column').length).toBeGreaterThan(0);
      expect(container.querySelector('.column-header-separator')).toBeNull();
    });

    it('omits the element entirely when the width is set to 0px', () => {
      // Explicitly writing the default must behave identically to omitting it. A
      // zero-width border would still emit an element carrying the separator's own
      // bottom margin, so switching the rule off has to remove the node rather than
      // make it invisible.
      const config = buildConfig();
      config.column = { day_header_separator_width: '0px' };

      const container = renderColumnContainer(EVENTS, config);
      expect(container.querySelector('.column-header-separator')).toBeNull();
    });

    it('renders a rule per column once a width is configured', () => {
      const config = buildConfig();
      config.column = { day_header_separator_width: '2px' };

      const container = renderColumnContainer(EVENTS, config);
      const separators = container.querySelectorAll('.column-header-separator');
      const columns = container.querySelectorAll('.day-column');

      expect(separators.length).toBe(columns.length);
      expect(separators[0].getAttribute('style')?.replace(/\s/g, '')).toContain(
        'border-top-width:2px',
      );
    });

    it('falls back to the default colour when only a width is set', () => {
      const config = buildConfig();
      config.column = { day_header_separator_width: '1px' };

      const container = renderColumnContainer(EVENTS, config);
      const style =
        requireElement(container, '.column-header-separator').getAttribute('style') ?? '';

      expect(style).toContain(COLUMN_DEFAULTS.day_header_separator_color);
    });

    it('honours a configured colour', () => {
      const config = buildConfig();
      config.column = {
        day_header_separator_width: '1px',
        day_header_separator_color: 'rgb(1, 2, 3)',
      };

      const container = renderColumnContainer(EVENTS, config);
      const style =
        requireElement(container, '.column-header-separator').getAttribute('style') ?? '';

      expect(style).toContain('rgb(1, 2, 3)');
    });
  });

  describe('header gap', () => {
    it('publishes the gap as a custom property on the grid', () => {
      // The header-to-events gap used to be an emergent 4px of header padding plus 4px
      // of separator margin, which meant switching the rule off silently halved it.
      // Owning it as one value is what lets the rule default to off (B2, amended)
      // without the header collapsing onto its events.
      //
      // Asserted as a literal rather than against COLUMN_DEFAULTS, so this cannot pass
      // by moving with the code.
      const container = renderColumnContainer(EVENTS, buildConfig());
      const style = requireElement(container, '.column-grid').getAttribute('style') ?? '';

      expect(style.replace(/\s/g, '')).toContain('--calendar-card-column-header-gap:8px');
    });

    it('honours a configured gap', () => {
      const config = buildConfig();
      config.column = { day_header_gap: '20px' };

      const container = renderColumnContainer(EVENTS, config);
      const style = requireElement(container, '.column-grid').getAttribute('style') ?? '';

      expect(style.replace(/\s/g, '')).toContain('--calendar-card-column-header-gap:20px');
    });

    it('coerces a bare number to px', () => {
      // Home Assistant's YAML parser types an unquoted `16` as a number, which would
      // emit an invalid declaration the browser drops -- collapsing the gap to the
      // stylesheet fallback with no diagnostic. Same trap as the separator width.
      const config = buildConfig();
      config.column = { day_header_gap: 16 as unknown as string };

      const container = renderColumnContainer(EVENTS, config);
      const style = requireElement(container, '.column-grid').getAttribute('style') ?? '';

      expect(style.replace(/\s/g, '')).toContain('--calendar-card-column-header-gap:16px');
    });
  });

  describe('shared leaves', () => {
    it('renders event content byte-identically to the list view', () => {
      // The load-bearing test in this file. `renderEventContent` excludes its wrapper
      // precisely so both views can call it; nothing else enforces that the column
      // view actually does, and a divergence would only show up as the two views
      // slowly drifting apart across releases.
      //
      // Its reach was measured by mutation rather than assumed. Changing the event
      // passed to the leaf fails this test; changing the *config* passed to it does
      // not, because `renderEventContent` reads only `show_progress_bar` — every other
      // display decision arrives pre-resolved in `contentParts` from
      // `buildEventPresentation`, which both views call identically. So this asserts
      // that the two views share the rendering leaf, and Phase 2's presentation layer
      // is what guarantees they share the decisions feeding it.
      const config = buildConfig();

      expect(eventContents(renderColumnContainer(EVENTS, config))).toEqual(
        eventContents(renderListContainer(EVENTS, config)),
      );
    });

    it('stays identical when display options are turned on', () => {
      // Default config leaves several branches unrendered, so equality under defaults
      // proves less than it appears to. This turns them on.
      const config = buildConfig({
        show_location: true,
        show_end_time: true,
        show_countdown: true,
        show_progress_bar: true,
      });

      expect(eventContents(renderColumnContainer(EVENTS, config))).toEqual(
        eventContents(renderListContainer(EVENTS, config)),
      );
    });

    it('reuses the list view event classes, so accent styling is shared', () => {
      const container = renderColumnContainer(EVENTS, buildConfig());
      const events = container.querySelectorAll('.event');

      expect(events.length).toBeGreaterThan(0);
      // First/last position classes drive the corner radii and must be per column, not
      // per grid — otherwise only the first column would be rounded.
      for (const column of Array.from(container.querySelectorAll('.day-column'))) {
        const own = column.querySelectorAll('.event');
        expect(own[0].classList.contains('event-first')).toBe(true);
        expect(own[own.length - 1].classList.contains('event-last')).toBe(true);
      }
    });

    it('carries the accent colour on the event wrapper', () => {
      const container = renderColumnContainer(SINGLE_EVENT, buildConfig());
      const style = requireElement(container, '.event').getAttribute('style') ?? '';

      expect(style).toContain('border-inline-start');
      expect(style).toContain('--calendar-card-line-width-vertical');
    });
  });

  describe('day classification', () => {
    it('marks the current day and not the others', () => {
      const container = renderColumnContainer(EVENTS, buildConfig());
      const today = container.querySelectorAll('.day-column.today');

      expect(today.length).toBeLessThanOrEqual(1);
      for (const column of Array.from(container.querySelectorAll('.day-column'))) {
        // Every column is exactly one of today or future-day; the two are complements,
        // so a column that is neither means the classification silently failed.
        expect(column.classList.contains('today') !== column.classList.contains('future-day')).toBe(
          true,
        );
      }
    });

    it('produces a serializable DOM with no unresolved bindings', () => {
      // A lit binding that receives `undefined` renders the literal string; this is the
      // cheapest way to catch a config key that resolves to nothing.
      const markup = serialize(renderColumnContainer(EVENTS, buildConfig()));

      expect(markup).not.toContain('undefined');
      expect(markup).not.toContain('[object Object]');
      expect(markup).toContain('column-grid');
    });

    it("renders the today indicator inside today's column header and nowhere else", () => {
      // .column-day-header carries position: relative solely to be this element's
      // containing block, so without an assertion here that rule is justified by an
      // emission nothing checks -- and the indicator could be dropped silently.
      const container = renderColumnContainer(
        EVENTS,
        buildConfig({ today_indicator: 'dot' }),
      ) as HTMLElement;

      const indicators = container.querySelectorAll('.today-indicator');
      expect(indicators.length).toBe(1);

      const host = indicators[0].closest('.column-day-header');
      expect(host).not.toBeNull();
      expect(host?.closest('.day-column')?.classList.contains('today')).toBe(true);
    });

    it('renders no today indicator when the option is off', () => {
      // Control for the test above: without it, an implementation that emitted the
      // indicator unconditionally in every column would still fail only on count,
      // leaving "respects the config" untested.
      const container = renderColumnContainer(
        EVENTS,
        buildConfig({ today_indicator: false }),
      ) as HTMLElement;

      expect(container.querySelectorAll('.today-indicator').length).toBe(0);
    });
  });
});
