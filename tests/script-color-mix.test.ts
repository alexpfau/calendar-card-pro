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
 * - Every color-mix() in the source outside a stylesheet is listed by value. A new one moves
 *   the list, and each must be a mix with a floor or one of the three the card resolves itself.
 * - Every option whose default is a mix is listed, with the view that draws it, and that view is
 *   shown to write the option at all. A mixed default added without a floor, or without a view
 *   here, fails.
 * - Each view is rendered with every one of those options on, as a browser without color-mix()
 *   would, and not one inline style may hold a color-mix() there.
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

/** A color-mix() and its arguments, a var() and its fallback among them. */
const MIX = /color-mix\((?:[^()]|\([^()]*\))*\)/g;

/** Every color-mix() written in script, as `file: text`. */
function scriptMixes(): string[] {
  return sourceFiles(ROOT)
    .flatMap((path) =>
      [...script(path).matchAll(MIX)].map((m) => `${relative(ROOT, path)}: ${m[0]}`),
    )
    .sort();
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

/** Every option whose default is a mix, as `view:option`, with the default it holds. */
function mixedDefaults(): Map<string, string> {
  const tables: Array<[string, Record<string, unknown>]> = [
    ['card', DEFAULT_CONFIG as unknown as Record<string, unknown>],
    ['column', ViewConfig.COLUMN_DEFAULTS],
    ['column', ViewConfig.COLUMN_DEFAULT_OVERRIDES],
    ['grid', ViewConfig.TIME_GRID_DEFAULTS],
    ['grid', ViewConfig.TIME_GRID_DEFAULT_OVERRIDES],
  ];
  const found = new Map<string, string>();
  for (const [scope, table] of tables) {
    for (const [key, value] of Object.entries(table)) {
      if (typeof value === 'string' && value.includes('color-mix(')) {
        found.set(`${scope}:${key}`, value);
      }
    }
  }
  return found;
}

type Scenario = { view: Types.EffectiveView; overrides: Partial<Types.Config> };

/**
 * One rendering per view, with every option that draws a mixed default turned on: week numbers
 * and week separators, empty days, a tint from the theme's color (the calendar has none of its
 * own), and in the grid the weekend, half-hour slots and the all-day band. Seven days from a
 * Wednesday, so the week turns and the weekend is on screen.
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

/**
 * Which scenario draws each option whose default is a mix. The card-wide ones are written into
 * the card's own style whatever the view, and are read in every one.
 */
const DRAWN_BY: Record<string, keyof typeof SCENARIOS> = {
  'card:week_number_background_color': 'list-week-numbers',
  'card:week_separator_color': 'list-week-separator',
  'grid:allday_band_line_color': 'grid',
  'grid:day_header_separator_color': 'grid',
  'grid:day_separator_color': 'grid',
  'grid:hour_line_color': 'grid',
  'grid:weekend_background_color': 'grid',
};

/** An option set to `value`, where its scope reads it: grid options from the grid's block. */
function withOption(overrides: Partial<Types.Config>, option: string, value: string) {
  const [scope, key] = option.split(':');
  if (scope !== 'grid') return { ...overrides, [key]: value };
  const block = (overrides as { time_grid?: Record<string, unknown> }).time_grid ?? {};
  return { ...overrides, time_grid: { ...block, [key]: value } } as Partial<Types.Config>;
}

/** Every inline style a scenario writes from script: the card's own, and every element's. */
function inlineStyles(scenario: Scenario, overrides = scenario.overrides): string[] {
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
  const card = Object.entries(generateCustomPropertiesObject(effective)).map(
    ([name, value]) => `${name}:${value};`,
  );
  const elements = [...container.querySelectorAll('[style]')].map(
    (el) => el.getAttribute('style') ?? '',
  );
  return [...card, ...elements];
}

/** Every inline style across the scenarios. */
const allInlineStyles = (): string[] => Object.values(SCENARIOS).flatMap((s) => inlineStyles(s));

/** Answers as a browser without color-mix() does, and forgets any earlier answer. */
function withoutColorMix(): void {
  vi.stubGlobal('CSS', {
    supports: (property: string, value?: string) =>
      !`${property} ${value ?? ''}`.includes('color-mix('),
  });
  ColorMix.resetColorMixSupport();
}

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
    expect(floors.filter((f) => f.includes('color-mix('))).toEqual([]);
  });

  it('has a floor and a drawing view for every option whose default is a mix', () => {
    const defaults = mixedDefaults();
    expect([...defaults.keys()].sort()).toEqual(Object.keys(DRAWN_BY).sort());
    expect([...defaults.values()].filter((v) => !ColorMix.COLOR_MIX_FLOORS.has(v))).toEqual([]);
  });

  it('draws each of those options in its view, so the check below reaches it', () => {
    const unreached = Object.entries(DRAWN_BY).filter(([option, name]) => {
      const marker = `var(--s262-${option.replace(':', '-')})`;
      const scenario = SCENARIOS[name];
      return !inlineStyles(scenario, withOption(scenario.overrides, option, marker)).some((s) =>
        s.includes(marker),
      );
    });
    expect(unreached).toEqual([]);
  });

  it('writes every one of them where color-mix() is known, so the check below is not vacuous', () => {
    const styles = allInlineStyles().join('\n');
    const expected = [...new Set(mixedDefaults().values())];
    expected.push(
      'color-mix(in srgb, var(--primary-text-color) 60%, transparent)',
      'color-mix(in srgb, var(--primary-color, #03a9f4) 20%, transparent)',
      'color-mix(in srgb, currentColor 6%, transparent)',
    );
    expect(expected.filter((m) => !styles.includes(m))).toEqual([]);
  });

  it('writes none where color-mix() is unknown, and draws the floors instead', () => {
    withoutColorMix();
    expect(ColorMix.supportsColorMix()).toBe(false);
    const styles = allInlineStyles();
    expect(styles.filter((s) => s.includes('color-mix('))).toEqual([]);
    const joined = styles.join('\n');
    const drawn = [...ColorMix.COLOR_MIX_FLOORS.values(), ColorMix.translucentGray(20)];
    expect(drawn.filter((floor) => !joined.includes(floor))).toEqual([]);
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

  it('leaves a mix the user wrote as they wrote it', () => {
    withoutColorMix();
    const own = 'color-mix(in srgb, var(--accent-color) 40%, transparent)';
    expect(ColorMix.floorColor(own)).toBe(own);
    expect(ColorMix.floorColor('#e67c73')).toBe('#e67c73');
  });
});
