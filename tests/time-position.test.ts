import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, WEATHER, buildConfig } from './fixtures';
import { withoutComments } from './helpers/without-comments';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { lookup } from '../src/rendering/editor/localize';
import { TIME_POSITION_OPTIONS, buildEventsSchema } from '../src/rendering/editor/schemas/events';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import * as Helpers from '../src/utils/helpers';

/**
 * `time_position`: the time row below the title, as every release drew it, or at the end of the
 * title's line.
 *
 * The placement is a second shape of the event body and a block of CSS. The CSS is pinned in
 * tests/stylesheet.test.ts; this file holds the markup to four claims. Both files are about
 * markup and declarations only: happy-dom lays nothing out, so where the time lands on screen,
 * how many lines it takes and how much title is left were measured in browsers, not here.
 *
 * - **Off, nothing changes.** The default, `below`, and every value the resolver does not
 *   recognize, render the markup the card always drew. The list and column DOM snapshots are
 *   the strong form of that for the default; this checks the fallbacks against it.
 * - **On, the time is drawn in the title's row**, on every row that has a time or a countdown,
 *   without its clock, after list view's weather badge. By default the title wraps, and an empty
 *   room the card sizes to the time ends its text (tests/title-fit.test.ts holds the sizing);
 *   `title_max_lines` of two or more marks the row for the card to cut. With
 *   `title_max_lines: 1` or `scroll_long_titles` the title is kept to one line instead, carrying
 *   text the card can move only with that option on; off, it ends in "…" where it is too long.
 *   Nothing trails the time: list view folds its countdown into the time text and draws its bar
 *   as a row of its own, as column view always has.
 * - **Nothing else changes.** Checked by reconciling renders rather than by listing what each
 *   row should hold, because the title-line markup is a second copy of the default's and the
 *   way two copies fail is by drifting: column view's rows against the title below the time,
 *   or against the scrolling default where the title is kept to one line, with the clock taken
 *   out, and the moving text too where the title only keeps to its line, and list view's against
 *   column view's, which its leaf now draws the same way.
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

/** The bodies whose time sits on the title's line. */
function moved(container: HTMLElement): HTMLElement[] {
  return bodies(container).filter((body) => body.classList.contains('time-beside-title'));
}

/**
 * An element's markup with Lit's markers gone and the whitespace between tags reduced to one
 * line break, or nothing where there is no element.
 *
 * Kept as a break rather than removed, so whitespace present on one side and absent on the
 * other still differs; only its amount is ignored, which no flex row and no line start can
 * see. Text-adjacent whitespace is left exactly as it is.
 */
