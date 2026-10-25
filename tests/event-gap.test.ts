/**
 * `event_gap`: a gap between every event of a day, in list and column view (#653).
 *
 * A day's events are drawn as one joined block by default, and that is the card's own look,
 * so most of what is pinned here is about leaving it alone: zero in any spelling, and a
 * negative length, must render exactly the markup a card without the option renders. With
 * a gap, list view holds the events apart with a row of its own between each pair (a table
 * row takes no margin, and `border-spacing` would also pad above the first and below the
 * last event), and column view sets a gap on the flex stack. Both mark their container with
 * `with-event-gap`, which is what rounds all four corners of every event, as grid rounds a block.
 *
 * Rendered through `resolveEffectiveConfig`, as the card does, so a `list:` or `column:`
 * override is exercised by the same path that applies it in production.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stripComments } from '../rollup.config.mjs';
import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as Styles from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';

// Wednesday 17 June 2026, 08:00 UTC; the unit project runs under TZ=UTC.
const NOW = new Date('2026-06-17T08:00:00.000Z');

function timed(date: string, from: string, to: string, summary: string): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: `${date}T${from}:00.000Z` },
    end: { dateTime: `${date}T${to}:00.000Z` },
    _entityId: 'calendar.personal',
  };
}

/** Three events today, one tomorrow, none the day after: a stack, a lone event, an empty day. */
const EVENTS: Types.CalendarEventData[] = [
  timed('2026-06-17', '09:00', '10:00', 'Swimming'),
  timed('2026-06-17', '12:00', '13:00', 'Lunch with Anna'),
  timed('2026-06-17', '18:00', '19:00', 'Choir'),
  timed('2026-06-18', '09:00', '10:00', 'Dentist'),
];

/** Shows the empty third day in list view too, so its placeholder row is covered. */
const BASE: Partial<Types.Config> = { days_to_show: 3, show_empty_days: true };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function render(view: Types.EffectiveView, overrides: Partial<Types.Config> = {}): HTMLElement {
  const config = buildConfig({ view, ...BASE, ...overrides });
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
  const container = document.createElement('div');

  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, NOW)
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, null)
        : Render.renderGroupedEvents(days, effective, 'en', undefined, null),
    container,
  );

  return container;
}

/** Each list day's rows, in order: `event` for an event row, `gap` for a gap row. */
function listRows(container: HTMLElement): string[][] {
  return Array.from(container.querySelectorAll('table.day-table')).map((table) =>
    Array.from(table.querySelectorAll('tr')).map((row) =>
      row.classList.contains('event-gap-row') ? 'gap' : 'event',
    ),
  );
}

/** Each list day's date cell span. */
function rowSpans(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll('td.date-column')).map((cell) =>
    Number(cell.getAttribute('rowspan')),
  );
}

describe('hasEventGap', () => {
  it.each(['0px', '0', '0.0px', '00px', '0em', '-0px', '+0rem'])('reads %s as no gap', (gap) => {
    expect(ViewConfig.hasEventGap(buildConfig({ event_gap: gap }))).toBe(false);
  });

  it.each(['-4px', ' -0.5em', '-1px'])('reads the negative %s as no gap', (gap) => {
    expect(ViewConfig.hasEventGap(buildConfig({ event_gap: gap }))).toBe(false);
  });

  it.each(['1px', '0.5em', '.25rem', 'calc(0.25rem + 2px)', 'var(--my-gap)'])(
    'reads %s as a gap',
    (gap) => {
      expect(ViewConfig.hasEventGap(buildConfig({ event_gap: gap }))).toBe(true);
    },
  );

  it('ships with no gap', () => {
    expect(Config.DEFAULT_CONFIG.event_gap).toBe('0px');
    expect(ViewConfig.hasEventGap(buildConfig())).toBe(false);
  });
});

