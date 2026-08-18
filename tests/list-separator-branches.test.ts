/**
 * Three separator branches in the list view that render nothing at default config.
 *
 * `day_separator_width`, `week_separator_width` and `month_separator_width` all default to
 * `'0px'` and `show_week_numbers` defaults to `null`, so a suite built from `DEFAULT_CONFIG`
 * draws no separator of any kind and cannot reach this code. `tests/zero-length.test.ts` turns
 * the *month* width on and covers that path well; these three sit outside it and each survived
 * a mutation sweep of `render.ts`:
 *
 * - `renderHorizontalSeparator`'s `isZeroLength(lineWidth) || isFirstWeek` early return — the
 *   day separator's own suppression, on a different call path from the month rule.
 * - `renderWeekRow`'s `isMonthBoundary && !isZeroLength(month_separator_width)`, which picks
 *   month styling over week styling for the row's rule.
 * - `hasWeekSeparator`'s `show_week_numbers !== null || !isZeroLength(week_separator_width)`,
 *   which is what makes a week row appear to carry the *number* when no rule is drawn.
 *
 * The two rule widths are deliberately different everywhere below. With a single shared width
 * a branch that picks the wrong one is invisible, which is part of why the month/week
 * selection survived in the first place.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/** One event a day across a month boundary, so week and month boundaries both occur. */
const ACROSS_BOUNDARIES: Types.CalendarEventData[] = [
  '2026-06-28',
  '2026-06-29',
  '2026-06-30',
  '2026-07-01',
  '2026-07-02',
].map((date) => ({
  start: { dateTime: `${date}T09:00:00.000Z` },
  end: { dateTime: `${date}T10:00:00.000Z` },
  summary: `event-${date}`,
  _entityId: 'calendar.personal',
}));

function renderList(overrides: Partial<Types.Config>): HTMLElement {
  const config = buildConfig({
    days_to_show: 30,
    start_date: '2026-06-28',
    ...overrides,
  });
  const days = EventUtils.groupEventsByDay(ACROSS_BOUNDARIES, config, false, 'en');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en'), container);
  return container;
}

/** The `--separator-border-width` on each week row that draws a rule, in document order. */
function weekRowRuleWidths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.separator-cell'))
    .map(
      (cell) => /--separator-border-width:\s*([^;]+)/.exec(cell.getAttribute('style') ?? '')?.[1],
    )
    .filter((width): width is string => width !== undefined)
    .map((width) => width.trim());
}

/** Both rule widths, configured differently so a wrong branch shows up as a wrong width. */
const DISTINCT_RULES = {
  show_week_numbers: 'iso',
  week_separator_width: '1px',
  month_separator_width: '5px',
} as Partial<Types.Config>;

describe('the day separator suppresses itself at zero width', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits day separators when the width is non-zero', () => {
    // The positive control: without it every assertion below is satisfied by a fixture that
    // produces no day boundaries at all.
    expect(
      renderList({ day_separator_width: '3px' }).querySelectorAll('.separator').length,
    ).toBeGreaterThan(0);
  });

  it('emits no day separator element at zero width', () => {
    expect(renderList({ day_separator_width: '0px' }).querySelectorAll('.separator')).toHaveLength(
      0,
    );
  });

  it('leaves no separator margin behind at zero width', () => {
    // The half a border-only suppression would miss: a separator's margins come from
    // `day_spacing` and do not scale with its border width, so an invisible rule still costs
    // the gap it would have sat in.
    const withZero = Array.from(
      renderList({ day_separator_width: '0px' }).querySelectorAll<HTMLElement>('[style]'),
    ).map((node) => node.getAttribute('style') ?? '');

    expect(withZero.filter((style) => style.includes('border-top-style:solid'))).toEqual([]);
  });
});

describe('a week row is not styled as a month boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws the week rule at the week width, not the month width', () => {
    // The month width is non-zero and different, so a branch that stops requiring an actual
    // month boundary before choosing month styling shows up here as the wrong width on a week
    // row. The month rule itself is drawn elsewhere and is asserted separately below.
    const widths = weekRowRuleWidths(renderList(DISTINCT_RULES));

    expect(widths.length).toBeGreaterThan(0);
    expect(new Set(widths)).toEqual(new Set(['1px']));
  });

  it('still draws the month rule at its own width', () => {
    // The control for the assertion above: `5px` has to be reachable somewhere, or "no 5px on
    // a week row" would also pass on a card that had stopped drawing month rules entirely.
    const monthRules = Array.from(
      renderList(DISTINCT_RULES).querySelectorAll<HTMLElement>('.month-separator'),
    ).map((node) => node.getAttribute('style') ?? '');

    expect(monthRules.length).toBeGreaterThan(0);
    expect(monthRules.join(' ')).toContain('border-top-width:5px');
  });
});

describe('week numbers bring their own row', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the week row for the number even with no rule to draw', () => {
    // `show_week_numbers` alone is enough: the row exists to carry the number, and the
    // separator width only decides whether a line is drawn inside it. Requiring both would
    // drop week numbers for everyone who never set a separator width — which is everyone,
    // since it defaults to `0px`.
    const rendered = renderList({ show_week_numbers: 'iso', week_separator_width: '0px' });

    expect(rendered.querySelectorAll('.week-row-table').length).toBeGreaterThan(0);
    expect(rendered.querySelectorAll('.week-number').length).toBeGreaterThan(0);
  });

  it('renders no week row when neither a number nor a rule is asked for', () => {
    // The control, and the reason the assertion above is not vacuous: the row is absent by
    // default, so its presence there is caused by `show_week_numbers`.
    const rendered = renderList({ show_week_numbers: null, week_separator_width: '0px' });

    expect(rendered.querySelectorAll('.week-row-table')).toHaveLength(0);
  });

  it('suppresses the day separator where the week row already draws one', () => {
    // What `hasWeekSeparator` is actually for. It does not gate the week row — it stops a
    // day rule being stacked on top of one, so a week boundary shows a single line rather
    // than two. Requiring a non-zero `week_separator_width` before that suppression applies
    // would put both back at every week boundary for anyone showing week numbers without a
    // rule, which is the default pairing.
    const withNumbers = renderList({
      show_week_numbers: 'iso',
      week_separator_width: '0px',
      day_separator_width: '2px',
    });
    const withoutNumbers = renderList({
      show_week_numbers: null,
      week_separator_width: '0px',
      day_separator_width: '2px',
    });

    // The pair is the assertion: the same fixture draws one fewer day rule once the week row
    // is present. Either count alone would be satisfied by a card that never suppressed
    // anything, or by one that had stopped drawing day separators at all.
    expect(withoutNumbers.querySelectorAll('.separator')).toHaveLength(4);
    expect(withNumbers.querySelectorAll('.separator')).toHaveLength(3);
  });
});
