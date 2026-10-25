/**
 * The accent bar: its own element beside every event, in every view that draws one (#47).
 *
 * It replaced a border on the event box, which could neither have rounded ends nor sit inside
 * the event's tint. Three things are pinned here. The element is drawn exactly where an event
 * is and nowhere else, as the first child of every list, column and grid timed event and of
 * no grid banner, `+N` block or list gap row. Its color reaches it through one inline
 * property on the event element, and no event draws a border any more. And the stylesheet
 * rules that place it, read by value rather than by spot check, so a dropped declaration or a
 * reintroduced border fails here instead of moving a pixel nobody measures.
 *
 * Geometry is not something happy-dom lays out, so where the bar actually lands, and that the
 * text did not move, was measured in Chromium against the previous build when this shipped;
 * these tests pin the declarations that produced it.
 */
import { readFileSync } from 'node:fs';

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stripComments } from '../rollup.config.mjs';
import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as Styles from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';

// Wednesday 17 June 2026, 08:00 UTC; the unit project runs under TZ=UTC.
const NOW = new Date('2026-06-17T08:00:00.000Z');

function timed(
  date: string,
  from: string,
  to: string,
  summary: string,
  entity = 'calendar.anna',
): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: `${date}T${from}:00.000Z` },
    end: { dateTime: `${date}T${to}:00.000Z` },
    _entityId: entity,
  };
}

function allDay(from: string, to: string, summary: string): Types.CalendarEventData {
  return { summary, start: { date: from }, end: { date: to }, _entityId: 'calendar.ben' };
}

/**
 * One fixture for all three views, chosen so every kind of grid node is drawn: a block raised
 * over a longer one, blocks clipped at both ends of the visible hours, more simultaneous
 * events than fit (the `+N` block), and an all-day banner. List and column draw the same
 * events as rows, plus an empty day and, with a gap, the gap rows.
 */
const EVENTS: Types.CalendarEventData[] = [
  timed('2026-06-17', '09:00', '12:00', 'Workshop'),
  timed('2026-06-17', '10:00', '11:00', 'Interview', 'calendar.ben'),
  timed('2026-06-17', '05:00', '09:00', 'Early shift'),
  timed('2026-06-17', '19:00', '23:00', 'Late shift', 'calendar.ben'),
  ...['A', 'B', 'C', 'D', 'E'].map((name) => timed('2026-06-18', '14:00', '15:00', `Talk ${name}`)),
  allDay('2026-06-17', '2026-06-19', 'Holiday'),
];

const BASE: Partial<Types.Config> = {
  days_to_show: 3,
  show_empty_days: true,
  entities: [
    { entity: 'calendar.anna', accent_color: '#e91e63' },
    { entity: 'calendar.ben', accent_color: '#1e88e5' },
  ],
  time_grid: { start_time: '08:00', end_time: '20:00' },
} as Partial<Types.Config>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function render(
  view: Types.EffectiveView,
  overrides: Partial<Types.Config> = {},
  eventsTappable = false,
): HTMLElement {
  const config = buildConfig({ view, ...BASE, ...overrides });
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
  const container = document.createElement('div');

  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, NOW)
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, null, eventsTappable)
        : Render.renderGroupedEvents(days, effective, 'en', undefined, null, eventsTappable),
    container,
  );

  return container;
}

/** The nodes in each view that are an event with an accent, and so must draw a bar. */
const EVENT_SELECTOR: Record<Types.EffectiveView, string> = {
  list: 'td.event',
  column: '.column-events > .event',
  grid: '.grid-event:not(.grid-event-overflow)',
};