describe('with no gap, the markup is exactly what it was', () => {
  it.each(['list', 'column'] as const)(
    'renders the same %s view for every zero spelling and for a negative gap',
    (view) => {
      const unset = render(view).innerHTML;

      for (const gap of ['0px', '0', '0.0em', '-0px', '-4px']) {
        expect(render(view, { event_gap: gap }).innerHTML, gap).toBe(unset);
      }

      // The control: a gap the renderer honors changes the markup, so the equality above is
      // not two renders of something that ignores the option.
      expect(render(view, { event_gap: '8px' }).innerHTML).not.toBe(unset);
    },
  );

  it('draws no gap row and no gap class in either view', () => {
    for (const view of ['list', 'column'] as const) {
      const container = render(view);
      expect(container.querySelectorAll('.event-gap-row, .with-event-gap')).toHaveLength(0);
    }
  });
});

describe('list view', () => {
  it('puts a gap row between every pair of events and none before the first or after the last', () => {
    expect(listRows(render('list', { event_gap: '8px' }))).toEqual([
      ['event', 'gap', 'event', 'gap', 'event'],
      ['event'],
      ['event'],
    ]);
    expect(listRows(render('list'))).toEqual([['event', 'event', 'event'], ['event'], ['event']]);
  });

  it('spans the date cell over the gap rows as well as the events', () => {
    expect(rowSpans(render('list', { event_gap: '8px' }))).toEqual([5, 1, 1]);
    expect(rowSpans(render('list'))).toEqual([3, 1, 1]);
  });

  it('keeps every gap row empty, single-celled and hidden from assistive technology', () => {
    const rows = render('list', { event_gap: '8px' }).querySelectorAll('tr.event-gap-row');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.getAttribute('aria-hidden')).toBe('true');
      expect(row.children).toHaveLength(1);
      expect(row.children[0].className).toBe('event-gap-cell');
      expect(row.textContent?.trim()).toBe('');
    }
  });

  it('marks every day table, the lone event and the empty day included', () => {
    const tables = render('list', { event_gap: '8px' }).querySelectorAll('table.day-table');

    expect(tables).toHaveLength(3);
    for (const table of tables) {
      expect(table.classList.contains('with-event-gap')).toBe(true);
    }
  });

  it('keeps event-first, event-middle and event-last meaning their place in the day', () => {
    // theming.md documents them as first, neither and last of the day. A gap separates
    // the events visually and must not turn every event into a "first" and a "last".
    const events = render('list', { event_gap: '8px' })
      .querySelector('table.day-table')!
      .querySelectorAll('td.event');

    expect(
      Array.from(events).map((event) =>
        ['event-first', 'event-middle', 'event-last'].filter((name) =>
          event.classList.contains(name),
        ),
      ),
    ).toEqual([['event-first'], ['event-middle'], ['event-last']]);
  });
});

describe('column view', () => {
  it('marks every day column, and adds nothing between its events', () => {
    const stacks = render('column', { event_gap: '8px' }).querySelectorAll('.column-events');

    expect(stacks).toHaveLength(3);
    for (const stack of stacks) {
      expect(stack.className).toBe('column-events with-event-gap');
      for (const child of stack.children) {
        expect(child.classList.contains('event')).toBe(true);
      }
    }
  });
});

describe('per view', () => {
  it('applies a column: override to column view only', () => {
    const overrides = { column: { event_gap: '8px' } } as Partial<Types.Config>;

    expect(render('column', overrides).querySelectorAll('.with-event-gap')).toHaveLength(3);
    expect(render('list', overrides).querySelectorAll('.with-event-gap')).toHaveLength(0);
  });

  it('applies a list: override to list view only', () => {
    const overrides = { list: { event_gap: '8px' } } as Partial<Types.Config>;

    expect(render('list', overrides).querySelectorAll('.event-gap-row')).toHaveLength(2);
    expect(render('column', overrides).querySelectorAll('.with-event-gap')).toHaveLength(0);
  });

  it('lets a view turn off a gap set at the top level', () => {
    const overrides = { event_gap: '8px', column: { event_gap: '0px' } } as Partial<Types.Config>;

    expect(render('column', overrides).querySelectorAll('.with-event-gap')).toHaveLength(0);
    expect(render('list', overrides).querySelectorAll('.event-gap-row')).toHaveLength(2);
  });

  it('changes nothing in grid view, at the top level or in time_grid:', () => {
    const unset = render('grid').innerHTML;

    expect(render('grid', { event_gap: '8px' }).innerHTML).toBe(unset);
    expect(
      render('grid', { time_grid: { event_gap: '8px' } } as Partial<Types.Config>).innerHTML,
    ).toBe(unset);
    // The control: grid does honor an option it is known to read.
    expect(render('grid', { days_to_show: 2 }).innerHTML).not.toBe(unset);
  });
});

