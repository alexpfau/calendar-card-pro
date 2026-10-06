/**
 * The icon sizes fold a value an icon cannot be drawn at, as `today_indicator_size` does.
 *
 * `time_icon_size`, `location_icon_size`, `description_icon_size`, `weather.date.icon_size`
 * and `weather.event.icon_size` each reach Home Assistant's `ha-svg-icon` through
 * `--mdc-icon-size`, the route that blew #620's indicator up. Measured in Chromium against
 * Home Assistant's own icon rules, `14 px` drew every one of them 300px across in list view,
 * and the row icons and the event weather icon in column view too. A day header's weather
 * icon grew as wide as its column, and grid view's time fit dropped the clock icon rather
 * than draw it. A negative size, a percentage, a keyword and a unit typo did the same.
 *
 * happy-dom does no layout, so nothing here can measure a 300px icon. What these pin is the
 * value each custom property receives, which is the whole of the fix: once that holds a
 * size an icon can be drawn at, the browser draws it at that size. `toValidSize` itself is
 * covered in `today-indicator-size.test.ts`; this file covers the paths each option takes,
 * and above all the nested weather pair, which the fold could not reach while options were
 * named by key alone.
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

const DEFAULT = '14px';

/** Every icon size, by option path, with the custom property it reaches CSS through. */
const ICON_SIZES = [
  ['time_icon_size', '--calendar-card-icon-size-time'],
  ['location_icon_size', '--calendar-card-icon-size-location'],
  ['description_icon_size', '--calendar-card-icon-size-description'],
  ['weather.date.icon_size', '--calendar-card-weather-date-icon-size'],
  ['weather.event.icon_size', '--calendar-card-weather-event-icon-size'],
] as const;

type IconSize = (typeof ICON_SIZES)[number][0];

/** The three a view block can override. The weather pair is card-wide. */
const OVERRIDABLE = ICON_SIZES.map(([path]) => path).filter(
  (path): path is Extract<IconSize, `${string}_icon_size`> =>
    (View.COLUMN_OVERRIDE_KEYS as readonly string[]).includes(path),
);

/** Values with one reading, and the size each is read as — in px, em and rem alike. */
const FORGIVEN: ReadonlyArray<readonly [input: unknown, size: string]> = [
  ['14 px', '14px'],
  ['1.5 em', '1.5em'],
  ['0.75 rem', '0.75rem'],
  [14, '14px'],
  ['14', '14px'],
  ['14px;', '14px'],
  // Lit's styleMap reads the flag as the declaration's priority, so this drew at 20px and
  // outranked a card-mod `!important` on the same property. Kept, in the spelling it reads.
  ['20px !important', '20px !important'],
  ['1.25rem !IMPORTANT;', '1.25rem !important'],
  ['14 px!important', '14px !important'],
  ['calc(1 em + 2 px)', 'calc(1em + 2px)'],
];

/** Sizes already written as CSS writes them, which must arrive untouched. */
const KEPT = ['14px', '1em', '1.25rem', '0px', '12PX', 'calc(1em + 2px)', 'var(--icon-size)'];

/**
 * Values an icon cannot be drawn at.
 *
 * Measured in Chromium before the fix: each drew the clock icon 300px wide in list and
 * column view, except `50%` at 150px. `min(20px, 50%)` drew the icon itself at 20px, but
 * its box went 300px wide, pushing the row's text aside in list view and squeezing it into
 * a strip in column view.
 */
const REFUSED = [
  '-14px',
  '150%',
  '50%',
  'min(20px, 50%)',
  'large',
  'auto',
  'big',
  '14pz',
  '14,5px',
  '14 px 7',
  'none',
  // A flag cannot rescue the size before it; the default takes its place, unflagged.
  'big !important',
].map((value) => [value] as const);

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

/** A copy of form data with `value` written at an option path. */
function withAt(
  data: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  if (rest.length === 0) return { ...data, [head]: value };
  const inner = data[head];
  return {
    ...data,
    [head]: withAt(
      typeof inner === 'object' && inner !== null ? (inner as Record<string, unknown>) : {},
      rest.join('.'),
      value,
    ),
  };
}

