import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, WEATHER, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { lookup } from '../src/rendering/editor/localize';
import { TIME_POSITION_OPTIONS, buildEventsSchema } from '../src/rendering/editor/schemas/events';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import * as Helpers from '../src/utils/helpers';

/**
 * `time_position`: the time row below the title, as every release drew it, or as the title
 * row's last item.
 *
 * The placement is a DOM move and a block of CSS. The CSS is pinned in
 * tests/stylesheet.test.ts; this file holds the move to three claims:
 *
 * - **Off, nothing changes.** The default, `below`, and every value the resolver does not
 *   recognize, render the markup the card always drew. The list and column DOM snapshots
 *   are the strong form of that for the default; this checks the fallbacks against it.
 * - **On, only the time row moves**, and only on a row that has one. The moved `.time` is
 *   the element `renderEventContent` draws below the title, unchanged, and everything else
 *   in the row is unchanged too. That is checked by reconciling the two renders of every
 *   row in a corpus, rather than by listing what each row should hold, because the opt-in
 *   markup is a second copy of the default's and the way two copies fail is by drifting.
 * - **Each view decides for itself**, through `list:` and `column:`, and grid never moves
 *   anything (tests/view-scope-inert.test.ts).
 */

type AgendaView = 'list' | 'column';

/** Events the shared fixture lacks: a description, for the row below the location. */
const WITH_DESCRIPTION: Types.CalendarEventData[] = EVENTS.map((event, index) =>
  index === 3 ? { ...event, description: 'Bring the referral letter' } : event,
);

/**
 * Render one agenda view the way the card does, with the view's effective config.
 *
 * `overrides` is loosely typed on purpose: several cases write values the option's type
 * refuses, which is what a hand-written YAML card can hold.
 */
function render(
  view: AgendaView,
  overrides: Record<string, unknown> = {},
  events: Types.CalendarEventData[] = WITH_DESCRIPTION,
  eventsTappable = false,
): HTMLElement {
  const config = buildConfig({ view, ...overrides } as Partial<Types.Config>);
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(events, config, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'column'
      ? Render.renderColumnGroupedEvents(days, effective, 'en', WEATHER, null, eventsTappable)
      : Render.renderGroupedEvents(days, effective, 'en', WEATHER, null, eventsTappable),
    container,
  );
  return container;
}

/** Every event body, in document order. */
function bodies(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.event-content')];
}

/** The bodies whose time row moved up beside the title. */
function moved(container: HTMLElement): HTMLElement[] {
  return bodies(container).filter((body) => body.classList.contains('time-beside-title'));
}

/**
 * Markup with Lit's markers gone and the whitespace between tags reduced to one line break.
 *
 * Kept as a break rather than removed, so whitespace present on one side and absent on the
 * other still differs; only its amount is ignored, which no flex row and no line start can
 * see. Text-adjacent whitespace is left exactly as it is.
 */
function normalize(markup: string): string {
  return markup.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '>\n<');
}

/** The title of an event body, for messages. */
function titleOf(body: Element): string {
  return body.querySelector('.event-title')?.textContent?.trim() ?? '(no title)';
}

