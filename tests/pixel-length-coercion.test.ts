/**
 * Y21 — a bare number written against a length-valued option.
 *
 * Home Assistant's YAML parser types `day_spacing: 4` as a number. A number is not a CSS
 * length, so it reaches `styleMap` as `"4"`, the browser rejects the declaration, and the
 * rule vanishes. Nothing throws and nothing is logged — the option simply has no effect,
 * which the user reads as the option being broken.
 *
 * The column-override path has coerced its own keys since `day_spacing` moved into the
 * override list, so `column: {day_spacing: 4}` worked while a top-level `day_spacing: 4`
 * did not: the same value in two places behaving differently. Both now route through one
 * exported `coercePixelLength`.
 *
 * Two things these tests are deliberately built to catch, because both were possible:
 *
 *  1. **Over-reach.** The coercion infers length-ness from the shipped default, so a
 *     number written against a genuinely numeric option (`days_to_show`, `title_max_lines`)
 *     must pass through untouched. A blanket `${n}px` would break the card far more
 *     visibly than the bug it fixes.
 *  2. **A vacuous pass.** The pixel-length key set is read from `DEFAULT_CONFIG` at test
 *     time rather than hardcoded, and its size is asserted, so a refactor that emptied it
 *     would fail here instead of reporting a green run over nothing.
 */

import { describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';

/** Every top-level option whose shipped default is a plain pixel length. */
const PIXEL_KEYS = Object.entries(Config.DEFAULT_CONFIG as unknown as Record<string, unknown>)
  .filter(([, v]) => typeof v === 'string' && /^-?\d+(?:\.\d+)?px$/.test(v as string))
  .map(([k]) => k);

/** Options that take a real number and must never be turned into a length. */
const NUMERIC_KEYS = ['days_to_show', 'refresh_interval', 'title_max_lines'];

describe('Y21 — pixel-length coercion', () => {
  it('has a non-empty key set to test against', () => {
    // The denominator. Without this, every assertion below could pass over an empty list.
    expect(PIXEL_KEYS.length).toBeGreaterThan(10);
    expect(PIXEL_KEYS).toContain('day_spacing');
  });

  it.each(PIXEL_KEYS)('coerces a bare number written against %s', (key) => {
    expect(Config.coercePixelLength(key, 4)).toBe('4px');
  });

  it.each(NUMERIC_KEYS)('leaves %s alone — it takes a real number', (key) => {
    // The negative control. A blanket coercion would break these, and they are the
    // options most likely to be written as bare numbers in the first place.
    expect(Config.coercePixelLength(key, 4)).toBe(4);
  });

  it('leaves strings, booleans and non-finite numbers untouched', () => {
    expect(Config.coercePixelLength('day_spacing', '10px')).toBe('10px');
    expect(Config.coercePixelLength('day_spacing', '1rem')).toBe('1rem');
    expect(Config.coercePixelLength('show_location', true)).toBe(true);
    expect(Config.coercePixelLength('day_spacing', Number.NaN)).toBeNaN();
    expect(Config.coercePixelLength('day_spacing', Number.POSITIVE_INFINITY)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('normalizes a whole config in place, top-level keys only', () => {
    const config = {
      day_spacing: 4,
      event_font_size: 18,
      days_to_show: 7,
      language: 'en',
    } as unknown as Types.Config;

    Config.normalizeLengthOptions(config);

    const raw = config as unknown as Record<string, unknown>;
    expect(raw.day_spacing).toBe('4px');
    expect(raw.event_font_size).toBe('18px');
    expect(raw.days_to_show).toBe(7);
    expect(raw.language).toBe('en');
  });

  it('reaches nested groups, so weather lengths are coerced too', () => {
    // The sweep was top-level only, on the reasoning that a nested key's shipped default
    // is not visible to a flat lookup. It is — `DEFAULT_CONFIG` carries the same nesting,
    // so the walk can descend both structures together. Four shipped options lived in
    // that gap, and every one of them silently lost its rule when written bare:
    // `weather.date.icon_size`, `weather.date.font_size`, and the two `weather.event`
    // equivalents.
    const config = {
      weather: {
        entity: 'weather.home',
        position: 'date',
        date: { icon_size: 20, font_size: 16, uv_index_threshold: 3 },
        event: { icon_size: 22, font_size: 18, max_lines: 2 },
      },
    } as unknown as Types.Config;

    Config.normalizeLengthOptions(config);

    const weather = (config as unknown as Record<string, Record<string, Record<string, unknown>>>)
      .weather;
    expect(weather.date.icon_size).toBe('20px');
    expect(weather.date.font_size).toBe('16px');
    expect(weather.event.icon_size).toBe('22px');
    expect(weather.event.font_size).toBe('18px');

    // Numbers written against genuinely numeric nested options must survive as numbers.
    expect(weather.date.uv_index_threshold).toBe(3);
    expect(weather.event.max_lines).toBe(2);

    // And the strings around them are untouched.
    expect(weather.entity).toBe('weather.home');
    expect(weather.position).toBe('date');
  });

  it('does not descend into arrays, so a per-entity list is left alone', () => {
    // `entities` is an array of objects whose shipped default is an empty array, so
    // there is no per-index default to descend into. Walking it anyway would compare
    // entity objects against `undefined` and could only do harm.
    const config = {
      entities: [{ entity: 'calendar.x', label: '5' }],
      day_spacing: 4,
    } as unknown as Types.Config;

    Config.normalizeLengthOptions(config);

    const raw = config as unknown as Record<string, unknown>;
    expect(raw.entities).toEqual([{ entity: 'calendar.x', label: '5' }]);
    expect(raw.day_spacing).toBe('4px');
  });

  it('is idempotent through nested groups as well', () => {
    const config = {
      weather: { date: { font_size: 16 }, event: { icon_size: 22 } },
    } as unknown as Types.Config;

    Config.normalizeLengthOptions(config);
    Config.normalizeLengthOptions(config);

    const weather = (config as unknown as Record<string, Record<string, Record<string, unknown>>>)
      .weather;
    expect(weather.date.font_size).toBe('16px');
    expect(weather.event.icon_size).toBe('22px');
  });

  it('is idempotent — a normalized config survives a second pass', () => {
    // The card normalizes on every setConfig, and the editor asks the same question of a
    // copy. A coercion that appended twice would produce `4pxpx`, which is silently
    // invalid in exactly the way the original bug was.
    const config = { day_spacing: 4 } as unknown as Types.Config;
    Config.normalizeLengthOptions(config);
    Config.normalizeLengthOptions(config);
    expect((config as unknown as Record<string, unknown>).day_spacing).toBe('4px');
  });
});
