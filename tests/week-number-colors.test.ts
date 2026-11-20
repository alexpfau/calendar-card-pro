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
 * this pins the halves that have to agree: what the card writes for each combination of set and
 * unset colors, which background counts as a light wash, and which custom properties the
 * stylesheet declares beside the tile and the pill reads. A separator is pinned where each view
 * draws it, on both of the list's paths.
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
import * as Logger from '../src/utils/logger';
import '../src/calendar-card-pro';

const PILL_PROPERTIES = [
  '--calendar-card-week-number-color',
  '--calendar-card-week-number-bg-color',
  '--calendar-card-week-number-ink-floor',
  '--calendar-card-week-number-fill-source',
] as const;

/** The pill's colors the card writes for a configuration, by property. */
function pillProperties(overrides: Partial<Types.Config>): Record<string, string | undefined> {
  const written = generateCustomPropertiesObject(buildConfig(overrides));
  return Object.fromEntries(PILL_PROPERTIES.map((property) => [property, written[property]]));
}

/** The 31% mix the pill and the week separator shipped as their default until this change. */
const RETIRED_DEFAULT = 'color-mix(in srgb, var(--primary-color, #03a9f4) 31%, transparent)';

/** Nothing written, for each of the pill's properties a case leaves out. */
const UNWRITTEN = Object.fromEntries(PILL_PROPERTIES.map((property) => [property, undefined]));

