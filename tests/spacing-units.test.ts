import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { scaleLength } from '../src/config/view';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * `day_spacing` is a CSS length, not a pixel count. The docs type it `string`, the
 * column tests name `2em` and `calc(...)` as legal, and ordinary day tables honour
 * whatever the author wrote by passing it straight into `--calendar-card-day-spacing`.
 *
 * The list separators did not. Every one of them ran the value through `parseFloat` and
 * re-appended `px`, so `day_spacing: 2em` spaced the day tables by `2em` and the rules
 * between them by `2px`. The larger the author scaled the card, the further the rules
 * drifted from the gaps they were supposed to divide — and because the default is `10px`,
 * where the two spellings agree, the whole suite agreed with the bug.
 *
 * That is why this file pins a non-pixel unit specifically, and keeps a pixel case beside
 * every assertion: the pixel case is what the old code got right, so a test that only
 * checked pixels would have passed against the defect.
 */

function eventAt(date: string, summary: string): Types.CalendarEventData {
  return {
    start: { dateTime: `${date}T12:00:00.000Z` },
    end: { dateTime: `${date}T13:00:00.000Z` },
    summary,
    _entityId: 'calendar.personal',
  };
}

// Chosen so all three boundaries are reachable in one render: consecutive days give day
// separators, Jun 18 (Thu) to Jun 22 (Mon) crosses a week, and Jun 22 to Jul 1 crosses a
// month. A fixture inside a single week renders no week rule at all, which would make
// every assertion below pass vacuously.
const ACROSS_BOUNDARIES: Types.CalendarEventData[] = [
  eventAt('2026-06-18', 'Thursday'),
  eventAt('2026-06-19', 'Friday'),
  eventAt('2026-06-22', 'Monday, new week'),
  eventAt('2026-07-01', 'Wednesday, new month'),
];

function renderWith(overrides: Partial<Types.Config>): HTMLElement {
  const config = buildConfig({
    days_to_show: 30,
    day_separator_width: '1px',
    week_separator_width: '1px',
    month_separator_width: '1px',
    ...overrides,
  });
  const days = EventUtils.groupEventsByDay(ACROSS_BOUNDARIES, config, false, 'en');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en'), container);
  return container;
}

/** Inline style attributes of every element matching `selector`, whitespace-normalized. */
function stylesOf(container: HTMLElement, selector: string): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).map((node) =>
    (node.getAttribute('style') ?? '').replace(/:\s+/g, ':'),
  );
}

describe('scaleLength', () => {
  it('scales a pixel length exactly as the previous arithmetic did', () => {
    // The refactor has to be a no-op for pixels, or it silently re-lays-out every
    // existing card. These are the four factors the separators actually use.
    expect(scaleLength('10px', 1)).toBe('10px');
    expect(scaleLength('10px', 1.5)).toBe('15px');
    expect(scaleLength('10px', 0.5)).toBe('5px');
    expect(scaleLength('10px', -0.5)).toBe('-5px');
  });

  it.each([
    ['2em', 1.5, '3em'],
    ['1.5rem', 2, '3rem'],
    ['10%', 0.5, '5%'],
    ['4vh', -0.25, '-1vh'],
  ])('keeps %o in its own unit', (value, factor, expected) => {
    expect(scaleLength(value, factor)).toBe(expected);
  });

  it('treats a unitless length as pixels, matching coercePixelLength', () => {
    expect(scaleLength('12', 1.5)).toBe('18px');
  });

  it('defers to the browser for lengths it cannot evaluate', () => {
    // `calc()` and `var()` cannot be resolved at render time — the variable may not even
    // be defined yet. Wrapping is the only correct answer; the parenthesis matters
    // because a defaulted variable expands to several terms.
    expect(scaleLength('calc(1em + 2px)', 1.5)).toBe('calc(1.5 * (calc(1em + 2px)))');
    expect(scaleLength('var(--x, 1em + 2px)', 2)).toBe('calc(2 * (var(--x, 1em + 2px)))');
  });

  it('tolerates surrounding whitespace', () => {
    expect(scaleLength('  2em  ', 1.5)).toBe('3em');
  });
});

describe('list separator spacing honours the configured unit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all three separator kinds, so the assertions below are not vacuous', () => {
    const container = renderWith({ day_spacing: '10px' });

    expect(stylesOf(container, '.separator').length).toBeGreaterThan(0);
    expect(stylesOf(container, '.week-separator').length).toBeGreaterThan(0);
    expect(stylesOf(container, '.month-separator').length).toBeGreaterThan(0);
  });

  it('spaces pixel separators exactly as before', () => {
    // The control. This passed against the defect too, which is the point: it proves the
    // fixture reaches the code under test without proving anything about units.
    const container = renderWith({ day_spacing: '10px' });

    expect(stylesOf(container, '.separator')[0]).toContain('margin-bottom:10px');
    expect(stylesOf(container, '.week-separator')[0]).toContain('margin-top:10px');
    expect(stylesOf(container, '.month-separator')[0]).toContain('margin-top:15px');
  });

  it('spaces em separators in em, not px', () => {
    // The regression. Against the old `parseFloat` path these read 2px, 2px and 3px —
    // the rules collapsed to a fifth of the gap they were dividing.
    const container = renderWith({ day_spacing: '2em' });

    expect(stylesOf(container, '.separator')[0]).toContain('margin-bottom:2em');

    const week = stylesOf(container, '.week-separator')[0];
    expect(week).toContain('margin-top:2em');
    expect(week).toContain('margin-bottom:2em');

    const month = stylesOf(container, '.month-separator')[0];
    expect(month).toContain('margin-top:3em');
    expect(month).toContain('margin-bottom:3em');
  });

  it('keeps the week-number row in the configured unit', () => {
    // A separate parse site from the three above, feeding a negative pull-up that has to
    // cancel the day table's own margin. In px it read -1px/1px for a 2em spacing, so the
    // row sat a whole em away from where it belonged.
    const container = renderWith({ day_spacing: '2em', show_week_numbers: 'iso' });
    const rows = stylesOf(container, '.week-row-table');

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((style) => style.includes('margin-bottom:1em'))).toBe(true);

    // Every margin the rows carry is either a genuine zero — the first row deliberately
    // has no pull-up — or expressed in the author's unit. Nothing may be pixel-ised.
    const margins = rows.flatMap((style) => Array.from(style.matchAll(/margin-\w+:([^;]+)/g)));
    expect(margins.length).toBeGreaterThan(0);
    expect(margins.map((m) => m[1]).filter((v) => v !== '0px' && !v.endsWith('em'))).toEqual([]);
  });

  it('passes an unresolvable length through to the browser', () => {
    // `calc()` is explicitly legal for this option, and nothing in the renderer can
    // evaluate it. The rule has to carry an expression rather than a parsed `NaNpx`.
    const container = renderWith({ day_spacing: 'calc(1em + 2px)' });

    expect(stylesOf(container, '.month-separator')[0]).toContain('calc(1.5 * (calc(1em + 2px)))');
    expect(stylesOf(container, '.separator')[0]).not.toContain('NaN');
  });
});
