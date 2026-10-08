/**
 * `today_indicator_size` folds a value the indicator cannot be drawn at (#620).
 *
 * The reported value was `6 px`. CSS has no length with a space before its unit, so the
 * browser could not use it — and for this option that does not merely drop a rule. The
 * dot, `pulse`, `glow` and `mdi:` indicators are Home Assistant icons sized through
 * `--mdc-icon-size`, and `ha-svg-icon` falls back to its 24px only when that property is
 * missing, not when it holds something `width` cannot use. The icon's box went `auto`, its
 * SVG took the browser's default 300px width, and in column view the dot took over today's
 * header. A negative size, a percentage, a keyword and a unit typo broke it the same way.
 *
 * happy-dom does no layout, so nothing here can measure a 300px dot. What these tests pin
 * is the value the stylesheet receives, `--calendar-card-today-indicator-size`, which is
 * the whole of the fix: once that holds a size the indicator can be drawn at, the browser
 * draws it at that size. The before-and-after sizes were measured in Chromium against Home
 * Assistant's own `ha-svg-icon` rules and are recorded in the pull request.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import * as Routing from '../src/rendering/editor/routing';
import * as Workspace from '../src/rendering/editor/workspace';
import { generateCustomPropertiesObject } from '../src/rendering/styles';
import * as Logger from '../src/utils/logger';
import '../src/calendar-card-pro';

const KEY = 'today_indicator_size';
const PROPERTY = '--calendar-card-today-indicator-size';
const DEFAULT = Config.DEFAULT_CONFIG.today_indicator_size;

/** Values with one reading, and the size each is read as. */
const FORGIVEN: ReadonlyArray<readonly [input: unknown, size: string]> = [
  ['6 px', '6px'],
  ['1.5 em', '1.5em'],
  ['0.75 rem', '0.75rem'],
  ['  6\tPX  ', '6PX'],
  [6, '6px'],
  ['6', '6px'],
  [' 2.5 ', '2.5px'],
  // Measured drawing at 12px before the fix, so folding it would break a working card.
  ['12px;', '12px'],
  ['6 px ;', '6px'],
  ['6;', '6px'],
  // Lit's styleMap reads the flag as a priority, so `10px !important` drew at 10px and
  // outranked a card-mod `!important` before the fold. It is kept, in the one spelling
  // styleMap reads.
  ['10px !important', '10px !important'],
  ['0.5em!important;', '0.5em !important'],
  ['6 px ! IMPORTANT', '6px !important'],
  // The same typo inside a function, where it broke the declaration just the same.
  ['calc(6 px + 0.5 em)', 'calc(6px + 0.5em)'],
  ['min(6 px, 1 rem)', 'min(6px, 1rem)'],
];

/** Sizes already written as CSS writes them, which must arrive untouched. */
const KEPT = [
  '6px',
  '0.5em',
  '1rem',
  '.75rem',
  '+6px',
  '0px',
  '24px',
  '2vh',
  '1cqi',
  '1e1px',
  'calc(1em + 2px)',
  'min(6px, 1em)',
  'clamp(4px, 1vw, 12px)',
  'var(--indicator-size)',
] as const;

/**
 * Values the indicator cannot be drawn at.
 *
 * Measured in Chromium before the fix: `-6px`, `150%`, `large`, `auto`, `big`, `6pz` and
 * `6,5px` each drew the dot 300px wide in column view and filled the date column in list
 * view; `50%` drew it 150px wide; `inherit` and a blank fell to Home Assistant's 24px. The
 * rest are the same mistakes in other shapes, and values YAML types as something else.
 * Each is wrapped in its own array so `it.each` cannot spread `[]` into no argument at all.
 */
const REFUSED: ReadonlyArray<readonly [value: unknown]> = [
  '-6px',
  '-6',
  -6,
  '50%',
  '150%',
  'large',
  'auto',
  'inherit',
  'big',
  '6pz',
  '6,5px',
  '6 px 7',
  '-6 px',
  'calc(50%)',
  'min(6px, 50%)',
  '',
  '   ',
  ';',
  '!important',
  true,
  false,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  {},
  [],
].map((value) => [value] as const);

