import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import { generateCustomPropertiesObject } from '../src/rendering/styles';
import * as ColorMix from '../src/utils/color-mix';
import * as EventUtils from '../src/utils/events';

/**
 * Safari before 16.2 has no color-mix(). Where the card writes a mix into an inline style from
 * script, rather than declaring it in a stylesheet, no `@supports` block can give it a fallback,
 * and once the var() inside it is substituted the declaration is invalid: the grid lost every
 * rule, separator, shading and fill, the week number lost its pill, a list's week separator was
 * drawn in the full text color, and an event whose calendar takes the theme's color lost its
 * tint. `ColorMix.floorColor` writes a floor in its place there, measured once from the browser.
 * `tests/color-mix-fallback.test.ts` holds the same line for the stylesheets.
 *
 * Pinned four ways, so a mix cannot be written from script without a floor:
 *
 * - Every color-mix() in the source outside a stylesheet is listed by value, in any case, and no
 *   `mix(` may stand anywhere else in it, so one assembled from pieces fails too. Each must be a
 *   mix with a floor or one of the three the card resolves itself.
 * - Every option whose default is a mix, nested ones included, is listed. So is every color
 *   option the views write from script, with every place they write it, found by setting it to
 *   a marker, and the files that read them. A mixed default without a floor fails, a view that
 *   stops drawing one of those places fails, and so does a new file reading one of them.
 * - Each view is rendered as a browser with color-mix() and one without would render it. At
 *   every inline declaration holding a mix in the first, the second must hold exactly the floor
 *   below, or nothing where the mix is one the card leaves unwritten there. The floors are
 *   written out here rather than read from the table, so the table cannot vouch for itself.
 * - A mix the card ships, written into each of those color options, is drawn as its floor at
 *   every place the option is written, defaults or not.
 */

const ROOT = join(process.cwd(), 'src');

