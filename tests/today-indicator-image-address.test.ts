import { render as litRender } from 'lit';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { SYNTHETIC_FIELDS, todayIndicatorStyle } from '../src/rendering/editor/synthetic';
import { renderTodayIndicator } from '../src/rendering/leaves';
import * as Helpers from '../src/utils/helpers';

/**
 * A `today_indicator` holding an image address the old extension list did not name (#569).
 *
 * This is the sibling of `label-image-address.test.ts`, and the reason it is a separate file
 * rather than more rows in that one is that the two options fail *differently*. A label that
 * missed the image test fell through to `text` and drew its own address, which is ugly but
 * visible — that is how #215 was noticed at all. `today_indicator` has no text branch: a value
 * that misses every arm reaches `dot`, which is also the option's **default**. So the card
 * draws exactly what it would have drawn had the option never been set, and there is nothing
 * in the log. The user's evidence for a wrong value is indistinguishable from their evidence
 * for a correct one.
 *
 * 🚨 None of this is reachable from a default config — `today_indicator` ships `false`, so
 * `renderTodayIndicator` returns `nothing` and the DOM snapshots never enter the switch. Before
 * this file, `getTodayIndicatorType` had no test naming it anywhere in the suite, which is why
 * the defect survived from before v4.0.0.
 */

const IMAGE_ADDRESSES: ReadonlyArray<readonly [string, string]> = [
  // The `/api/*` families #566 counted against a live instance. The prefix arm already took
  // these, and must go on doing so — the fix widens the rule rather than swapping it.
  ["a person's picture", '/api/image/serve/8672f1121a4d15c3ed5c422e6bc0597c/512x512'],
  ['a brand icon behind a query string', '/api/brands/integration/homeassistant/icon.png?p=no'],
  ['a camera snapshot', '/api/camera_proxy/camera.front'],
  ['a /local/ path', '/local/today.png'],

  // No extension, so only a scheme arm can see them. The old rule had none.
  ['an absolute URL with no extension', 'https://example.com/avatar'],
  ['an insecure absolute URL', 'http://example.com/avatar'],
  ['an uppercased scheme', 'HTTPS://example.com/avatar'],
  ['a protocol-relative URL', '//example.com/avatar'],

  // Relative paths — the only shape the extension arm can still see once the two prefix arms
  // above have run, which is what makes anchoring that arm safe.
  ['a relative path', 'today.png'],
  ['a relative path behind a query string', 'today.png?v=2'],
  ['a relative path behind a fragment', 'today.svg#icon'],

  // Spellings the old six-entry list left out.
  ['a jpeg file', 'photo.jpeg'],
  ['an avif file', 'cover.avif'],
  ['a bmp file', 'cover.bmp'],
  ['an ico file', 'favicon.ico'],
  ['an apng file', 'spinner.apng'],

  // 🚨 The old test was `includes` on lower-case literals, so it was case-sensitive. This pair
  // is not in #569's table; it was found by running the rule rather than by reading it.
  ['an uppercased extension', 'PHOTO.PNG'],
  ['a mixed-case extension', 'photo.JPEG'],
];

/** Values whose reading must not change, so the widened rule is not simply a wider net. */
const KEEPS_ITS_SHAPE: ReadonlyArray<readonly [string, string, string]> = [
  ['the dot keyword', 'dot', 'dot'],
  ['the pulse keyword', 'pulse', 'pulse'],
  ['the glow keyword', 'glow', 'glow'],
  ['an mdi icon', 'mdi:star', 'mdi'],
  ['a non-mdi icon prefix', 'phu:octopusenergy', 'mdi'],
  ['an emoji', '🎯', 'emoji'],
  ['an emoji beside a scheme it does not begin with', '🎯 https://example.com', 'emoji'],
];

/**
 * The cost of anchoring the extension arm, pinned as a decision rather than left to be noticed.
 *
 * Each of these contains an image extension somewhere other than the end of a path, so the old
 * `includes` test called it an image and the card rendered `<img src="report.gifted">`. They are
 * drawn as their own characters now — `dot` when this was written, text since #573 made that
 * the fallthrough. Nothing here is an address the card could ever have loaded, which is the
 * argument; but it is a behavior change in the restrictive direction, so it is written down.
 */
const NARROWED: ReadonlyArray<readonly [string, string]> = [
  ['an extension inside a sentence', 'Meeting.jpg tomorrow'],
  ['an extension with more after it', 'a.pngx'],
  ['a word that merely starts with one', 'report.gifted'],
  ['an extension mid-string', 'my.png.backup'],
];

