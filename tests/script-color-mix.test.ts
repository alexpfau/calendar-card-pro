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
 * Pinned three ways, so a new mix cannot be written from script without a floor:
 *
 * - Every color-mix() in the source outside a stylesheet is listed by value, and no `mix(` may
 *   stand anywhere else in it, so one assembled from pieces fails too. Each must be a mix with a
 *   floor or one of the three the card resolves itself.
 * - Every option whose default is a mix, nested ones included, is listed, with every place the
 *   views below write it, found by setting it to a marker. A mixed default added without a
 *   floor fails, and so does a view that stops drawing one of those places.
 * - Each view is rendered as a browser with color-mix() and one without would render it. At
 *   every inline declaration holding a mix in the first, the second must hold exactly the floor
 *   below, or nothing where the mix is one the card leaves unwritten there. The floors are
 *   written out here rather than read from the table, so the table cannot vouch for itself.
 */

const ROOT = join(process.cwd(), 'src');

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

/** Each color-mix() in a text, to its balancing parenthesis however deeply its arguments nest. */
function mixesIn(text: string): string[] {
  const found: string[] = [];
  for (let start = text.indexOf('color-mix('); start !== -1;) {
    let depth = 0;
    let end = start + 'color-mix'.length;
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++;
      else if (text[end] === ')' && --depth === 0) break;
    }
    found.push(text.slice(start, end + 1));
    start = text.indexOf('color-mix(', end);
  }
  return found;
}

/** Every color-mix() written in script, as `file: text`. */
function scriptMixes(): string[] {
  return sourceFiles(ROOT)
    .flatMap((path) => mixesIn(script(path)).map((mix) => `${relative(ROOT, path)}: ${mix}`))
    .sort();
}

