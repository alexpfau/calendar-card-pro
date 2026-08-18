/**
 * A bare number written against a length-valued option.
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

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import * as View from '../src/config/view';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';

/** Every top-level option whose shipped default is a plain pixel length. */
const PIXEL_KEYS = Object.entries(Config.DEFAULT_CONFIG as unknown as Record<string, unknown>)
  .filter(([, v]) => typeof v === 'string' && /^-?\d+(?:\.\d+)?px$/.test(v as string))
  .map(([k]) => k);

/** Options that take a real number and must never be turned into a length. */
const NUMERIC_KEYS = ['days_to_show', 'refresh_interval', 'title_max_lines'];

/**
 * The same derivation over the *second* default table.
 *
 * Column-only options are not in `DEFAULT_CONFIG` — they live in `COLUMN_DEFAULTS`, and
 * `resolveColumnOption` is what reads them. That is why the Y21b fix below did not reach
 * them: `coercePixelLength` looks a key up in `DEFAULT_CONFIG`, finds nothing, and returns
 * the value untouched, so `day_header_gap: '12'` stayed `'12'` and the browser dropped the
 * declaration. Deriving both tables the same way means a column-only length option added
 * later is covered here without anyone remembering to add it.
 */
const COLUMN_PIXEL_KEYS = Object.entries(View.COLUMN_DEFAULTS as unknown as Record<string, unknown>)
  .filter(([, v]) => typeof v === 'string' && /^-?\d+(?:\.\d+)?px$/.test(v as string))
  .map(([k]) => k);

/**
 * Fields the editor renders as free text, across every panel and both views.
 *
 * A `text` selector carrying a `type` (`date`, `number`, …) is excluded: those do not
 * hand back a bare numeric string.
 *
 * Walked over several configurations, not just the defaults. Panels reveal options only
 * when they apply, so a field behind a switch that ships `false` is invisible to a walk
 * of `buildConfig({view})` alone — `progress_bar_width` and `progress_bar_height` sit
 * behind `show_progress_bar`, and both were length options the coercion missed. A gate
 * that cannot see conditional fields has a hole exactly where the bugs were.
 *
 * Module-scoped because two suites need it: the pixel-defaulted subset below, and the
 * accounted-for gate at the end of the file that has to see *every* text field.
 */
const TEXT_FIELDS = (() => {
  const names = new Set<string>();

  const variants: Array<Partial<Types.Config>> = [
    {},
    { show_progress_bar: true, show_countdown: true } as Partial<Types.Config>,
    { show_week_numbers: 'iso', show_month: true } as unknown as Partial<Types.Config>,
  ];

  for (const panel of PANELS) {
    for (const view of ['list', 'column'] as const) {
      for (const variant of variants) {
        const config = buildConfig({ view, ...variant }) as Types.Config;

        for (const { node } of walkSchema(panel.build({ view, config, language: 'en' }))) {
          if ('schema' in node || node.name === '') continue;

          const text = (node as { selector?: { text?: unknown } }).selector?.text;
          if (typeof text === 'object' && text !== null && !('type' in text)) {
            names.add(node.name);
          }
        }
      }
    }
  }

  return [...names];
})();