function normalize(element: Element | null): string {
  return element ? withoutComments(element).outerHTML.replace(/>\s+</g, '>\n<') : '';
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
      // and the choice still puts a countdown beside the title.
      const names = eventsPanel({ show_time: showTime }).map(
        (node) => (node as { name?: string }).name,
      );
      expect(names[names.indexOf('show_time') + 1]).toBe('time_position');
    });

    it('names both places, the shipped one first, and warns what the title line needs', () => {
      const field = eventsPanel().find(
        (node) => (node as { name?: string }).name === 'time_position',
      ) as unknown as {
        selector: { select: { options: Array<{ value: string; label: string }> } };
      };

      expect(field.selector.select.options).toEqual([
        { value: 'below', label: 'Below the title' },
        { value: 'title', label: 'Beside the title' },
      ]);
      expect(lookup('en', 'time_position')).toBe('Time Position');
      const helper = lookup('en', 'time_position.helper');
      expect(helper).toMatch(/^Puts the time on the title's line, without its clock\./);
      // The wrap, and where the time goes when the last line has no room.
      expect(helper).toMatch(
        /A long title wraps, and the time ends its last line, or takes a line of its own where it does not fit\./,
      );
      // The two settings that keep it shorter, by the names the editor gives them.
      expect(helper).toMatch(
        /Title Line Limit cuts a longer title with the time at the end of its last line, so 1 keeps both on one line\./,
      );
      expect(helper).toMatch(/Scroll Long Titles keeps the title on one line and scrolls it\./);
      // The warning, now about the one line only: it needs width, and the extras that raise how
      // much.
      expect(helper).toMatch(/On one line, the title needs a wide event row: in narrow cards/);
      expect(helper).toMatch(/countdowns, event weather or long text labels/);
      expect(helper).toMatch(/it can shrink to a few characters\.$/);
      // And the option that keeps a title on one line says so where a reader looks for why.
      expect(lookup('en', 'scroll_long_titles.helper')).toMatch(
        /With the time beside the title, this keeps the title on one line beside it, where it otherwise wraps\.$/,
      );
    });
  });

  it('names both settings that shorten the title in every translated helper', () => {
    // `lookup` falls back to English, which would hide a file still holding the earlier helper,
    // so the files are read as they are. The earlier text said the line limit did not apply; the
    // current one names it, and the scrolling option, by the labels that file gives them, or by
    // the English one where a file has none. A shape check, not a translation review.
    const dir = join(process.cwd(), 'src/rendering/editor/translations');
    const files = readdirSync(dir).filter(
      (file) => file.endsWith('.json') && file !== 'en-GB.json',
    );
    expect(files).toHaveLength(10);
    for (const file of files) {
      const strings = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, string>;
      const helper = strings['time_position.helper'];
      expect(helper, file).toBeDefined();
      expect(helper, file).toContain(strings['title_max_lines'] ?? lookup('en', 'title_max_lines'));
      expect(helper, file).toContain(
        strings['scroll_long_titles'] ?? lookup('en', 'scroll_long_titles'),
      );
      expect(helper, file).toMatch(/1/);
      expect(helper, file).not.toMatch(/60/);
    }
  });

  describe('off', () => {
    it.each(['list', 'column'] as const)('draws no placement class in %s view', (view) => {
      const container = render(view, { show_countdown: true, show_progress_bar: true });
      expect(bodies(container).length).toBeGreaterThan(4);
      expect(moved(container)).toEqual([]);
      expect(container.querySelector('.title-aside')).toBeNull();
      expect(container.querySelector('.summary-row .time')).toBeNull();
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

    it.each([
      ['list', {}, 'summary-row title-wrap', 'summary'],
      ['column', {}, 'summary-row title-wrap', 'summary'],
      ['list', { title_max_lines: 2 }, 'summary-row title-wrap title-capped', 'summary'],
      ['column', { title_max_lines: 3 }, 'summary-row title-wrap title-capped', 'summary'],
      ['list', { title_max_lines: 1 }, 'summary-row', 'summary summary-scroll'],
      ['column', { scroll_long_titles: true }, 'summary-row', 'summary summary-scroll'],
    ] as const)(
      "draws the title line in %s view with %o: the title, then the time's box",
      (view, overrides, rowClass, summaryClass) => {
        const rows = moved(render(view, { ...DETAILS, ...overrides }));
        expect(rows.length).toBeGreaterThan(4);
        for (const body of rows) {
          const line = body.querySelector(':scope > .summary-row')!;
          expect(line.className, titleOf(body)).toBe(rowClass);
          expect(
            [...line.children].map((child) => child.className),
            titleOf(body),
          ).toEqual([summaryClass, 'title-aside']);
          // The time is the box's last item, and the only time in the row.
          const aside = line.querySelector(':scope > .title-aside')!;
          expect(aside.lastElementChild!.className, titleOf(body)).toBe('time');
          expect(body.querySelectorAll('.time'), titleOf(body)).toHaveLength(1);
          // A wrapping title ends in the empty room the card sizes to the time, right after the
          // title: a space between them would be text on the title's last line. Its box opens
          // with the strut, a word joiner hidden from screen readers that holds the title's
          // baseline; a one-line title's box has none.
          const room = line.querySelector('.title-room');
          const strut = aside.querySelector('.title-strut');
          if (rowClass.includes('title-wrap')) {
            expect(aside.firstElementChild, titleOf(body)).toBe(strut);
            expect(strut!.textContent, titleOf(body)).toBe('\u2060');
            expect(strut!.getAttribute('aria-hidden'), titleOf(body)).toBe('true');
            expect(room?.parentElement?.lastElementChild, titleOf(body)).toBe(room);
            expect(room!.childNodes, titleOf(body)).toHaveLength(0);
            expect(room!.previousSibling, titleOf(body)).toBe(
              line.querySelector('.summary > .event-title'),
            );
          } else {
            expect(room, titleOf(body)).toBeNull();
            expect(strut, titleOf(body)).toBeNull();
          }
        }
      },
    );

    it("puts list view's weather badge first in the box, where it draws one, and nowhere else", () => {
      const rows = moved(render('list', DETAILS));
      // After the strut, which holds the title's baseline and draws nothing.
      const boxes = rows.map((body) =>
        [...body.querySelectorAll('.title-aside > :not(.title-strut)')].map(
          (child) => child.className,
        ),
      );
      for (const body of rows) {
        expect(body.querySelector('.title-aside')!.firstElementChild!.className).toBe(
          'title-strut',
        );
      }
      // The bullet between the two is the stylesheet's, on .event-weather + .time, so a row
      // without a forecast has no badge and no bullet.
      expect(boxes).toContainEqual(['event-weather', 'time']);
      for (const box of boxes) expect([['event-weather', 'time'], ['time']]).toContainEqual(box);
      // The badge is the one the title row draws below the title, unchanged.
      const below = bodies(render('list', { ...DETAILS, time_position: 'below' }));
      const badges = (list: HTMLElement[]) =>
        list.map((body) => normalize(body.querySelector('.event-weather')));
      expect(badges(rows)).toEqual(
        badges(below.filter((body) => body.querySelector('.time-location > .time'))),
      );
      // Without weather, no box holds a badge.
      for (const body of moved(render('list', { ...DETAILS, weather: undefined }))) {
        expect(body.querySelector('.title-aside > .event-weather'), titleOf(body)).toBeNull();
      }
      // Column view draws its weather as a row below, as it always has.
      for (const body of moved(render('column', DETAILS))) {
        expect(body.querySelector('.title-aside > .event-weather'), titleOf(body)).toBeNull();
      }
    });

    it.each([
      ['by default', {}],
      ['with scroll_long_titles off', { scroll_long_titles: false }],
      ['under a limit of two lines', { title_max_lines: 2 }],
    ])('lets every title beside a time wrap, %s', (_name, overrides) => {
      for (const view of ['list', 'column'] as const) {
        const rows = moved(render(view, { ...DETAILS, ...overrides }));
        expect(rows.length, view).toBeGreaterThan(4);
        for (const body of rows) {
          // The title as it is below the time: no one-line viewport, nothing the card can move.
          const title = body.querySelector('.summary-row.title-wrap > .summary > .event-title');
          expect(title?.className.trim(), titleOf(body)).toBe('event-title');
          expect(body.querySelector('.summary-scroll'), titleOf(body)).toBeNull();
          expect(title!.textContent!.trim(), titleOf(body)).not.toBe('');
        }
        expect(render(view, { ...DETAILS, ...overrides }).querySelector('.title-scrollable')).toBe(
          null,
        );
      }
    });

    it.each([
      ['by default', {}],
      ['with scroll_long_titles off', { scroll_long_titles: false }],
    ])(
      'keeps every title beside a time to its line, still, with a limit of one, %s',
      (_name, extra) => {
        const overrides = { ...extra, title_max_lines: 1 };
        for (const view of ['list', 'column'] as const) {
          const rows = moved(render(view, { ...DETAILS, ...overrides }));
          expect(rows.length, view).toBeGreaterThan(4);
          for (const body of rows) {
            // The one-line viewport the stylesheet ends in "…", with no text in it the card can
            // move: the measurement step and the motion controller key on that inner span.
            const title = body.querySelector(
              '.summary-row > .summary.summary-scroll > .event-title',
            );
            expect(title?.classList.contains('title-scrollable'), titleOf(body)).toBe(true);
            expect(title!.querySelector('.event-title-scroll'), titleOf(body)).toBeNull();
            expect(title!.textContent!.trim(), titleOf(body)).not.toBe('');
          }
          // The same options below the title leave titles wrapping.
          const below = render(view, { ...DETAILS, ...overrides, time_position: 'below' });
          expect(below.querySelector('.title-scrollable'), view).toBeNull();
        }
      },
    );

    it.each([
      ['card-wide', { scroll_long_titles: true }],
      ['under a title line limit', { scroll_long_titles: true, title_max_lines: 2 }],
    ])('scrolls every title beside a time with scroll_long_titles on, %s', (_name, overrides) => {
      for (const view of ['list', 'column'] as const) {
        const rows = moved(render(view, { ...DETAILS, ...overrides }));
        expect(rows.length, view).toBeGreaterThan(4);
        for (const body of rows) {
          const title = body.querySelector('.summary-row > .summary.summary-scroll > .event-title');
          expect(title?.classList.contains('title-scrollable'), titleOf(body)).toBe(true);
          expect(
            title!.querySelector(':scope > .event-title-scroll'),
            titleOf(body),
          ).not.toBeNull();
        }
      }
    });

    it('scrolls titles beside a time only in the view whose block turns scrolling on', () => {
      const config = { ...DETAILS, scroll_long_titles: false, list: { scroll_long_titles: true } };
      const scrolling = (view: AgendaView) =>
        moved(render(view, config)).map(
          (body) => body.querySelector('.summary-row .event-title > .event-title-scroll') !== null,
        );
      expect(scrolling('list').length).toBeGreaterThan(4);
      expect(new Set(scrolling('list'))).toEqual(new Set([true]));
      expect(scrolling('column').length).toBeGreaterThan(4);
      expect(new Set(scrolling('column'))).toEqual(new Set([false]));
    });

    it('draws no clock beside the title, and keeps the running event\'s "Now"', () => {
      for (const view of ['list', 'column'] as const) {
        const container = render(view, DETAILS);
        expect(container.querySelector('.title-aside > .time ha-icon'), view).toBeNull();
        const running = moved(container).find(
          (body) => titleOf(body) === 'Currently running review',
        )!;
        expect(
          running.querySelector('.title-aside .now-time > .now-indicator'),
          view,
        ).not.toBeNull();
        // Below the title every time has its clock, so the check above can fail.
        const below = render(view, { ...DETAILS, time_position: 'below' });
        expect(below.querySelectorAll('.time-actual > ha-icon').length, view).toBeGreaterThan(4);
      }
    });

    it('folds the countdown into the time text in list view, as column view does', () => {
      const rows = moved(render('list', DETAILS));
      const upcoming = rows.find((body) => titleOf(body) === 'Upcoming one-to-one')!;
      expect(
        upcoming.querySelector('.title-aside > .time > .time-actual > .time-text > .time-countdown')
          ?.textContent,
      ).toBe('in 4 hours');
      // Nothing trails the time in any row.
      for (const body of rows) {
        expect(body.querySelector('.time > .time-actual + *'), titleOf(body)).toBeNull();
      }
      // Below the title, list view trails it.
      const below = bodies(render('list', { ...DETAILS, time_position: 'below' }));
      expect(
        below.some((body) => body.querySelector('.time > .time-actual + .time-countdown')),
      ).toBe(true);
    });

    it('draws the progress bar on a row of its own in list view, as column view does', () => {
      const running = moved(render('list', DETAILS)).find(
        (body) => titleOf(body) === 'Currently running review',
      )!;
      expect(running.querySelector('.time .progress-bar')).toBeNull();
      expect(
        [...running.querySelector(':scope > .time-location')!.children].map((c) => c.className),
      ).toEqual(['progress-bar progress-bar-row']);
      // Below the title, list view draws it inline.
      const below = bodies(render('list', { ...DETAILS, time_position: 'below' })).find(
        (body) => titleOf(body) === 'Currently running review',
      )!;
      expect(below.querySelector('.time > .progress-bar')).not.toBeNull();
    });

    it('keeps the location and description below, in their order', () => {
      for (const view of ['list', 'column'] as const) {
        const dentist = moved(render(view, { ...DETAILS, weather: undefined })).find(
          (body) => titleOf(body) === 'Dentist',
        )!;
        expect(
          [...dentist.querySelector(':scope > .time-location')!.children].map((c) => c.className),
          view,
        ).toEqual(['location', 'description']);
      }
    });

    it.each(['list', 'column'] as const)(
      'puts the countdown alone beside the title with times off, in %s view',
      (view) => {
        const rows = moved(
          render(view, { time_position: 'title', show_time: false, show_countdown: true }),
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const body of rows) {
          const time = body.querySelector('.title-aside > .time')!;
          expect(
            [...time.children].map((child) => child.className),
            titleOf(body),
          ).toEqual(['time-countdown']);
        }
      },
    );

    it('leaves a row with nothing beside the title in the shape below, its bar on a row', () => {
      // Times off and no countdown: the running event's bar is all its time row held.
      const config = { time_position: 'title', show_time: false, show_progress_bar: true };
      for (const view of ['list', 'column'] as const) {
        const container = render(view, config);
        expect(moved(container), view).toEqual([]);
        expect(container.querySelector('.title-scrollable'), view).toBeNull();
        const running = bodies(container).find(
          (body) => titleOf(body) === 'Currently running review',
        )!;
        expect(running.querySelector('.time'), view).toBeNull();
        expect(running.querySelector('.time-location > .progress-bar-row'), view).not.toBeNull();
      }
      // Column view draws it so below the title too, so its rows are the default's exactly.
      expect(render('column', config).innerHTML).toBe(
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

    it('gives a capped title its own direction, as it has below the time, and a wrapping one none', () => {
      const hebrew: Types.CalendarEventData = {
        summary: 'סקירת תכנון רבעונית עם השותפים לעיצוב',
        start: { dateTime: '2026-06-17T11:00:00.000Z' },
        end: { dateTime: '2026-06-17T12:00:00.000Z' },
      };
      const summaryDir = (overrides: Record<string, unknown>) =>
        render('list', { time_position: 'title', ...overrides }, [hebrew])
          .querySelector('.event-content .summary')
          ?.getAttribute('dir');
      // A cut ends the title in "…" at its own end only in its own direction.
      expect(summaryDir({ title_max_lines: 2 })).toBe('rtl');
      // The same as below the time, which the clamp-direction tests hold.
      expect(summaryDir({ title_max_lines: 2, time_position: 'below' })).toBe('rtl');
      // No limit, nothing to cut: the title keeps the dashboard's direction.
      expect(summaryDir({})).toBeNull();
      // Kept to one line, as the scrolling title is.
      expect(summaryDir({ title_max_lines: 1 })).toBeNull();
    });

    it("keeps a merged row's labels before the title, as the title below the time draws them", () => {
      const shared = (entityId: string): Types.CalendarEventData => ({
        summary: 'Team lunch',
        start: { dateTime: '2026-06-17T11:00:00.000Z' },
        end: { dateTime: '2026-06-17T12:00:00.000Z' },
        _entityId: entityId,
      });
      const entities = [
        { entity: 'calendar.c0', label: 'mdi:star' },
        { entity: 'calendar.c1', label: '🎾' },
      ];
      const config = { filter_duplicates: true, entities };
      const events = [shared('calendar.c0'), shared('calendar.c1')];
      const lunch = (container: HTMLElement) =>
        bodies(container).find((body) => titleOf(body) === 'Team lunch')!;
      const summary = lunch(
        render('list', { ...config, time_position: 'title' }, events),
      ).querySelector('.summary-row > .summary')!;
      expect([...summary.children].map((child) => child.className)).toEqual([
        'label-icon',
        'calendar-label label-emoji',
        'event-title ',
        'title-room',
      ]);
      // The labels and the title as the title below the time draws them, less only the room.
      const below = lunch(render('list', config, events)).querySelector('.summary-row > .summary')!;
      const wrapping = summary.cloneNode(true) as Element;
      wrapping.querySelector(':scope > .title-room')!.remove();
      expect(withoutBlockEdgeWhitespace(wrapping)).toBe(withoutBlockEdgeWhitespace(below));
      // Kept to one line, the labels and the title are the scrolling title's, less the moving
      // text.
      const oneLine = lunch(
        render('list', { ...config, time_position: 'title', title_max_lines: 1 }, events),
      ).querySelector('.summary-row > .summary')!;
      expect([...oneLine.children].map((child) => child.className)).toEqual([
        'label-icon',
        'calendar-label label-emoji',
        'event-title  title-scrollable',
      ]);
      const scrolling = lunch(
        render('list', { ...config, scroll_long_titles: true }, events),
      ).querySelector('.summary-row > .summary')!;
      expect(withoutFlexWhitespace(oneLine)).toBe(withoutFlexWhitespace(stillTitle(scrolling)));
      // With scrolling on, the title beside the time is the scrolling title exactly.
      const both = lunch(
        render('list', { ...config, time_position: 'title', scroll_long_titles: true }, events),
      ).querySelector('.summary-row > .summary')!;
      expect(withoutFlexWhitespace(both)).toBe(withoutFlexWhitespace(scrolling));
    });
  });

  /**
   * Both renders of every row, held against each other. Each configuration is chosen to draw a
   * different shape of time row, or a different neighbor for it.
   */
  describe('changes nothing else', () => {
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
      ['weather', { weather: { entity: 'weather.home', position: 'both' } }],
      ['scrolling titles', { scroll_long_titles: true }],
      ['a title line limit', { title_max_lines: 1, time_max_lines: 1 }],
      ['an icon label', LABELED],
      ['unsplit multi-day', { split_multiday_events: false, show_countdown: true }],
      ['empty days', { show_empty_days: true, days_to_show: 5 }],
      ['links', { open_links: true }],
    ];
    const CASES = CORPUS.flatMap(([name, overrides]) =>
      [false, true].map((tappable) => [name, tappable, overrides] as const),
    );

    it.each(CASES)(
      'column view, %s, tappable %s: the time on the title line without its clock',
      (_name, tappable, overrides) => {
        const below = bodies(render('column', overrides, WITH_DESCRIPTION, tappable));
        // A title kept to its line beside a time is held against the scrolling default, and a
        // wrapping one against the title below the time.
        const oneLine = Boolean(overrides.scroll_long_titles) || overrides.title_max_lines === 1;
        const scrolling = bodies(
          render('column', { ...overrides, scroll_long_titles: true }, WITH_DESCRIPTION, tappable),
        );
        const title = bodies(
          render('column', { ...overrides, time_position: 'title' }, WITH_DESCRIPTION, tappable),
        );
        expect(title).toHaveLength(below.length);
        expect(scrolling).toHaveLength(below.length);

        let movedRows = 0;
        title.forEach((after, index) => {
          const label = `${titleOf(after)} (${index})`;
          if (!after.classList.contains('time-beside-title')) {
            // Nothing beside the title: the row is the default's, byte for byte.
            expect(below[index].querySelector('.time'), label).toBeNull();
            expect(after.outerHTML, label).toBe(below[index].outerHTML);
            return;
          }
          movedRows += 1;
          const before = (oneLine ? scrolling : below)[index].cloneNode(true) as HTMLElement;
          const rest = after.cloneNode(true) as HTMLElement;

          // The time is the one below the title, less its clock, and less the empty time a
          // countdown alone leaves.
          const original = before.querySelector(':scope > .time-location > .time')!;
          expect(original, label).not.toBeNull();
          const expected = original.cloneNode(true) as HTMLElement;
          expected.querySelector(':scope > .time-actual > ha-icon')?.remove();
          expected.querySelector(':scope > .time-actual:empty')?.remove();
          const time = rest.querySelector(':scope > .summary-row > .title-aside > .time')!;
          expect(withoutFlexWhitespace(time), label).toBe(withoutFlexWhitespace(expected));

          // The rest of the row, with the time taken out of both and its box gone, is the
          // scrolling default's, less the moving text unless scrolling is on, or for a wrapping
          // title the default's, less the room ending the title.
          original.remove();
          const aside = rest.querySelector(':scope > .summary-row > .title-aside')!;
          aside.querySelector(':scope > .time')!.remove();
          if (!oneLine) aside.querySelector(':scope > .title-strut')!.remove();
          expect(aside.children, label).toHaveLength(0);
          aside.remove();
          rest.classList.remove('time-beside-title');
          if (!oneLine) {
            const row = rest.querySelector(':scope > .summary-row')!;
            expect(row.classList.contains('title-wrap'), label).toBe(true);
            row.classList.remove('title-wrap', 'title-capped');
            rest.querySelector(':scope > .summary-row > .summary > .title-room')!.remove();
            expect(withoutBlockEdgeWhitespace(rest), label).toBe(
              withoutBlockEdgeWhitespace(before),
            );
            return;
          }
          const expectedRest = overrides.scroll_long_titles ? before : stillTitle(before);
          expect(withoutFlexWhitespace(rest), label).toBe(withoutFlexWhitespace(expectedRest));
        });

        // Every row with a time or a countdown moved, and only those.
        const withTime = below.filter((body) =>
          body.querySelector('.time-location > .time > .time-actual:not(:empty), .time-countdown'),
        );
        expect(movedRows).toBe(withTime.length);
        // Every configuration here draws a time somewhere, bar one: column view's bar has a
        // row of its own, so with times off and no countdown nothing is left to move.
        if (overrides.show_time === false && !overrides.show_countdown) {
          expect(withTime).toEqual([]);
        } else {
          expect(withTime.length).toBeGreaterThan(0);
        }
      },
    );

    it.each(CASES)(
      "list view, %s, tappable %s: every body column view's",
      (_name, tappable, overrides) => {
        // Column view draws its weather as a row of its own, list view as a badge on the title
        // line, so the badge's case is held to list view's own badge above instead.
        const config = { ...overrides, time_position: 'title' };
        delete (config as { weather?: unknown }).weather;
        const list = bodies(render('list', config, WITH_DESCRIPTION, tappable));
        const column = bodies(render('column', config, WITH_DESCRIPTION, tappable));
        expect(list.length).toBeGreaterThan(4);

        // Keyed by title: the two views order their days differently. A title column view
        // draws more than once is a multi-day event split into a segment per day, whose time
        // reads differently in each view, or an empty day, which column view draws in every
        // empty column; that is the views' doing, not this option's.
        const count = new Map<string, number>();
        for (const body of column) count.set(titleOf(body), (count.get(titleOf(body)) ?? 0) + 1);
        const byTitle = new Map(column.map((body) => [titleOf(body), body]));
        const skipped = new Set<string>();
        for (const body of list) {
          const key = titleOf(body);
          if (count.get(key) !== 1) {
            skipped.add(key);
            continue;
          }
          const twin = byTitle.get(key)!;
          expect(normalize(body), key).toBe(normalize(twin));
        }
        // Only the fixtures' multi-day event, which column view always splits, and an empty
        // day, so a broken key cannot skip the whole comparison.
        expect([...skipped].sort()).toEqual(
          overrides.show_empty_days ? ['Conference', '✓ No events'] : ['Conference'],
        );
      },
    );
  });
});

/**
 * A copy of an element with every title's moving text unwrapped: the span's children take its
 * place, so what is left is a title kept to its line with nothing in it that can move.
 */
function stillTitle(element: Element): Element {
  const clone = element.cloneNode(true) as Element;
  const moving = [...clone.querySelectorAll('.event-title > .event-title-scroll')];
  expect(moving.length).toBeGreaterThan(0);
  for (const span of moving) span.replaceWith(...span.childNodes);
  return clone;
}

/**
 * Markup with every whitespace-only text node directly inside a flex container removed, then
 * normalized. A flex container draws no whitespace between its items, so those nodes are not
 * on screen, and the title-line templates are written without the line breaks the default
 * templates keep between their tags. Whitespace anywhere else, inline text above all, is left as
 * it is. The classes are the flex containers of an event body in list and column view.
 */
function withoutFlexWhitespace(element: Element): string {
  const FLEX = [
    '.event-content',
    '.summary-row',
    '.summary-scroll',
    '.title-aside',
    '.time',
    '.time-actual',
    '.time-location',
  ].join(', ');
  const clone = element.cloneNode(true) as Element;
  for (const container of [
    ...(clone.matches(FLEX) ? [clone] : []),
    ...clone.querySelectorAll(FLEX),
  ]) {
    for (const node of [...container.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent!.trim()) node.remove();
    }
  }
  return normalize(clone);
}

/**
 * Markup with every whitespace-only text node directly inside a flex container removed, as
 * `withoutFlexWhitespace` does, and with the whitespace at the start and end of each title row's
 * `.summary` removed too. `.summary` is a block, where whitespace beginning its first line or
 * ending its last is not on screen; the wrapping title's template writes none there, and the
 * default's keeps the line breaks between its tags.
 */
function withoutBlockEdgeWhitespace(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const summary of [
    ...(clone.matches('.summary') ? [clone] : []),
    ...clone.querySelectorAll('.summary'),
  ]) {
    for (const edge of [summary.firstChild, summary.lastChild]) {
      if (edge?.nodeType === Node.TEXT_NODE && !edge.textContent!.trim()) edge.remove();
    }
  }
  return withoutFlexWhitespace(clone);
}
