/**
 * The week-number pill and the week separator take today's tile's colors (backlog item 325).
 *
 * Unset, the pill is drawn as the tile is: the tile's wash behind it and the tile's ink for its
 * number, both from `today_indicator_color`, and an unset week separator is the pill's
 * background. A background set without a number color colors its number by the tile's rule, a
 * shade of that background while it is a light wash, and the text color behind anything
 * stronger.
 *
 * The colors themselves are resolved by the browser, which the test environment cannot do, so
 * this pins the two halves that have to agree: what the card writes for each combination of set
 * and unset colors, and which custom properties the stylesheet declares beside the tile and the
 * pill reads. A separator is pinned where each view draws it, on both of the list's paths.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { type Declaration, declarations } from './helpers/css-declarations';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as Leaves from '../src/rendering/leaves';
import * as Render from '../src/rendering/render';
import { cardStyles, generateCustomPropertiesObject } from '../src/rendering/styles';
import * as ColorMix from '../src/utils/color-mix';
import * as EventUtils from '../src/utils/events';

const PILL_PROPERTIES = [
  '--calendar-card-week-number-color',
  '--calendar-card-week-number-bg-color',
  '--calendar-card-week-number-ink-floor',
] as const;

/** The pill's colors the card writes for a configuration, by property. */
function pillProperties(overrides: Partial<Types.Config>): Record<string, string | undefined> {
  const written = generateCustomPropertiesObject(buildConfig(overrides));
  return Object.fromEntries(PILL_PROPERTIES.map((property) => [property, written[property]]));
}

/** The 31% mix the pill and the week separator shipped as their default until this change. */
const RETIRED_DEFAULT = 'color-mix(in srgb, var(--primary-color, #03a9f4) 31%, transparent)';

describe('the pill colors the card writes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    ColorMix.resetColorMixSupport();
  });

  it.each<[string, Partial<Types.Config>, Record<string, string | undefined>]>([
    [
      'none while nothing is set, so the stylesheet draws the tile',
      {},
      {
        '--calendar-card-week-number-color': undefined,
        '--calendar-card-week-number-bg-color': undefined,
        '--calendar-card-week-number-ink-floor': undefined,
      },
    ],
    [
      'a set background, with the text color as the floor for its number',
      { week_number_background_color: '#e67c7350' },
      {
        '--calendar-card-week-number-color': undefined,
        '--calendar-card-week-number-bg-color': '#e67c7350',
        '--calendar-card-week-number-ink-floor': 'var(--primary-text-color)',
      },
    ],
    [
      'a set number on the tile wash',
      { week_number_color: '#123456' },
      {
        '--calendar-card-week-number-color': '#123456',
        '--calendar-card-week-number-bg-color': undefined,
        '--calendar-card-week-number-ink-floor': undefined,
      },
    ],
    [
      'both as set, and no floor, which the set number would override anyway',
      { week_number_background_color: '#e67c7350', week_number_color: '#123456' },
      {
        '--calendar-card-week-number-color': '#123456',
        '--calendar-card-week-number-bg-color': '#e67c7350',
        '--calendar-card-week-number-ink-floor': undefined,
      },
    ],
  ])('writes %s', (_name, overrides, expected) => {
    expect(pillProperties({ show_week_numbers: 'iso', ...overrides })).toEqual(expected);
  });

  it("writes a view block's own background in that view only", () => {
    const config = buildConfig({
      show_week_numbers: 'iso',
      column: { week_number_background_color: '#e67c7350' },
    } as Partial<Types.Config>);
    const column = generateCustomPropertiesObject(
      ViewConfig.resolveEffectiveConfig(config, 'column'),
    );
    const list = generateCustomPropertiesObject(ViewConfig.resolveEffectiveConfig(config, 'list'));
    expect(column['--calendar-card-week-number-bg-color']).toBe('#e67c7350');
    expect(list['--calendar-card-week-number-bg-color']).toBeUndefined();
  });

  it('draws the retired default, set by hand, as its gray where color-mix() is unknown', () => {
    vi.stubGlobal('CSS', { supports: () => false });
    ColorMix.resetColorMixSupport();
    expect(
      pillProperties({ show_week_numbers: 'iso', week_number_background_color: RETIRED_DEFAULT })[
        '--calendar-card-week-number-bg-color'
      ],
    ).toBe('rgba(128, 128, 128, 0.31)');
  });
});