describe('the pill colors the card writes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    ColorMix.resetColorMixSupport();
  });

  it.each<[string, Partial<Types.Config>, Record<string, string>]>([
    ['none while nothing is set, so the stylesheet draws the tile', {}, {}],
    [
      'a light background, as the source of its number and with the text color as its floor',
      { week_number_background_color: '#e67c7350' },
      {
        '--calendar-card-week-number-bg-color': '#e67c7350',
        '--calendar-card-week-number-ink-floor': 'var(--primary-text-color)',
        '--calendar-card-week-number-fill-source': '#e67c7350',
      },
    ],
    [
      'a solid background with the text color for its number, and no source to shade',
      { week_number_background_color: '#e67c73' },
      {
        '--calendar-card-week-number-bg-color': '#e67c73',
        '--calendar-card-week-number-ink-floor': 'var(--primary-text-color)',
      },
    ],
    [
      'a set number on the tile wash',
      { week_number_color: '#123456' },
      { '--calendar-card-week-number-color': '#123456' },
    ],
    [
      'both as set, and nothing for a number the set one overrides',
      { week_number_background_color: '#e67c7350', week_number_color: '#123456' },
      {
        '--calendar-card-week-number-color': '#123456',
        '--calendar-card-week-number-bg-color': '#e67c7350',
      },
    ],
  ])('writes %s', (_name, overrides, written) => {
    expect(pillProperties({ show_week_numbers: 'iso', ...overrides })).toEqual({
      ...UNWRITTEN,
      ...written,
    });
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

describe('a light wash, which colors its own number', () => {
  // Each opacity is what Chromium 151 and WebKit 27.2 compute for the same text as a
  // background-color. Where a row reads nothing, the browser can tell and the text alone cannot:
  // a relative color without an alpha of its own keeps its origin's, and light-dark() picks by
  // the color scheme.
  it.each<[string, number | undefined]>([
    ['#e67c7350', 0x50 / 255],
    ['#03a9f455', 0x55 / 255],
    ['#03a9f466', 0x66 / 255],
    ['#fff3', 0x33 / 255],
    ['#e67c73', 1],
    ['red', 1],
    ['transparent', 0],
    ['rgba(230, 124, 115, 0.3)', 0.3],
    ['rgb(230 124 115 / 30%)', 0.3],
    ['rgba(var(--rgb-primary-color), 0.2)', 0.2],
    ['hsl(0 50% 50% / 0.25)', 0.25],
    ['oklch(0.7 0.1 30 / 0.2)', 0.2],
    ['oklch(0.7 0.1 30)', 1],
    [RETIRED_DEFAULT, 0.31],
    ['color-mix(in srgb, transparent, red 20%)', 0.2],
    ['color-mix(in oklab, #ff000080 50%, transparent)', (0.5 * 0x80) / 255],
    ['color-mix(in srgb, red 50%, blue)', 1],
    ['color-mix(in srgb, red 20%, blue 20%)', 0.4],
    // Percentages summing under 100 leave the rest transparent; over 100, they are scaled down.
    ['color-mix(in srgb, var(--primary-color) 20%, transparent 20%)', 0.2],
    ['color-mix(in srgb, transparent 20%, 20% red)', 0.2],
    ['color-mix(in srgb, red 60%, transparent 60%)', 0.5],
    // A percentage before its color, no percentage, and no interpolation method.
    ['color-mix(in srgb, 20% var(--primary-color), transparent)', 0.2],
    ['color-mix(in srgb, red, transparent)', 0.5],
    ['color-mix(red 20%, transparent)', 0.2],
    ['color-mix(in srgb, color-mix(in srgb, red 50%, transparent) 50%, transparent)', 0.25],
    ['color-mix(in srgb, color-mix(in srgb, red, blue) 20%, transparent)', 0.2],
    ['color-mix(in srgb, red 2e1%, transparent)', 0.2],
    ['color-mix(in srgb, var(--paint) +20%, transparent)', 0.2],
    // A theme color is taken as opaque, and so is one named with an opaque fallback, but a
    // fallback that is translucent or carries a percentage of its own is the browser's to read,
    // as is a percentage computed with calc().
    ['color-mix(in srgb, var(--primary-color, #03a9f4) 20%, transparent)', 0.2],
    ['color-mix(in srgb, var(--missing, var(--paint)) 20%, transparent)', 0.2],
    ['color-mix(in srgb, var(--missing, #ff000066) 60%, transparent 60%)', undefined],
    ['color-mix(in srgb, var(--missing, red 20%), transparent)', undefined],
    ['color-mix(in srgb, var(--paint) calc(20%), transparent)', undefined],
    ['color-mix(in srgb, rgb(255 0 0) calc(20%), transparent)', undefined],
    ['rgb(255 0 0) calc(20%)', undefined],
    // The same with no space between the two: a function ends at its own closing parenthesis.
    ['color-mix(in srgb, rgb(255 0 0)calc(80%), transparent 80%)', undefined],
    ['color-mix(in srgb, calc(80%)rgb(255 0 0), transparent 80%)', undefined],
    ['color-mix(in srgb, var(--paint)calc(80%), transparent 80%)', undefined],
    ['rgb(255 0 0)calc(80%)', undefined],
    // Not a color: a percentage over 100 is invalid, as is a zero sum in Chromium, where WebKit
    // draws it transparent. Neither is a wash.
    ['color-mix(in srgb, red 120%, transparent)', undefined],
    ['color-mix(in srgb, red 0%, transparent 0%)', undefined],
    ['rgb(from var(--primary-color) r g b / 0.2)', 0.2],
    ['oklch(from #e67c73 l c h / 25%)', 0.25],
    ['rgb(from #ff000080 r g b)', undefined],
    ['light-dark(#03a9f440, #03a9f440)', undefined],
    ['var(--accent-color)', undefined],
    ['currentColor', undefined],
    ['color-mix(in srgb, currentColor 25%, transparent)', undefined],
    ['rgb(var(--rgb-primary-color))', undefined],
  ])('reads %s as %s opaque', (value, opacity) => {
    const read = ColorMix.opacityOf(value);
    if (opacity === undefined) expect(read).toBeUndefined();
    else expect(read).toBeCloseTo(opacity, 6);
  });

  it('is one up to about a third opaque, and nothing transparent or unknown', () => {
    const light = [
      '#e67c7350',
      '#03a9f455',
      RETIRED_DEFAULT,
      'rgba(var(--rgb-primary-color), 0.2)',
    ];
    const not = ['#03a9f466', '#e67c73', 'transparent', 'var(--accent-color)', 'currentColor'];
    expect(light.map(ColorMix.isLightWash)).toEqual(light.map(() => true));
    expect(not.map(ColorMix.isLightWash)).toEqual(not.map(() => false));
  });

  it('reads nothing from a value that is not text', () => {
    for (const value of [333333, true, null, undefined, { color: 'red' }]) {
      expect(ColorMix.opacityOf(value as unknown as string), String(value)).toBeUndefined();
      expect(ColorMix.isLightWash(value as unknown as string), String(value)).toBe(false);
    }
  });
});

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: unknown;
  events: unknown[];
  isInitialLoad: boolean;
  updateComplete: Promise<boolean>;
}

const WEEK_MARK_OPTIONS = [
  'week_number_color',
  'week_number_background_color',
  'week_separator_color',
] as const;

// Unquoted in YAML, `333333` arrives as a number and `true` as a boolean.
const NOT_TEXT = WEEK_MARK_OPTIONS.flatMap((key) => [
  [key, 333333],
  [key, true],
]) as [string, unknown][];

describe('a week mark color written as something other than text', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /** Mounts a card through setConfig and returns its ha-card and the warnings it gave. */
  async function mount(config: Record<string, unknown>): Promise<{
    haCard: HTMLElement;
    warnings: string[];
  }> {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ entities: ['calendar.personal'], show_week_numbers: 'iso', ...config });
    card.isInitialLoad = false;
    document.body.appendChild(card);
    card.hass = { states: {}, locale: { language: 'en' }, connection: {} };
    card.events = [];
    await card.updateComplete;
    const haCard = card.shadowRoot?.querySelector('ha-card') as HTMLElement | null;
    expect(haCard, 'rendered ha-card').not.toBeNull();
    return { haCard: haCard!, warnings: warn.mock.calls.map(([message]) => String(message)) };
  }

  it.each(NOT_TEXT)(
    'is reported once by setConfig and drawn as unset: %s %o',
    async (key, value) => {
      const { haCard, warnings } = await mount({ [key]: value });
      for (const property of PILL_PROPERTIES) {
        expect(haCard.style.getPropertyValue(property), property).toBe('');
      }
      const reports = warnings.filter((message) => message.includes(key));
      expect(reports).toHaveLength(1);
      expect(reports[0]).toContain(`${key} ${JSON.stringify(value)}`);
    },
  );

  it('stays quiet for colors written as text', async () => {
    const { warnings } = await mount({
      week_number_color: '#123456',
      week_number_background_color: '#e67c7350',
      week_separator_color: 'red',
    });
    expect(
      warnings.filter((message) => WEEK_MARK_OPTIONS.some((key) => message.includes(key))),
    ).toEqual([]);
  });

  it('draws a week separator as unset where its color is not text', () => {
    for (const value of [333333, true]) {
      const config = buildConfig({
        week_separator_color: value as unknown as string,
      });
      expect(Leaves.weekSeparatorColor(config)).toBe(Leaves.WEEK_MARK_COLOR);
      expect(Leaves.weekSeparatorInk(config)).toBe(Leaves.WEEK_MARK_INK);
    }
  });

  it('is reported in a view block under its path, and that view draws it as unset', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const config = buildConfig({
      show_week_numbers: 'iso',
      column: { week_number_background_color: 333333 },
    } as unknown as Partial<Types.Config>);
    ViewConfig.validateColumnOverrides(config);
    const reports = warn.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes('week_number_background_color'));
    expect(reports).toHaveLength(1);
    expect(reports[0]).toContain('column.week_number_background_color 333333');
    const column = generateCustomPropertiesObject(
      ViewConfig.resolveEffectiveConfig(config, 'column'),
    );
    expect(column['--calendar-card-week-number-bg-color']).toBeUndefined();
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

