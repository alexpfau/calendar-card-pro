/**
 * The font-size options fold a value that is not a font size, and every place that reads a
 * font size as a length takes any font size that is.
 *
 * On its own an unusable font size is harmless: the declaration drops and the text inherits.
 * The damage came from the places that also read these as lengths, measured in Chromium
 * against Home Assistant's own icon rules on a 600px card:
 *
 * - `day_font_size: 26 px`, a keyword or a misspelled unit widened the list view's date
 *   column from 65px to 288px, and `150%` gave it all 576px, squeezing the events to nothing;
 * - `event_font_size` sized label icons and images directly, so the same values drew an icon
 *   300px across and an image at its natural 512px, and `150%` turned the hanging indent
 *   into 749px of padding;
 * - `week_number_font_size: 150%` drew the week pill 171px wide, and a 900px week row on a
 *   card with a fixed height;
 * - `time_font_size: large` or `150%` collapsed the progress bar to 0px.
 *
 * happy-dom does no layout, so nothing here can measure those. What this pins is what each
 * value becomes before CSS sees it, and that the stylesheet reads font sizes only as font
 * sizes. The rendered sizes are in the pull request.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import { PANELS } from '../src/rendering/editor/panels';
import * as Routing from '../src/rendering/editor/routing';
import * as Workspace from '../src/rendering/editor/workspace';
import { cardStyles, generateCustomPropertiesObject } from '../src/rendering/styles';
import * as Logger from '../src/utils/logger';
import '../src/calendar-card-pro';

/** Every font-size option, by option path, with the custom property it reaches CSS through. */
const FONT_SIZES = [
  ['title_font_size', '--calendar-card-font-size-title'],
  ['week_number_font_size', '--calendar-card-week-number-font-size'],
  ['weekday_font_size', '--calendar-card-font-size-weekday'],
  ['day_font_size', '--calendar-card-font-size-day'],
  ['month_font_size', '--calendar-card-font-size-month'],
  ['event_font_size', '--calendar-card-font-size-event'],
  ['time_font_size', '--calendar-card-font-size-time'],
  ['location_font_size', '--calendar-card-font-size-location'],
  ['description_font_size', '--calendar-card-font-size-description'],
  ['weather.date.font_size', '--calendar-card-weather-date-font-size'],
  ['weather.event.font_size', '--calendar-card-weather-event-font-size'],
] as const;

type FontSize = (typeof FONT_SIZES)[number][0];

/** The ones a view block can override. The title and the weather pair are card-wide. */
const OVERRIDABLE = FONT_SIZES.map(([path]) => path).filter(
  (path): path is Extract<FontSize, keyof Types.ColumnOverrides> =>
    (View.COLUMN_OVERRIDE_KEYS as readonly string[]).includes(path),
);

/** A partial configuration holding `value` at an option path. */
function at(path: string, value: unknown): Record<string, unknown> {
  return path
    .split('.')
    .reduceRight<unknown>((inner, step) => ({ [step]: inner }), value) as Record<string, unknown>;
}

/** Reads an option path out of a configuration or form data. */
function read(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, step) =>
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[step]
          : undefined,
      source,
    );
}

/** The shipped default of an option path. `title_font_size` ships unset. */
function shipped(path: string): unknown {
  return read(Config.DEFAULT_CONFIG, path);
}

/** Every option path the shipped defaults describe, nested ones included, whatever the value. */
function optionPaths(source: Record<string, unknown>, parent?: string): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = parent === undefined ? key : `${parent}.${key}`;
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? optionPaths(value as Record<string, unknown>, path)
      : [path];
  });
}