/** Every `mix(` in script that does not open a `color-mix(`, as `file: text around it`. */
function looseMixes(): string[] {
  return sourceFiles(ROOT).flatMap((path) => {
    const text = script(path);
    return [...text.matchAll(/mix\(/g)]
      .filter((m) => text.slice(Math.max(0, (m.index ?? 0) - 6), m.index) !== 'color-')
      .map(
        (m) => `${relative(ROOT, path)}: ${text.slice((m.index ?? 0) - 20, (m.index ?? 0) + 20)}`,
      );
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

/**
 * What each mix the scenarios below write draws as without color-mix(), or `undefined` where the
 * card leaves it unwritten there. The tint is the one at the scenarios' 20%.
 */
const FLOORS: Readonly<Record<string, string | undefined>> = {
  'color-mix(in srgb, var(--divider-color) 50%, transparent)': 'rgba(128, 128, 128, 0.12)',
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
    if (typeof value === 'string' && value.includes('mix(')) {
      found.set(`${scope}:${path.join('.')}`, value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, inner] of Object.entries(value)) walk(scope, [...path, key], inner);
    }
  };
  for (const [scope, table] of tables) walk(scope, [], table);
  return found;
}

/**
 * The options whose default is a mix, pinned by value. Card-wide ones are written into the card's
 * own style or into separators every view draws; grid ones are the grid's rules and shading.
 */
const MIXED_OPTIONS = [
  'card:week_number_background_color',
  'card:week_separator_color',
  'grid:allday_band_line_color',
  'grid:day_header_separator_color',
  'grid:day_separator_color',
  'grid:hour_line_color',
  'grid:weekend_background_color',
];

type Scenario = { view: Types.EffectiveView; overrides: Partial<Types.Config> };

/**
 * One rendering per view, with every option that draws a mixed default turned on: week numbers
 * and week separators, empty days, a tint from the theme's color (the calendar has none of its
 * own), and in the grid the weekend, half-hour slots and the all-day band. Seven days from a
 * Wednesday, with empty days shown, so the week turns on screen and the weekend is on it.
 */
const SCENARIOS: Record<string, Scenario> = {
  'list-week-numbers': {
    view: 'list',
    overrides: {
      days_to_show: 7,
      show_week_numbers: 'iso',
      week_separator_width: '2px',
      show_empty_days: true,
      event_background_opacity: 20,
    },
  },
  'list-week-separator': {
    view: 'list',
    overrides: {
      days_to_show: 7,
      week_separator_width: '2px',
      show_empty_days: true,
      event_background_opacity: 20,
    },
  },
  column: {
    view: 'column',
    overrides: {
      view: 'column',
      days_to_show: 7,
      show_week_numbers: 'iso',
      week_separator_width: '2px',
      show_empty_days: true,
      event_background_opacity: 20,
    },
  },
  grid: {
    view: 'grid',
    overrides: {
      view: 'grid',
      days_to_show: 7,
      show_week_numbers: 'iso',
      week_separator_width: '2px',
      time_grid: { slot_minutes: 30 },
    } as Partial<Types.Config>,
  },
};

/** An option set to `value` where its scope reads it: a grid option from the grid's block. */
function withOption(overrides: Partial<Types.Config>, option: string, value: string) {
  const [scope, path] = option.split(':');
  const copy = structuredClone(overrides) as Record<string, unknown>;
  let target = copy;
  const keys = scope === 'grid' ? ['time_grid', ...path.split('.')] : path.split('.');
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
    const at = `${index} ${(el.getAttribute('class') ?? el.localName).replace(/\s+/g, ' ').trim()}`;
    for (const part of (el.getAttribute('style') ?? '').split(';')) {
      const colon = part.indexOf(':');
      if (colon === -1) continue;
      found.push({
        at,
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
    supports: (property: string, value?: string) =>
      !`${property} ${value ?? ''}`.includes('color-mix('),
  });
  ColorMix.resetColorMixSupport();
}

/** Back to the test environment's own answer, which knows color-mix(). */
function withColorMix(): void {
  vi.unstubAllGlobals();
  ColorMix.resetColorMixSupport();
}

/** A scenario's declarations as a browser with color-mix() writes them, and one without. */
function bothWays(scenario: Scenario): { modern: Declaration[]; without: Declaration[] } {
  withColorMix();
  const modern = inlineDeclarations(scenario);
  withoutColorMix();
  const without = inlineDeclarations(scenario);
  withColorMix();
  return { modern, without };
}

const key = (d: Declaration): string => `${d.at} | ${d.property}`;

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
    expect(floors.filter((f) => f.includes('mix('))).toEqual([]);
  });

  it('has a floor for every option whose default is a mix', () => {
    const defaults = mixedDefaults();
    expect([...defaults.keys()].sort()).toEqual(MIXED_OPTIONS);
    expect([...defaults.values()].filter((v) => !ColorMix.COLOR_MIX_FLOORS.has(v))).toEqual([]);
  });

  it('draws each of those options at these places, so a view that stops drawing one fails', () => {
    const places = Object.fromEntries(
      MIXED_OPTIONS.map((option) => {
        const marker = `var(--s262-${option.replace(/[:.]/g, '-')})`;
        const at = Object.entries(SCENARIOS).flatMap(([name, scenario]) =>
          inlineDeclarations(scenario, withOption(scenario.overrides, option, marker))
            .filter((d) => d.value === marker)
            .map((d) => `${name} | ${d.at.replace(/^\d+ /, '')} | ${d.property}`),
        );
        return [option, [...new Set(at)].sort()];
      }),
    );
    expect(places).toEqual({
      'card:week_number_background_color': [
        'column | card | --calendar-card-week-number-bg-color',
        'grid | card | --calendar-card-week-number-bg-color',
        'list-week-numbers | card | --calendar-card-week-number-bg-color',
        'list-week-separator | card | --calendar-card-week-number-bg-color',
      ],
      'card:week_separator_color': [
        'column | column-separator column-separator-week | background-color',
        'grid | grid-separator grid-separator-week | --calendar-card-grid-rule-paint',
        'list-week-numbers | separator-cell | --separator-border-color',
        'list-week-separator | week-separator | border-top-color',
      ],
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
      'grid:weekend_background_color': ['grid | grid-container | --calendar-card-grid-weekend'],
    });
  });

  it('writes, where color-mix() is known, exactly the mixes whose floors are listed', () => {
    const written = new Set(
      Object.values(SCENARIOS).flatMap((s) =>
        inlineDeclarations(s)
          .map((d) => d.value)
          .filter((v) => v.includes('mix(')),
      ),
    );
    expect([...written].sort()).toEqual(Object.keys(FLOORS).sort());
  });

  it('writes the listed floor in place of every one of those mixes where color-mix() is unknown', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      const { modern, without } = bothWays(scenario);
      // The same elements in the same order, so a declaration's place names it in both.
      expect(without.map((d) => d.at).filter((at, i, all) => all.indexOf(at) === i)).toEqual(
        modern.map((d) => d.at).filter((at, i, all) => all.indexOf(at) === i),
      );
      const drawn = new Map(without.map((d) => [key(d), d.value]));
      for (const d of modern.filter((m) => m.value.includes('mix('))) {
        checked++;
        const actual = drawn.get(key(d));
        if (actual !== FLOORS[d.value]) wrong.push(`${name} | ${key(d)}: ${actual}`);
      }
      const mixed = without.filter((d) => d.value.includes('mix('));
      wrong.push(...mixed.map((d) => `${name} | ${key(d)}: ${d.value}`));
    }
    expect(wrong).toEqual([]);
    expect(checked).toBeGreaterThan(20);
  });

  it('measures the browser once', () => {
    const supports = vi.fn(() => true);
    vi.stubGlobal('CSS', { supports });
    ColorMix.floorColor(String(DEFAULT_CONFIG.week_separator_color));
    ColorMix.floorColor(String(DEFAULT_CONFIG.week_separator_color));
    ColorMix.supportsColorMix();
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