/** One event a day on each date given. */
function eventsOn(dates: string[]): Types.CalendarEventData[] {
  return dates.map((date) => ({
    start: { dateTime: `${date}T09:00:00.000Z` },
    end: { dateTime: `${date}T10:00:00.000Z` },
    summary: `event-${date}`,
    _entityId: 'calendar.anna',
  }));
}

/** Thursday to Tuesday in June, so a Monday-first week turns on screen without a month doing so. */
const ACROSS_A_WEEK = eventsOn(['2026-06-25', '2026-06-26', '2026-06-29', '2026-06-30']);

/** One view drawn as the card draws it, with its effective configuration. */
function draw(view: Types.EffectiveView, overrides: Partial<Types.Config>): HTMLElement {
  const config = buildConfig({
    view,
    days_to_show: 6,
    start_date: '2026-06-25',
    first_day_of_week: 'monday',
    week_separator_width: '2px',
    show_empty_days: true,
    ...overrides,
  });
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(ACROSS_A_WEEK, config, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, FROZEN_NOW)
      : view === 'column'
        ? Render.renderColumnGroupedEvents(days, effective, 'en', undefined, null)
        : Render.renderGroupedEvents(days, effective, 'en', undefined, null),
    container,
  );
  return container;
}

/** The week separator's color as each view writes it, on both of the list's paths. */
function separatorColors(overrides: Partial<Types.Config>): Record<string, string[]> {
  const read = (root: HTMLElement, selector: string, property: string): string[] =>
    [...root.querySelectorAll<HTMLElement>(selector)].map((el) =>
      el.style.getPropertyValue(property),
    );
  return {
    'list beside the pill': read(
      draw('list', { show_week_numbers: 'iso', ...overrides }),
      '[style*="--separator-display: block"], [style*="--separator-display:block"]',
      '--separator-border-color',
    ),
    'list without week numbers': read(
      draw('list', overrides),
      '.week-separator',
      'border-top-color',
    ),
    column: read(draw('column', overrides), '.column-separator-week', 'background-color'),
    grid: read(draw('grid', overrides), '.grid-separator-week', '--calendar-card-grid-rule-paint'),
  };
}