describe('the font-size table', () => {
  it('names every font-size option, and nothing else', () => {
    // Reconciled against the shipped defaults rather than only listed, so a font-size option
    // added later fails here instead of passing an unusable value through.
    const fontSizes = optionPaths(Config.DEFAULT_CONFIG as unknown as Record<string, unknown>)
      .filter((path) => /(?:^|[._])font_size$/.test(path))
      .sort();

    expect(fontSizes.length).toBeGreaterThanOrEqual(11);
    expect([...Config.FONT_SIZE_OPTIONS_FOLDED_WHEN_UNUSABLE].sort()).toEqual(fontSizes);
    expect([...Config.FONT_SIZE_OPTIONS_FOLDED_WHEN_UNUSABLE]).toEqual(
      FONT_SIZES.map(([path]) => path),
    );
  });

  it('keeps font sizes out of the icon-size table, and the other way round', () => {
    // The two accept different things, so an option in both would be judged twice and by
    // whichever rule happened to be asked first.
    const shared = [...Config.FONT_SIZE_OPTIONS_FOLDED_WHEN_UNUSABLE].filter((path) =>
      Config.LENGTH_OPTIONS_FOLDED_WHEN_UNUSABLE.has(path),
    );

    expect(shared).toEqual([]);
    expect(Config.FOLDED_OPTIONS).toEqual([
      ...Config.LENGTH_OPTIONS_FOLDED_WHEN_UNUSABLE,
      ...Config.FONT_SIZE_OPTIONS_FOLDED_WHEN_UNUSABLE,
    ]);
  });
});

describe('a font size', () => {
  /** Values with one reading, and the font size each is read as. */
  it.each<readonly [unknown, string]>([
    ['26 px', '26px'],
    ['1.5 em', '1.5em'],
    ['0.875 rem', '0.875rem'],
    ['150 %', '150%'],
    ['14 PX', '14PX'],
    [26, '26px'],
    ['26', '26px'],
    ['26px;', '26px'],
    ['large;', 'large'],
    ['calc(1 em + 2 px)', 'calc(1em + 2px)'],
    // Kept for the reason toValidSize keeps it: Lit's styleMap reads it as the priority.
    ['20px !important', '20px !important'],
    ['150 % !IMPORTANT;', '150% !important'],
  ])('reads %o as %o', (input, size) => {
    expect(Config.toValidFontSize(input)).toBe(size);
  });

  it.each([
    '14px',
    '1.2em',
    '0.875rem',
    '0px',
    '1e1px',
    '150%',
    '62.5%',
    'xx-small',
    'x-small',
    'small',
    'medium',
    'large',
    'x-large',
    'xx-large',
    'xxx-large',
    'LARGE',
    'larger',
    'smaller',
    'math',
    'calc(1em + 2px)',
    'clamp(12px, 150%, 30px)',
    'var(--my-size)',
    // The CSS-wide keywords are font sizes too, and inherit means follow the text around it.
    'inherit',
    'initial',
    'unset',
    'revert',
    'revert-layer',
    'Inherit',
  ])('keeps %o, which is a font size as written', (value) => {
    expect(Config.toValidFontSize(value)).toBe(value);
  });

  it.each([
    '-14px',
    '-150%',
    'big',
    'auto',
    'none',
    '14pz',
    '14,5px',
    '14 px 7',
    'large larger',
    'inherited',
    'big !important',
    '!important',
    ' ',
    '',
  ])('refuses %o', (value) => {
    expect(Config.toValidFontSize(value)).toBeUndefined();
  });

  it('refuses what YAML types as something other than text or a finite number', () => {
    for (const value of [true, Number.NaN, Number.POSITIVE_INFINITY, -2, {}, []]) {
      expect(Config.toValidFontSize(value), String(value)).toBeUndefined();
    }
  });
});

/**
 * `CSS.supports('font-size', value)` as Chromium 149 answered it, so the refusing branch can
 * be tested at all: happy-dom answers `true` to everything.
 */
const CHROMIUM_FONT_SIZE: Readonly<Record<string, boolean>> = {
  'calc(14pz)': false,
  'url(x)': false,
  'calc(large)': false,
  'max(large, 10px)': false,
  'calc(1em + 2px)': true,
  'clamp(12px, 150%, 30px)': true,
  'calc(1em + 50%)': true,
  'min(2em, 30px)': true,
  'var(--x)': true,
  'env(safe-area-inset-top, 14px)': true,
  'calc(-5px)': true,
};

