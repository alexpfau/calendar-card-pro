/**
 * How tall a month is: the four `month:` keys that size the whole card, wide and compact, and
 * how each form resolves them.
 *
 * The wide keys stand alone, folded to `auto` and `none` where they are unusable. A compact key
 * counts as set by being written in the block, so an explicit `auto` or `none` stops it taking
 * the wide one, and an absent or unusable one takes the wide one. Every case is pinned by value.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Logger from '../src/utils/logger';

/** The month block written, and the card size each form resolves it to. */
type Case = readonly [
  string,
  Types.MonthOverrides | undefined,
  { height: string; max: string },
  { height: string; max: string },
];

const AUTO = { height: 'auto', max: 'none' };

describe('the card size a month resolves', () => {
  it.each<Case>([
    ['nothing set', undefined, AUTO, AUTO],
    ['an empty block', {}, AUTO, AUTO],
    // The compact form follows the wide one where it is not set.
    [
      'the wide height alone',
      { card_height: '50rem' },
      { height: '50rem', max: 'none' },
      { height: '50rem', max: 'none' },
    ],
    [
      'the compact height alone',
      { compact_card_height: '30rem' },
      AUTO,
      { height: '30rem', max: 'none' },
    ],
    [
      'both heights',
      { card_height: '50rem', compact_card_height: '30rem' },
      { height: '50rem', max: 'none' },
      { height: '30rem', max: 'none' },
    ],
    // Written, so set: the compact form takes its own default rather than the wide height.
    [
      'an explicit compact auto',
      { card_height: '50rem', compact_card_height: 'auto' },
      { height: '50rem', max: 'none' },
      AUTO,
    ],
    [
      'an explicit compact none',
      { card_max_height: '40rem', compact_card_max_height: 'none' },
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
      'the compact cap alone',
      { compact_card_max_height: '40rem' },
      AUTO,
      { height: 'auto', max: '40rem' },
    ],
    [
      'a wide height under a compact cap',
      { card_height: '50rem', compact_card_max_height: '40rem' },
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
        compact_card_height: ' Auto ',
        compact_card_max_height: '90dvh',
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
    // Unusable means unset, so the compact form takes the wide value.
    [
      'unusable compact values',
      {
        card_height: '50rem',
        card_max_height: '60rem',
        compact_card_height: '50%',
        compact_card_max_height: 'big',
      },
      { height: '50rem', max: '60rem' },
      { height: '50rem', max: '60rem' },
    ],
    [
      'blank compact values',
      {
        card_height: '50rem',
        card_max_height: '60rem',
        compact_card_height: null,
        compact_card_max_height: '',
      } as unknown as Types.MonthOverrides,
      { height: '50rem', max: '60rem' },
      { height: '50rem', max: '60rem' },
    ],
    [
      'compact keys written as undefined',
      { card_height: '50rem', compact_card_height: undefined },
      { height: '50rem', max: 'none' },
      { height: '50rem', max: 'none' },
    ],
  ])('%s', (_name, month, wide, compact) => {
    const config = buildConfig(month === undefined ? {} : { month });
    expect(ViewConfig.resolveMonthCardSize(config, 'wide')).toEqual(wide);
    expect(ViewConfig.resolveMonthCardSize(config, 'compact')).toEqual(compact);
  });

  it('ignores the four keys anywhere but the month block', () => {
    const config = buildConfig({
      card_height: '50rem',
      column: { compact_card_height: '30rem' },
    } as unknown as Partial<Types.Config>);
    expect(ViewConfig.resolveMonthCardSize(config, 'wide')).toEqual(AUTO);
    expect(ViewConfig.resolveMonthCardSize(config, 'compact')).toEqual(AUTO);
  });
});

describe('the four height keys', () => {
  it('fold what they cannot use, in one table with the week row height', () => {
    expect([...Config.CARD_HEIGHT_OPTIONS_FOLDED_WHEN_UNUSABLE]).toEqual([
      'card_height',
      'card_max_height',
      'compact_card_height',
      'compact_card_max_height',
      'row_height',
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
    // The week row height keeps its own rule, and the month block its default, until it goes.
    expect(Config.toValidRowHeight('auto')).toBeUndefined();
    expect(ViewConfig.normalizeMonthValue('row_height', 'auto')).toBe('112px');
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
    expect(ViewConfig.normalizeMonthValue(key, value)).toBe(expected);
  });

  it('says once that a height it cannot draw falls back, and the compact form follows', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    try {
      ViewConfig.validateColumnOverrides(
        buildConfig({
          month: {
            card_height: '50%',
            card_max_height: 'auto',
            compact_card_height: 'big',
            compact_card_max_height: '-4px',
          },
        }),
      );
      // Usable and blank values say nothing.
      ViewConfig.validateColumnOverrides(
        buildConfig({
          month: {
            card_height: '50rem',
            card_max_height: 'none',
            compact_card_height: 'auto',
            compact_card_max_height: '',
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
        'Invalid month.compact_card_height "big": expected "auto" or a non-negative CSS length ' +
          'such as "44rem", "600px" or "100dvh", not a percentage or another keyword. Ignoring ' +
          'it.',
        'Invalid month.compact_card_max_height "-4px": expected "none" or a non-negative CSS ' +
          'length such as "40rem", "600px" or "90dvh", not a percentage or another keyword. ' +
          'Ignoring it.',
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it('are reported where they do nothing, and not checked at the top level', () => {
    expect(
      ViewConfig.findMisplacedOptions({
        card_height: '50rem',
        column: { compact_card_max_height: '40rem' },
      }),
    ).toEqual([
      { kind: 'view-only', key: 'card_height', from: null, to: ['month'] },
      { kind: 'wrong-view', key: 'compact_card_max_height', from: 'column', to: ['month'] },
    ]);

    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    try {
      Config.validateFoldedLengths(
        buildConfig({ card_height: '50%' } as unknown as Partial<Types.Config>),
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