describe('length handling', () => {
  it('gives a bare number its unit, at the top level and in a view block', () => {
    // Home Assistant's YAML parser types `event_gap: 6` as a number, which no CSS
    // property accepts.
    expect(Config.coercePixelLength('event_gap', 6)).toBe('6px');
    expect(Config.coercePixelLength('event_gap', '6')).toBe('6px');

    const config = buildConfig({ column: { event_gap: 6 } } as unknown as Partial<Types.Config>);
    expect(ViewConfig.resolveEffectiveConfig(config, 'column').event_gap).toBe('6px');
  });

  it('keeps a non-pixel length as written', () => {
    const config = buildConfig({ event_gap: '0.5em', column: { event_gap: '1rem' } });

    expect(ViewConfig.resolveEffectiveConfig(config, 'list').event_gap).toBe('0.5em');
    expect(ViewConfig.resolveEffectiveConfig(config, 'column').event_gap).toBe('1rem');
    expect(render('list', { event_gap: '0.5em' }).querySelectorAll('.event-gap-row')).toHaveLength(
      2,
    );
  });
});

describe('the stylesheet', () => {
  const rules = stripComments(Styles.cardStyles.cssText);

  /** The declarations of the one rule whose selector list is exactly `selector`. */
  function ruleBody(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(rules);
    expect(match, `no rule for ${selector}`).not.toBeNull();
    return match![1];
  }

  const ACCENT_SIDE = 'var(--calendar-card-event-accent-side-radius, 0px)';
  const END_SIDE = 'var(--calendar-card-event-border-radius)';

  it('rounds every gapped event as a block, its stripe side only while tinted', () => {
    const body = ruleBody('.with-event-gap .event');

    expect(body).toContain(`border-start-end-radius: ${END_SIDE}`);
    expect(body).toContain(`border-end-end-radius: ${END_SIDE}`);
    // Untinted, the property is unwritten and the stripe stays a straight line.
    expect(body).toContain(`border-start-start-radius: ${ACCENT_SIDE}`);
    expect(body).toContain(`border-end-start-radius: ${ACCENT_SIDE}`);
  });

  it('rounds the joined block on its outer corners, its stripe side only while tinted', () => {
    // The first event rounds the top of the block and the last its bottom, so a tinted day
    // without a gap is one rounded block, like a gapped event and a grid block.
    for (const [selector, edge] of [
      ['.event-first', 'start'],
      ['.event-last', 'end'],
    ] as const) {
      const body = ruleBody(selector);
      expect(body).toContain(`border-${edge}-end-radius: ${END_SIDE}`);
      expect(body).toContain(`border-${edge}-start-radius: ${ACCENT_SIDE}`);
    }
    // The corners between two events stay square: `.event` itself sets none, and no rule
    // squares the outer ones again for a lone event.
    expect(ruleBody('.event')).toContain('border-radius: 0');
    expect(rules).not.toContain('.event-first.event-last');
  });

  it('sizes the list gap row from the property, with no padding and no zeroed font', () => {
    const body = ruleBody('.event-gap-cell');

    expect(body).toContain('height: var(--calendar-card-event-gap)');
    expect(body).toContain('padding: 0');
    // `font-size: 0` is the usual way to empty a row, and it would turn an em gap into none.
    expect(body).not.toContain('font-size');
  });

  it('gaps the column stack from the same property', () => {
    expect(ruleBody('.column-events.with-event-gap')).toContain(
      'row-gap: var(--calendar-card-event-gap)',
    );
  });
});