describe('a font size written as a function is judged by the browser', () => {
  beforeEach(() => {
    vi.stubGlobal('CSS', {
      supports: (property: string, value: string) => {
        if (property !== 'font-size' || !(value in CHROMIUM_FONT_SIZE)) {
          throw new Error(`No recorded answer for ${property}: ${value}`);
        }
        return CHROMIUM_FONT_SIZE[value];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['calc(14pz)', 'url(x)', 'calc(large)', 'max(large, 10px)'])(
    'folds %o, which the browser refuses',
    (value) => {
      expect(Config.toValidFontSize(value)).toBeUndefined();
      expect(Config.coercePixelLength('day_font_size', value)).toBe('26px');
    },
  );

  it.each([
    'calc(1em + 2px)',
    'clamp(12px, 150%, 30px)',
    'calc(1em + 50%)',
    'min(2em, 30px)',
    'var(--x)',
    'env(safe-area-inset-top, 14px)',
    'calc(-5px)',
  ])('keeps %o, which the browser accepts', (value) => {
    // Asked about font-size itself, so the percentages an icon size refuses are kept here.
    expect(Config.toValidFontSize(value)).toBe(value);
  });

  it('closes a space up before it asks', () => {
    // `calc(14 px)` is refused as written; the repair is what reaches the browser.
    expect(Config.toValidFontSize('calc(1 em + 2 px)')).toBe('calc(1em + 2px)');
  });
});

describe('a font size written as a function where nothing can answer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps it, as the Node scripts that import this module need', () => {
    vi.stubGlobal('CSS', undefined);
    expect(Config.toValidFontSize('calc(14pz)')).toBe('calc(14pz)');
  });
});

describe('coercing a font size', () => {
  describe.each(FONT_SIZES)('%s', (path) => {
    it.each([
      ['26 px', '26px'],
      ['1.5 em', '1.5em'],
      ['150 %', '150%'],
      ['large', 'large'],
      ['inherit', 'inherit'],
      ['20px !important', '20px !important'],
    ])('turns %o into %o', (input, size) => {
      expect(Config.coercePixelLength(path, input)).toBe(size);
    });

    it.each(['big', '14pz', '-2px', 'auto'])('folds %o to the shipped default', (value) => {
      expect(Config.coercePixelLength(path, value)).toBe(shipped(path));
    });

    it('takes the shipped default for a blank value, which is itself a font size', () => {
      expect(Config.coercePixelLength(path, null)).toBe(shipped(path));
      const fallback = shipped(path);
      if (fallback !== undefined) {
        expect(Config.toValidFontSize(fallback)).toBe(fallback);
      }
    });
  });

  it('folds by option path, so a nested key named like a top-level option is not taken for it', () => {
    expect(Config.coercePixelLengthAgainst('12px', 'big', 'weather.day_font_size')).toBe('big');
    expect(Config.coercePixelLengthAgainst('12px', 'big', 'font_size')).toBe('big');
  });
});

/**
 * Every path the value can take to the stylesheet. Each is asserted with a `px` and a `rem`
 * value, because every default here is a pixel length and a px-only test agrees with an
 * implementation that discards the unit.
 */
describe('the folded value reaches the stylesheet by every path', () => {
  describe.each(FONT_SIZES)('%s', (path, property) => {
    it.each([
      ['26 px', '26px'],
      ['1.25 rem', '1.25rem'],
      ['150%', '150%'],
      ['big', undefined],
    ])('normalizes %o, as setConfig does', (input, size) => {
      const config = buildConfig(at(path, input) as Partial<Types.Config>);
      Config.normalizeLengthOptions(config);
      const expected = size ?? shipped(path);

      expect(read(config, path)).toBe(expected);
      expect(generateCustomPropertiesObject(config)[property]).toBe(expected);
    });
  });

  it('folds a nested font size and its icon-size sibling each by its own rule', () => {
    const config = buildConfig({
      weather: { date: { icon_size: 'large', font_size: 'large' } },
    } as unknown as Partial<Types.Config>);
    Config.normalizeLengthOptions(config);

    expect(read(config, 'weather.date.icon_size')).toBe('14px');
    expect(read(config, 'weather.date.font_size')).toBe('large');
  });

  describe.each(OVERRIDABLE)('%s inside a view block', (key) => {
    it.each(View.VIEWS)('folds an override in the %s block', (view) => {
      const blockKey = View.OVERRIDE_BLOCK_BY_VIEW[view]!;

      for (const [input, size] of [
        ['26 px', '26px'],
        ['0.75 rem', '0.75rem'],
        ['larger', 'larger'],
        // The shipped top-level default, as for a blank override: see the pull request.
        ['big', shipped(key)],
      ]) {
        const config = buildConfig({
          view,
          [key]: '10px',
          [blockKey]: { [key]: input },
        } as Partial<Types.Config>);
        Config.normalizeLengthOptions(config);

        // Both resolvers, because they are two implementations of one rule and the bulk one
        // is the path the card takes.
        expect(View.resolveEffectiveConfig(config, view)[key], `${blockKey} ${input}`).toBe(size);
        expect(View.resolveViewOption(config, key, view), `${blockKey} ${input}`).toBe(size);
      }
    });
  });
});

describe('the date column follows its day number', () => {
  const width = (day_font_size: string) =>
    generateCustomPropertiesObject(buildConfig({ day_font_size }) as Types.Config)[
      '--calendar-card-date-column-width'
    ];

  it.each([
    // Lengths scale in their own unit, as they always did.
    ['26px', '45.5px'],
    ['2em', '3.5em'],
    ['1.5rem', '2.625rem'],
    ['calc(1em + 10px)', 'calc(1.75 * (calc(1em + 10px)))'],
    // A percentage is a share of the parent's font size, which the date cell's em is.
    ['150%', '2.625em'],
    ['110%', '1.925em'],
    ['clamp(12px, 150%, 30px)', 'calc(1.75 * (clamp(12px, 1.5em, 30px)))'],
    // Chromium's step for the relative keywords, and math outside MathML.
    ['larger', '2.1em'],
    ['math', '1.75em'],
    // The absolute keywords at their CSS Fonts sizes for a 16px default.
    ['medium', '28px'],
    ['large', '33.6px'],
    ['xx-large', '56px'],
    ['LARGE', '33.6px'],
    // The day number carries the option inline, so a CSS-wide keyword means what it says
    // there: initial is medium, and the rest leave it at the size it inherits.
    ['initial', '28px'],
    ['inherit', '1.75em'],
    ['unset', '1.75em'],
    ['revert', '1.75em'],
    ['revert-layer', '1.75em'],
    // A var() fallback is rewritten like the rest of a function; a custom property's name is
    // not, even where it contains a keyword.
    ['var(--missing, large)', 'calc(1.75 * (var(--missing, 19.2px)))'],
    ['var(--large-text, 150%)', 'calc(1.75 * (var(--large-text, 1.5em)))'],
    ['var(--x, var(--y, larger))', 'calc(1.75 * (var(--x, var(--y, 1.2em))))'],
    // The flag belongs to the font-size declaration, not to the width.
    ['26px !important', '45.5px'],
    ['150% !important', '2.625em'],
  ])('sizes %o as %o', (day, column) => {
    expect(width(day)).toBe(column);
  });

  it('takes smaller as the inverse of the step larger takes', () => {
    expect(Number.parseFloat(width('smaller'))).toBeCloseTo(1.75 / 1.2, 12);
    expect(width('smaller')).toMatch(/em$/);
  });

  it('never leaves a width no property can use, for any font size the card accepts', () => {
    // The reported failures were all a font size CSS cannot multiply: `calc(1.75 * (large))`
    // and `calc(1.75 * (26 px))`. A rewritten keyword or percentage is a plain length.
    for (const day of [
      'xx-small',
      'small',
      'x-large',
      'xxx-large',
      'larger',
      'smaller',
      '150%',
      'inherit',
      'initial',
      'revert-layer',
    ]) {
      expect(width(day), day).toMatch(/^[\d.]+(?:px|em)$/);
    }
  });

  it('keeps the shipped column to the pixel', () => {
    expect(width(Config.DEFAULT_CONFIG.day_font_size)).toBe('45.5px');
  });
});

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: unknown;
  events: unknown[];
  isInitialLoad: boolean;
  updateComplete: Promise<boolean>;
}

/** Mount a real card and read the custom properties off the rendered `ha-card`. */
async function renderedProperties(config: Record<string, unknown>): Promise<CSSStyleDeclaration> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.personal'], ...config });
  card.isInitialLoad = false;
  document.body.appendChild(card);
  card.hass = { states: {}, locale: { language: 'en' }, connection: {} };
  card.events = [];
  await card.updateComplete;

  const haCard = card.shadowRoot?.querySelector('ha-card') as HTMLElement | null;
  expect(haCard, 'rendered ha-card').not.toBeNull();
  return haCard!.style;
}

