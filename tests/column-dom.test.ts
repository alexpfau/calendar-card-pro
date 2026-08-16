import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, SINGLE_EVENT, WEATHER, buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import { COLUMN_DEFAULTS } from '../src/config/view';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * The column view's DOM.
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

/**
 * `.event-content` blocks with the documented per-view **placements** folded back to a
 * common position, so the two views can still be compared for everything else.
 *
 * The contract this serves is "identical except for documented per-view placements", and
 * that is a widening of the original "identical", not an abandonment of it. It was
 * already true in spirit: the weather badge has had a per-view placement since C2, and
 * the byte-identity gate survived only because its configs happen to leave weather off.
 * C5 gives the progress bar the same treatment, and `show_progress_bar` *is* turned on in
 * one of those configs — so the exception has to become explicit rather than incidental.
 *
 * Folding rather than deleting is what keeps the assertion strong. The bar is moved back
 * to the inline placement's position and stripped of its modifier class, so its presence,
 * its remaining classes, its fill percentage and its inline style are all still compared;
 * only *which parent it hangs from* is normalized. Deleting the node would have thrown
 * all of that away along with the placement.
 *
 * Whitespace between tags is normalized because moving a node necessarily moves the text
 * nodes around it — reattaching the bar leaves it flush against its new closing tag where
 * the list view has a newline. That is very nearly the equivalence `list-dom.test.ts`'s
 * serializer already applies (`>\s+<`), widened by one character to `>\s*<` so that "no
 * whitespace between two tags" and "some whitespace between two tags" also compare equal,
 * which is the precise artefact the fold creates. Whitespace *adjacent to text* still
 * survives verbatim, which is the half that is load-bearing.
 *
 * The countdown is the second placement folded here, and it is folded the other way
 * round: the column view *adds* a `.time-text` wrapper the list view does not have, so
 * normalizing means unwrapping rather than moving. Unwrapping is a wider operation than
 * the bar's re-parenting and is worth being explicit about — what survives it is the
 * countdown element itself, its class, its text and its position relative to `.time`, and
 * what is discarded is the wrapper and the element's tag name. Both of those are asserted
 * directly, and differentially against the list view, by the placement tests below; this
 * helper is deliberately not the thing that proves the placement happened.
 */