describe('toValidSize', () => {
  it.each(FORGIVEN)('reads %o as %o', (input, size) => {
    expect(Config.toValidSize(input)).toBe(size);
  });

  it.each(KEPT)('keeps %o as written', (size) => {
    expect(Config.toValidSize(size)).toBe(size);
    expect(Config.toValidSize(`  ${size} `)).toBe(size);
  });

  it.each(REFUSED)('refuses %o', (value) => {
    expect(Config.toValidSize(value)).toBeUndefined();
  });
});

/**
 * `CSS.supports('border-top-width', value)` as Chromium 149 answered it.
 *
 * A function's arguments are checked by the browser, and happy-dom answers `true` to every
 * question, so the refusing branch cannot run here unless the answer is supplied. These are
 * answers measured in Chromium, not a model of them. They are answers about
 * `border-top-width` only, so the stub refuses to answer for any other property rather than
 * hand a recorded answer to a different question.
 */
const CHROMIUM_BORDER_WIDTH: Readonly<Record<string, boolean>> = {
  'calc(6pz)': false,
  'url(x)': false,
  'calc(6px)': true,
  'calc(-6px)': true,
  'round(up, 0.5em, 1px)': true,
  'var(--x)': true,
  'env(safe-area-inset-top, 6px)': true,
};