describe('time_position', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the resolver', () => {
    it.each([
      ['below', 'below'],
      ['title', 'title'],
      [' Title ', 'title'],
      ['BELOW', 'below'],
    ])('reads %j as %j', (value, expected) => {
      expect(Helpers.resolveTimePosition(value)).toBe(expected);
    });

    it.each([undefined, null, true, false, 0, 1, '', 'beside', 'time', 'above', {}, ['title']])(
      'falls back to below for %j',
      (value) => {
        expect(Helpers.resolveTimePosition(value)).toBe('below');
      },
    );

    it('agrees with the default the card merges in, and with the editor', () => {
      expect(Helpers.TIME_POSITIONS).toEqual(['below', 'title']);
      expect(Config.DEFAULT_CONFIG.time_position).toBe(Helpers.DEFAULT_TIME_POSITION);
      expect(Helpers.resolveTimePosition(Config.DEFAULT_CONFIG.time_position)).toBe('below');
      // The dropdown offers the closed set, in its order, and nothing it would discard.
      expect(TIME_POSITION_OPTIONS).toEqual([...Helpers.TIME_POSITIONS]);
    });
  });

  describe('the editor field', () => {
    /** The Events panel's top-level nodes, as the editor builds them for one config. */
    function eventsPanel(overrides: Record<string, unknown> = {}) {
      return buildEventsSchema({
        config: buildConfig(overrides as Partial<Types.Config>),
        language: 'en',
        view: 'list',
      });
    }

    it.each([true, false])('sits directly under show_time, with times on: %s', (showTime) => {
      // Times off is the case that decides the placement: the Time group is withheld then,
      // and the choice still moves a countdown-only row.
      const names = eventsPanel({ show_time: showTime }).map(
        (node) => (node as { name?: string }).name,
      );
      expect(names[names.indexOf('show_time') + 1]).toBe('time_position');
    });

    it('names both places, the shipped one first, and says narrow rows keep the time below', () => {
      const field = eventsPanel().find(
        (node) => (node as { name?: string }).name === 'time_position',
      ) as unknown as {
        selector: { select: { options: Array<{ value: string; label: string }> } };
      };

      expect(field.selector.select.options).toEqual([
        { value: 'below', label: 'Below the title' },
        { value: 'title', label: 'Beside the title when there is room' },
      ]);
      expect(lookup('en', 'time_position')).toBe('Time Position');
      expect(lookup('en', 'time_position.helper')).toMatch(/stays below the title/);
    });
  });

  describe('off', () => {
    it.each(['list', 'column'] as const)('draws no placement class in %s view', (view) => {
      const container = render(view, { show_countdown: true, show_progress_bar: true });
      expect(bodies(container).length).toBeGreaterThan(4);
      expect(moved(container)).toEqual([]);
      expect(container.querySelector('.title-time-row')).toBeNull();
      expect(container.querySelector('.summary-row > .time')).toBeNull();
    });

    it.each([
      ['an explicit below', { time_position: 'below' }],
      ['an unknown word', { time_position: 'beside' }],
      ['a YAML boolean', { time_position: true }],
      ['an unknown word in list:', { list: { time_position: 'nonsense' } }],
      ['a number in column:', { column: { time_position: 42 } }],
      // Accepted in time_grid: as every shared key is, and read by neither agenda view.
      ['title in time_grid:', { time_grid: { time_position: 'title' } }],
    ])('renders %s exactly as the default', (_name, overrides) => {
      const shared = { show_countdown: true, show_progress_bar: true };
      for (const view of ['list', 'column'] as const) {
        expect(render(view, { ...shared, ...overrides }).innerHTML, view).toBe(
          render(view, shared).innerHTML,
        );
      }
    });
  });

  describe('each view on its own', () => {
    it('moves the time in list view alone when list: asks for it', () => {
      const config = { list: { time_position: 'title' } };
      expect(moved(render('list', config)).length).toBeGreaterThan(0);
      expect(moved(render('column', config))).toEqual([]);
    });

    it('moves the time in column view alone when column: asks for it', () => {
      const config = { column: { time_position: 'title' } };
      expect(moved(render('column', config)).length).toBeGreaterThan(0);
      expect(moved(render('list', config))).toEqual([]);
    });

    it('lets a view block keep the time below under a card-wide title', () => {
      const config = { time_position: 'title', column: { time_position: 'below' } };
      expect(moved(render('list', config)).length).toBeGreaterThan(0);
      expect(moved(render('column', config))).toEqual([]);
    });
  });

  describe('on', () => {
    const DETAILS = {
      time_position: 'title',
      show_countdown: true,
      show_progress_bar: true,
      show_description: true,
      weather: { entity: 'weather.home', position: 'event' },
    };

    it('puts the time row after the whole title row, the weather badge kept inside it', () => {
      const container = render('list', DETAILS);
      const rows = moved(container);
      expect(rows.length).toBeGreaterThan(4);

      for (const body of rows) {
        // The title row and the time are the only two items of the row that wraps, so the
        // time is the one thing that can move to a line of its own.
        const outer = body.querySelector(':scope > .title-time-row')!;
        expect(
          [...outer.children].map((child) => child.className),
          titleOf(body),
        ).toEqual(['summary-row', 'time']);
        expect(body.querySelector(':scope > .time-location > .time'), titleOf(body)).toBeNull();
      }

      // A row that carries the badge: it stays in the title row, after the title, as it is
      // drawn below the time, so nothing can wrap it away from the title.
      const withWeather = rows.filter((body) =>
        body.querySelector('.summary-row > .event-weather'),
      );
      expect(withWeather.length).toBeGreaterThan(0);
      for (const body of withWeather) {
        expect(
          [...body.querySelector('.title-time-row > .summary-row')!.children].map(
            (child) => child.className,
          ),
        ).toEqual(['summary', 'event-weather']);
      }
    });

    it('takes the countdown and the inline bar along in list view, and nothing else', () => {
      const rows = moved(render('list', DETAILS));
      const running = rows.find((body) => titleOf(body) === 'Currently running review')!;
      const upcoming = rows.find((body) => titleOf(body) === 'Upcoming one-to-one')!;
      const dentist = rows.find((body) => titleOf(body) === 'Dentist')!;

      expect(running.querySelector('.title-time-row > .time > .progress-bar')).not.toBeNull();
      expect(upcoming.querySelector('.title-time-row > .time > .time-countdown')).not.toBeNull();
      // Location and description stay below, in their order.
      expect(
        [...dentist.querySelector(':scope > .time-location')!.children].map((c) => c.className),
      ).toEqual(['location', 'description']);
    });

    it('keeps the folded countdown in the time, and the bar and weather rows below, in column view', () => {
      const rows = moved(
        render('column', { ...DETAILS, weather: { entity: 'weather.home', position: 'both' } }),
      );
      const running = rows.find((body) => titleOf(body) === 'Currently running review')!;
      const upcoming = rows.find((body) => titleOf(body) === 'Upcoming one-to-one')!;

      expect(
        upcoming.querySelector(
          '.title-time-row > .time > .time-actual > .time-text > .time-countdown',
        ),
      ).not.toBeNull();
      expect(running.querySelector('.title-time-row .progress-bar')).toBeNull();
      // The bar's own row and the weather row stay in .time-location, in their order.
      expect(
        [...running.querySelector(':scope > .time-location')!.children].map((c) => c.className),
      ).toEqual(['progress-bar progress-bar-row', 'event-weather']);
    });

    it.each(['list', 'column'] as const)(
      'moves a countdown-only time row with times off, in %s view',
      (view) => {
        const rows = moved(
          render(view, { time_position: 'title', show_time: false, show_countdown: true }),
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const body of rows) {
          const time = body.querySelector('.title-time-row > .time')!;
          expect(time.querySelector(':scope > .time-actual')!.children, titleOf(body)).toHaveLength(
            0,
          );
          expect(time.querySelector(':scope > .time-countdown'), titleOf(body)).not.toBeNull();
        }
      },
    );

    it("moves list view's bar-only row with times off, and leaves column view's bar row alone", () => {
      const config = { time_position: 'title', show_time: false, show_progress_bar: true };

      const list = moved(render('list', config));
      expect(list.map(titleOf)).toEqual(['Currently running review']);
      expect(list[0].querySelector('.title-time-row > .time > .progress-bar')).not.toBeNull();

      // Column's bar has a row of its own, so with times off there is no time row to move.
      const column = render('column', config);
      expect(moved(column)).toEqual([]);
      expect(column.innerHTML).toBe(
        render('column', { ...config, time_position: 'below' }).innerHTML,
      );
    });

    it.each(['list', 'column'] as const)('leaves an empty day as it was, in %s view', (view) => {
      const config = { time_position: 'title', show_empty_days: true, days_to_show: 5 };
      const on = bodies(render(view, config)).filter((body) =>
        body.querySelector('.empty-day-title'),
      );
      const off = bodies(render(view, { ...config, time_position: 'below' })).filter((body) =>
        body.querySelector('.empty-day-title'),
      );

      expect(on.length).toBeGreaterThan(0);
      expect(on.map((body) => body.outerHTML)).toEqual(off.map((body) => body.outerHTML));
    });
  });

  /**
   * Both renders of every row, held against each other. Each configuration is chosen to
   * draw a different shape of time row, or a different neighbor for it.
   */
  describe('moves the time row and nothing else', () => {
    const LABELED: Record<string, unknown> = {
      entities: [{ entity: 'calendar.personal', label: 'mdi:star' }],
    };
    const CORPUS: Array<[string, Record<string, unknown>]> = [
      ['the base', {}],
      ['countdown and bar', { show_countdown: true, show_progress_bar: true }],
      ['times off, countdown', { show_time: false, show_countdown: true }],
      ['times off, bar', { show_time: false, show_progress_bar: true }],
      ['all-day badge on the time', { allday_badge: 'time', show_countdown: true }],
      ['all-day badge on the title', { allday_badge: 'title' }],
      ['no now indicator', { show_now_indicator: false }],
      ['descriptions', { show_description: true }],
      ['title weather', { weather: { entity: 'weather.home', position: 'event' } }],
      ['scrolling titles', { scroll_long_titles: true }],
      ['a title line limit', { title_max_lines: 1, time_max_lines: 1 }],
      ['an icon label', LABELED],
      ['unsplit multi-day', { split_multiday_events: false, show_countdown: true }],
      ['empty days', { show_empty_days: true, days_to_show: 5 }],
      ['links', { open_links: true }],
    ];

    it.each(
      CORPUS.flatMap(([name, overrides]) =>
        (['list', 'column'] as const).flatMap((view) =>
          [false, true].map((tappable) => [name, view, tappable, overrides] as const),
        ),
      ),
    )('%s, %s view, tappable %s', (_name, view, tappable, overrides) => {
      const below = bodies(render(view, overrides, WITH_DESCRIPTION, tappable));
      const title = bodies(
        render(view, { ...overrides, time_position: 'title' }, WITH_DESCRIPTION, tappable),
      );
      expect(title).toHaveLength(below.length);

      const withTime = below.filter((body) =>
        body.querySelector(':scope > .time-location > .time'),
      );
      let movedRows = 0;
      below.forEach((before, index) => {
        const after = title[index];
        const label = `${titleOf(before)} (${index})`;

        if (!after.classList.contains('time-beside-title')) {
          // Nothing to move: the row is the default's, byte for byte.
          expect(before.querySelector('.time'), label).toBeNull();
          expect(after.outerHTML, label).toBe(before.outerHTML);
          return;
        }
        movedRows += 1;

        // The row that moved is the one that was below, unchanged.
        const time = after.querySelector(':scope > .title-time-row > .time')!;
        const original = before.querySelector(':scope > .time-location > .time')!;
        expect(original, label).not.toBeNull();
        expect(time.nextElementSibling, label).toBeNull();
        expect(normalize(time.outerHTML), label).toBe(normalize(original.outerHTML));

        // And with it taken out of both, and the row that held it unwrapped, the rest of the
        // row is the default's: the title row included, weather badge and all.
        const rest = after.cloneNode(true) as HTMLElement;
        const restBefore = before.cloneNode(true) as HTMLElement;
        const outer = rest.querySelector(':scope > .title-time-row')!;
        outer.querySelector(':scope > .time')!.remove();
        outer.replaceWith(...outer.childNodes);
        restBefore.querySelector(':scope > .time-location > .time')!.remove();
        rest.classList.remove('time-beside-title');
        expect(normalize(rest.outerHTML), label).toBe(normalize(restBefore.outerHTML));
      });

      // Every row with a time row moved it, and only those.
      expect(movedRows).toBe(withTime.length);
      // Every configuration here draws a time row somewhere, so a zero is a broken render,
      // bar one: column view's bar has a row of its own, so with times off nothing is left
      // to move, which the first branch above has just checked row by row.
      if (view === 'column' && overrides.show_time === false && !overrides.show_countdown) {
        expect(withTime).toEqual([]);
      } else {
        expect(withTime.length).toBeGreaterThan(0);
      }
    });
  });

  describe('a merged row with several glyph labels', () => {
    /** The same event from each calendar, so `filter_duplicates` merges them into one row. */
    function shared(entityId: string): Types.CalendarEventData {
      return {
        summary: 'Team lunch',
        start: { dateTime: '2026-06-17T11:00:00.000Z' },
        end: { dateTime: '2026-06-17T12:00:00.000Z' },
        _entityId: entityId,
      };
    }

    function roomFor(labels: string[], view: AgendaView = 'list'): string | null {
      const entities = labels.map((label, index) => ({ entity: `calendar.c${index}`, label }));
      const container = render(
        view,
        { time_position: 'title', filter_duplicates: true, entities },
        entities.map(({ entity }) => shared(entity)),
      );
      // One merged row; column view draws its empty days beside it.
      const lunch = bodies(container).filter((body) => titleOf(body) === 'Team lunch');
      expect(lunch).toHaveLength(1);
      return lunch[0].querySelector('.title-time-row')!.getAttribute('style');
    }

    it('widens the title room by every glyph after the first', () => {
      expect(roomFor(['mdi:star', 'mdi:heart'])).toBe(
        '--calendar-card-title-label-room: calc(1em + 4px)',
      );
      expect(roomFor(['🎾', 'mdi:star', '🎉'], 'column')).toBe(
        '--calendar-card-title-label-room: calc(2.25em + 8px)',
      );
    });

    it('adds nothing for one glyph, which hangs in the indent, or for prose', () => {
      expect(roomFor(['mdi:star', 'Work'])).toBeNull();
      expect(roomFor(['Anna', 'Ben'])).toBeNull();
    });

    it('is drawn only beside a moved time', () => {
      const entities = [
        { entity: 'calendar.c0', label: 'mdi:star' },
        { entity: 'calendar.c1', label: 'mdi:heart' },
      ];
      const container = render('list', { filter_duplicates: true, entities }, [
        shared('calendar.c0'),
        shared('calendar.c1'),
      ]);
      expect(container.querySelector('.title-time-row')).toBeNull();
      expect(container.querySelector('.summary')!.hasAttribute('style')).toBe(false);
    });
  });
});