function eventContentsAtCommonPlacement(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll('.event-content')).map((element) => {
    const clone = element.cloneNode(true) as HTMLElement;

    for (const bar of Array.from(clone.querySelectorAll('.progress-bar-row'))) {
      const time = clone.querySelector('.time');
      // Not a fallback: the row placement drops `.time` entirely when there is no time
      // to show, and the inline placement emits an empty one. That is a real structural
      // difference and must fail the comparison rather than be quietly papered over.
      if (time === null) continue;
      bar.classList.remove('progress-bar-row');
      time.append(bar);
    }

    for (const wrapper of Array.from(clone.querySelectorAll('.time-text'))) {
      const time = wrapper.closest('.time');
      // Same reasoning as the bar above: the wrapper only ever exists inside a `.time`,
      // so its absence is a structural difference and not a case to skip past.
      if (time === null) continue;

      const countdown = wrapper.querySelector('.time-countdown');
      if (countdown !== null) {
        // Re-tagged to the trailing placement's element so the comparison is about where
        // the countdown sits rather than about `span` versus `div`. The class and the
        // text come across; nothing else on the element is dropped, because nothing else
        // is set on it.
        const trailing = clone.ownerDocument.createElement('div');
        trailing.className = countdown.className;
        trailing.textContent = countdown.textContent;
        countdown.remove();
        time.append(trailing);
      }

      wrapper.replaceWith(...Array.from(wrapper.childNodes));
    }

    return clone.innerHTML
      .replace(/<!--\?lit\$[0-9]+\$-->/g, '')
      .replace(/<!---->/g, '')
      .replace(/>\s*</g, '>\n<')
      .trim();
  });
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

    it('applies the default day spacing without a column block', () => {
      const container = renderColumnContainer(EVENTS, buildConfig());
      const style = requireElement(container, '.column-grid').getAttribute('style') ?? '';

      expect(style.replace(/\s/g, '')).toContain(
        `column-gap:${DEFAULT_CONFIG.day_spacing}`.replace(/\s/g, ''),
      );
    });

    it('applies a configured day spacing', () => {
      const config = buildConfig();
      config.day_spacing = '32px';

      const container = renderColumnContainer(EVENTS, config);
      const style = requireElement(container, '.column-grid').getAttribute('style') ?? '';

      expect(style.replace(/\s/g, '')).toContain('column-gap:32px');
    });

    it('never emits a negative gutter the browser would discard', () => {
      // A negative `column-gap` is invalid, so the browser drops the declaration and
      // renders no gutter — while the separator offset, `calc(-0.5 * (gap + width))`,
      // turns the same value into a *positive* margin that is valid and survives,
      // displacing every separator into the middle of a column. Substituting the
      // default keeps the two in step, and keeps what renders in step with the width
      // arithmetic that decided to render columns at all.
      const config = buildConfig();
      config.day_spacing = '-100px';

      const container = renderColumnContainer(EVENTS, config);
      const style = requireElement(container, '.column-grid').getAttribute('style') ?? '';

      expect(style).not.toContain('-100px');
      expect(style.replace(/\s/g, '')).toContain(
        `column-gap:${DEFAULT_CONFIG.day_spacing}`.replace(/\s/g, ''),
      );
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
      // Both sides are put on `split_multiday_events: true` so the two views see the
      // same set of events. Column view raises that option by default (spec §D6), and
      // without matching it here the counts diverge for a reason that has nothing to do
      // with badge placement — the multi-day fixture becomes two events in one view and
      // one in the other, and this assertion fails on a difference it is not testing.
      const config = buildConfig({ show_location: true, split_multiday_events: true });
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

    /**
     * What `show_conditions` means in each layout.
     *
     * In the list view it gates the icon, which is what it has always done and what the
     * docs advertise. In its own row it cannot: that row shares a leading icon edge with
     * the time, location and description rows, and the stylesheet does explicit work to
     * line it up there. Dropping the icon leaves a temperature hanging in an empty icon
     * column between two icon-led rows.
     *
     * So in the own-row placement the icon is unconditional and `show_conditions` states
     * the condition in words instead. Both halves are asserted against the list view,
     * because a one-sided assertion would pass just as happily against a build that had
     * changed both.
     */
    function weatherConfig(showConditions: boolean): Types.Config {
      const config = buildConfig({ show_location: true, split_multiday_events: true });
      config.weather = {
        entity: 'weather.home',
        position: 'event',
        event: { show_conditions: showConditions, show_temp: true },
      };
      return config;
    }

    /** A `hass` whose formatter localizes conditions the way Home Assistant's does. */
    function germanHass(): Types.Hass {
      const translations: Record<string, string> = {
        'component.weather.entity_component._.state.sunny': 'Sonnig',
        'component.weather.entity_component._.state.cloudy': 'Bewölkt',
        'component.weather.entity_component._.state.fog': 'Nebel',
        'component.weather.entity_component._.state.rainy': 'Regnerisch',
      };

      return {
        states: {
          'weather.home': {
            entity_id: 'weather.home',
            state: 'sunny',
            attributes: { friendly_name: 'Home' },
          },
        },
        callApi: async () => undefined,
        callService: () => undefined,
        formatEntityState: (stateObj: Types.HassEntity, state?: string) => {
          const value = state ?? stateObj.state;
          const domain = String(stateObj.entity_id).split('.')[0];
          return translations[`component.${domain}.entity_component._.state.${value}`] ?? value;
        },
      } as unknown as Types.Hass;
    }

    it('keeps the icon in the column row when conditions are switched off', () => {
      const config = weatherConfig(false);

      const column = renderColumnContainer(EVENTS, config, { weather: WEATHER });
      const list = renderListContainer(EVENTS, config, { weather: WEATHER });

      const columnBadge = requireElement(column, '.event-weather');
      const listBadge = requireElement(list, '.event-weather');

      // The fix: the gutter keeps its glyph.
      expect(columnBadge.querySelector('ha-icon')).not.toBeNull();
      // The list view, unchanged: temperature only, exactly as documented.
      expect(listBadge.querySelector('ha-icon')).toBeNull();
    });

    it('states the condition in words in the column row, and only there', () => {
      const config = weatherConfig(true);
      const hass = germanHass();

      const column = renderColumnContainer(EVENTS, config, { weather: WEATHER, hass });
      const list = renderListContainer(EVENTS, config, { weather: WEATHER, hass });

      const columnWords = column.querySelectorAll('.weather-condition');
      expect(columnWords.length).toBeGreaterThan(0);
      expect(Array.from(columnWords).map((span) => span.textContent?.trim())).toContain('Sonnig');

      // The list badge shares the title row and has no spare width, so it never carries
      // words — whatever `show_conditions` is set to.
      expect(list.querySelectorAll('.weather-condition').length).toBe(0);
    });

    it('says nothing in words when conditions are switched off', () => {
      const column = renderColumnContainer(EVENTS, weatherConfig(false), {
        weather: WEATHER,
        hass: germanHass(),
      });

      expect(column.querySelectorAll('.weather-condition').length).toBe(0);
    });

    it('keeps the row when the condition cannot be localized', () => {
      // An older instance has no `formatEntityState`. The words are what must be lost;
      // the icon is what fixes the layout and needs no `hass` at all.
      const hass = {
        states: {},
        callApi: async () => undefined,
        callService: () => undefined,
      } as unknown as Types.Hass;

      const column = renderColumnContainer(EVENTS, weatherConfig(true), {
        weather: WEATHER,
        hass,
      });

      const badge = requireElement(column, '.event-weather');
      expect(badge.querySelector('ha-icon')).not.toBeNull();
      expect(column.querySelectorAll('.weather-condition').length).toBe(0);
    });

    it('puts the words after both numbers, so truncation never eats a number', () => {
      const config = weatherConfig(true);
      config.weather!.event!.show_uv_index = true;
      config.weather!.event!.uv_index_threshold = 0;

      const column = renderColumnContainer(EVENTS, config, {
        weather: WEATHER,
        hass: germanHass(),
      });

      // Ordering is a markup decision, so it is asserted on the markup: whatever the
      // line limit clamps, it reaches the condition before it reaches the temperature.
      const badge = requireElement(column, '.event-weather');
      const spans = Array.from(badge.querySelectorAll('span'));
      const words = spans.findIndex((span) => span.classList.contains('weather-condition'));

      expect(words).toBe(spans.length - 1);
      expect(words).toBeGreaterThan(0);
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
      config.column = { day_spacing: '4px' };

      const columnDays = EventUtils.groupEventsByDay(SINGLE_EVENT, config, false, 'en', 'column');
      const listDays = EventUtils.groupEventsByDay(SINGLE_EVENT, config, false, 'en', 'list');

      expect(columnDays.length).toBe(listDays.length);
    });
  });

  describe('compact mode is not applied in column view', () => {
    const count = (days: Types.EventsByDay[]) => days.reduce((n, day) => n + day.events.length, 0);

    // The global `compact_events_to_show` budget is card-wide and spent walking days
    // chronologically. In a list that trims the tail; in a grid it deletes whole columns,
    // and a card rendering two of seven configured days looks *complete* — no gap, nothing
    // to notice. The spec ruled both keys inapplicable to column view (G12, A3-D) but the
    // code applied them anyway, so these assert the ruling is now real.
    //
    // Each case asserts the *list* side too. Without that they would pass just as happily
    // against a build that had broken compact mode outright, which is the failure mode a
    // one-sided test invites.

    it('spends the global event budget in list view but not in column view', () => {
      const config = buildConfig({ compact_events_to_show: 2 });
      const uncapped = buildConfig();

      const listDays = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', 'list');
      const columnDays = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', 'column');
      const baseline = EventUtils.groupEventsByDay(EVENTS, uncapped, false, 'en', 'column');

      // The fixture's first day alone carries more than the budget, so the list drops
      // every later day — the exact behaviour that deletes columns in a grid.
      expect(listDays.length).toBeLessThan(columnDays.length);
      expect(columnDays.length).toBe(3);

      // Compared against an uncapped run rather than the fixture length, because unrelated
      // filtering (`show_past_events` is off by default) also removes events. The property
      // is that the cap changes nothing at all here, not that every fixture event survives.
      expect(count(columnDays)).toBe(count(baseline));
    });

    it('ignores compact_events_complete_days in column view', () => {
      // The soft-limit branch is a second code path to the same defect, reached only when
      // this key is set — gating one and not the other would leave the grid corruptible.
      const config = buildConfig({
        compact_events_to_show: 2,
        compact_events_complete_days: true,
      });

      const listDays = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', 'list');
      const columnDays = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', 'column');

      expect(listDays.length).toBeLessThan(columnDays.length);
      expect(columnDays.length).toBe(3);
    });

    it('ignores the per-entity cap in column view too', () => {
      // ⚠️ This assertion is the *reverse* of the one that shipped here first, which held
      // that A3-D ruled the per-entity cap column-safe because rebasing it per column would
      // multiply it by `days_to_show`. That reasoning is sound for the rebase, but it was
      // read as licence to leave the cap live, and the version of this test that encoded it
      // carried its own refutation in a warning comment: the bucket key is
      // `entityId__configIdx` — one budget per entity for the whole *card*, not per day — so
      // on a single-entity card a cap of 1 leaves one event in the entire grid and collapses
      // every column but the first. That is the same defect as the global cap, reached by a
      // narrower door. A3-D:262-264 is corrected; all four compact keys are now inert in
      // column view, and density is answered by `min_days_to_show` / `min_days_fallback`.
      const config = buildConfig({
        show_empty_days: true,
        entities: [{ entity: 'calendar.personal', compact_events_to_show: 1 }],
      });

      // `_matchedConfig` is attached during the fetch, not during grouping, so fixture
      // events carry none and the cap's type guard (issue #327) would wave every event
      // through — the test would pass against a build with the cap gated out entirely.
      // It also *carries* the cap, so the baseline needs its own uncapped attachment
      // rather than reusing these events with a different config. That baseline is what
      // gives the assertion a denominator: it is the same run with no cap set, so an
      // equality that held because grouping had stopped returning anything would show up
      // as both sides collapsing rather than as a pass.
      const attach = (target: Types.Config) => {
        const matched = target.entities[0] as Types.EntityConfig;
        return EVENTS.map((event) => ({
          ...event,
          _entityId: matched.entity,
          _matchedConfig: matched,
        }));
      };

      const uncapped = buildConfig({ show_empty_days: true });
      const columnDays = EventUtils.groupEventsByDay(attach(config), config, false, 'en', 'column');
      const baseline = EventUtils.groupEventsByDay(
        attach(uncapped),
        uncapped,
        false,
        'en',
        'column',
      );

      // Same shape as the global-budget assertion above: the cap changes nothing at all.
      expect(columnDays.length).toBe(3);
      expect(count(columnDays)).toBe(count(baseline));
      expect(count(baseline)).toBeGreaterThan(1);

      // And the list-view control, without which this would pass against a build where the
      // per-entity cap had stopped working everywhere.
      const listDays = EventUtils.groupEventsByDay(attach(config), config, false, 'en', 'list');
      expect(count(listDays)).toBe(1);
    });
  });

  describe('separators between columns', () => {
    // 15 days from the frozen Wednesday 2026-06-17 reaches Wed 2026-07-01, so one
    // config produces all three boundary kinds: plain days throughout, new weeks at
    // Mon 06-22 (index 5) and Mon 06-29 (index 12), and a new month at 07-01 (index
    // 14, which is also a plain day so month and week never collide here).
    //
    // `show_empty_days` is what makes that possible at all -- the fixture carries
    // events on three days only, and without it the grid would be three columns wide
    // with no week boundary anywhere in it.
    function spanConfig(overrides: Partial<Types.Config> = {}): Types.Config {
      return buildConfig({
        days_to_show: 15,
        show_empty_days: true,
        ...overrides,
      });
    }

    function separators(container: HTMLElement): { column: string; color: string }[] {
      return Array.from(container.querySelectorAll<HTMLElement>('.column-separator')).map(
        (element) => ({
          column: element.style.gridColumn,
          color: element.style.backgroundColor,
        }),
      );
    }

    it('renders nothing when all three widths are zero', () => {
      const container = renderColumnContainer(EVENTS, spanConfig());

      // Every separator width defaults to 0px, so the default card has no rules at
      // all -- the same as the list view, where the same defaults produce no lines.
      expect(container.querySelectorAll('.column-separator').length).toBe(0);
    });

    it('draws a day rule in every gutter but never before the first column', () => {
      const container = renderColumnContainer(
        EVENTS,
        spanConfig({ day_separator_width: '1px', day_separator_color: 'rgb(1, 2, 3)' }),
      );

      const rules = separators(container);

      // 15 columns, 14 gutters. The absent 15th is the point: `computeDayBoundaries`
      // reports index 0 as opening a new week *and* a new month by construction, and
      // a rule there would be drawn against the outside of the card.
      expect(rules.length).toBe(14);
      expect(rules.map((rule) => rule.column)).toEqual([
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        '10',
        '11',
        '12',
        '13',
        '14',
        '15',
      ]);
      expect(new Set(rules.map((rule) => rule.color))).toEqual(new Set(['rgb(1, 2, 3)']));
    });

    it('lets a week rule win over a day rule at a week boundary', () => {
      const container = renderColumnContainer(
        EVENTS,
        spanConfig({
          day_separator_width: '1px',
          day_separator_color: 'rgb(1, 2, 3)',
          week_separator_width: '3px',
          week_separator_color: 'rgb(4, 5, 6)',
        }),
      );

      const weekRules = Array.from(
        container.querySelectorAll<HTMLElement>('.column-separator-week'),
      );

      // Mondays 06-22 and 06-29 are indices 5 and 12, so tracks 6 and 13.
      expect(weekRules.map((rule) => rule.style.gridColumn)).toEqual(['6', '13']);
      expect(weekRules.map((rule) => rule.style.width)).toEqual(['3px', '3px']);
      // Every other gutter keeps its day rule rather than losing it to the week.
      expect(container.querySelectorAll('.column-separator-day').length).toBe(12);
    });

    it('lets a month rule win over both', () => {
      const container = renderColumnContainer(
        EVENTS,
        spanConfig({
          day_separator_width: '1px',
          week_separator_width: '3px',
          month_separator_width: '5px',
          month_separator_color: 'rgb(7, 8, 9)',
        }),
      );

      const monthRules = Array.from(
        container.querySelectorAll<HTMLElement>('.column-separator-month'),
      );

      // 2026-07-01 is index 14, so track 15.
      expect(monthRules.map((rule) => rule.style.gridColumn)).toEqual(['15']);
      expect(monthRules[0].style.backgroundColor).toBe('rgb(7, 8, 9)');
    });

    it('falls through to the next family when the winning one is switched off', () => {
      const container = renderColumnContainer(
        EVENTS,
        spanConfig({ day_separator_width: '1px', week_separator_width: '0px' }),
      );

      // A zero-width week separator must not *suppress* the day rule at a week
      // boundary. In the list view `hasWeekSeparator` does exactly that, because the
      // week-number row occupies the slot; column view has no such collision, so the
      // day rule stays. Tracks 6 and 13 are the Mondays.
      const dayColumns = Array.from(
        container.querySelectorAll<HTMLElement>('.column-separator-day'),
      ).map((rule) => rule.style.gridColumn);

      expect(dayColumns).toContain('6');
      expect(dayColumns).toContain('13');
      expect(dayColumns.length).toBe(14);
    });

    it('keeps the day rule at a week boundary when week numbers are on', () => {
      const container = renderColumnContainer(
        EVENTS,
        spanConfig({ day_separator_width: '1px', show_week_numbers: 'iso' }),
      );

      // The amended D5 ruling. Switching week numbers on must not silently delete the
      // rule at every week boundary and leave a gap in an otherwise regular run.
      expect(container.querySelectorAll('.column-separator').length).toBe(14);
      expect(container.querySelectorAll('.column-week-number').length).toBeGreaterThan(0);
    });

    it('centres the rule in the gutter for any spacing and width', () => {
      const container = renderColumnContainer(
        EVENTS,
        spanConfig({ day_spacing: '20px', day_separator_width: '4px' }),
      );

      const rule = requireElement<HTMLElement>(container, '.column-separator');

      // Half the gutter plus half the rule pulls a 4px line to sit centred across the
      // 20px gap. Asserted as the expression rather than a computed number because
      // day_spacing can be any CSS length, including one the browser resolves.
      expect(rule.style.marginInlineStart).toBe('calc(-0.5 * (20px + 4px))');
    });

    it('honours a separator width overridden inside the column block', () => {
      const config = spanConfig({ day_separator_width: '0px' });
      config.column = { day_separator_width: '2px' };

      // Category B keys are resolved by `resolveEffectiveConfig`, which the card runs
      // once before rendering so the renderer only ever sees view-resolved values.
      // The harness has to do the same, or this would assert against the raw config
      // and prove only that `day_separator_width: '0px'` draws nothing.
      const resolved = ViewConfig.resolveEffectiveConfig(config, 'column');
      const container = renderColumnContainer(EVENTS, resolved);

      // Category B: the same key, a different value per view. A user who wants a hair
      // line between stacked days but a heavier rule between full-height columns has
      // no other way to say so.
      expect(container.querySelectorAll('.column-separator-day').length).toBe(14);
      expect(requireElement<HTMLElement>(container, '.column-separator').style.width).toBe('2px');
    });

    it('places both columns and separators explicitly so neither displaces the other', () => {
      const container = renderColumnContainer(EVENTS, spanConfig({ day_separator_width: '1px' }));

      const columns = Array.from(container.querySelectorAll<HTMLElement>('.day-column'));

      // Auto-placement fills only cells no explicitly-placed item claims, so a mix of
      // the two would push the auto-placed columns into row 2 the moment a separator
      // claimed a row-1 cell. Every item carries its own placement for that reason.
      expect(columns.map((column) => column.style.gridRow)).toEqual(Array(15).fill('1'));
      expect(columns.map((column) => column.style.gridColumn)).toEqual(
        Array.from({ length: 15 }, (_, index) => String(index + 1)),
      );
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
      // that the two views share the rendering leaf, and `buildEventPresentation` is
      // what guarantees they share the decisions feeding it.
      //
      // `split_multiday_events` is set on both sides so the two views group the same
      // events. Column raises it by default (spec §D6); leaving the list on the default
      // would make this compare a split event against an unsplit one, which is a
      // difference in *which* events exist rather than in how the leaf renders one.
      const config = buildConfig({ split_multiday_events: true });

      expect(eventContents(renderColumnContainer(EVENTS, config))).toEqual(
        eventContents(renderListContainer(EVENTS, config)),
      );
    });

    it('stays identical when display options are turned on', () => {
      // Default config leaves several branches unrendered, so equality under defaults
      // proves less than it appears to. This turns them on.
      //
      // Compared through `eventContentsAtCommonPlacement` rather than `eventContents`,
      // and that is the deliberate widening C5 owes this gate. `show_progress_bar` is on
      // here and the fixture set contains a currently-running event, so the bar renders
      // in both views — inline in the list, in its own row in the column. The contract
      // becomes "identical except for documented per-view placements": the helper folds
      // the row back to the inline position and everything else, the bar's own fill
      // included, is still compared. See that helper for why folding beats deleting.
      //
      // The test above deliberately keeps the strict comparison. Under default config no
      // placement fires, so byte-identity still holds there and the stronger assertion is
      // kept where it can be.
      const config = buildConfig({
        show_location: true,
        show_end_time: true,
        show_countdown: true,
        show_progress_bar: true,
        split_multiday_events: true,
      });

      expect(eventContentsAtCommonPlacement(renderColumnContainer(EVENTS, config))).toEqual(
        eventContentsAtCommonPlacement(renderListContainer(EVENTS, config)),
      );
    });

    it('proves the fold is doing work, not passing vacuously', () => {
      // `eventContentsAtCommonPlacement` would be worthless if the two views happened to
      // agree before it ran — the widening would then be hiding nothing and also proving
      // nothing. This pins that the strict comparison genuinely fails on the same input,
      // so the helper is neutralizing a real difference rather than decorating a pass.
      const config = buildConfig({
        show_progress_bar: true,
        split_multiday_events: true,
      });

      expect(eventContents(renderColumnContainer(EVENTS, config))).not.toEqual(
        eventContents(renderListContainer(EVENTS, config)),
      );
    });

    it('moves the progress bar off the time row and into its own row', () => {
      // The column half of C5, and the reason the gate above had to widen. Written as a
      // differential against the list view for the same reason the weather-row test is:
      // the placement only means anything relative to the other view, and asserting the
      // column side alone would still pass if the list view drifted to match it.
      const config = buildConfig({ show_progress_bar: true, split_multiday_events: true });

      const column = renderColumnContainer(EVENTS, config);
      const list = renderListContainer(EVENTS, config);

      const columnBar = requireElement(column, '.progress-bar');
      const listBar = requireElement(list, '.progress-bar');

      // Column: a row of its own, hanging off .time-location rather than .time.
      expect(columnBar.classList.contains('progress-bar-row')).toBe(true);
      expect(columnBar.parentElement?.classList.contains('time-location')).toBe(true);
      expect(column.querySelector('.time .progress-bar')).toBeNull();

      // List: untouched. Still a child of the time row, still without the modifier.
      expect(listBar.parentElement?.classList.contains('time')).toBe(true);
      expect(list.querySelector('.progress-bar-row')).toBeNull();
    });

    it('puts the progress bar row above the time, between it and the title', () => {
      // Ordering is the whole placement. `.time-location` is a column flex container, so
      // DOM order is visual order and being *first* is what puts the bar under the title
      // rather than under the description.
      const config = buildConfig({ show_progress_bar: true, split_multiday_events: true });
      const container = renderColumnContainer(EVENTS, config);

      const row = requireElement(container, '.progress-bar-row');
      const timeLocation = row.parentElement;

      expect(timeLocation?.classList.contains('time-location')).toBe(true);

      const children = Array.from(timeLocation?.children ?? []);
      const timeIndex = children.findIndex((child) => child.classList.contains('time'));

      expect(children[0]).toBe(row);
      expect(timeIndex).toBeGreaterThan(0);
    });

    it('folds the countdown into the time text in the column view, and only there', () => {
      // The other half of C5 was CSS-only, and this test pinned that. It is now a markup
      // decision, and this is the differential that states it — written against the list
      // view rather than as a column-side assertion, for the same reason the weather-row
      // and progress-bar tests are: a placement only means anything relative to the other
      // view, and asserting one side alone would still pass if the other drifted to match.
      //
      // Column: inside `.time-actual`, nested in the `.time-text` wrapper alongside the
      // time. That wrapper is the whole mechanism — two flex items can only break between
      // themselves, two inline siblings can break anywhere — and it is the same one
      // `.event-weather-text` is. Still not a row of its own: that was proposed and
      // rejected, because every other row here leads with an icon and a bare text row
      // reads as one whose icon has gone missing.
      //
      // List: untouched, and deliberately. Its countdown is not a continuation of the
      // time — no separator, and `space-between` parks it at the far right of a cell as
      // wide as the card — so it stays a sibling of `.time-actual` with no wrapper at all.
      //
      // The separator and the alignment are stylesheet invariants and live in
      // `stylesheet.test.ts`; nothing in the DOM can see them.
      const config = buildConfig({ show_countdown: true, split_multiday_events: true });

      const column = renderColumnContainer(EVENTS, config);
      const list = renderListContainer(EVENTS, config);

      const columnCountdown = requireElement(column, '.time-countdown');
      expect(columnCountdown.parentElement?.classList.contains('time-text')).toBe(true);
      expect(columnCountdown.closest('.time-actual')).not.toBeNull();
      // A span, not a div: it has to be inline-level to share a line with the time.
      expect(columnCountdown.tagName).toBe('SPAN');

      const listCountdown = requireElement(list, '.time-countdown');
      expect(listCountdown.parentElement?.classList.contains('time')).toBe(true);
      expect(list.querySelector('.time-text')).toBeNull();
    });

    it('emits the wrapper only when there is a countdown to fold', () => {
      // The wrapper exists to give two pieces one inline formatting context, so around a
      // single piece it has no job. That is not tidiness: the byte-identity gate above
      // runs under default config, where `show_countdown` is false, and an unconditional
      // wrapper would have cost it. Pinned so the condition cannot quietly be dropped.
      const off = renderColumnContainer(EVENTS, buildConfig({ split_multiday_events: true }));
      expect(off.querySelector('.time-countdown')).toBeNull();
      expect(off.querySelector('.time-text')).toBeNull();

      const on = renderColumnContainer(
        EVENTS,
        buildConfig({ show_countdown: true, split_multiday_events: true }),
      );
      expect(on.querySelector('.time-text')).not.toBeNull();
    });

    it('keeps the countdown trailing when there is no time to fold it into', () => {
      // `show_time: false` leaves no time text, so the text placement has nothing to fold
      // into and both views render the same trailing box. The branch reads `countdownStr`
      // rather than the narrowed `trailingCountdown` precisely so this case survives;
      // narrowing it would have deleted the countdown outright in the column view, which
      // is a silent data loss no other assertion here would have caught.
      const config = buildConfig({
        show_time: false,
        show_countdown: true,
        split_multiday_events: true,
      });

      const column = renderColumnContainer(EVENTS, config);
      const countdown = requireElement(column, '.time-countdown');

      expect(countdown.parentElement?.classList.contains('time')).toBe(true);
      expect(countdown.tagName).toBe('DIV');
      expect(column.querySelector('.time-text')).toBeNull();
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

  /**
   * Multi-day events, and why column view splits them without being asked.
   *
   * In the list view an unsplit multi-day event is honest: it renders once, under the
   * day it starts, reading "All day, until Jun 19" — the end date is right there in
   * the text. A grid has no such affordance. The event renders in one column and the
   * columns for every other day it covers sit next to it looking free, which is
   * exactly the question a week-at-a-glance layout exists to answer. So column view
   * defaults `split_multiday_events` on (spec §D5/§D6) rather than inheriting the
   * top-level default.
   */
  describe('multi-day events', () => {
    it('splits across every column it covers with no config asking for it', () => {
      // `buildConfig()` sets no split option at all, so this fails if the divergent
      // default stops being applied — which is the regression worth catching, since a
      // card configured the normal way would silently go back to lying.
      const container = renderColumnContainer(EVENTS, buildConfig());
      const covered = Array.from(container.querySelectorAll('.day-column')).filter((column) =>
        column.textContent?.includes('Conference'),
      );

      // The fixture is all-day Jun 18 → Jun 20 exclusive, so it covers two days.
      expect(covered.length).toBe(2);
    });

    it('renders each segment as its own day rather than carrying the end date', () => {
      const container = renderColumnContainer(EVENTS, buildConfig());
      const column = Array.from(container.querySelectorAll('.day-column')).find((candidate) =>
        candidate.textContent?.includes('Conference'),
      );

      // The tell of an unsplit event. Its absence is what proves the split ran, rather
      // than the event merely appearing twice for some other reason.
      expect(column?.textContent).toContain('All day');
      expect(column?.textContent).not.toContain('until');
    });

    it('lets the column block turn splitting back off', () => {
      const container = renderColumnContainer(
        EVENTS,
        buildConfig({ column: { split_multiday_events: false } }),
      );
      const covered = Array.from(container.querySelectorAll('.day-column')).filter((column) =>
        column.textContent?.includes('Conference'),
      );

      expect(covered.length).toBe(1);
      expect(covered[0]?.textContent).toContain('until');
    });

    /**
     * A per-entity `split_multiday_events: false` is inert in column view (spec §D5), and
     * these two tests are a matched pair: the same event, the same opt-out, opposite
     * outcomes in the two views. Asserting only the column half would pass just as well
     * if the per-entity setting had been broken outright rather than scoped to one view.
     *
     * The reason for the exception is structural. A column is a claim about one day, so
     * an unsplit event leaves every later column it spans silently blank — and because
     * precedence is per entity, one calendar in a card would be honest while another was
     * not. In list view a multi-day event is one row that names its own end date, so
     * nothing is hidden and the documented precedence stands.
     */
    const optedOutOfSplitting = () =>
      EVENTS.map((event) =>
        event.summary === 'Conference'
          ? {
              ...event,
              _matchedConfig: { entity: 'calendar.personal', split_multiday_events: false },
            }
          : event,
      );

    it('ignores a per-entity opt-out, because a column cannot lie about its own day', () => {
      const container = renderColumnContainer(optedOutOfSplitting(), buildConfig());
      const covered = Array.from(container.querySelectorAll('.day-column')).filter((column) =>
        column.textContent?.includes('Conference'),
      );

      expect(covered.length).toBe(2);
      // Both segments carry the per-entity config through the split, so a later change
      // that re-reads it downstream cannot quietly undo this.
      for (const column of covered) {
        expect(column.textContent).not.toContain('until');
      }
    });

    it('still honours a per-entity opt-out in list view', () => {
      // Top-level `true` so the opt-out is the only thing that can hold the event
      // together; with the default `false` the event would stay whole either way and
      // the test would pass without asserting anything.
      const container = renderListContainer(
        optedOutOfSplitting(),
        buildConfig({ split_multiday_events: true }),
      );
      const appearances = (container.textContent ?? '').split('Conference').length - 1;

      expect(appearances).toBe(1);
      expect(container.textContent).toContain('until');
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
      // Without an assertion here the indicator could be dropped from the column view
      // silently -- nothing else in the suite would notice.
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

    /**
     * The inline placement, and the reason it exists.
     *
     * The list view floats the indicator inside its date cell using
     * `today_indicator_position` as a percentage pair, which works because that cell is
     * roughly 66px wide and centre-aligned -- 15% lands the dot in the margin beside
     * the date. A column header is the full track width with its date flush left, so
     * the same 15% resolves *into* the day number. Column view therefore drops
     * percentage positioning and emits the indicator as a leading item on the weekday
     * row instead.
     *
     * Asserting the absence of `position:absolute` is the load-bearing half: an inline
     * indicator that kept it would be pulled out of flow and land back on top of the
     * date, which is the exact defect this replaced and which looks fine in a DOM
     * snapshot.
     */
    it('places the column-view indicator inline rather than by percentage', () => {
      const container = renderColumnContainer(
        EVENTS,
        buildConfig({ today_indicator: 'dot', today_indicator_position: '15% 50%' }),
      ) as HTMLElement;

      const indicator = container.querySelector('.today-indicator');
      expect(indicator).not.toBeNull();

      const style = indicator?.getAttribute('style') ?? '';
      expect(style).not.toContain('position:absolute');
      expect(style).not.toContain('15%');

      const wrapper = indicator?.closest('.today-indicator-container');
      expect(wrapper?.classList.contains('inline')).toBe(true);
      expect(wrapper?.closest('.column-date-content')).not.toBeNull();
    });

    it("marks the date content so the weekday can reserve the indicator's width", () => {
      // The dot shares the weekday's grid cell, so the weekday needs padding out of
      // its way. That padding hangs off this class rather than off :has(), because the
      // renderer knows more than isToday does -- the indicator also declines to render
      // for type `none`, and a class driven by isToday alone would pad a gap with
      // nothing in it.
      const withIndicator = renderColumnContainer(
        EVENTS,
        buildConfig({ today_indicator: 'dot' }),
      ) as HTMLElement;

      const todayContent = withIndicator
        .querySelector('.day-column.today')
        ?.querySelector('.column-date-content');
      expect(todayContent?.classList.contains('with-today-indicator')).toBe(true);

      const otherContent = withIndicator
        .querySelector('.day-column:not(.today)')
        ?.querySelector('.column-date-content');
      expect(otherContent?.classList.contains('with-today-indicator')).toBe(false);
    });

    it('does not mark the date content when the value resolves to no indicator', () => {
      // A truthy value that is neither a string nor a boolean -- YAML types an
      // unquoted `1` this way -- passes the enabled check and then resolves to type
      // `none`, so nothing renders. This is the case that separates a class driven by
      // the render result from one driven by isToday: the latter would pad the weekday
      // out of the way of a dot that is not there.
      const container = renderColumnContainer(
        EVENTS,
        buildConfig({ today_indicator: 1 as unknown as string }),
      ) as HTMLElement;

      expect(container.querySelectorAll('.today-indicator').length).toBe(0);
      expect(container.querySelectorAll('.with-today-indicator').length).toBe(0);
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
