/**
 * How tall a month is: the four `month:` keys that size the whole card, wide and narrow, and
 * how each form resolves them.
 *
 * The wide keys stand alone, folded to `auto` and `none` where they are unusable. A narrow key
 * counts as set by being written in the block, so an explicit `auto` or `none` stops it taking
 * the wide one, and an absent or unusable one takes the wide one. A month asks a Sections
 * dashboard for its own rows until a form resolves to a height or a maximum, so a key written at
 * its default asks as one left out. Every case is pinned by value.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { DAY_PANEL_TAG, type DayPanelParams } from '../src/rendering/day-panel';
import * as Logger from '../src/utils/logger';
import * as Sections from '../src/utils/sections';
import '../src/calendar-card-pro';

/** The month block written, and the card size each form resolves it to. */
type Case = readonly [
  string,
  Types.MonthOverrides | undefined,
  { height: string; max: string },
  { height: string; max: string },
];

const AUTO = { height: 'auto', max: 'none' };

/** A toolbar with every control off, which draws nothing. */
const NO_CONTROLS = {
  navigation: false,
  add_event: false,
  view_switcher: false,
  reset: false,
  refresh: false,
  search: false,
  legend: false,
} as const;

/** Each control a toolbar can hold, alone. */
const ONE_CONTROL: ReadonlyArray<readonly [string, Types.ToolbarConfig]> = [
  ['navigation', { navigation: true }],
  ['add', { add_event: true }],
  ['reset', { reset: true }],
  ['refresh', { refresh: true }],
  ['the filter', { legend: 'chips' }],
  ['a button of its own', { buttons: [{ icon: 'mdi:home' }] }],
  ['a switcher of two layouts', { view_switcher: true, view_switcher_layouts: ['list'] }],
];

describe('the card size a month resolves', () => {
  it.each<Case>([
    ['nothing set', undefined, AUTO, AUTO],
    ['an empty block', {}, AUTO, AUTO],
    // The narrow form follows the wide one where it is not set.
    [
      'the wide height alone',
      { card_height: '50rem' },
      { height: '50rem', max: 'none' },
      { height: '50rem', max: 'none' },
    ],
    [
      'the narrow height alone',
      { narrow_card_height: '30rem' },
      AUTO,
      { height: '30rem', max: 'none' },
    ],
    [
      'both heights',
      { card_height: '50rem', narrow_card_height: '30rem' },
      { height: '50rem', max: 'none' },
      { height: '30rem', max: 'none' },
    ],
    // Written, so set: the narrow form takes its own default rather than the wide height.
    [
      'an explicit narrow auto',
      { card_height: '50rem', narrow_card_height: 'auto' },
      { height: '50rem', max: 'none' },
      AUTO,
    ],
    [
      'an explicit narrow none',
      { card_max_height: '40rem', narrow_card_max_height: 'none' },
      { height: 'auto', max: '40rem' },
      AUTO,
    ],
    // A cap alone, in each form.
    [
      'the wide cap alone',
      { card_max_height: '40rem' },
      { height: 'auto', max: '40rem' },
      { height: 'auto', max: '40rem' },
    ],
    [
      'the narrow cap alone',
      { narrow_card_max_height: '40rem' },
      AUTO,
      { height: 'auto', max: '40rem' },
    ],
    [
      'a wide height under a narrow cap',
      { card_height: '50rem', narrow_card_max_height: '40rem' },
      { height: '50rem', max: 'none' },
      { height: '50rem', max: '40rem' },
    ],
    // What a length accepts.
    [
      'a bare number, and a space before the unit',
      { card_height: 600, card_max_height: '45 rem' } as unknown as Types.MonthOverrides,
      { height: '600px', max: '45rem' },
      { height: '600px', max: '45rem' },
    ],
    [
      'a viewport height, a calc() with a var(), and the keywords in any case',
      {
        card_height: 'calc(100dvh - var(--header-height, 56px))',
        card_max_height: 'NONE',
        narrow_card_height: ' Auto ',
        narrow_card_max_height: '90dvh',
      },
      { height: 'calc(100dvh - var(--header-height, 56px))', max: 'none' },
      { height: 'auto', max: '90dvh' },
    ],
    // Folded: a percentage, a word, a negative length.
    ['unusable wide values', { card_height: '50%', card_max_height: 'auto' }, AUTO, AUTO],
    [
      'more unusable wide values',
      { card_height: 'fit-content', card_max_height: '-20px' },
      AUTO,
      AUTO,
    ],
    // Unusable means unset, so the narrow form takes the wide value.
    [
      'unusable narrow values',
      {
        card_height: '50rem',
        card_max_height: '60rem',
        narrow_card_height: '50%',
        narrow_card_max_height: 'big',
      },
      { height: '50rem', max: '60rem' },
      { height: '50rem', max: '60rem' },
    ],
    [
      'blank narrow values',
      {
        card_height: '50rem',
        card_max_height: '60rem',
        narrow_card_height: null,
        narrow_card_max_height: '',
      } as unknown as Types.MonthOverrides,
      { height: '50rem', max: '60rem' },
      { height: '50rem', max: '60rem' },
    ],
    [
      'narrow keys written as undefined',
      { card_height: '50rem', narrow_card_height: undefined },
      { height: '50rem', max: 'none' },
      { height: '50rem', max: 'none' },
    ],
  ])('%s', (_name, month, wide, narrow) => {
    const config = buildConfig(month === undefined ? {} : { month });
    expect(ViewConfig.resolveCardSize(config, 'month', 'wide')).toEqual(wide);
    expect(ViewConfig.resolveCardSize(config, 'month', 'narrow')).toEqual(narrow);
  });

  it('takes the card’s own height at the top level, and the narrow pair only in the month block', () => {
    const config = buildConfig({
      card_height: '50rem',
      column: { narrow_card_height: '30rem' },
    } as unknown as Partial<Types.Config>);
    expect(ViewConfig.resolveCardSize(config, 'month', 'wide')).toEqual({
      height: '50rem',
      max: 'none',
    });
    expect(ViewConfig.resolveCardSize(config, 'month', 'narrow')).toEqual({
      height: '50rem',
      max: 'none',
    });
  });

  it('lets the month block set its own height over the top level', () => {
    const config = buildConfig({
      card_height: '50rem',
      card_max_height: '70rem',
      month: { card_height: '40rem', narrow_card_max_height: 'none' },
    });
    expect(ViewConfig.resolveCardSize(config, 'month', 'wide')).toEqual({
      height: '40rem',
      max: '70rem',
    });
    expect(ViewConfig.resolveCardSize(config, 'month', 'narrow')).toEqual({
      height: '40rem',
      max: 'none',
    });
  });
});

