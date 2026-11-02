import { render as litRender } from 'lit';
import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { TODAY_INDICATOR_STYLES } from '../src/rendering/editor/schemas/day-header';
import { todayIndicatorStyle } from '../src/rendering/editor/synthetic';
import { renderTodayIndicator } from '../src/rendering/leaves';
import * as Helpers from '../src/utils/helpers';

/**
 * `today_indicator` keywords are matched exactly as written, in lowercase.
 *
 * The option is open: anything that is not a keyword, an icon or an address is drawn as its
 * own characters. Folding case before matching, as the closed keyword options do, would
 * therefore take words away rather than forgive a typo: `Glow` would stop drawing the word
 * and start glowing, and nothing could draw "Tile" any more. Matching exactly changes no
 * card, because every capitalized form has drawn as text since text was allowed, and `tile`
 * is the one keyword v5 added.
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

/** Renders the indicator and reports the text it drew, or null when it drew no text. */
function drawnText(value: string): string | null {
  const host = document.createElement('div');
  const config = buildConfig({ today_indicator: value }) as Types.Config;
  litRender(renderTodayIndicator(config, true), host);

  const node = host.querySelector('span.today-indicator');
  return node === null ? null : (node.textContent ?? '').trim();
}

describe('today_indicator keywords are matched exactly as written', () => {
  it('finds every built-in style the editor offers', () => {
    expect(KEYWORDS).toEqual(['tile', 'dot', 'pulse', 'glow']);
  });

  it.each(KEYWORDS)('reads %s, written in lowercase, as the keyword', (keyword) => {
    expect(Helpers.getTodayIndicatorType(keyword)).toBe(keyword);
    expect(todayIndicatorStyle({ today_indicator: keyword } as Types.Config)).toBe(keyword);
    expect(drawnText(keyword)).toBeNull();
  });

  it.each(CASES)('draws %s written as %s as the word itself', (_keyword, value) => {
    expect(Helpers.getTodayIndicatorType(value), value).toBe('emoji');
    expect(drawnText(value), value).toBe(value);
  });

  it.each(CASES)('opens %s written as %s on the Custom style in the editor', (_keyword, value) => {
    expect(todayIndicatorStyle({ today_indicator: value } as Types.Config), value).toBe('custom');
  });
});