describe('the rendered card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe.each(FONT_SIZES.filter(([path]) => !OVERRIDABLE.includes(path as never)))(
    '%s',
    (path, property) => {
      it.each([
        ['list', '20 px', '20px'],
        ['column', '1.25 rem', '1.25rem'],
        ['grid', 'big', undefined],
      ])('in %s view sets %o as %o', async (view, input, size) => {
        const style = await renderedProperties({ view, ...at(path, input) });
        const fallback = shipped(path);

        // An unset title emits no property at all, so the stylesheet's own fallback applies.
        expect(style.getPropertyValue(property)).toBe(size ?? fallback ?? '');
      });
    },
  );

  describe.each(OVERRIDABLE)('%s', (key) => {
    const property = FONT_SIZES.find(([path]) => path === key)![1];

    it.each([
      ['list', '20 px', '20px'],
      ['column', '1.25 rem', '1.25rem'],
      ['list', 'big', Config.DEFAULT_CONFIG[key]],
    ])('in %s view sets %o as %o', async (view, input, size) => {
      const style = await renderedProperties({ view, [key]: input });

      expect(style.getPropertyValue(property)).toBe(size);
    });

    it('sets a column override at its intended size', async () => {
      const style = await renderedProperties({ view: 'column', column: { [key]: '0.5 em' } });

      expect(style.getPropertyValue(property)).toBe('0.5em');
    });
  });

  it.each([
    ['26 px', '45.5px'],
    ['150%', '2.625em'],
    ['large', '33.6px'],
    ['inherit', '1.75em'],
    ['big', '45.5px'],
  ])('sizes the date column for day_font_size %o as %o', async (day, column) => {
    const style = await renderedProperties({ view: 'list', day_font_size: day });

    expect(style.getPropertyValue('--calendar-card-date-column-width')).toBe(column);
  });

  it('gives a font size the priority an !important value asks for', async () => {
    const style = await renderedProperties({ view: 'list', event_font_size: '20px !important' });

    expect(style.getPropertyValue('--calendar-card-font-size-event')).toBe('20px');
    expect(style.getPropertyPriority('--calendar-card-font-size-event')).toBe('important');
  });
});

