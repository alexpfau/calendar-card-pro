import { render as litRender } from 'lit';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { SYNTHETIC_FIELDS, todayIndicatorStyle } from '../src/rendering/editor/synthetic';
import { renderTodayIndicator } from '../src/rendering/leaves';
import * as Helpers from '../src/utils/helpers';

/**
 * `today_indicator` drawn as its own characters (#573).
 *
 * The branch that renders a value verbatim used to be guarded by `/[\p{Emoji}]/u`, which is
 * not "is this a pictograph": the Unicode `Emoji` property is `Yes` for the ASCII digits, for
 * `#` and for `*`, because those are the bases of keycap sequences. So the option already had
 * a text mode — `Sprint 12` drew the words — gated on whether the text happened to contain a
 * digit. `Sprint` drew a dot, and nothing in the config, the docs or the editor said why.
 *
 * Widening is the one direction that takes nothing away: everything that drew text before
 * still draws text, and `true` / `dot` remain the way to ask for a plain dot. What it costs
 * is the fallback that turned an unrecognized value into a dot, so a typo is now visible
 * rather than looking deliberate.
 */

/** The keyword arm. Each of these must beat the text fallthrough below it. */
const KEYWORDS: ReadonlyArray<readonly [string, string]> = [
  ['dot', 'dot'],
  ['pulse', 'pulse'],
  ['glow', 'glow'],
];

/**
 * Values that read as text, and the reason each is here.
 *
 * The first group already worked, by the accident this replaces; the second is what the
 * accident excluded, and is the whole of the change.
 */
const TEXT: ReadonlyArray<readonly [string, string]> = [
  ['a year', '2024'],
  ['a quarter', 'Q4'],
  ['a sprint number', 'Sprint 12'],
  ['a German week number', 'KW 34'],
  ['a hash-prefixed number', '#1'],

  ['a bare word', 'Sprint'],
  ['a word with no digit in it', 'heute'],
  ['a capitalized word', 'Holiday'],
  ['a non-Latin word', 'やすみ'],
  ['an ASCII symbol', '!'],
  ['a single letter', 'x'],
];

describe('a today_indicator drawn as its own characters', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
  });

  /** Renders the indicator and reports which branch of the switch drew it. */
  function drawn(value: string): { branch: string; text: string } {
    const config = buildConfig({ today_indicator: value }) as Types.Config;
    litRender(renderTodayIndicator(config, true), host);

    const node = host.querySelector('.today-indicator');
    if (node === null) return { branch: 'none', text: '' };

    const tag = node.tagName.toLowerCase();
    return {
      branch: tag === 'img' ? 'image' : tag === 'span' ? 'emoji' : 'icon',
      text: (node.textContent ?? '').trim(),
    };
  }

  it.each(TEXT)('draws %s as the characters themselves', (_name, value) => {
    expect(Helpers.getTodayIndicatorType(value), value).toBe('emoji');

    const { branch, text } = drawn(value);
    expect(branch, value).toBe('emoji');
    expect(text, value).toBe(value);
  });

  /**
   * 🚨 The regression the widening would have shipped without this.
   *
   * `dot` is a documented value and it is what the editor's own Dot option writes, but it
   * used to reach `'dot'` through the fallthrough rather than through an arm of its own —
   * it worked only because *every* unrecognized string did. Turning that fallthrough into
   * text would have drawn the word "dot" on the card.
   */
  it.each(KEYWORDS)('still reads the %s keyword as a keyword', (value, expected) => {
    expect(Helpers.getTodayIndicatorType(value)).toBe(expected);
    expect(drawn(value).branch).toBe('icon');
  });

  it('still reads the boolean forms', () => {
    expect(Helpers.getTodayIndicatorType(true)).toBe('dot');
    expect(Helpers.getTodayIndicatorType(false)).toBe('none');
  });

  /**
   * Everything above the text arm still wins, so the widening is not simply a wider net.
   * These are the four classes that would be swallowed if the fallthrough ran too early.
   */
  it.each([
    ['an mdi icon', 'mdi:star', 'mdi'],
    ['a non-mdi icon prefix', 'phu:octopusenergy', 'mdi'],
    ['an absolute path', '/local/today.png', 'image'],
    ['an absolute URL', 'https://example.com/avatar', 'image'],
    ['a relative image', 'today.svg', 'image'],
    ['a real emoji', '🎯', 'emoji'],
  ])('still reads %s as %s', (_name, value, expected) => {
    expect(Helpers.getTodayIndicatorType(value), value).toBe(expected);
  });

  /**
   * An empty value must not read as text. `renderTodayIndicator` short-circuits on a falsy
   * value and never asks, but the editor does ask — without this it would open the Custom
   * control on a field the user has not filled in.
   */
  it.each(['', ' ', '   '])('reads %j as a dot rather than empty text', (value) => {
    expect(Helpers.getTodayIndicatorType(value)).toBe('dot');
  });
});

/**
 * What the editor does with a text indicator.
 *
 * `isCommittableIndicator` asks whether the card would render the value, which after the
 * widening is the same question as "does this keep the style on Custom". So the values it
 * commits are exactly the ones that do not move the style, and the ones it holds are exactly
 * the ones that would take this field away mid-word.
 */
describe('the editor and a text indicator', () => {
  const custom = SYNTHETIC_FIELDS.today_indicator_custom;

  const commits = (value: string): boolean =>
    Object.prototype.hasOwnProperty.call(
      custom.apply(value, buildConfig({}) as Types.Config).changes,
      'today_indicator',
    );

  it.each(['Sprint', 'Sprint 12', 'heute', 'Holiday'])('commits %s', (value) => {
    expect(commits(value)).toBe(true);
    expect(todayIndicatorStyle({ today_indicator: value } as Types.Config)).toBe('custom');
  });

  /**
   * The hold that survives, and the reason it still has to. Each of these classifies as
   * something other than text, so committing one mid-word would switch the style and replace
   * the field the user is typing into.
   */
  it.each(['mdi:c', 'mdi:calendar', 'dot', 'pulse', '', ' '])('holds %j', (value) => {
    expect(commits(value)).toBe(false);
  });
});