describe('the fold covers every option that sizes a Home Assistant icon', () => {
  /**
   * Options that reach `--mdc-icon-size` without folding, each for a stated reason.
   *
   * `event_font_size` sizes the calendar label icons, but it is a font size first, and a
   * keyword or a percentage is a valid font size, so folding everything else does not fit
   * it. It is fixed on its own terms rather than here.
   */
  const NOT_FOLDED: ReadonlyMap<string, string> = new Map([
    ['event_font_size', 'a font size first; keywords and percentages are valid there'],
  ]);

  /** The custom property each `--mdc-icon-size` in the card's stylesheet reads. */
  const ICON_PROPERTIES = [
    ...cardStyles.cssText
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/--mdc-icon-size:\s*var\(\s*(--[\w-]+)/g),
  ].map((match) => match[1]);

  /** Every string-valued option path the shipped defaults describe, nested ones included. */
  function stringPaths(source: Record<string, unknown>, parent?: string): string[] {
    return Object.entries(source).flatMap(([key, value]) => {
      const path = parent === undefined ? key : `${parent}.${key}`;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return stringPaths(value as Record<string, unknown>, path);
      }
      return typeof value === 'string' ? [path] : [];
    });
  }

  /** The option paths whose value lands in a custom property, found by planting each. */
  function optionsFeeding(property: string): string[] {
    return stringPaths(Config.DEFAULT_CONFIG as unknown as Record<string, unknown>).filter(
      (path) => {
        const sentinel = '7301px';
        const config = buildConfig(at(path, sentinel) as Partial<Types.Config>);
        return generateCustomPropertiesObject(config)[property] === sentinel;
      },
    );
  }

  it('finds the icon sizes in the stylesheet', () => {
    // The denominator, so an empty match cannot pass the reconciliation below vacuously.
    expect(ICON_PROPERTIES.length).toBeGreaterThanOrEqual(7);
    expect(ICON_PROPERTIES).toContain('--calendar-card-icon-size-time');
  });

  it('folds every option an icon size is read from, and names nothing else', () => {
    // Reconciled against the stylesheet rather than listed, so the next option that sizes
    // an icon fails here instead of shipping a 300px icon for `14 px`.
    const feeding = ICON_PROPERTIES.map((property) => [property, optionsFeeding(property)]);
    for (const [property, paths] of feeding) {
      expect(paths, `options feeding ${String(property)}`).toHaveLength(1);
    }
    const options = feeding.map(([, paths]) => (paths as string[])[0]);

    const unprotected = options.filter(
      (path) => !Config.LENGTH_OPTIONS_FOLDED_WHEN_UNUSABLE.has(path) && !NOT_FOLDED.has(path),
    );
    const stale = [...Config.LENGTH_OPTIONS_FOLDED_WHEN_UNUSABLE].filter(
      (path) => !options.includes(path),
    );
    const settled = [...NOT_FOLDED.keys()].filter(
      (path) => !options.includes(path) || Config.LENGTH_OPTIONS_FOLDED_WHEN_UNUSABLE.has(path),
    );

    expect(unprotected, 'icon sizes that pass an unusable value through').toEqual([]);
    expect(stale, 'folded options that size no icon').toEqual([]);
    expect(settled, 'exceptions that no longer apply').toEqual([]);
  });
});

describe('coercing an icon size', () => {
  describe.each(ICON_SIZES)('%s', (path) => {
    it.each(FORGIVEN)('turns %o into %o', (input, size) => {
      expect(Config.coercePixelLength(path, input)).toBe(size);
    });

    it.each(KEPT)('passes %o through', (size) => {
      expect(Config.coercePixelLength(path, size)).toBe(size);
    });

    it.each(REFUSED)('folds %o to the shipped default', (value) => {
      expect(Config.coercePixelLength(path, value)).toBe(DEFAULT);
    });

    it('ships a default that is itself a size', () => {
      expect(Config.coercePixelLength(path, null)).toBe(DEFAULT);
      expect(Config.toValidSize(DEFAULT)).toBe(DEFAULT);
    });
  });
});

describe('the fold stops at the icon sizes', () => {
  it.each([
    'event_font_size',
    'day_font_size',
    'weather.date.font_size',
    'weather.event.font_size',
  ])('leaves %s passing an unusable value through', (path) => {
    // The over-reach control. Font sizes take keywords and percentages, and the nested two
    // share a group with an icon size, so a fold keyed by group or by field name alone
    // would reach them.
    for (const value of ['14 px', '150%', 'large', 'big']) {
      expect(Config.coercePixelLength(path, value), `${path}: ${value}`).toBe(value);
    }
  });

  it('leaves a nested option alone that shares a top-level name', () => {
    // A nested key is handed over under its path, so one named like a folded top-level
    // option is not taken for it.
    expect(Config.coercePixelLengthAgainst('14px', 'big', 'weather.time_icon_size')).toBe('big');
    expect(Config.coercePixelLengthAgainst('14px', 'big', 'icon_size')).toBe('big');
  });
});

/**
 * Every path the value can take to the stylesheet.
 *
 * Each is asserted with a `px` and a `rem` value, because every default here is a pixel
 * length and a px-only test agrees with an implementation that discards the unit.
 */