describe('a folded font size is reported', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it.each(FONT_SIZES)('is reported once by setConfig for %s, under its path', (path) => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;

    card.setConfig({ entities: ['calendar.personal'], ...at(path, 'big') });

    const reports = warn.mock.calls.filter(([message]) => String(message).includes(`${path} `));
    expect(reports).toHaveLength(1);
    expect(reports[0][0]).toContain(`${path} "big"`);
    expect(reports[0][0]).toContain('a CSS font size');
    const fallback = shipped(path);
    expect(reports[0][0]).toContain(
      fallback === undefined ? 'Ignoring it.' : `Falling back to "${String(fallback)}"`,
    );
  });

  it.each(FONT_SIZES)('stays quiet for %s when every value is usable', (path) => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

    for (const value of [
      '26 px',
      '150%',
      'large',
      'inherit',
      '1.25rem',
      '20px !important',
      14,
      '',
    ]) {
      Config.validateFoldedLengths(buildConfig(at(path, value) as Partial<Types.Config>));
    }

    expect(warn).not.toHaveBeenCalled();
  });

  it.each(OVERRIDABLE)('is reported for an override of %s under the block path', (key) => {
    for (const view of View.VIEWS) {
      const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      const blockKey = View.OVERRIDE_BLOCK_BY_VIEW[view]!;

      View.validateColumnOverrides(
        buildConfig({ [blockKey]: { [key]: 'big' } } as Partial<Types.Config>),
      );

      const reports = warn.mock.calls.filter(([message]) => String(message).includes(key));
      expect(reports, blockKey).toHaveLength(1);
      expect(reports[0][0]).toContain(`${blockKey}.${key} "big"`);
      warn.mockRestore();
    }
  });
});