describe('reading an image address off today_indicator', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
  });

  /** Renders the indicator and reports which branch of the switch drew it. */
  function drawn(value: string): string {
    const config = buildConfig({ today_indicator: value }) as Types.Config;
    litRender(renderTodayIndicator(config, true), host);

    const node = host.querySelector('.today-indicator');
    if (node === null) return 'none';

    const tag = node.tagName.toLowerCase();
    return tag === 'img' ? 'image' : tag === 'span' ? 'emoji' : 'icon';
  }

  it.each(IMAGE_ADDRESSES)('reads %s as an image', (_name, address) => {
    expect(Helpers.getTodayIndicatorType(address), address).toBe('image');
    expect(drawn(address), address).toBe('image');
  });

  it.each(IMAGE_ADDRESSES)('points the img at %s unchanged', (_name, address) => {
    const config = buildConfig({ today_indicator: address }) as Types.Config;
    litRender(renderTodayIndicator(config, true), host);

    expect(host.querySelector('.today-indicator')?.getAttribute('src')).toBe(address);
  });

  it.each(KEEPS_ITS_SHAPE)('still reads %s as %s', (_name, value, expected) => {
    expect(Helpers.getTodayIndicatorType(value), value).toBe(expected);
  });

  it.each(NARROWED)('no longer reads %s as an image', (_name, value) => {
    expect(Helpers.getTodayIndicatorType(value), value).toBe('emoji');
  });

  /**
   * The order inside the function is what makes the widened test safe, so it is pinned rather
   * than trusted. `isIconValue` runs above the image arms and is shared with `getLabelType`,
   * which is why #568 left it alone — widening it there would have reached here.
   */
  it('cannot steal a value from the arms that run before it', () => {
    for (const [, address] of IMAGE_ADDRESSES) {
      expect(Helpers.isIconValue(address), address).toBe(false);
    }

    expect(Helpers.isIconValue('mdi:star')).toBe(true);
    expect(Helpers.getTodayIndicatorType('mdi:star')).toBe('mdi');
  });

  it('keeps the non-string values the switch is entered with', () => {
    expect(Helpers.getTodayIndicatorType(false)).toBe('none');
    expect(Helpers.getTodayIndicatorType(true)).toBe('dot');
  });
});

/**
 * 🚨 The half of #569 that is worse than the rendering, and that the issue does not describe.
 *
 * `today_indicator_custom` commits what the user types only when `isCommittableIndicator` says
 * the card would render it — which asks `getTodayIndicatorType` for `image` or `emoji`. An
 * address the classifier read as `dot` was therefore held in the pending buffer and **never
 * written to the configuration at all**, so the value could not be entered through the visual
 * editor by any sequence of keystrokes. Measured before the fix: 4 of 6 addresses blocked.
 *
 * The paired `derive` is the other direction — a config already holding such an address showed
 * the **Dot** control rather than **Custom**, so the editor disagreed with the YAML.
 */
describe('the editor and a today_indicator image address', () => {
  const BLOCKED = [
    'https://example.com/avatar',
    'photo.jpeg',
    'cover.avif',
    'favicon.ico',
  ] as const;

  const custom = SYNTHETIC_FIELDS.today_indicator_custom;

  it.each(BLOCKED)('commits %s when it is typed into the custom field', (address) => {
    const result = custom.apply(address, buildConfig({}) as Types.Config);

    expect(result.changes).toHaveProperty('today_indicator', address);
    expect(result.pending?.today_indicator_custom).toBeNull();
  });

  it.each(BLOCKED)('opens the custom control for a config holding %s', (address) => {
    expect(todayIndicatorStyle({ today_indicator: address } as Types.Config)).toBe('custom');
  });

  /**
   * The control. A value the classifier already accepted must still round-trip, so a green run
   * above cannot be the commit gate having been removed rather than the classifier fixed.
   */
  it.each([
    ['an emoji', '🎯'],
    ['a /local/ path', '/local/today.png'],
  ])('still commits %s', (_name, value) => {
    const result = custom.apply(value, buildConfig({}) as Types.Config);

    expect(result.changes).toHaveProperty('today_indicator', value);
  });

  /** And a value that would move the style away from Custom is still held rather than committed. */
  it('still refuses a value that would change the style', () => {
    const result = custom.apply('mdi:calendar', buildConfig({}) as Types.Config);

    expect(result.changes).not.toHaveProperty('today_indicator');
    expect(result.pending?.today_indicator_custom).toBe('mdi:calendar');
  });
});
