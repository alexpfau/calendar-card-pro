import { render as litRender } from 'lit';
import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { TODAY_INDICATOR_STYLES } from '../src/rendering/editor/schemas/day-header';
import { SYNTHETIC_FIELDS, todayIndicatorStyle } from '../src/rendering/editor/synthetic';
import { isTileIndicator, renderTodayIndicator } from '../src/rendering/leaves';
import * as Helpers from '../src/utils/helpers';

/**
 * `today_indicator` keywords match in any casing.
 *
 * `Tile`, `DOT` and `gLoW` are the tile, the dot and the glow, on the card and in the editor
 * alike. The option is open, so the price is that the four words can no longer be drawn as
 * text in any casing; a longer word that merely contains one, such as `Tiles`, still is.
 *
 * The keywords are found by asking, not listed: a style the editor offers is a keyword when
 * the card reads its own name back as that style. The set is then pinned by value, so a
 * keyword dropped from the matcher fails here rather than leaving one fewer case to check.
 */
const KEYWORDS = TODAY_INDICATOR_STYLES.filter(
  (style) => Helpers.getTodayIndicatorType(style) === style,
);

/** Every other casing of a keyword: capitalized, upper case, and one with a later capital. */
function otherCasings(keyword: string): string[] {
  return [
    keyword[0].toUpperCase() + keyword.slice(1),
    keyword.toUpperCase(),
    keyword.slice(0, -1) + keyword.slice(-1).toUpperCase(),
  ];
}

const CASES = KEYWORDS.flatMap((keyword) =>
  otherCasings(keyword).map((value) => [keyword, value] as const),
);

/** The configuration with this indicator. */
function configWith(value: string): Types.Config {
  return buildConfig({ today_indicator: value }) as Types.Config;
}

/** Renders today's indicator, as the list view draws it, and returns its markup. */
function drawn(value: string): string {
  const host = document.createElement('div');
  litRender(renderTodayIndicator(configWith(value), true), host);
  return host.innerHTML.replace(/<!--[^>]*-->/g, '').trim();
}

describe('today_indicator keywords match in any casing', () => {
  it('finds every built-in style the editor offers', () => {
    expect(KEYWORDS).toEqual(['tile', 'dot', 'pulse', 'glow']);
  });

  it('has four cases per keyword besides lowercase, so a short list cannot pass', () => {
    expect(CASES.map(([, value]) => value)).toEqual([
      'Tile',
      'TILE',
      'tilE',
      'Dot',
      'DOT',
      'doT',
      'Pulse',
      'PULSE',
      'pulsE',
      'Glow',
      'GLOW',
      'gloW',
    ]);
  });

  it.each(CASES)('reads %s written as %s as that keyword, in lowercase', (keyword, value) => {
    expect(Helpers.getTodayIndicatorType(value), value).toBe(keyword);
  });

  it.each(CASES)('draws %s written as %s exactly as it draws the keyword', (keyword, value) => {
    // The tile is drawn on the day number rather than as an element of its own, so it draws
    // nothing here and is told apart by `isTileIndicator`; the other three are an icon whose
    // class names the keyword in lowercase.
    expect(drawn(value), value).toBe(drawn(keyword));
    expect(isTileIndicator(configWith(value)), value).toBe(keyword === 'tile');
    expect(drawn(value), value).not.toContain(value);
  });

  it('draws each of the four the way its own keyword does, and no two alike', () => {
    // The control, so "the same as the keyword" cannot pass by every value drawing nothing.
    expect(drawn('tile')).toBe('');
    expect(new Set(KEYWORDS.filter((keyword) => keyword !== 'tile').map(drawn)).size).toBe(3);
    for (const keyword of ['dot', 'pulse', 'glow']) {
      expect(drawn(keyword)).toContain(`class="today-indicator ${keyword}"`);
    }
  });

  it.each(CASES)('opens %s written as %s on that style in the editor', (keyword, value) => {
    expect(todayIndicatorStyle(configWith(value)), value).toBe(keyword);
  });

  it.each(CASES)(
    'holds %s written as %s in the Custom field rather than committing it',
    (_keyword, value) => {
      // Committing it would move the style off Custom, and take the field away mid-word.
      const result = SYNTHETIC_FIELDS.today_indicator_custom.apply(value, configWith('⭐'));
      expect(result.changes, value).toEqual({});
      expect(result.pending?.today_indicator_custom, value).toBe(value);
    },
  );

  it.each(['Tiles', 'DOTS', 'Glowing', 'Pulsar', 'Tile 3'])(
    'still draws %s, which only contains a keyword, as text',
    (value) => {
      expect(Helpers.getTodayIndicatorType(value)).toBe('emoji');
      expect(todayIndicatorStyle(configWith(value))).toBe('custom');
      expect(drawn(value)).toContain(value);
    },
  );
});