/**
 * The visual editor holds a font size it cannot use yet, rather than storing the default.
 *
 * `2r` on the way to `2rem` would otherwise store `14px` — a size the user never typed — and
 * keep it if they stopped there.
 */
describe('the visual editor holds a font size that is not one yet', () => {
  type State = { config: Types.Config; pending: Record<string, string> };

  describe.each(OVERRIDABLE)('%s', (key) => {
    const COLOR = 'time_color';

    function type(state: State, workspace: Workspace.EditorWorkspace, field: string, text: string) {
      const current: Routing.FormFrame = {
        workspace,
        schema: [key, COLOR].map((name) => ({ name, selector: { text: {} } })),
        data: Routing.workspaceFormData(state.config, workspace, state.pending),
      };
      return Routing.applyWorkspaceChange(
        state.config,
        current,
        { ...current.data, [field]: text },
        state.pending,
      );
    }

    function stored(config: Types.Config, workspace: Workspace.EditorWorkspace): unknown {
      const block = Routing.destination(key, workspace);
      return read(config, block === undefined ? key : `${block}.${key}`);
    }

    const shown = (state: State, workspace: Workspace.EditorWorkspace) =>
      Routing.workspaceFormData(state.config, workspace, state.pending)[key];

    it.each(Workspace.WORKSPACES)('in %s, writes nothing until the size parses', (workspace) => {
      const start = buildConfig({ [key]: '10px' } as Partial<Types.Config>);
      let state: State = { config: start, pending: {} };

      for (const text of ['b', 'bi', 'big']) {
        state = type(state, workspace, key, text);

        expect(state.config, `${workspace} after ${text}`).toEqual(start);
        expect(shown(state, workspace)).toBe(text);
      }

      // The default `big` folds to, which a held value could make compare equal to the one
      // before it, and be skipped.
      const fallback = String(Config.DEFAULT_CONFIG[key]);
      state = type(state, workspace, key, fallback);
      expect(stored(state.config, workspace)).toBe(fallback);

      // Partial keywords are held too, and the whole one is written as typed.
      for (const text of ['l', 'la', 'larg']) {
        state = type(state, workspace, key, text);
        expect(stored(state.config, workspace), `${workspace} after ${text}`).toBe(fallback);
      }
      state = type(state, workspace, key, 'large');
      expect(stored(state.config, workspace)).toBe('large');

      state = type(state, workspace, key, '1.5 em');
      expect(stored(state.config, workspace)).toBe('1.5em');
      expect(shown(state, workspace)).toBe('1.5 em');
    });
  });

  describe.each(['weather.date.font_size', 'weather.event.font_size'])('%s', (path) => {
    const WEATHER = PANELS.find((panel) => panel.id === 'weather')!;

    /** A form frame built from the real weather panel, so the nesting is the shipped one. */
    function frame(state: State, workspace: Workspace.EditorWorkspace): Routing.FormFrame {
      return {
        workspace,
        schema: WEATHER.build({
          view: Workspace.viewForWorkspace(workspace) ?? 'list',
          workspace,
          config: state.config,
          language: 'en',
        }),
        data: Routing.workspaceFormData(state.config, workspace, state.pending),
      };
    }

    function type(state: State, workspace: Workspace.EditorWorkspace, text: string) {
      const current = frame(state, workspace);
      const [head, group, field] = path.split('.');
      const block = (current.data[head] ?? {}) as Record<string, Record<string, unknown>>;
      return Routing.applyWorkspaceChange(
        state.config,
        current,
        { ...current.data, [head]: { ...block, [group]: { ...block[group], [field]: text } } },
        state.pending,
      );
    }

    const start = () =>
      buildConfig({
        weather: {
          entity: 'weather.home',
          position: 'both',
          date: { font_size: '10px' },
          event: { font_size: '10px' },
        },
      } as unknown as Partial<Types.Config>);

    it('renders the field at the path under test', () => {
      // The positive control: without it, a schema that stopped offering the field would
      // leave every edit below a no-op, and the held-value assertions would pass on nothing.
      const state: State = { config: start(), pending: {} };
      const fields = [...Routing.workspaceFields(frame(state, 'shared').schema)];

      expect(fields.map(({ node, path: parent }) => [...parent, node.name].join('.'))).toContain(
        path,
      );
    });

    it.each(Workspace.WORKSPACES)('in %s, writes nothing until the size parses', (workspace) => {
      let state: State = { config: start(), pending: {} };

      for (const text of ['1', '1r', '1re']) {
        state = type(state, workspace, text);
        expect(read(Routing.workspaceFormData(state.config, workspace, state.pending), path)).toBe(
          text,
        );
      }
      // `1` parsed and was stored as `1px`; the two after it were held.
      expect(read(state.config, path)).toBe('1px');

      state = type(state, workspace, '1rem');
      expect(read(state.config, path)).toBe('1rem');

      state = type(state, workspace, '150%');
      expect(read(state.config, path)).toBe('150%');
    });
  });
});