describe('a size written as a function is judged by the browser', () => {
  beforeEach(() => {
    vi.stubGlobal('CSS', {
      supports(property: string, value: string): boolean {
        if (property !== 'border-top-width' || !(value in CHROMIUM_BORDER_WIDTH)) {
          throw new Error(`No recorded answer for ${property}: ${value}`);
        }
        return CHROMIUM_BORDER_WIDTH[value];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['calc(6pz)', 'url(x)'])('folds %o, which the browser cannot draw', (value) => {
    // `calc(6pz)` drew the dot 300px wide in Chromium, exactly as `6pz` did on its own.
    expect(Config.toValidSize(value)).toBeUndefined();
    expect(Config.coercePixelLength(KEY, value)).toBe(DEFAULT);
  });

  it.each(['round(up, 0.5em, 1px)', 'var(--x)', 'env(safe-area-inset-top, 6px)', 'calc(-6px)'])(
    'keeps %o, which it can',
    (value) => {
      // `round()` drew at 8px before the fix, so a list of allowed function names would have
      // broken it. `calc(-6px)` clamps to zero and draws nothing, rather than the icon's own
      // size. `var()` always passes: the property it names is not known until layout.
      expect(Config.toValidSize(value)).toBe(value);
    },
  );

  it('closes up a space before it asks', () => {
    expect(Config.toValidSize('calc(6 px)')).toBe('calc(6px)');
  });

  it('accepts a function YAML spread over several lines', () => {
    // A block scalar keeps its line breaks, and CSS reads them as plain whitespace.
    vi.stubGlobal('CSS', { supports: () => true });

    expect(Config.toValidSize('calc(\n  1em + 2px\n)\n')).toBe('calc(\n  1em + 2px\n)');
  });

  it('keeps a function as written where nothing can answer', () => {
    // The Node scripts that import this module have no `CSS` at all.
    vi.stubGlobal('CSS', undefined);

    expect(Config.toValidSize('calc(6pz)')).toBe('calc(6pz)');
  });
});

describe('coercing today_indicator_size', () => {
  it.each(FORGIVEN)('turns %o into %o', (input, size) => {
    expect(Config.coercePixelLength(KEY, input)).toBe(size);
  });

  it.each(KEPT)('passes %o through', (size) => {
    expect(Config.coercePixelLength(KEY, size)).toBe(size);
  });

  it.each(REFUSED)('folds %o to the shipped default', (value) => {
    expect(Config.coercePixelLength(KEY, value)).toBe(DEFAULT);
  });

  it('falls back on a missing value, as every length option does', () => {
    expect(Config.coercePixelLength(KEY, null)).toBe(DEFAULT);
    expect(Config.coercePixelLength(KEY, undefined)).toBe(DEFAULT);
  });

  it('ships a default that is itself a size, or the fold would have nothing to land on', () => {
    expect(Config.toValidSize(DEFAULT)).toBe(DEFAULT);
  });
});

describe('the fold is scoped to the options that need it', () => {
  it('names today_indicator_size and the icon sizes, and nothing else', () => {
    // Pinned by value rather than walked, so an entry leaving the table fails here instead
    // of quietly shrinking every loop that reads it. The five icon sizes share the
    // indicator's route to a 300px icon; `icon-size-fold.test.ts` covers them, and
    // reconciles this table against every `--mdc-icon-size` in the stylesheet.
    expect([...Config.LENGTH_OPTIONS_FOLDED_WHEN_UNUSABLE]).toEqual([
      KEY,
      'time_icon_size',
      'location_icon_size',
      'description_icon_size',
      'weather.date.icon_size',
      'weather.event.icon_size',
    ]);
  });

  it('leaves day_spacing passing an unusable value through', () => {
    // The over-reach control. For a plain length an unusable value only drops its own rule,
    // and the existing contract — pinned in `pixel-length-coercion.test.ts` — is not to guess.
    expect(Config.coercePixelLength('day_spacing', '10 px')).toBe('10 px');
    expect(Config.coercePixelLength('day_spacing', '50%')).toBe('50%');
    expect(Config.coercePixelLength('day_spacing', 'big')).toBe('big');
  });

  it('judges weekday_font_size by the font-size rule, not by this one', () => {
    // A font size folds too, by its own rule, which keeps the percentage the indicator's rule
    // refuses — see `font-size-fold.test.ts`.
    expect(Config.coercePixelLength('weekday_font_size', '50%')).toBe('50%');
    expect(Config.coercePixelLength('weekday_font_size', '10 px')).toBe('10px');
    expect(Config.coercePixelLength('weekday_font_size', 'big')).toBe(
      Config.DEFAULT_CONFIG.weekday_font_size,
    );
  });
});

/**
 * Every path the value can take to the stylesheet.
 *
 * Length coercion has been fixed in one of these and not another before: `day_spacing: 4`
 * once worked inside `column:` and not at the top level. Each path is asserted with both a
 * `px` and an `em` value, because every default here is a pixel length and a px-only test
 * agrees with an implementation that discards the unit.
 */
describe('the folded value reaches the stylesheet by every path', () => {
  it.each([
    ['6 px', '6px'],
    ['1.5 em', '1.5em'],
    ['big', DEFAULT],
  ])('normalizes a top-level %o to %o, as setConfig does', (input, size) => {
    const config = buildConfig({ [KEY]: input } as Partial<Types.Config>);
    Config.normalizeLengthOptions(config);

    expect(config.today_indicator_size).toBe(size);
    expect(generateCustomPropertiesObject(config)[PROPERTY]).toBe(size);
  });

  it.each(View.VIEWS)('folds an override inside the %s block', (view) => {
    const blockKey = View.OVERRIDE_BLOCK_BY_VIEW[view]!;

    for (const [input, size] of [
      ['6 px', '6px'],
      ['0.5 rem', '0.5rem'],
      ['-6px', DEFAULT],
    ]) {
      const config = buildConfig({
        view,
        [KEY]: '10px',
        [blockKey]: { [KEY]: input },
      } as Partial<Types.Config>);
      Config.normalizeLengthOptions(config);
      const effective = View.resolveEffectiveConfig(config, view);

      // Both resolvers, because they are two implementations of one rule and the bulk one
      // is the path the card takes.
      expect(effective.today_indicator_size, `${blockKey} ${input}`).toBe(size);
      expect(View.resolveViewOption(config, KEY, view), `${blockKey} ${input}`).toBe(size);
      expect(generateCustomPropertiesObject(effective)[PROPERTY]).toBe(size);
    }
  });

  it('leaves a usable top-level value alone when a view overrides it', () => {
    // The control for the block case above: the fold must not leak from the block into the
    // value it overrides, or a working list card would change size when column view broke.
    const config = buildConfig({
      view: 'column',
      [KEY]: '10px',
      column: { [KEY]: 'big' },
    } as Partial<Types.Config>);
    Config.normalizeLengthOptions(config);

    expect(config.today_indicator_size).toBe('10px');
    expect(View.resolveEffectiveConfig(config, 'list').today_indicator_size).toBe('10px');
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
 * Mount a real card and read the property off the rendered `ha-card`.
 *
 * The tests above call the pieces; this calls `setConfig`, which is what decides whether
 * the pieces are wired in at all. Removing `normalizeLengthOptions` from `setConfig` would
 * leave every test above green.
 */
async function renderedSize(config: Record<string, unknown>): Promise<string> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.personal'], today_indicator: 'dot', ...config });
  card.isInitialLoad = false;
  document.body.appendChild(card);
  card.hass = { states: {}, locale: { language: 'en' }, connection: {} };
  card.events = [];
  await card.updateComplete;

  const haCard = card.shadowRoot?.querySelector('ha-card') as HTMLElement | null;
  expect(haCard, 'rendered ha-card').not.toBeNull();
  return haCard!.style.getPropertyValue(PROPERTY);
}

describe('the rendered card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it.each([
    ['column', '6 px', '6px'],
    ['column', '1.5 em', '1.5em'],
    ['column', 'big', DEFAULT],
    ['list', '6 px', '6px'],
    ['grid', '-6px', DEFAULT],
  ])('in %s view draws %o at %o', async (view, input, size) => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

    expect(await renderedSize({ view, [KEY]: input })).toBe(size);
  });

  it('draws the reported configuration at its intended size', async () => {
    // The configuration from #620, less the entity names.
    const size = await renderedSize({
      view: 'column',
      start_date: 'start_of_week',
      days_to_show: 7,
      today_indicator: 'dot',
      today_indicator_position: '85% 50%',
      today_indicator_size: '6 px',
    });

    expect(size).toBe('6px');
  });

  it('draws a column override at its intended size', async () => {
    expect(await renderedSize({ view: 'column', column: { [KEY]: '0.5 em' } })).toBe('0.5em');
  });

  it.each(['dot', 'pulse', 'glow', 'mdi:star'])(
    'draws a %s indicator in column view against the tidied size',
    async (indicator) => {
      // Every type the report names. The size is one property for all of them, so what this
      // adds is that each actually renders the icon the property sizes, in today's header.
      const size = await renderedSize({
        view: 'column',
        today_indicator: indicator,
        [KEY]: '6 px',
      });
      const card = document.body.querySelector('calendar-card-pro-dev')!;
      const icon = card.shadowRoot?.querySelector('.column-date-content ha-icon.today-indicator');

      expect(size).toBe('6px');
      expect(icon, `${indicator} icon in the column header`).not.toBeNull();
    },
  );
});

describe('a folded value is reported', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('names the option, the value and what replaced it', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

    Config.validateFoldedLength(KEY, '50%');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('today_indicator_size "50%"');
    expect(warn.mock.calls[0][0]).toContain(`Falling back to "${DEFAULT}"`);
  });

  it.each([undefined, null, '', '  ', '6 px', '1.5 em', '12px;', 6, '6px', 'calc(1em + 2px)'])(
    'stays quiet for %o, which is missing or usable',
    (value) => {
      const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

      Config.validateFoldedLength(KEY, value);

      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('is reported once by setConfig, on the value as written', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;

    card.setConfig({ entities: ['calendar.personal'], [KEY]: 'big' });

    const reports = warn.mock.calls.filter(([message]) => String(message).includes(KEY));
    expect(reports).toHaveLength(1);
    expect(reports[0][0]).toContain('today_indicator_size "big"');
  });

  it.each(View.VIEWS)('is reported for an override in the %s block, under its path', (view) => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const blockKey = View.OVERRIDE_BLOCK_BY_VIEW[view]!;

    View.validateColumnOverrides(
      buildConfig({ [blockKey]: { [KEY]: 'large' } } as Partial<Types.Config>),
    );

    const reports = warn.mock.calls.filter(([message]) => String(message).includes(KEY));
    expect(reports).toHaveLength(1);
    expect(reports[0][0]).toContain(`${blockKey}.today_indicator_size "large"`);
  });
});

/**
 * The visual editor holds a size it cannot draw yet, rather than storing the default.
 *
 * The editor stores what a value resolves to, and that is right for `6 px`, which resolves to
 * `6px`. For `2r` on the way to `2rem` it would store `6px` — a size the user never typed —
 * and keep it if they stopped there. So a size that would fold is held as typed and nothing
 * is written until it parses: the rule for every value that is invalid only while being
 * typed.
 */
describe('the visual editor holds a size it cannot draw yet', () => {
  const COLOR = 'today_indicator_color';

  function frame(config: Types.Config, workspace: Workspace.EditorWorkspace): Routing.FormFrame {
    return {
      workspace,
      schema: [KEY, COLOR].map((name) => ({ name, selector: { text: {} } })),
      data: Routing.workspaceFormData(config, workspace),
    };
  }

  /** Type into one field the way `ha-form` reports it: the whole form, one value changed. */
  function type(
    state: { config: Types.Config; pending: Record<string, string> },
    workspace: Workspace.EditorWorkspace,
    field: string,
    text: string,
  ): { config: Types.Config; pending: Record<string, string> } {
    const current = frame(state.config, workspace);
    current.data = Routing.workspaceFormData(state.config, workspace, state.pending);
    return Routing.applyWorkspaceChange(
      state.config,
      current,
      { ...current.data, [field]: text },
      state.pending,
    );
  }

  /** The size as stored where this workspace writes it. */
  function stored(config: Types.Config, workspace: Workspace.EditorWorkspace): unknown {
    const block = Routing.destination(KEY, workspace);
    const record = config as unknown as Record<string, Record<string, unknown> | undefined>;
    return block === undefined
      ? (config as unknown as Record<string, unknown>)[KEY]
      : record[block]?.[KEY];
  }

  const shown = (
    state: { config: Types.Config; pending: Record<string, string> },
    workspace: Workspace.EditorWorkspace,
  ) => Routing.workspaceFormData(state.config, workspace, state.pending)[KEY];

  it.each(Workspace.WORKSPACES)('in %s, writes nothing until the size parses', (workspace) => {
    const start = buildConfig({ [KEY]: '10px' } as Partial<Types.Config>);
    let state = { config: start, pending: {} as Record<string, string> };

    for (const text of ['b', 'bi', 'big']) {
      state = type(state, workspace, KEY, text);

      expect(state.config, `${workspace} after ${text}`).toEqual(start);
      expect(shown(state, workspace)).toBe(text);
    }

    // `6px` is the default `big` folds to, so this is the edit a held value could make compare
    // equal to the one before it, and be skipped.
    state = type(state, workspace, KEY, '6px');
    expect(stored(state.config, workspace)).toBe('6px');

    state = type(state, workspace, KEY, '1.5 em');
    expect(stored(state.config, workspace)).toBe('1.5em');
    expect(shown(state, workspace)).toBe('1.5 em');
  });

  it.each(Workspace.WORKSPACES)(
    'in %s, leaves a held size alone when another field changes',
    (workspace) => {
      const start = buildConfig({ [KEY]: '10px' } as Partial<Types.Config>);
      let state = type({ config: start, pending: {} }, workspace, KEY, 'big');

      // `ha-form` re-emits the held `big` with every other change, unchanged.
      state = type(state, workspace, COLOR, '#ff0000');

      expect(stored(state.config, workspace)).toBe(stored(start, workspace));
      expect(shown(state, workspace)).toBe('big');
    },
  );
});