/** Whether a value holds a CSS function ending in `mix`, in any case, as CSS reads it. */
const hasMix = (value: string): boolean => /mix\(/i.test(value);

/** Every `.ts` file under `dir`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/**
 * A file's script: block comments, whole-line comments and every `css` tagged template removed.
 * The stylesheets' own mixes are `tests/color-mix-fallback.test.ts`'s to pin.
 */
function script(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\bcss`(?:[^`\\]|\\.)*`/g, 'css``');
}

/** Each color-mix() in a text, in any case, to the parenthesis that balances it. */
function mixesIn(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (let start = lower.indexOf('color-mix('); start !== -1;) {
    let depth = 0;
    let end = start + 'color-mix'.length;
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++;
      else if (text[end] === ')' && --depth === 0) break;
    }
    found.push(text.slice(start, end + 1));
    start = lower.indexOf('color-mix(', end);
  }
  return found;
}

/** Every color-mix() written in script, as `file: text`. */
function scriptMixes(): string[] {
  return sourceFiles(ROOT)
    .flatMap((path) => mixesIn(script(path)).map((mix) => `${relative(ROOT, path)}: ${mix}`))
    .sort();
}

/** Every CSS `mix(` in script that is not a `color-mix(`, as `file: text around it`. */
function looseMixes(): string[] {
  return sourceFiles(ROOT).flatMap((path) => {
    const text = script(path);
    // A `mix(` that ends a name, as in `supportsColorMix(`, is a call in script, not CSS.
    return [...text.matchAll(/(?<![\w$])mix\(/gi)]
      .filter((m) => text.slice(Math.max(0, m.index - 6), m.index).toLowerCase() !== 'color-')
      .map((m) => `${relative(ROOT, path)}: ${text.slice(m.index - 20, m.index + 20)}`);
  });
}

/**
 * The mixes in script that need no floor from the table, each for its own reason: the probe is
 * a question rather than a color, an event's tint gives its own floor (`translucentVar` in
 * `helpers.ts`), and the two washes are not written at all where color-mix() is unknown.
 */
const RESOLVED_ELSEWHERE = new Set([
  'color-mix(in srgb, red, blue)',
  'color-mix(in srgb, ${color} ${opacity}%, transparent)',
  'color-mix(in srgb, currentColor 6%, transparent)',
  'color-mix(in srgb, currentColor 10%, transparent)',
]);

/** The shipped mix written into each color option below, and the floor it must draw as. */
const DIVIDER_MIX = 'color-mix(in srgb, var(--divider-color) 50%, transparent)';

/**
 * What each mix the scenarios below write draws as without color-mix(), or `undefined` where the
 * card leaves it unwritten there. The tint is the one at the scenarios' 20%.
 */
const FLOORS: Readonly<Record<string, string | undefined>> = {
  [DIVIDER_MIX]: 'rgba(128, 128, 128, 0.12)',
  'color-mix(in srgb, var(--primary-text-color) 4%, transparent)': 'rgba(128, 128, 128, 0.08)',
  'color-mix(in srgb, var(--primary-color, #03a9f4) 31%, transparent)': 'rgba(128, 128, 128, 0.31)',
  'color-mix(in srgb, var(--primary-text-color) 60%, transparent)': 'var(--secondary-text-color)',
  'color-mix(in srgb, var(--primary-color, #03a9f4) 20%, transparent)': 'rgba(128, 128, 128, 0.2)',
  'color-mix(in srgb, currentColor 6%, transparent)': undefined,
  'color-mix(in srgb, currentColor 10%, transparent)': undefined,
};

/** Every option whose default is a mix, as `scope:path`, nested options included. */
function mixedDefaults(): Map<string, string> {
  const tables: Array<[string, Record<string, unknown>]> = [
    ['card', DEFAULT_CONFIG as unknown as Record<string, unknown>],
    ['column', ViewConfig.COLUMN_DEFAULTS],
    ['column', ViewConfig.COLUMN_DEFAULT_OVERRIDES],
    ['grid', ViewConfig.TIME_GRID_DEFAULTS],
    ['grid', ViewConfig.TIME_GRID_DEFAULT_OVERRIDES],
  ];
  const found = new Map<string, string>();
  const walk = (scope: string, path: string[], value: unknown): void => {
    if (typeof value === 'string' && hasMix(value)) {
      found.set(`${scope}:${path.join('.')}`, value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, inner] of Object.entries(value)) walk(scope, [...path, key], inner);
    }
  };
  for (const [scope, table] of tables) walk(scope, [], table);
  return found;
}

/** The options whose default is a mix, pinned by value. */
const MIXED_OPTIONS = [
  'card:week_number_background_color',
  'card:week_separator_color',
  'grid:allday_band_line_color',
  'grid:day_header_separator_color',
  'grid:day_separator_color',
  'grid:hour_line_color',
  'grid:weekend_background_color',
];

/**
 * Every color option the views write from script outside the card's own style, which takes all
 * of its properties through one floor: the ones whose default is a mix, and the rest a user can
 * set to one. A view's own block (`column:`, `time_grid:`) is named where only it reads one.
 */
const COLOR_OPTIONS = [
  ...MIXED_OPTIONS,
  'card:day_separator_color',
  'card:month_separator_color',
  'column:day_header_separator_color',
  'grid:today_background_color',
].sort();

type Scenario = { view: Types.EffectiveView; overrides: Partial<Types.Config> };

/**
 * One rendering per view, with every color option above on: week numbers, week, month and day
 * separators, empty days, a tint from the theme's color (the calendar has none of its own), and
 * in the grid the weekend, half-hour slots and the all-day band. Sixteen days from June 17, with
 * empty days shown, so the week and the month turn on screen.
 */
const SEPARATORS: Partial<Types.Config> = {
  days_to_show: 16,
  week_separator_width: '2px',
  month_separator_width: '3px',
  day_separator_width: '1px',
  show_empty_days: true,
};

const SCENARIOS: Record<string, Scenario> = {
  'list-week-numbers': {
    view: 'list',
    overrides: { ...SEPARATORS, show_week_numbers: 'iso', event_background_opacity: 20 },
  },
  'list-separators': {
    view: 'list',
    overrides: { ...SEPARATORS, event_background_opacity: 20 },
  },
  // From a Monday a week before June 1, 2026, also a Monday, so a week row turns the month.
  'list-month-week': {
    view: 'list',
    overrides: {
      ...SEPARATORS,
      start_date: '2026-05-25',
      days_to_show: 10,
      show_week_numbers: 'iso',
    },
  },
  column: {
    view: 'column',
    overrides: {
      ...SEPARATORS,
      view: 'column',
      show_week_numbers: 'iso',
      event_background_opacity: 20,
      column: { day_header_separator_width: '1px' },
    } as Partial<Types.Config>,
  },
  grid: {
    view: 'grid',
    overrides: {
      ...SEPARATORS,
      view: 'grid',
      show_week_numbers: 'iso',
      time_grid: { slot_minutes: 30 },
    } as Partial<Types.Config>,
  },
};

/** The YAML block a scope's options are read from, or none for a card-wide one. */
const BLOCK: Readonly<Record<string, string | undefined>> = {
  card: undefined,
  column: 'column',
  grid: 'time_grid',
};

/** An option set to `value` where its scope reads it. */
function withOption(overrides: Partial<Types.Config>, option: string, value: string) {
  const [scope, path] = option.split(':');
  const copy = structuredClone(overrides) as Record<string, unknown>;
  const block = BLOCK[scope];
  const keys = block === undefined ? path.split('.') : [block, ...path.split('.')];
  let target = copy;
  for (const key of keys.slice(0, -1)) {
    target[key] = { ...((target[key] as Record<string, unknown>) ?? {}) };
    target = target[key] as Record<string, unknown>;
  }
  target[keys[keys.length - 1]] = value;
  return copy as Partial<Types.Config>;
}

/** One inline declaration: where it is written, which property, and its value. */
type Declaration = { at: string; property: string; value: string };

/**
 * Every inline declaration a scenario writes from script, in document order: the card's own
 * custom properties, then each styled element's, each element named by its position and class.
 */
function inlineDeclarations(scenario: Scenario, overrides = scenario.overrides): Declaration[] {
  const config = buildConfig(overrides);
  const effective = ViewConfig.resolveEffectiveConfig(config, scenario.view);
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', scenario.view);
  const template =
    scenario.view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, FROZEN_NOW)
      : scenario.view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en')
        : Render.renderGroupedEvents(days, effective, 'en');
  const container = document.createElement('div');
  litRender(template, container);
  const found: Declaration[] = Object.entries(generateCustomPropertiesObject(effective)).map(
    ([property, value]) => ({ at: 'card', property, value }),
  );
  [...container.querySelectorAll('[style]')].forEach((el, index) => {
    const label = (el.getAttribute('class') ?? el.localName).replace(/\s+/g, ' ').trim();
    for (const part of (el.getAttribute('style') ?? '').split(';')) {
      const colon = part.indexOf(':');
      if (colon === -1) continue;
      found.push({
        at: `${index} ${label}`,
        property: part.slice(0, colon).trim(),
        value: part.slice(colon + 1).trim(),
      });
    }
  });
  return found;
}

/** Answers as a browser without color-mix() does, and forgets any earlier answer. */
function withoutColorMix(): void {
  vi.stubGlobal('CSS', {
    supports: (property: string, value?: string) => !hasMix(`${property} ${value ?? ''}`),
  });
  ColorMix.resetColorMixSupport();
}

/** Back to the test environment's own answer, which knows color-mix(). */
function withColorMix(): void {
  vi.unstubAllGlobals();
  ColorMix.resetColorMixSupport();
}

/** A rendering's declarations as a browser with color-mix() writes them, and one without. */
function bothWays(
  scenario: Scenario,
  overrides = scenario.overrides,
): { modern: Declaration[]; without: Declaration[] } {
  withColorMix();
  const modern = inlineDeclarations(scenario, overrides);
  withoutColorMix();
  const without = inlineDeclarations(scenario, overrides);
  withColorMix();
  // The same elements in the same order, so a declaration's place names it in both.
  const places = (all: Declaration[]) => [...new Set(all.map((d) => d.at))];
  expect(places(without)).toEqual(places(modern));
  return { modern, without };
}

const key = (d: Declaration): string => `${d.at} | ${d.property}`;

/** A declaration's place without its position, as the pins below name it. */
const place = (name: string, d: Declaration): string =>
  `${name} | ${d.at.replace(/^\d+ /, '')} | ${d.property}`;

describe('color-mix() the card writes from script, where Safari before 16.2 has none', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    ColorMix.resetColorMixSupport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    ColorMix.resetColorMixSupport();
  });

  it('lists every one in the source by value', () => {
    expect(scriptMixes()).toEqual([
      'config/config.ts: color-mix(in srgb, var(--primary-color, #03a9f4) 31%, transparent)',
      'config/config.ts: color-mix(in srgb, var(--primary-color, #03a9f4) 31%, transparent)',
      'config/view.ts: color-mix(in srgb, var(--divider-color) 50%, transparent)',
      'config/view.ts: color-mix(in srgb, var(--divider-color) 50%, transparent)',
      'config/view.ts: color-mix(in srgb, var(--divider-color) 50%, transparent)',
      'config/view.ts: color-mix(in srgb, var(--divider-color) 50%, transparent)',
      'config/view.ts: color-mix(in srgb, var(--primary-text-color) 4%, transparent)',
      'rendering/styles.ts: color-mix(in srgb, currentColor 10%, transparent)',
      'rendering/styles.ts: color-mix(in srgb, currentColor 6%, transparent)',
      'rendering/styles.ts: color-mix(in srgb, var(--primary-text-color) 60%, transparent)',
      'utils/color-mix.ts: color-mix(in srgb, red, blue)',
      'utils/color-mix.ts: color-mix(in srgb, var(--divider-color) 50%, transparent)',
      'utils/color-mix.ts: color-mix(in srgb, var(--primary-color, #03a9f4) 31%, transparent)',
      'utils/color-mix.ts: color-mix(in srgb, var(--primary-text-color) 4%, transparent)',
      'utils/color-mix.ts: color-mix(in srgb, var(--primary-text-color) 60%, transparent)',
      'utils/helpers.ts: color-mix(in srgb, ${color} ${opacity}%, transparent)',
    ]);
  });

  it('finds no mix( in script that is not a whole color-mix(', () => {
    expect(looseMixes()).toEqual([]);
  });

  it('gives each a floor, and keeps no floor for a mix the card no longer writes', () => {
    const written = scriptMixes()
      .filter((entry) => !entry.startsWith('utils/color-mix.ts: '))
      .map((entry) => entry.slice(entry.indexOf(': ') + 2));
    expect(
      written.filter((m) => !ColorMix.COLOR_MIX_FLOORS.has(m) && !RESOLVED_ELSEWHERE.has(m)),
    ).toEqual([]);
    expect([...ColorMix.COLOR_MIX_FLOORS.keys()].filter((m) => !written.includes(m))).toEqual([]);
  });

  it('keeps every floor free of color-mix(), so it draws where that is unknown', () => {
    const floors = [...ColorMix.COLOR_MIX_FLOORS.values(), ColorMix.translucentGray(20)];
    expect(floors.filter(hasMix)).toEqual([]);
  });

  it('has a floor for every option whose default is a mix', () => {
    const defaults = mixedDefaults();
    expect([...defaults.keys()].sort()).toEqual(MIXED_OPTIONS);
    expect([...defaults.values()].filter((v) => !ColorMix.COLOR_MIX_FLOORS.has(v))).toEqual([]);
  });

  it('reads those color options in these files only, so a new reader is noticed', () => {
    const names = [...new Set(COLOR_OPTIONS.map((option) => option.split(':')[1]))];
    const readers = sourceFiles(ROOT)
      .map((path) => relative(ROOT, path))
      .filter((path) => !path.startsWith('config/') && !path.startsWith('rendering/editor/'))
      .flatMap((path) =>
        names
          .filter((name) => new RegExp(`\\b${name}\\b`).test(script(join(ROOT, path))))
          .map((name) => `${path}: ${name}`),
      )
      .sort();
    expect(readers).toEqual([
      'rendering/column.ts: day_header_separator_color',
      'rendering/column.ts: day_separator_color',
      'rendering/column.ts: month_separator_color',
      'rendering/column.ts: week_separator_color',
      'rendering/grid.ts: allday_band_line_color',
      'rendering/grid.ts: day_header_separator_color',
      'rendering/grid.ts: day_separator_color',
      'rendering/grid.ts: hour_line_color',
      'rendering/grid.ts: month_separator_color',
      'rendering/grid.ts: today_background_color',
      'rendering/grid.ts: week_separator_color',
      'rendering/grid.ts: weekend_background_color',
      'rendering/render.ts: day_separator_color',
      'rendering/render.ts: month_separator_color',
      'rendering/render.ts: week_separator_color',
      'rendering/styles.ts: week_number_background_color',
    ]);
  });

  it('draws each of those color options at these places, so a view that stops drawing one fails', () => {
    const places = Object.fromEntries(
      COLOR_OPTIONS.map((option) => {
        const marker = `var(--s262-${option.replace(/[:.]/g, '-')})`;
        const at = Object.entries(SCENARIOS).flatMap(([name, scenario]) =>
          inlineDeclarations(scenario, withOption(scenario.overrides, option, marker))
            .filter((d) => d.value === marker)
            .map((d) => place(name, d)),
        );
        return [option, [...new Set(at)].sort()];
      }),
    );
    expect(places).toEqual({
      'card:day_separator_color': [
        'column | column-separator column-separator-day | background-color',
        'list-month-week | separator | border-top-color',
        'list-separators | separator | border-top-color',
        'list-week-numbers | separator | border-top-color',
      ],
      'card:month_separator_color': [
        'column | column-separator column-separator-month | background-color',
        'grid | grid-separator grid-separator-month | --calendar-card-grid-rule-paint',
        'list-month-week | separator-cell | --separator-border-color',
        'list-separators | month-separator | border-top-color',
        'list-week-numbers | month-separator | border-top-color',
      ],
      'card:week_number_background_color': [
        'column | card | --calendar-card-week-number-bg-color',
        'grid | card | --calendar-card-week-number-bg-color',
        'list-month-week | card | --calendar-card-week-number-bg-color',
        'list-separators | card | --calendar-card-week-number-bg-color',
        'list-week-numbers | card | --calendar-card-week-number-bg-color',
      ],
      'card:week_separator_color': [
        'column | column-separator column-separator-week | background-color',
        'grid | grid-separator grid-separator-week | --calendar-card-grid-rule-paint',
        'list-separators | week-separator | border-top-color',
        'list-week-numbers | separator-cell | --separator-border-color',
      ],
      'column:day_header_separator_color': ['column | column-header-separator | border-top-color'],
      'grid:allday_band_line_color': [
        'grid | grid-boundary grid-boundary-band-bottom | --calendar-card-grid-rule-paint',
      ],
      'grid:day_header_separator_color': [
        'grid | grid-boundary grid-boundary-band-top | --calendar-card-grid-rule-paint',
      ],
      'grid:day_separator_color': [
        'grid | grid-separator grid-separator-day | --calendar-card-grid-rule-paint',
      ],
      'grid:hour_line_color': [
        'grid | grid-boundary grid-boundary-body-end | --calendar-card-grid-rule-paint',
        'grid | grid-container | --calendar-card-grid-rule-color',
        'grid | grid-container | --calendar-card-grid-slot-color',
      ],
      'grid:today_background_color': ['grid | grid-container | --calendar-card-grid-today'],
      'grid:weekend_background_color': ['grid | grid-container | --calendar-card-grid-weekend'],
    });
  });

  it('writes, where color-mix() is known, exactly the mixes whose floors are listed', () => {
    const written = new Set(
      Object.values(SCENARIOS).flatMap((s) =>
        inlineDeclarations(s)
          .map((d) => d.value)
          .filter(hasMix),
      ),
    );
    expect([...written].sort()).toEqual(Object.keys(FLOORS).sort());
  });

  it('writes the listed floor in place of every one of those mixes where color-mix() is unknown', () => {
    const wrong: string[] = [];
    const checked = new Set<string>();
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      const { modern, without } = bothWays(scenario);
      const drawn = new Map(without.map((d) => [key(d), d.value]));
      for (const d of modern.filter((m) => hasMix(m.value))) {
        checked.add(place(name, d));
        const actual = drawn.get(key(d));
        if (actual !== FLOORS[d.value]) wrong.push(`${name} | ${key(d)}: ${actual}`);
      }
      wrong.push(...without.filter((d) => hasMix(d.value)).map((d) => `${name} | ${key(d)}`));
    }
    expect(wrong).toEqual([]);
    expect(checked.size).toBeGreaterThan(30);
  });

  it('draws a mix the card ships as its floor wherever a color option above writes one', () => {
    const wrong: string[] = [];
    const reached = new Set<string>();
    for (const option of COLOR_OPTIONS) {
      for (const [name, scenario] of Object.entries(SCENARIOS)) {
        const { modern, without } = bothWays(
          scenario,
          withOption(scenario.overrides, option, DIVIDER_MIX),
        );
        const drawn = new Map(without.map((d) => [key(d), d.value]));
        for (const d of modern.filter((m) => m.value === DIVIDER_MIX)) {
          reached.add(option);
          const actual = drawn.get(key(d));
          if (actual !== FLOORS[DIVIDER_MIX])
            wrong.push(`${option} | ${name} | ${key(d)}: ${actual}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect([...reached].sort()).toEqual(COLOR_OPTIONS);
  });

  it.each([true, false])('asks the browser once, when it answers %s', (answer) => {
    const supports = vi.fn(() => answer);
    vi.stubGlobal('CSS', undefined);
    // A new object on every read, as the test environment's own `CSS` is.
    Object.defineProperty(globalThis, 'CSS', { configurable: true, get: () => ({ supports }) });
    ColorMix.floorColor(DIVIDER_MIX);
    ColorMix.floorColor(DIVIDER_MIX);
    expect(ColorMix.supportsColorMix()).toBe(answer);
    expect(supports).toHaveBeenCalledTimes(1);
    expect(supports).toHaveBeenCalledWith('color', 'color-mix(in srgb, red, blue)');
  });

  it('writes a mix that is not one the card ships as given', () => {
    withoutColorMix();
    const own = 'color-mix(in srgb, var(--accent-color) 40%, transparent)';
    expect(ColorMix.floorColor(own)).toBe(own);
    expect(ColorMix.floorColor('#e67c73')).toBe('#e67c73');
  });
});