describe('the folded value reaches the stylesheet by every path', () => {
  describe.each(ICON_SIZES)('%s', (path, property) => {
    it.each([
      ['14 px', '14px'],
      ['1.25 rem', '1.25rem'],
      ['big', DEFAULT],
      ['-14px', DEFAULT],
    ])('normalizes %o to %o, as setConfig does', (input, size) => {
      const config = buildConfig(at(path, input) as Partial<Types.Config>);
      Config.normalizeLengthOptions(config);

      expect(read(config, path)).toBe(size);
      expect(generateCustomPropertiesObject(config)[property]).toBe(size);
    });
  });

  it('leaves the siblings of a nested icon size as written', () => {
    const config = buildConfig({
      weather: { date: { icon_size: 'big', font_size: 'large' } },
    } as unknown as Partial<Types.Config>);
    Config.normalizeLengthOptions(config);

    expect(read(config, 'weather.date.icon_size')).toBe(DEFAULT);
    expect(read(config, 'weather.date.font_size')).toBe('large');
  });

  describe.each(OVERRIDABLE)('%s inside a view block', (key) => {
    it.each(View.VIEWS)('folds an override in the %s block', (view) => {
      const blockKey = View.OVERRIDE_BLOCK_BY_VIEW[view]!;

      for (const [input, size] of [
        ['14 px', '14px'],
        ['0.75 rem', '0.75rem'],
        ['150%', DEFAULT],
      ]) {
        const config = buildConfig({
          view,
          [key]: '10px',
          [blockKey]: { [key]: input },
        } as Partial<Types.Config>);
        Config.normalizeLengthOptions(config);
        const effective = View.resolveEffectiveConfig(config, view);

        // Both resolvers, because they are two implementations of one rule and the bulk one
        // is the path the card takes.
        expect(effective[key], `${blockKey} ${input}`).toBe(size);
        expect(View.resolveViewOption(config, key, view), `${blockKey} ${input}`).toBe(size);
      }
    });

    it('leaves a usable top-level value alone when a view overrides it', () => {
      const config = buildConfig({
        view: 'column',
        [key]: '10px',
        column: { [key]: 'big' },
      } as Partial<Types.Config>);
      Config.normalizeLengthOptions(config);

      expect(config[key]).toBe('10px');
      expect(View.resolveEffectiveConfig(config, 'list')[key]).toBe('10px');
      expect(View.resolveEffectiveConfig(config, 'column')[key]).toBe(DEFAULT);
    });
  });
});

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: unknown;
  events: unknown[];
  isInitialLoad: boolean;
  updateComplete: Promise<boolean>;
}

/**
 * Mount a real card and read the custom properties off the rendered `ha-card`.
 *
 * The tests above call the pieces; this calls `setConfig`, which is what decides whether
 * the pieces are wired in at all.
 */
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

  describe.each(ICON_SIZES)('%s', (path, property) => {
    it.each([
      ['list', '14 px', '14px'],
      ['column', '1.5 em', '1.5em'],
      ['column', 'large', DEFAULT],
      ['grid', '50%', DEFAULT],
    ])('in %s view draws %o at %o', async (view, input, size) => {
      const style = await renderedProperties({ view, ...at(path, input) });

      expect(style.getPropertyValue(property)).toBe(size);
    });
  });

  it.each(OVERRIDABLE)('draws a column override of %s at its intended size', async (key) => {
    const property = ICON_SIZES.find(([path]) => path === key)![1];
    const style = await renderedProperties({ view: 'column', column: { [key]: '0.5 em' } });

    expect(style.getPropertyValue(property)).toBe('0.5em');
  });

  it.each(ICON_SIZES)(
    'gives %s the priority an !important value asks for',
    async (path, property) => {
      // Kept rather than dropped: the flag is what let the configured size outrank a card-mod
      // `!important` on the same property, and a size alone would lose to it.
      const style = await renderedProperties({ view: 'list', ...at(path, '20px !important') });

      expect(style.getPropertyValue(property)).toBe('20px');
      expect(style.getPropertyPriority(property)).toBe('important');
    },
  );
});