describe('the element', () => {
  it.each(['list', 'column', 'grid'] as const)(
    'is the first child of every %s event, once',
    (view) => {
      const container = render(view, { event_gap: '6px' });
      const events = [...container.querySelectorAll(EVENT_SELECTOR[view])];

      expect(events.length, `no events drawn in ${view}`).toBeGreaterThan(2);
      for (const event of events) {
        expect(event.firstElementChild?.className).toBe('event-accent-bar');
        expect(event.querySelectorAll('.event-accent-bar')).toHaveLength(1);
        // Empty: everything about it is the stylesheet's, its color the event element's.
        expect(event.firstElementChild?.childNodes).toHaveLength(0);
        expect(event.firstElementChild?.hasAttribute('style')).toBe(false);
      }
      // Nothing else carries one: every bar in the view belongs to one of those events.
      expect(container.querySelectorAll('.event-accent-bar')).toHaveLength(events.length);
    },
  );

  it('is drawn on an empty day too, as the stripe was', () => {
    for (const view of ['list', 'column'] as const) {
      const empty = [...render(view).querySelectorAll(EVENT_SELECTOR[view])].filter((event) =>
        event.querySelector('.empty-day-title'),
      );

      expect(empty.length, `no empty day drawn in ${view}`).toBeGreaterThan(0);
      for (const event of empty) {
        expect(event.firstElementChild?.className).toBe('event-accent-bar');
      }
    }
  });

  it('is not drawn on a grid banner, the +N block, a backdrop, or a list gap row', () => {
    const grid = render('grid');
    // Each of these must exist for its absence of a bar to mean anything.
    for (const selector of [
      '.grid-banner',
      '.grid-event-overflow',
      '.grid-event-backdrop',
      '.grid-event-raised',
      '.grid-event.clipped-top',
      '.grid-event.clipped-bottom',
    ]) {
      expect(grid.querySelector(selector), `fixture draws no ${selector}`).not.toBeNull();
    }
    for (const selector of ['.grid-banner', '.grid-event-overflow', '.grid-event-backdrop']) {
      for (const node of grid.querySelectorAll(selector)) {
        expect(node.querySelector('.event-accent-bar')).toBeNull();
        expect(node.getAttribute('style') ?? '').not.toContain('accent-bar-color');
      }
    }

    const list = render('list', { event_gap: '6px' });
    expect(list.querySelectorAll('.event-gap-row').length).toBeGreaterThan(0);
    expect(list.querySelector('.event-gap-row .event-accent-bar')).toBeNull();
  });

  it('sits beside the list tap target rather than inside it', () => {
    // The button carries the tap target, so the bar is a sibling of it, and the stylesheet
    // makes it ignore the pointer (pinned below) so a tap on it reaches the button's hit area.
    const cells = render('list', {}, true).querySelectorAll('td.event-tappable');

    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect([...cell.children].map((child) => child.className.split(' ')[0])).toEqual([
        'event-accent-bar',
        'event-button',
      ]);
    }
  });
});

describe('its color', () => {
  it.each(['list', 'column', 'grid'] as const)(
    'reaches every %s bar through one inline property, and no event draws a border',
    (view) => {
      const container = render(view);
      const colors = [...container.querySelectorAll(EVENT_SELECTOR[view])]
        .filter((event) => !event.querySelector('.empty-day-title'))
        .map((event) => {
          const style = event.getAttribute('style') ?? '';
          expect(style).not.toMatch(/border/i);
          return /--calendar-card-event-accent-bar-color:\s*([^;]+)/.exec(style)?.[1].trim();
        });

      // Both calendars' colors arrive, each on its own events.
      expect(new Set(colors)).toEqual(new Set(['#e91e63', '#1e88e5']));
    },
  );

  it('is written by no renderer as a border any more', () => {
    // A reconciliation against the source rather than one more rendered case: a border
    // reintroduced on any branch of any event renderer fails here whatever the fixture draws.
    const read = (file: string) => readFileSync(`${process.cwd()}/src/rendering/${file}`, 'utf8');
    for (const file of ['render.ts', 'column.ts', 'grid.ts', 'leaves.ts']) {
      expect(read(file), file).not.toMatch(/border-inline-start|borderInlineStart/);
    }
  });
});