/** Strips the comments from the card's stylesheet, which are allowed to name anything. */
const STYLESHEET = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every declaration in the stylesheet, as written. */
const DECLARATIONS = [...STYLESHEET.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map((match) => ({
  property: match[1],
  value: match[2].replace(/\s+/g, ' ').trim(),
}));

/** Every style rule, by its selector list with whitespace collapsed, at any nesting depth. */
const RULES = (() => {
  const rules: Array<{ selector: string; body: string }> = [];
  const open: Array<{ prelude: string; start: number }> = [];
  let last = 0;
  for (let i = 0; i < STYLESHEET.length; i += 1) {
    const char = STYLESHEET[i];
    if (char === '{') {
      open.push({ prelude: STYLESHEET.slice(last, i).replace(/\s+/g, ' ').trim(), start: i + 1 });
      last = i + 1;
    } else if (char === '}') {
      const rule = open.pop();
      if (rule && !rule.prelude.startsWith('@')) {
        rules.push({ selector: rule.prelude, body: STYLESHEET.slice(rule.start, i) });
      }
      last = i + 1;
    } else if (char === ';') {
      last = i + 1;
    }
  }
  return rules;
})();

/** The value of `property` in the first rule whose selector list is exactly `selector`. */
function declared(selector: string, property: string): string | undefined {
  for (const rule of RULES.filter((candidate) => candidate.selector === selector)) {
    const match = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`).exec(rule.body);
    if (match) return match[1].replace(/\s+/g, ' ').trim();
  }
  return undefined;
}

describe('the stylesheet reads a font size only as a font size', () => {
  /** The custom properties a font-size option's value lands in, found by planting each. */
  const FONT_PROPERTIES = FONT_SIZES.flatMap(([path]) => {
    const sentinel = '7301px';
    const props = generateCustomPropertiesObject(buildConfig(at(path, sentinel)) as Types.Config);
    return Object.entries(props)
      .filter(([, value]) => value === sentinel)
      .map(([property]) => property);
  });

  it('finds the properties and the declarations it reconciles', () => {
    // The denominators, so an empty scan cannot pass the reconciliation below vacuously.
    expect(FONT_PROPERTIES).toEqual(FONT_SIZES.map(([, property]) => property));
    expect(DECLARATIONS.length).toBeGreaterThan(500);
    expect(
      DECLARATIONS.filter(({ value }) => value.includes('--calendar-card-font-size-event')).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('never reads one as a length', () => {
    // The whole class of defect this file is about. A keyword, a percentage or a space before
    // the unit is a font size the browser can use and a length it cannot, so a declaration
    // that multiplies one, adds to one or hands one to a width breaks on it. Reconciled
    // against the stylesheet rather than listed, so the next such declaration fails here.
    const misread = DECLARATIONS.filter(
      ({ property, value }) =>
        property !== 'font-size' &&
        FONT_PROPERTIES.some((font) => new RegExp(`var\\(\\s*${font}\\b`).test(value)),
    );

    expect(misread).toEqual([]);
  });

  it('ships no default that reads one', () => {
    // The progress bar's height used to: `calc(var(--calendar-card-font-size-time) * 0.75)`
    // collapsed it to nothing for `time_font_size: large`.
    const defaults = optionPaths(Config.DEFAULT_CONFIG as unknown as Record<string, unknown>)
      .map((path) => [path, read(Config.DEFAULT_CONFIG, path)] as const)
      .filter(([, value]) => typeof value === 'string');

    expect(defaults.length).toBeGreaterThan(50);
    expect(
      defaults.filter(([, value]) => FONT_PROPERTIES.some((font) => String(value).includes(font))),
    ).toEqual([]);
  });

  it('sizes the label glyphs and their hanging indent from the text they sit in', () => {
    // .summary carries the event font size and the labels inherit it, so em is that size
    // in any form the option takes.
    expect(declared('.summary', 'font-size')).toBe('var(--calendar-card-font-size-event)');
    expect(declared('.label-icon', '--mdc-icon-size')).toBe('1em');
    expect(declared('.label-image', 'height')).toBe('1em');
    expect(
      declared('.summary:has(> .label-icon), .summary:has(> .label-image)', 'padding-inline-start'),
    ).toBe('calc(1em + 4px)');
    expect(declared('.summary:has(> .label-emoji)', 'padding-inline-start')).toBe(
      'calc(1.25em + 4px)',
    );
  });

  it('sizes the week pill from its own font', () => {
    expect(declared('.week-number', 'font-size')).toBe(
      'var(--calendar-card-week-number-font-size)',
    );
    expect(declared('.week-number', 'width')).toBe('2.5em');
    expect(declared('.week-number', 'height')).toBe('1.5em');
    // Its row has no height of its own: the pill is its content.
    expect(declared('.week-row-table', 'height')).toBeUndefined();
  });

  it.each(['.weekday', '.day', '.month'])(
    'keeps the line height of %s equal to its font',
    (sel) => {
      expect(declared(sel, 'line-height')).toBe('1');
    },
  );

  it('draws the progress bar three quarters of the time text in both placements', () => {
    // The inline bar inherits the time font from .time; the own-row bar carries it.
    expect(Config.DEFAULT_CONFIG.progress_bar_height).toBe('0.75em');
    expect(declared('.time', 'font-size')).toBe('var(--calendar-card-font-size-time)');
    expect(declared('.progress-bar-row', 'font-size')).toBe('var(--calendar-card-font-size-time)');
  });
});

describe('scaleFontSize', () => {
  it.each([
    ['14px', 2, '28px'],
    ['1.5rem', 2, '3rem'],
    ['2em', 0.5, '1em'],
    ['50%', 2, '1em'],
    ['larger', 1, '1.2em'],
    ['math', 3, '3em'],
    ['x-small', 1, '12px'],
    ['var(--size)', 2, 'calc(2 * (var(--size)))'],
    ['calc(100% - 2px)', 1, 'calc(1 * (calc(1em - 2px)))'],
    [' large !important ', 1, '19.2px'],
    ['Initial', 2, '32px'],
    [
      'env(safe-area-inset-top, small)',
      1,
      `calc(1 * (env(safe-area-inset-top, ${(16 * 8) / 9}px)))`,
    ],
    ['var(--x-small, x-small)', 1, 'calc(1 * (var(--x-small, 12px)))'],
  ])('scales %o by %d to %o', (value, factor, scaled) => {
    expect(View.scaleFontSize(value, factor)).toBe(scaled);
  });

  it('defers to scaleLength for a length, so the two cannot disagree', () => {
    for (const value of ['26px', '1.25rem', '3em', 'calc(1em + 2px)', '0']) {
      expect(View.scaleFontSize(value, 1.75), value).toBe(View.scaleLength(value, 1.75));
    }
  });
});