describe('a folded icon size is reported', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it.each(ICON_SIZES)('is reported once by setConfig for %s, under its path', (path) => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;

    card.setConfig({ entities: ['calendar.personal'], ...at(path, 'big') });

    const reports = warn.mock.calls.filter(([message]) => String(message).includes(path));
    expect(reports).toHaveLength(1);
    expect(reports[0][0]).toContain(`${path} "big"`);
    expect(reports[0][0]).toContain(`Falling back to "${DEFAULT}"`);
  });

  it.each(ICON_SIZES)('stays quiet for %s when every value is usable', (path) => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

    for (const value of ['14 px', '1.25rem', '20px !important', 14]) {
      Config.validateFoldedLengths(buildConfig(at(path, value) as Partial<Types.Config>));
    }

    expect(warn).not.toHaveBeenCalled();
  });

  it.each(OVERRIDABLE)('is reported for an override of %s under the block path', (key) => {
    for (const view of View.VIEWS) {
      const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      const blockKey = View.OVERRIDE_BLOCK_BY_VIEW[view]!;

      View.validateColumnOverrides(
        buildConfig({ [blockKey]: { [key]: 'large' } } as Partial<Types.Config>),
      );

      const reports = warn.mock.calls.filter(([message]) => String(message).includes(key));
      expect(reports, blockKey).toHaveLength(1);
      expect(reports[0][0]).toContain(`${blockKey}.${key} "large"`);
      warn.mockRestore();
    }
  });
});

/**
 * The visual editor holds a size it cannot draw yet, rather than storing the default.
 *
 * `2r` on the way to `2rem` would otherwise store `14px` — a size the user never typed — and
 * keep it if they stopped there. So a size that would fold is held as typed and nothing is
 * written until it parses, for the nested weather pair as well as the top-level options.
 */
describe('the visual editor holds an icon size it cannot draw yet', () => {
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

      // `14px` is the default `big` folds to, so this is the edit a held value could make
      // compare equal to the one before it, and be skipped.
      state = type(state, workspace, key, '14px');
      expect(stored(state.config, workspace)).toBe('14px');

      state = type(state, workspace, key, '1.5 em');
      expect(stored(state.config, workspace)).toBe('1.5em');
      expect(shown(state, workspace)).toBe('1.5 em');
    });
  });

  describe.each(ICON_SIZES.filter(([path]) => path.startsWith('weather.')))('%s', (path) => {
    const WEATHER = PANELS.find((panel) => panel.id === 'weather')!;
    const group = path.split('.')[1];
    const sibling = `weather.${group}.font_size`;

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

    function type(
      state: State,
      workspace: Workspace.EditorWorkspace,
      target: string,
      text: string,
    ) {
      const current = frame(state, workspace);
      return Routing.applyWorkspaceChange(
        state.config,
        current,
        withAt(current.data, target, text),
        state.pending,
      );
    }

    const shown = (state: State, workspace: Workspace.EditorWorkspace, target = path) =>
      read(Routing.workspaceFormData(state.config, workspace, state.pending), target);

    const start = () =>
      buildConfig({
        weather: {
          entity: 'weather.home',
          position: 'both',
          date: { icon_size: '10px' },
          event: { icon_size: '10px' },
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
      const initial = start();
      let state: State = { config: initial, pending: {} };

      for (const text of ['1', '1r', '1re']) {
        state = type(state, workspace, path, text);
        expect(shown(state, workspace), `shown after ${text}`).toBe(text);
      }
      // `1` parsed and was stored as `1px`; the two after it were held.
      expect(read(state.config, path)).toBe('1px');

      state = type(state, workspace, path, '1rem');
      expect(read(state.config, path)).toBe('1rem');

      for (const text of ['b', 'bi', 'big']) {
        state = type(state, workspace, path, text);
        expect(read(state.config, path), `stored after ${text}`).toBe('1rem');
        expect(shown(state, workspace)).toBe(text);
      }

      // The default `big` folds to, which a held value could otherwise make look unchanged.
      state = type(state, workspace, path, '14px');
      expect(read(state.config, path)).toBe('14px');

      state = type(state, workspace, path, '1.5 em');
      expect(read(state.config, path)).toBe('1.5em');
      expect(shown(state, workspace)).toBe('1.5 em');
    });

    it('leaves a held size alone when its sibling changes', () => {
      let state: State = { config: start(), pending: {} };
      state = type(state, 'shared', path, 'big');

      // `ha-form` re-emits the held `big` with every other change, unchanged.
      state = type(state, 'shared', sibling, '13px');

      expect(read(state.config, path)).toBe('10px');
      expect(read(state.config, sibling)).toBe('13px');
      expect(shown(state, 'shared')).toBe('big');
    });

    it('lets the font size beside it keep its own rules', () => {
      // The over-reach control in the editor: a font size is not folded, so what is typed
      // into it is written as it stands, as before.
      let state: State = { config: start(), pending: {} };
      state = type(state, 'shared', sibling, '1r');

      expect(read(state.config, sibling)).toBe('1r');
      expect(read(state.config, path)).toBe('10px');
    });
  });
});