describe('the four height keys', () => {
  it('fold what they cannot use, in one table of their own', () => {
    expect([...Config.CARD_HEIGHT_OPTIONS_FOLDED_WHEN_UNUSABLE]).toEqual([
      'card_height',
      'card_max_height',
      'narrow_card_height',
      'narrow_card_max_height',
    ]);
    expect(
      ['50%', 'fit-content', '-1px', 'none', '600px', 'auto', 7].map((value) =>
        Config.toValidCardHeight(value),
      ),
    ).toEqual([undefined, undefined, undefined, undefined, '600px', 'auto', '7px']);
    expect(
      ['50%', 'auto', '40rem', 'none', 'None;'].map((value) => Config.toValidCardMaxHeight(value)),
    ).toEqual([undefined, undefined, '40rem', 'none', 'none']);
    expect(Config.toValidCardHeight('44rem !important')).toBe('44rem');
  });

  it.each([
    ['card_height', '9 em', '9em'],
    ['card_height', 480, '480px'],
    ['card_height', 'AUTO', 'auto'],
    ['card_height', '50%', 'auto'],
    ['card_height', null, 'auto'],
    ['card_max_height', '40rem', '40rem'],
    ['card_max_height', 'auto', 'none'],
    ['card_max_height', null, 'none'],
  ] as const)('reads %s: %j as %j', (key, value, expected) => {
    const size = ViewConfig.resolveCardSize(buildConfig({ month: { [key]: value } }), 'month');
    expect(key === 'card_height' ? size.height : size.max).toBe(expected);
  });

  it('says once that a height it cannot draw falls back, and the narrow form follows', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    try {
      ViewConfig.validateColumnOverrides(
        buildConfig({
          month: {
            card_height: '50%',
            card_max_height: 'auto',
            narrow_card_height: 'big',
            narrow_card_max_height: '-4px',
          },
        }),
      );
      // Usable and blank values say nothing.
      ViewConfig.validateColumnOverrides(
        buildConfig({
          month: {
            card_height: '50rem',
            card_max_height: 'none',
            narrow_card_height: 'auto',
            narrow_card_max_height: '',
          },
        }),
      );
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
        'Invalid month.card_height "50%": expected "auto" or a non-negative CSS length such as ' +
          '"44rem", "600px" or "100dvh", not a percentage or another keyword. Falling back to ' +
          '"auto".',
        'Invalid month.card_max_height "auto": expected "none" or a non-negative CSS length ' +
          'such as "40rem", "600px" or "90dvh", not a percentage or another keyword. Falling ' +
          'back to "none".',
        'Invalid month.narrow_card_height "big": expected "auto" or a non-negative CSS length ' +
          'such as "44rem", "600px" or "100dvh", not a percentage or another keyword. Ignoring ' +
          'it.',
        'Invalid month.narrow_card_max_height "-4px": expected "none" or a non-negative CSS ' +
          'length such as "40rem", "600px" or "90dvh", not a percentage or another keyword. ' +
          'Ignoring it.',
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it('report the narrow pair outside the month block, and check the card’s pair at the top level', () => {
    expect(
      ViewConfig.findMisplacedOptions({
        card_height: '50rem',
        column: { card_max_height: '60rem', narrow_card_max_height: '40rem' },
      }),
    ).toEqual([
      { kind: 'wrong-view', key: 'narrow_card_max_height', from: 'column', to: ['month'] },
    ]);

    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    try {
      Config.validateFoldedLengths(
        buildConfig({ card_height: '50%' } as unknown as Partial<Types.Config>),
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('Invalid card_height "50%"');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('the rows a card asks a Sections dashboard for', () => {
  it.each<readonly [string, Partial<Types.Config>, number | 'auto']>([
    ['a month', { view: 'month' }, 10],
    ['a month with an empty block', { view: 'month', month: {} }, 10],
    ['a month with other options', { view: 'month', month: { min_day_width: 90 } }, 10],
    // A key sizes the card only where it sets a height or a maximum, in either form.
    ['a month with card_height', { view: 'month', month: { card_height: '50rem' } }, 'auto'],
    ['a month with the card’s own card_height', { view: 'month', card_height: '50rem' }, 'auto'],
    ['a list with card_height', { view: 'list', card_height: '50rem' }, 'auto'],
    [
      'a month with card_max_height',
      { view: 'month', month: { card_max_height: '40rem' } },
      'auto',
    ],
    [
      'a month with narrow_card_height',
      { view: 'month', month: { narrow_card_height: '30rem' } },
      'auto',
    ],
    [
      'a month with narrow_card_max_height',
      { view: 'month', month: { narrow_card_max_height: '40rem' } },
      'auto',
    ],
    [
      'a month whose narrow form takes its own default under a wide height',
      { view: 'month', month: { card_height: '50rem', narrow_card_height: 'auto' } },
      'auto',
    ],
    // Each key at its default sets nothing, written or not, so saving one back to it from the
    // visual editor, which leaves the line out, keeps the rows.
    [
      'a month with every key at its default',
      {
        view: 'month',
        month: {
          card_height: 'auto',
          card_max_height: 'none',
          narrow_card_height: 'auto',
          narrow_card_max_height: 'none',
        },
      },
      10,
    ],
    ['a month with card_height auto', { view: 'month', month: { card_height: 'auto' } }, 10],
    [
      'a month with card_max_height none',
      { view: 'month', month: { card_max_height: 'none' } },
      10,
    ],
    [
      'a month with narrow_card_height auto',
      { view: 'month', month: { narrow_card_height: 'auto' } },
      10,
    ],
    [
      'a month with narrow_card_max_height none',
      { view: 'month', month: { narrow_card_max_height: 'none' } },
      10,
    ],
    // Unusable values fold to the default, so they set nothing either.
    ['a month with an unusable height', { view: 'month', month: { card_height: '50%' } }, 10],
    [
      'a month with unusable values in every key',
      {
        view: 'month',
        month: {
          card_height: 'fit-content',
          card_max_height: 'auto',
          narrow_card_height: 'big',
          narrow_card_max_height: '-4px',
        },
      },
      10,
    ],
    // Two rows more where the configuration asks for a toolbar holding a control, whichever.
    ['a month with the toolbar', { view: 'month', toolbar: { show: true } }, 12],
    ['a month with its toolbar hidden', { view: 'month', toolbar: { show: false } }, 10],
    [
      'a month with a toolbar of no control',
      { view: 'month', toolbar: { show: true, ...NO_CONTROLS } },
      10,
    ],
    ...ONE_CONTROL.map(([control, on]): readonly [string, Partial<Types.Config>, number] => [
      `a month with a toolbar of ${control} alone`,
      { view: 'month', toolbar: { show: true, ...NO_CONTROLS, ...on } },
      12,
    ]),
    // Search is drawn only beside the date navigation, which it opens a match's day with.
    [
      'a month with a toolbar of search alone',
      { view: 'month', toolbar: { show: true, ...NO_CONTROLS, search: true } },
      10,
    ],
    [
      'a month with a toolbar of search and navigation',
      { view: 'month', toolbar: { show: true, ...NO_CONTROLS, search: true, navigation: true } },
      12,
    ],
    [
      'a month whose switcher offers only itself',
      {
        view: 'month',
        toolbar: { show: true, ...NO_CONTROLS, view_switcher: true, view_switcher_layouts: [] },
      },
      10,
    ],
    [
      'a month with the toolbar and a height',
      { view: 'month', toolbar: { show: true }, month: { card_height: '50rem' } },
      'auto',
    ],
    ['a list', { view: 'list' }, 'auto'],
    ['a list with the toolbar', { view: 'list', toolbar: { show: true } }, 'auto'],
    ['a grid with a month block', { view: 'grid', month: {} }, 'auto'],
    ['a column', { view: 'column' }, 'auto'],
  ])('%s', (_name, config, rows) => {
    expect(Sections.cardGridOptions(buildConfig(config))).toEqual({ columns: 'full', rows });
  });
});

describe('a Sections slot the card fills', () => {
  const MONTH = { view: 'month' } as const;
  it.each<readonly [string, string | undefined, Record<string, unknown>, boolean]>([
    ['a month on the grid', 'grid', MONTH, true],
    ['a month in a masonry view', undefined, MONTH, false],
    ['a month in a panel view', 'panel', MONTH, false],
    ['a month that sets its height', 'grid', { ...MONTH, month: { card_height: '50rem' } }, false],
    ['a month whose height is auto', 'grid', { ...MONTH, month: { card_height: 'auto' } }, true],
    // The dashboard's row count wins over the card's, key by key.
    [
      'a row count over a set height',
      'grid',
      { ...MONTH, month: { card_height: '50rem' }, grid_options: { rows: 8 } },
      true,
    ],
    ['auto rows over the month’s ten', 'grid', { ...MONTH, grid_options: { rows: 'auto' } }, false],
    ['columns alone, keeping the ten', 'grid', { ...MONTH, grid_options: { columns: 6 } }, true],
    ['a list with a row count', 'grid', { view: 'list', grid_options: { rows: 6 } }, true],
    ['a list without one', 'grid', { view: 'list' }, false],
    // The older layout_options, whose grid_rows are the rows, where there are no grid_options.
    [
      'layout_options rows',
      'grid',
      { ...MONTH, month: { card_height: '50rem' }, layout_options: { grid_rows: 4 } },
      true,
    ],
    [
      'layout_options without rows',
      'grid',
      { ...MONTH, month: { card_height: '50rem' }, layout_options: { grid_columns: 2 } },
      false,
    ],
    [
      'grid_options over layout_options',
      'grid',
      { ...MONTH, grid_options: { rows: 'auto' }, layout_options: { grid_rows: 4 } },
      false,
    ],
  ])('%s', (_name, layout, config, holds) => {
    expect(Sections.holdsSlot(layout, buildConfig(config as Partial<Types.Config>))).toBe(holds);
  });
});

//-----------------------------------------------------------------------------
// THE HEIGHT A CARD WRITES
//-----------------------------------------------------------------------------

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  getGridOptions(): Sections.CardGridOptions;
  hass: Types.Hass;
  layout?: string;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

/** Answers the resize observers the card starts, with any width a test reports. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];
  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function hass(): Types.Hass {
  return {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { friendly_name: 'Anna' },
      },
    },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    config: { country: 'DE' },
    themes: { darkMode: false },
    entities: {},
    connection: {
      // A Home Assistant before 2026.5, which the card asks over REST instead.
      subscribeMessage: vi.fn((_callback: unknown, message: { type: string }) =>
        message.type === 'calendar/event/subscribe'
          ? Promise.reject({ code: 'unknown_command' })
          : Promise.resolve(() => {}),
      ),
      subscribeEvents: vi.fn().mockResolvedValue(() => {}),
    },
    callWS: vi.fn().mockResolvedValue({}),
    localize: (key: string) => key,
    formatEntityState: (_stateObj: unknown, value?: string) => String(value ?? ''),
    callApi: vi.fn().mockResolvedValue([]),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

/**
 * A card at a width, laid out as Home Assistant says: the default 900px draws a wide month, 375px
 * a narrow one.
 */
async function mount(
  config: Record<string, unknown>,
  { layout, width = 900 }: { layout?: string; width?: number } = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  if (layout !== undefined) card.layout = layout;
  card.setConfig({ view: 'month', entities: ['calendar.anna'], ...config });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  for (const observer of RecordingResizeObserver.instances) {
    observer.callback([{ contentRect: { width } }]);
  }
  for (let pass = 0; pass < 3; pass += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
  return card;
}

/** The height and the cap written on the card's `ha-card`, `''` where none is. */
const written = (card: CardUnderTest): [string, string] => {
  const style = card.shadowRoot!.querySelector<HTMLElement>('ha-card')!.style;
  return [style.height, style.maxHeight];
};

describe('the height a month writes on its card', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
    vi.stubGlobal('localStorage', memoryStorage());
    RecordingResizeObserver.instances = [];
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    document.body.replaceChildren();
    globalThis.ResizeObserver = originalResizeObserver;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each<readonly [string, Record<string, unknown>, number, [string, string]]>([
    // The month's own default, one in both forms, and a taller one where the configuration asks
    // for a toolbar: a Sections slot's ten rows, or twelve.
    ['wide, by default', {}, 900, ['632px', 'none']],
    ['narrow, by default', {}, 375, ['632px', 'none']],
    ['wide, with the toolbar', { toolbar: { show: true } }, 900, ['760px', 'none']],
    ['narrow, with the toolbar', { toolbar: { show: true } }, 375, ['760px', 'none']],
    [
      'with a toolbar of one control',
      { toolbar: { show: true, ...NO_CONTROLS, refresh: true } },
      900,
      ['760px', 'none'],
    ],
    // A toolbar holding no control draws nothing, and keeps no room.
    [
      'with a toolbar of no control',
      { toolbar: { show: true, ...NO_CONTROLS } },
      900,
      ['632px', 'none'],
    ],
    [
      'with the toolbar hidden',
      { toolbar: { ...NO_CONTROLS, refresh: true } },
      900,
      ['632px', 'none'],
    ],
    // Each form's keys, the narrow one following the wide one where unset.
    [
      'wide, set',
      { month: { card_height: '50rem', card_max_height: '40rem' } },
      900,
      ['50rem', '40rem'],
    ],
    ['narrow, following wide', { month: { card_height: '50rem' } }, 375, ['50rem', 'none']],
    [
      'narrow, set',
      { month: { card_height: '50rem', narrow_card_height: '30rem' } },
      375,
      ['30rem', 'none'],
    ],
    // With no height of its own under a cap, a narrow month grows with its list up to the cap,
    // its own or the wide one it follows; the wide month is capped at its own height.
    [
      'narrow, growing under its cap',
      { month: { narrow_card_max_height: '30rem' } },
      375,
      ['auto', '30rem'],
    ],
    [
      'narrow, growing under the wide cap',
      { month: { card_max_height: '40rem' } },
      375,
      ['auto', '40rem'],
    ],
    ['wide, capped', { month: { card_max_height: '40rem' } }, 900, ['632px', '40rem']],
    [
      'narrow, a height under a cap',
      { month: { narrow_card_height: '30rem', narrow_card_max_height: '40rem' } },
      375,
      ['30rem', '40rem'],
    ],
    [
      'narrow, its cap taken off',
      { month: { card_max_height: '40rem', narrow_card_max_height: 'none' } },
      375,
      ['632px', 'none'],
    ],
    [
      'a panel’s height',
      { month: { card_height: 'calc(100dvh - var(--header-height, 56px))' } },
      900,
      ['calc(100dvh - var(--header-height, 56px))', 'none'],
    ],
    // The shared options size the content area of the other views, and nothing here.
    ['the shared options', { height: '300px', max_height: '200px' }, 900, ['632px', 'none']],
    // Any other view writes none.
    ['a list', { view: 'list', month: { card_height: '50rem' } }, 900, ['', '']],
  ])('%s', async (_name, config, width, expected) => {
    const card = await mount(config, { width });
    expect(written(card)).toEqual(expected);
  });

  it('lets the content and the list take their own height only while the list grows', async () => {
    const flex = (card: CardUnderTest) => {
      const style = card.shadowRoot!.querySelector<HTMLElement>('ha-card')!.style;
      return [
        style.getPropertyValue('--calendar-card-month-content-flex'),
        style.getPropertyValue('--calendar-card-month-list-flex'),
      ];
    };
    const capped = { month: { card_max_height: '40rem' } };
    expect(flex(await mount(capped, { width: 375 }))).toEqual(['0 1 auto', 'none']);
    // A fixed room: the defaults, a narrow height, the wide form, and a slot it fills.
    expect(flex(await mount({}, { width: 375 }))).toEqual(['', '']);
    expect(
      flex(
        await mount({ month: { ...capped.month, narrow_card_height: '30rem' } }, { width: 375 }),
      ),
    ).toEqual(['', '']);
    expect(flex(await mount(capped))).toEqual(['', '']);
    expect(
      flex(await mount({ ...capped, grid_options: { rows: 8 } }, { layout: 'grid', width: 375 })),
    ).toEqual(['', '']);
  });

  it('writes none in a Sections slot, which it fills, and asks for ten rows, or twelve', async () => {
    const card = await mount({ grid_options: { rows: 10 } }, { layout: 'grid' });
    expect(card.getGridOptions()).toEqual({ columns: 'full', rows: 10 });
    expect(written(card)).toEqual(['', '']);
    const withToolbar = await mount({ toolbar: { show: true } }, { layout: 'grid' });
    expect(withToolbar.getGridOptions()).toEqual({ columns: 'full', rows: 12 });
    expect(written(withToolbar)).toEqual(['', '']);
    expect(written(card)).toEqual(['', '']);

    // A narrow month fills it too.
    const narrow = await mount({}, { layout: 'grid', width: 375 });
    expect(written(narrow)).toEqual(['', '']);
  });

  it('sizes itself again once the dashboard lays it out elsewhere, or a height is set', async () => {
    const card = await mount({}, { layout: 'grid' });
    expect(written(card)).toEqual(['', '']);
    card.layout = 'panel';
    await card.updateComplete;
    expect(written(card)).toEqual(['632px', 'none']);

    card.layout = 'grid';
    card.setConfig({ view: 'month', entities: ['calendar.anna'], month: { card_height: '40rem' } });
    await card.updateComplete;
    expect(card.getGridOptions()).toEqual({ columns: 'full', rows: 'auto' });
    expect(written(card)).toEqual(['40rem', 'none']);
  });

  it('leaves the day panel its own height, in either form, and hands it the card’s properties', async () => {
    // The panel binds what the card hands it on its rows, so a card height there would size a
    // day's list to the whole card's height, or cap it at the card's.
    const opened: DayPanelParams[] = [];
    const listen = (event: Event) => {
      const detail = (event as CustomEvent<{ dialogTag: string; dialogParams: DayPanelParams }>)
        .detail;
      if (detail.dialogTag === DAY_PANEL_TAG) opened.push(detail.dialogParams);
    };
    document.addEventListener('show-dialog', listen);
    try {
      const card = await mount({
        month: {
          card_height: '50rem',
          card_max_height: '400px',
          narrow_card_height: '30rem',
          narrow_card_max_height: '300px',
        },
        event_font_size: '20px',
      });
      expect(written(card)).toEqual(['50rem', '400px']);
      const cell = card.shadowRoot!.querySelector<HTMLElement>(
        '.month-container [role="gridcell"]',
      )!;
      // Assistive technology's click, which opens a wide day's panel whatever the day holds.
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 0 }));
      await vi.advanceTimersByTimeAsync(0);
      expect(opened).toHaveLength(1);
      const styles = () => opened[0].source.styles();
      const size = () => [styles().height, styles()['max-height']];
      expect(size()).toEqual([undefined, undefined]);
      expect(styles()['--calendar-card-font-size-event']).toBe('20px');

      // The source is read live, so the narrow form's sizes must stay off it too.
      for (const observer of RecordingResizeObserver.instances) {
        observer.callback([{ contentRect: { width: 375 } }]);
      }
      await vi.advanceTimersByTimeAsync(0);
      await card.updateComplete;
      expect(written(card)).toEqual(['30rem', '300px']);
      expect(size()).toEqual([undefined, undefined]);
    } finally {
      document.removeEventListener('show-dialog', listen);
    }
  });
});