/**
 * The week separator's color and its own color property as each view writes them, on both of
 * the list's paths: `color|own color` for every separator drawn.
 */
function separatorColors(overrides: Partial<Types.Config>): Record<string, string[]> {
  const read = (root: HTMLElement, selector: string, property: string): string[] =>
    [...root.querySelectorAll<HTMLElement>(selector)].map(
      (el) => `${el.style.getPropertyValue(property)}|${el.style.getPropertyValue('color')}`,
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

  it("is the pill's background in every view while it is unset, in the pill's own color", () => {
    // The pill's number color as the separator's own, so currentColor in a background means the
    // same color on both.
    for (const [where, colors] of Object.entries(separatorColors({}))) {
      // Each place draws a separator at all, so an empty list cannot pass.
      expect(colors.length, where).toBeGreaterThan(0);
      expect(new Set(colors), where).toEqual(
        new Set([`${Leaves.WEEK_MARK_COLOR}|${Leaves.WEEK_MARK_INK}`]),
      );
    }
  });

  it('is its own color wherever it is set, and takes no color property', () => {
    for (const [where, colors] of Object.entries(
      separatorColors({ week_separator_color: 'red' }),
    )) {
      expect(colors.length, where).toBeGreaterThan(0);
      expect(new Set(colors), where).toEqual(new Set(['red|']));
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

  /** A declaration outside every at-rule, on a rule whose selectors include `selector`. */
  const base = (selector: string, property: string): string =>
    all.find((d) => d.at.length === 0 && d.selectors.includes(selector) && d.property === property)!
      .value;

  it("has the pill read today's tile's wash and ink, as the tile does", () => {
    expect(base('.week-number', 'background-color')).toBe(
      'var(--calendar-card-week-number-bg-color, var(--calendar-card-today-indicator-wash, rgba(128, 128, 128, 0.31)))',
    );
    // The separators repeat the pill's number color as their own; the two have to agree.
    expect(base('.week-number', 'color')).toBe(Leaves.WEEK_MARK_INK);
    expect(Leaves.WEEK_MARK_INK).toContain(
      'var(--calendar-card-today-indicator-ink, var(--primary-text-color))',
    );
    expect(base('.day.today-tile', 'background')).toBe(
      'var(--calendar-card-today-indicator-wash, var(--calendar-card-today-indicator-color))',
    );
  });

  it('declares the wash and the ink on the card and on the tile, in both mixing tiers', () => {
    for (const pattern of [OKLAB, RELATIVE]) {
      for (const property of [
        '--calendar-card-today-indicator-wash',
        '--calendar-card-today-indicator-ink',
      ]) {
        expect(
          tier(pattern, property).map((d) => d.selectors),
          `${pattern} ${property}`,
        ).toEqual([['ha-card', '.day.today-tile']]);
      }
    }
    // Nothing declares the wash for a browser without color-mix(): there the pill falls back to
    // its gray and the text color, and the tile to its solid color.
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
    // From the source the card writes only for a light wash, at full opacity as the tile's.
    expect(fill.value).toContain(
      'oklab(from var(--calendar-card-week-number-fill-source) l a b / 1)',
    );
    // The same mix and chroma restoration as the tile's ink, so the two agree on a light wash.
    for (const value of [ink.value, fill.value]) {
      expect(value).toContain('45%, var(--primary-text-color)');
      expect(value).toContain('l calc(a * 2.2) calc(b * 2.2) / 1');
    }
    expect(all.filter((d) => d.property === '--calendar-card-week-number-fill-ink')).toHaveLength(
      1,
    );
  });

  it("keeps the solid tile's ink off the card, so a pill without color-mix() keeps the text color", () => {
    // Declared on ha-card as well, the white ink meant for the solid tile would reach the pill,
    // whose floor is gray, through WEEK_MARK_INK.
    const floors = all.filter(
      (d) =>
        d.property === '--calendar-card-today-indicator-ink' &&
        !d.at.some((at) => OKLAB.test(at) || RELATIVE.test(at)),
    );
    expect(floors.map((d) => [d.at, d.selectors, d.value])).toEqual([
      [[], ['.day.today-tile'], 'var(--text-primary-color, #fff)'],
      // The wide month's filled tile, declared on the tile as well and never on ha-card.
      [
        [],
        ['.month-container:not(.month-compact) .month-date > .day.today-tile'],
        'var(--text-primary-color, #fff)',
      ],
    ]);
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