describe('the week separator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the pill's background in every view while it is unset", () => {
    const drawn = separatorColors({});
    for (const [where, colors] of Object.entries(drawn)) {
      // Each place draws a separator at all, so an empty list cannot pass.
      expect(colors.length, where).toBeGreaterThan(0);
      expect(new Set(colors), where).toEqual(new Set([Leaves.WEEK_MARK_COLOR]));
    }
  });

  it('is its own color wherever it is set', () => {
    const drawn = separatorColors({ week_separator_color: '#ff0000' });
    for (const [where, colors] of Object.entries(drawn)) {
      expect(colors.length, where).toBeGreaterThan(0);
      expect(
        colors.map((color) => color.replace(/\s/g, '')),
        where,
      ).toEqual(colors.map(() => expect.stringMatching(/^(#ff0000|rgb\(255,0,0\))$/)));
    }
  });

  it("reads the pill's background, set or not, and the pill's gray without color-mix()", () => {
    expect(Leaves.WEEK_MARK_COLOR).toBe(
      'var(--calendar-card-week-number-bg-color, var(--calendar-card-today-indicator-wash, rgba(128, 128, 128, 0.31)))',
    );
  });
});

describe('the stylesheet', () => {
  // Parentheses closed up, so a value reads the same however the source breaks its lines.
  const all = declarations(cardStyles.cssText).map((d) => ({
    ...d,
    value: d.value.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')'),
  }));
  const RELATIVE = /^@supports \(color: oklch\(from red l c h\)\)/;
  const OKLAB = /^@supports \(color: color-mix\(in oklab, red, blue\)\)$/;

  /** A property's declarations under one tier, with the selectors that carry them. */
  const tier = (pattern: RegExp, property: string): Declaration[] =>
    all.filter((d) => d.property === property && d.at.length === 1 && pattern.test(d.at[0]));

  const pill = (property: string): string =>
    all.find(
      (d) => d.at.length === 0 && d.selectors.includes('.week-number') && d.property === property,
    )!.value;

  it("has the pill read today's tile's wash and ink, as the tile does", () => {
    expect(pill('background-color')).toBe(
      'var(--calendar-card-week-number-bg-color, var(--calendar-card-today-indicator-wash, rgba(128, 128, 128, 0.31)))',
    );
    expect(pill('color')).toContain(
      'var(--calendar-card-today-indicator-ink, var(--primary-text-color))',
    );
    const tile = all.find(
      (d) =>
        d.at.length === 0 && d.selectors.includes('.day.today-tile') && d.property === 'background',
    )!;
    expect(tile.value).toContain('var(--calendar-card-today-indicator-wash');
  });

  it('declares the wash and the ink on the card and on the tile, in both mixing tiers', () => {
    for (const pattern of [OKLAB, RELATIVE]) {
      for (const property of [
        '--calendar-card-today-indicator-wash',
        '--calendar-card-today-indicator-ink',
      ]) {
        const found = tier(pattern, property);
        expect(
          found.map((d) => d.selectors),
          `${pattern} ${property}`,
        ).toEqual([['ha-card', '.day.today-tile']]);
      }
    }
    // Nothing declares them for a browser without color-mix(): there the pill falls back to its
    // gray and the text color, and the tile to its solid color.
    const unsupported = all.filter(
      (d) =>
        d.property === '--calendar-card-today-indicator-wash' &&
        !d.at.some((at) => OKLAB.test(at) || RELATIVE.test(at)),
    );
    expect(unsupported).toEqual([]);
  });

  it("reads the indicator color at full opacity for the tile's ink, as for a set pill's", () => {
    const [ink] = tier(RELATIVE, '--calendar-card-today-indicator-ink');
    expect(ink.value).toContain('oklab(from var(--calendar-card-today-indicator-color) l a b / 1)');
    const [fill] = tier(RELATIVE, '--calendar-card-week-number-fill-ink');
    expect(fill.selectors).toEqual(['ha-card']);
    expect(fill.value).toContain('oklab(from var(--calendar-card-week-number-bg-color) l a b /');
    // A third opaque, the cutoff the editor's words and the documentation name.
    expect(fill.value).toContain('calc((0.34 - alpha) * 1000)');
    // The same mix and chroma restoration as the tile's ink, so the two agree on a light wash.
    for (const value of [ink.value, fill.value]) {
      expect(value).toContain('45%, var(--primary-text-color)');
      expect(value).toContain('l calc(a * 2.2) calc(b * 2.2) / 1');
    }
    expect(all.filter((d) => d.property === '--calendar-card-week-number-fill-ink')).toHaveLength(
      1,
    );
  });

  it("scales the marks' chroma in Oklab, which keeps the hue of a low-chroma mix", () => {
    const marks = [
      '--calendar-card-today-indicator-wash',
      '--calendar-card-today-indicator-ink',
      '--calendar-card-week-number-fill-ink',
    ];
    const relative = all.filter((d) => marks.includes(d.property) && d.value.includes('from'));
    expect(relative.length).toBe(3);
    for (const d of relative) expect(d.value, d.property).not.toContain('calc(c *');
  });
});