describe('the stylesheet', () => {
  const rules = stripComments(Styles.cardStyles.cssText);

  /** Collapse whitespace, including inside parentheses, so values compare as written. */
  const norm = (value: string) =>
    value.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

  /**
   * Every innermost rule, with its declarations as an ordered list of [property, value].
   * Innermost so the rules inside `@supports` and `@container` blocks are read too.
   */
  const innermost = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, prelude, body]) => ({
    selector: norm(prelude),
    declarations: body
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const colon = part.indexOf(':');
        return [part.slice(0, colon).trim(), norm(part.slice(colon + 1))] as [string, string];
      }),
  }));

  /** The declarations of the one rule whose selector list is exactly `selector`. */
  function declarations(selector: string): Record<string, string> {
    const matches = innermost.filter((rule) => rule.selector === selector);
    expect(matches, `rules for ${selector}`).toHaveLength(1);
    return Object.fromEntries(matches[0].declarations);
  }

  it('places and paints the bar exactly so', () => {
    expect(declarations('.event-accent-bar')).toEqual({
      '--calendar-card-event-accent-bar-corner-inset':
        'max(var(--calendar-card-event-accent-bar-inset, 2px), calc(var(--calendar-card-event-accent-side-radius, 0px) - 4px))',
      position: 'absolute',
      'inset-inline-start': 'var(--calendar-card-event-accent-bar-inset, 0px)',
      'inset-block': 'var(--calendar-card-event-accent-bar-inset, 2px)',
      width: '0',
      // A border, not a background: forced colors and a printout without backgrounds both
      // drop a background and keep a border.
      'border-inline-start':
        'var(--calendar-card-line-width-vertical) solid var(--calendar-card-event-accent-bar-color)',
      'border-radius': '999px',
      // No z-index: a positive one would show through a raised grid block drawn over it.
      'pointer-events': 'none',
    });
  });

  it('keeps a bar end clear of a rounded corner only where the block has one', () => {
    const CORNER = 'var(--calendar-card-event-accent-bar-corner-inset)';

    expect(declarations('.event-first > .event-accent-bar')).toEqual({
      'inset-block-start': CORNER,
    });
    expect(declarations('.event-last > .event-accent-bar')).toEqual({
      'inset-block-end': CORNER,
    });
    expect(declarations('.with-event-gap .event > .event-accent-bar')).toEqual({
      'inset-block': CORNER,
    });
  });

  it('insets a grid bar 3px whatever the tint, and runs it square to a clipped edge', () => {
    expect(declarations('.grid-event > .event-accent-bar')).toEqual({
      'inset-inline-start': '3px',
      'inset-block': '3px',
    });
    expect(declarations('.grid-event.clipped-top > .event-accent-bar')).toEqual({
      'inset-block-start': '0',
      'border-start-start-radius': '0',
      'border-start-end-radius': '0',
    });
    expect(declarations('.grid-event.clipped-bottom > .event-accent-bar')).toEqual({
      'inset-block-end': '0',
      'border-end-start-radius': '0',
      'border-end-end-radius': '0',
    });
  });

  it('positions the list cell and the column event for the bar, and nothing else', () => {
    // Scoped: on .event it would also position grid banners and the +N block, and change
    // the order they paint in.
    expect(declarations('td.event, .column-events > .event')).toEqual({ position: 'relative' });
    expect(
      innermost.some(
        (rule) =>
          rule.selector === '.event' &&
          rule.declarations.some(([property]) => property === 'position'),
      ),
    ).toBe(false);
  });

  it('reads the bar width in exactly three places: the bar and the two text starts', () => {
    // A reconciliation of every declaration that reads the width, so a border put back on
    // an event, or a geometry that forgets the bar's room, fails here rather than in a
    // screenshot. The list text starts 12px past the bar's room, as it did past the border;
    // the grid text 6px past it, the bar's 3px inset and 3px clear of it.
    const readers = innermost.flatMap((rule) =>
      rule.declarations
        .filter(([, value]) => value.includes('--calendar-card-line-width-vertical'))
        .map(([property, value]) => `${rule.selector} { ${property}: ${value} }`),
    );

    expect(readers).toEqual([
      '.event { padding-inline-start: calc(12px + var(--calendar-card-line-width-vertical)) }',
      '.event-accent-bar { border-inline-start: var(--calendar-card-line-width-vertical) solid var(--calendar-card-event-accent-bar-color) }',
      '.grid-event, .grid-event-backdrop { --calendar-card-grid-text-start: calc(6px + var(--calendar-card-line-width-vertical)) }',
    ]);
  });

  it('starts grid text, compact text and continuation marks at the same place', () => {
    const START = 'var(--calendar-card-grid-text-start)';

    expect(declarations('.grid-event, .grid-event-backdrop')['padding-inline-start']).toBe(START);
    expect(
      declarations('.grid-event.clipped-top::before, .grid-event.clipped-bottom::after')[
        'inset-inline'
      ],
    ).toBe(`${START} 4px`);
    const compact = innermost.filter(
      (rule) =>
        rule.selector.endsWith('.grid-event-disclosure') &&
        rule.selector.startsWith('.grid-event:is(') &&
        rule.declarations.some(([property]) => property === 'inset-inline'),
    );
    expect(compact).toHaveLength(1);
    expect(Object.fromEntries(compact[0].declarations)['inset-inline']).toBe(`${START} 4px`);
  });

  it('reads the bar color in exactly two places: the bar and a raised block outline', () => {
    const readers = innermost.flatMap((rule) =>
      rule.declarations
        .filter(([, value]) => value.includes('--calendar-card-event-accent-bar-color'))
        .map(([property]) => `${rule.selector} { ${property} }`),
    );

    expect(readers).toEqual([
      '.event-accent-bar { border-inline-start }',
      '.grid-event-raised > .grid-event-accessible::before { border }',
    ]);
  });

  it('keeps the list tap target over the whole cell, the bar included', () => {
    // The button's pseudo-elements used to reach back over the border; with no border the
    // cell's padding box is the whole cell, so they no longer need to.
    expect(declarations('.event-button::before, .event-button::after')).toEqual({
      content: "''",
      position: 'absolute',
      inset: '0',
    });
  });
});

describe('a width that is not in px', () => {
  it('passes through to the property unparsed', () => {
    // The bar width, the list text start and the grid text start all read the property in
    // the stylesheet, where an em resolves against the event's own font as the border's did.
    expect(
      Styles.generateCustomPropertiesObject(buildConfig({ vertical_line_width: '0.3em' }))[
        '--calendar-card-line-width-vertical'
      ],
    ).toBe('0.3em');
  });
});