describe('pixel-length coercion', () => {
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

  it('leaves unit-bearing strings, booleans and non-finite numbers untouched', () => {
    // A string carrying a unit is already a valid length, so touching it could only break
    // it. A bare-numeric string is the separate case handled below — it is not a length.
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

  /**
   * Home Assistant hands a card its configuration **frozen**, and a frozen sub-object can
   * still reach the merged config. `setConfig` rebuilds any block that has a default —
   * `weather`, `tap_action`, `hold_action` — so those are safe to write into now. `column`
   * has no default (it stays `undefined` so an empty block means "no block"), so a user's
   * `column:` arrives by reference, frozen, exactly as before.
   *
   * Writing into one throws `TypeError: Cannot assign to read only property` in strict
   * mode, which is every module here, and it throws even when the assignment would not
   * have changed anything. The first version of the nested walk assigned unconditionally
   * and so broke every card carrying a `tap_action`, `hold_action` or `weather` block —
   * a card that rendered before and showed a red error box after.
   *
   * Nothing in the eight release gates caught it, because every fixture in the suite was
   * a plain mutable object literal. Freezing is the property that matters here, so these
   * freeze.
   */
  describe('a frozen configuration, as Home Assistant supplies it', () => {
    /** Freezes an object and every plain object beneath it. */
    function deepFreeze<T>(value: T): T {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
        return Object.freeze(value);
      }
      return value;
    }

    it('does not throw for a weather block that needs no coercion', () => {
      const config = {
        ...Config.DEFAULT_CONFIG,
        entities: ['calendar.family'],
        weather: deepFreeze({
          entity: 'weather.forecast_home',
          position: 'date',
          date: { show_conditions: true, icon_size: '14px', font_size: '12px' },
          event: { show_temp: true, max_lines: 0, icon_size: '14px', font_size: '12px' },
        }),
      } as unknown as Types.Config;

      expect(() => Config.normalizeLengthOptions(config)).not.toThrow();
    });

    it('does not throw for a frozen tap_action or hold_action', () => {
      const config = {
        ...Config.DEFAULT_CONFIG,
        entities: ['calendar.family'],
        tap_action: deepFreeze({ action: 'navigate', navigation_path: '/calendar' }),
        hold_action: deepFreeze({ action: 'none' }),
      } as unknown as Types.Config;

      expect(() => Config.normalizeLengthOptions(config)).not.toThrow();
    });

    it('still coerces a frozen nested value, by replacing the group rather than writing into it', () => {
      const weather = deepFreeze({
        entity: 'weather.home',
        position: 'date',
        date: { icon_size: 20, font_size: 16 },
      });
      const config = {
        ...Config.DEFAULT_CONFIG,
        entities: ['calendar.family'],
        weather,
      } as unknown as Types.Config;

      expect(() => Config.normalizeLengthOptions(config)).not.toThrow();

      const result = (config as unknown as Record<string, Record<string, Record<string, unknown>>>)
        .weather;
      expect(result.date.icon_size).toBe('20px');
      expect(result.date.font_size).toBe('16px');

      // The user's object is untouched: the group was rebuilt, not written through.
      expect(weather.date.icon_size).toBe(20);
      expect(result).not.toBe(weather);
    });

    it('leaves the shipped defaults alone when no block is supplied', () => {
      // A block the user never mentioned is still DEFAULT_CONFIG's own sub-object by
      // reference — the merge only rebuilds what the user also wrote — so an in-place
      // coercion here would edit the defaults for every card in the process.
      const before = JSON.stringify(Config.DEFAULT_CONFIG.weather);
      const config = {
        ...Config.DEFAULT_CONFIG,
        entities: ['calendar.family'],
      } as unknown as Types.Config;

      Config.normalizeLengthOptions(config);

      expect(JSON.stringify(Config.DEFAULT_CONFIG.weather)).toBe(before);
      expect(config.weather).toBe(Config.DEFAULT_CONFIG.weather);
    });
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

/**
 * The same bare number, reached through the visual editor rather than YAML.
 *
 * The first fix covered the YAML path only, because it assumed a bare number arrives
 * typed as a number. The editor renders these options as free-text fields, and `ha-form`
 * hands a text field's value back as a **string**. So typing `10` into Day Spacing stores
 * `"10"`, which the number-only guard let straight through — the identical silent
 * failure, on the input path most users actually use, in a card whose own fix was
 * already in the file.
 *
 * It is worse than a rule that does nothing. A browser discards the **whole
 * declaration**, not the bad token, so:
 *
 *  - `padding: var(--event-spacing) 0 var(--event-spacing) 12px` loses the `12px` too
 *  - `padding: calc(var(--spacing-additional) + 16px) 16px` collapses to `0px`, wiping
 *    the card's base padding — `additional_card_spacing: 8` makes the card *worse* than
 *    leaving it unset
 *
 * Both measured in headless Chrome against the card's real declarations.
 *
 * Why nothing caught it: `coercePixelLength` was tested with numbers only, the editor
 * suite asserts on what the schema *declares* rather than on what a typed value becomes,
 * and no gate connects the two. The affected field set is therefore derived here from
 * the live editor schema, so an option that later becomes free text is covered without
 * anyone remembering to add it.
 */
describe('Y21b — a bare number typed into an editor text field', () => {
  /** The affected set: rendered as free text, and defaulting to a pixel length. */
  const TYPED_LENGTH_FIELDS = TEXT_FIELDS.filter((name) => PIXEL_KEYS.includes(name));

  it('finds the affected fields in the live editor schema', () => {
    // The denominator, and the reason this suite cannot pass vacuously: if the derivation
    // silently returned nothing, every `it.each` below would run zero cases and go green.
    expect(TEXT_FIELDS.length).toBeGreaterThan(3);
    expect(TYPED_LENGTH_FIELDS).toEqual(
      expect.arrayContaining(['day_spacing', 'event_spacing', 'additional_card_spacing']),
    );
  });

  it.each(TYPED_LENGTH_FIELDS)('coerces a number typed into %s', (key) => {
    expect(Config.coercePixelLength(key, '10')).toBe('10px');
    expect(Config.coercePixelLength(key, '4.5')).toBe('4.5px');
    expect(Config.coercePixelLength(key, '-2')).toBe('-2px');
  });

  /**
   * Every column-only length the editor renders as free text.
   *
   * Intersecting the live schema with `COLUMN_DEFAULTS` is what makes this future-proof:
   * both halves are read from the code, so neither a new column-only length option nor a
   * field switched to a text selector can quietly escape it.
   */
  const TYPED_COLUMN_LENGTH_FIELDS = TEXT_FIELDS.filter((name) => COLUMN_PIXEL_KEYS.includes(name));

  it('finds the column-only length fields too', () => {
    // The second denominator. `TEXT_FIELDS` walks both views, so these are in it — they
    // were simply never intersected with the column default table, which is precisely how
    // the gap survived the first fix.
    expect(TYPED_COLUMN_LENGTH_FIELDS).toEqual(
      expect.arrayContaining(['day_header_gap', 'day_header_separator_width']),
    );
  });

  it.each(TYPED_COLUMN_LENGTH_FIELDS)('coerces a number typed into column %s', (key) => {
    const config = buildConfig({ view: 'column' }) as Types.Config;
    config.column = { [key]: '10' } as unknown as Types.Config['column'];

    expect(View.resolveColumnOption(config, key as keyof typeof View.COLUMN_DEFAULTS)).toBe('10px');
  });

  it('coerces a typed zero, which is a length only outside calc()', () => {
    // Bare `0` is a valid length on its own, so this looks harmless — but the card's
    // separator offset is `calc(-0.5 * (var(--gap) + 1px))`, and calc() requires a unit
    // on every term. Unitless zero kills that declaration like any other bare number.
    expect(Config.coercePixelLength('day_spacing', '0')).toBe('0px');
  });

  it('tolerates whitespace around a typed number', () => {
    // A text field trivially collects it, and a padded number is no more a valid length
    // than an unpadded one, so passing it through would preserve the bug for anyone who
    // hit the space bar.
    expect(Config.coercePixelLength('day_spacing', ' 10 ')).toBe('10px');
    expect(Config.coercePixelLength('day_spacing', '\t4\n')).toBe('4px');
  });

  it.each(['10px', '1rem', '2em', '50%', 'calc(100% - 4px)', 'auto', '', '10 px', '1e3'])(
    'leaves %o alone — it is not a bare number',
    (value) => {
      // Anything already carrying a unit, and anything that is not plainly numeric. `1e3`
      // is excluded deliberately: `1e3px` is not a CSS length, so guessing would replace a
      // dead rule with a different dead rule.
      expect(Config.coercePixelLength('day_spacing', value)).toBe(value);
    },
  );

  it.each(NUMERIC_KEYS)('leaves a number typed into %s as the string it was', (key) => {
    // The over-reach control, restated for the string path: these take a real number, and
    // `days_to_show: "4px"` would be far more broken than the value the user typed.
    expect(Config.coercePixelLength(key, '4')).toBe('4');
  });

  it('is idempotent across the string path', () => {
    const once = Config.coercePixelLength('day_spacing', '10');
    expect(Config.coercePixelLength('day_spacing', once)).toBe('10px');
  });

  it('reaches a nested group, where the editor writes the same way', () => {
    const config = {
      ...Config.DEFAULT_CONFIG,
      entities: ['calendar.family'],
      weather: { position: 'date', date: { icon_size: '20', font_size: '16px' } },
    } as unknown as Types.Config;

    Config.normalizeLengthOptions(config);

    const weather = (config as unknown as Record<string, Record<string, Record<string, unknown>>>)
      .weather;
    expect(weather.date.icon_size).toBe('20px');
    expect(weather.date.font_size).toBe('16px');
  });

  it('reaches the column override block', () => {
    // The override path resolves separately from `setConfig`, so a fix applied only to
    // normalization would leave `column: {day_spacing: "10"}` broken — which is the exact
    // shape of the split this file exists to close.
    const config = buildConfig({
      view: 'column',
      column: { day_spacing: '10' },
    } as unknown as Partial<Types.Config>) as Types.Config;

    const resolved = resolveEffectiveConfig(config, 'column');

    expect((resolved as unknown as Record<string, unknown>).day_spacing).toBe('10px');
  });
});

/**
 * The options a pixel-shaped default cannot speak for.
 *
 * Every derivation above starts from "the shipped default looks like `12px`", which is
 * what makes them self-maintaining — and is also exactly why they could not see this.
 * `title_font_size`, `progress_bar_width`, `progress_bar_height`, `height` and
 * `max_height` are CSS lengths that ship `undefined`, a `calc()` or a keyword, so
 * `PIXEL_KEYS` filtered them out of its own test set and every assertion passed over a
 * list that had quietly excluded the broken cases.
 *
 * `title_font_size` is the one that bites hardest, and not merely by being ignored:
 * `font-size: var(--calendar-card-font-size-title, var(--ha-card-header-font-size, 24px))`
 * *substitutes* a unitless `24` rather than falling back to it, so the declaration is
 * invalid at computed-value time and the title drops to its inherited body size. Setting
 * the option leaves the card worse than never having touched it — and v4's release notes
 * send people to that field by name.
 */
describe('length options whose default cannot mark them', () => {
  const NAMED = [...Config.LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT];

  it('names the options that need it, and none that do not', () => {
    // The denominator again. Also pins the exclusion: `today_indicator_position` ships
    // `'15% 50%'`, a position pair parsed by `parseIndicatorPosition` rather than handed
    // to CSS, so `20` is genuinely ambiguous there and appending a unit would be a guess.
    expect(NAMED).toEqual(
      expect.arrayContaining([
        'title_font_size',
        'progress_bar_width',
        'progress_bar_height',
        'height',
        'max_height',
      ]),
    );
    expect(NAMED).not.toContain('today_indicator_position');
  });

  it.each(NAMED)('coerces a bare number written against %s', (key) => {
    expect(Config.coercePixelLength(key, 24)).toBe('24px');
    expect(Config.coercePixelLength(key, '24')).toBe('24px');
    expect(Config.coercePixelLength(key, ' 0 ')).toBe('0px');
  });

  it.each(NAMED)('leaves an already-valid value for %s alone', (key) => {
    // The over-reach control for the named set: these accept units and keywords that the
    // pixel-defaulted options never see, and a percentage is the documented way to write
    // `progress_bar_width` in column view.
    for (const value of ['24px', '2em', '80%', 'auto', 'none', 'calc(1px + 2px)']) {
      expect(Config.coercePixelLength(key, value)).toBe(value);
    }
  });

  it('reaches them through setConfig, not just the helper', () => {
    // The helper being right is not the same as the card being right: `normalizeLengthOptions`
    // is what `setConfig` actually calls, and it walks keys rather than asking per option.
    const config = {
      ...Config.DEFAULT_CONFIG,
      entities: ['calendar.family'],
      title_font_size: 24,
      progress_bar_width: 100,
      progress_bar_height: 8,
      height: 300,
      max_height: 500,
    } as unknown as Types.Config;

    Config.normalizeLengthOptions(config);

    const out = config as unknown as Record<string, unknown>;
    expect(out.title_font_size).toBe('24px');
    expect(out.progress_bar_width).toBe('100px');
    expect(out.progress_bar_height).toBe('8px');
    expect(out.height).toBe('300px');
    expect(out.max_height).toBe('500px');
  });

  it('reaches them through a column override too', () => {
    // Four of the five are in `COLUMN_OVERRIDE_KEYS`, so the same value can be written
    // twice. The two paths coerce separately, which is how `day_spacing` once worked in
    // one and not the other. Derived rather than listed: `title_font_size` is deliberately
    // not overridable — the card title sits outside the columns and has one value — and
    // this should follow that list if it ever changes.
    const overridable = [...Config.LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT].filter((key) =>
      (View.COLUMN_OVERRIDE_KEYS as readonly string[]).includes(key),
    );

    expect(overridable).toEqual(
      expect.arrayContaining(['progress_bar_width', 'progress_bar_height', 'height', 'max_height']),
    );

    for (const key of overridable) {
      const config = buildConfig({
        view: 'column',
        column: { [key]: '24' },
      } as unknown as Partial<Types.Config>) as Types.Config;

      const resolved = resolveEffectiveConfig(config, 'column') as unknown as Record<
        string,
        unknown
      >;

      expect(resolved[key], `column override for ${key}`).toBe('24px');
    }
  });

  it('only applies the exception at the top level', () => {
    // The named set holds bare option names, and the walk descends into nested groups. A
    // nested key that happened to share one of these names must not inherit the exception
    // — the guard is positional, so this pins it rather than relying on today's shape.
    expect(Config.coercePixelLengthAgainst(undefined, 24)).toBe(24);
    expect(Config.coercePixelLengthAgainst(undefined, 24, 'title_font_size')).toBe('24px');
  });
});

/**
 * The gate that closes the class rather than the instance.
 *
 * Both bugs here had the same shape: an option the editor renders as free text, whose
 * length-ness no derivation could see. So rather than list the five and move on, require
 * every free-text field to be *accounted for* — either it is length-valued by the code's
 * own reckoning, or it is named below as deliberately not a length. A new text field
 * added with an `undefined` default fails here instead of shipping silently.
 */
describe('every free-text editor field is accounted for', () => {
  /**
   * Free-text fields that genuinely do not take a CSS length.
   *
   * Colors are matched by suffix rather than listed. There are nineteen of them, every
   * per-calendar override adds more, and a list of that shape is one someone eventually
   * forgets to extend — which is the failure this whole suite exists to prevent.
   */
  const NOT_LENGTHS = new Set([
    'allowlist',
    'blocklist',
    'empty_day_text',
    'label',
    'language',
    'location_country_pattern',
    'start_date_offset',
    'title',
    'today_indicator_custom',
    'today_indicator_position',
  ]);

  const isColor = (name: string) => name === 'color' || name.endsWith('_color');

  const isLength = (name: string) =>
    PIXEL_KEYS.includes(name) ||
    COLUMN_PIXEL_KEYS.includes(name) ||
    Config.LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT.has(name);

  it('classifies every one of them as a length or explicitly not', () => {
    const unaccounted = TEXT_FIELDS.filter(
      (name) => !isLength(name) && !isColor(name) && !NOT_LENGTHS.has(name),
    );

    expect(
      unaccounted,
      `These editor text fields are neither length-valued nor listed as non-lengths. ` +
        `A text field hands its value back as a string, so if any of these reaches CSS ` +
        `as a length, typing "10" into it silently kills the declaration. Add it to ` +
        `LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT in src/config/config.ts, or to NOT_LENGTHS here.`,
    ).toEqual([]);
  });

  it('has something to classify', () => {
    // Guards against the walk returning nothing and the assertion above passing vacuously.
    expect(TEXT_FIELDS.length).toBeGreaterThan(20);
    expect(TEXT_FIELDS.filter(isLength).length).toBeGreaterThan(10);
    expect(TEXT_FIELDS.filter(isColor).length).toBeGreaterThan(10);
  });
});
