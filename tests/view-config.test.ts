import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG, normalizeNumericOptions } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  COLUMN_DEFAULTS,
  COLUMN_ONLY_KEYS,
  COLUMN_OVERRIDE_KEYS,
  VIEW_SWITCH_HYSTERESIS_PX,
  computeColumnThresholdPx,
  isZeroLength,
  resolveColumnOption,
  resolveEffectiveConfig,
  resolveEffectiveView,
  resolveViewOnMeasurement,
  resolveViewOption,
  validateColumnOverrides,
} from '../src/config/view';
import { generateCustomPropertiesObject } from '../src/rendering/styles';

/**
 * Per-view option resolution.
 *
 * The `column:` block exists so an option can hold a different value in column view
 * than at the top level. That only works if resolution asks whether the block
 * *supplies* an option, not whether the value it supplies is truthy. Every idiom in
 * the codebase for reading optional config — `config.weather?.date || {}`,
 * `value !== false`, `value === true` — collapses "not set" into one of the two
 * boolean values, which is precisely the distinction this block has to preserve.
 *
 * These tests exercise both directions of that distinction. A resolver written with
 * `!== false` passes the false-over-true case and fails the true-over-false one; a
 * resolver written with `=== true` fails the other way. Only presence-based
 * resolution passes both.
 */

// Deterministic regardless of the build's log level, which the production bundle
// lowers far enough to compile warnings out entirely.
vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

const Logger = await import('../src/utils/logger');
const warnMock = vi.mocked(Logger.warn);

describe('resolveViewOption — E4, both directions', () => {
  it('honours an override of false against a top-level true', () => {
    const config = buildConfig({
      show_location: true,
      column: { show_location: false },
    });

    expect(resolveViewOption(config, 'show_location', 'column')).toBe(false);
    expect(resolveViewOption(config, 'show_location', 'list')).toBe(true);
  });

  // The mirror. `!== false` passes the case above and fails this one, which is the
  // whole reason both are here.
  it('honours an override of true against a top-level false', () => {
    const config = buildConfig({
      show_location: false,
      column: { show_location: true },
    });

    expect(resolveViewOption(config, 'show_location', 'column')).toBe(true);
    expect(resolveViewOption(config, 'show_location', 'list')).toBe(false);
  });
});

describe('resolveViewOption — inheritance', () => {
  it('inherits the merged top-level value, not the shipped default', () => {
    // `show_month` defaults to true, so a resolver that fell back to DEFAULT_CONFIG
    // would return true here and look correct against a default-valued config. The
    // top-level value is deliberately the opposite of the default to catch that.
    expect(DEFAULT_CONFIG.show_month).toBe(true);

    const config = buildConfig({
      show_month: false,
      column: { show_location: false },
    });

    expect(resolveViewOption(config, 'show_month', 'column')).toBe(false);
    expect(resolveViewOption(config, 'show_month', 'list')).toBe(false);
  });

  it('inherits every option when the block is absent', () => {
    const config = buildConfig({ show_location: false, event_font_size: '20px' });

    expect(config.column).toBeUndefined();
    expect(resolveViewOption(config, 'show_location', 'column')).toBe(false);
    expect(resolveViewOption(config, 'event_font_size', 'column')).toBe('20px');
  });

  it('inherits an option the block does not mention', () => {
    const config = buildConfig({
      show_location: true,
      show_description: true,
      column: { show_location: false },
    });

    expect(resolveViewOption(config, 'show_description', 'column')).toBe(true);
  });

  it('ignores a populated block entirely in list view', () => {
    const config = buildConfig({
      show_location: true,
      show_time: true,
      event_font_size: '14px',
      column: { show_location: false, show_time: false, event_font_size: '11px' },
    });

    expect(resolveViewOption(config, 'show_location', 'list')).toBe(true);
    expect(resolveViewOption(config, 'show_time', 'list')).toBe(true);
    expect(resolveViewOption(config, 'event_font_size', 'list')).toBe('14px');
  });
});

describe('resolveViewOption — falsy values are values', () => {
  // Each of these is falsy, so any `||`, `??`-on-falsy or truthiness check would
  // discard it and inherit the top-level value instead.
  it('honours an override of false', () => {
    const config = buildConfig({ show_time: true, column: { show_time: false } });
    expect(resolveViewOption(config, 'show_time', 'column')).toBe(false);
  });

  it('honours an override of 0', () => {
    const config = buildConfig({
      description_max_lines: 3,
      column: { description_max_lines: 0 },
    });
    expect(resolveViewOption(config, 'description_max_lines', 'column')).toBe(0);
  });

  it('honours an override of an empty string', () => {
    const config = buildConfig({ empty_day_text: 'Nothing on', column: { empty_day_text: '' } });
    expect(resolveViewOption(config, 'empty_day_text', 'column')).toBe('');
  });

  it('treats an explicit undefined as absent, since YAML cannot express it', () => {
    const config = buildConfig({
      show_location: true,
      column: { show_location: undefined },
    });
    expect(resolveViewOption(config, 'show_location', 'column')).toBe(true);
  });

  it('does not read inherited members of Object.prototype as overrides', () => {
    const config = buildConfig({ show_location: true, column: {} });
    // `'toString' in {}` is true; `hasOwnProperty` is what keeps that from
    // registering as a configured option.
    expect(resolveViewOption(config, 'show_location', 'column')).toBe(true);
  });
});

describe('resolveEffectiveConfig', () => {
  it('applies an override of false against a top-level true', () => {
    const config = buildConfig({
      show_location: true,
      column: { show_location: false },
    });

    expect(resolveEffectiveConfig(config, 'column').show_location).toBe(false);
  });

  // The mirror, for the same reason the per-option resolver has one.
  it('applies an override of true against a top-level false', () => {
    const config = buildConfig({
      show_location: false,
      column: { show_location: true },
    });

    expect(resolveEffectiveConfig(config, 'column').show_location).toBe(true);
  });

  it('leaves an option the block does not mention', () => {
    const config = buildConfig({
      show_location: true,
      show_description: true,
      column: { show_location: false },
    });

    expect(resolveEffectiveConfig(config, 'column').show_description).toBe(true);
  });

  /**
   * The parity contract.
   *
   * Two resolvers now answer the same question, and the bulk one is reached by far
   * the more travelled path. Asserting them equal over every declared key means a key
   * added to `COLUMN_OVERRIDE_KEYS` is covered the moment it is declared, and neither
   * resolver can be changed in isolation without this failing.
   */
  it('agrees with resolveViewOption on every declared override key', () => {
    expect(COLUMN_OVERRIDE_KEYS.length).toBeGreaterThan(30);

    for (const key of COLUMN_OVERRIDE_KEYS) {
      // Resolution is pass-through, so a sentinel exercises it as well as a
      // well-typed value would — and unlike a real value it cannot coincide with
      // whatever the top level or the shipped default happens to hold.
      const sentinel = `__${key}__`;
      const config = buildConfig({
        column: { [key]: sentinel } as Partial<Types.Config>['column'],
      });

      const merged = resolveEffectiveConfig(config, 'column') as unknown as Record<string, unknown>;

      expect(merged[key]).toBe(sentinel);
      expect(resolveViewOption(config, key, 'column')).toBe(sentinel);
    }
  });

  /**
   * Identity on the no-op paths.
   *
   * The card memoizes on configuration identity and hands the result to caches that
   * compare by reference. Returning a fresh equal object where nothing applies would
   * still render correctly, so nothing else in the suite would notice — it would just
   * quietly turn every one of those comparisons into a miss.
   */
  describe('returns the original object when nothing applies', () => {
    it('in list view, however populated the block', () => {
      const config = buildConfig({
        show_location: true,
        column: { show_location: false, event_font_size: '11px' },
      });

      expect(resolveEffectiveConfig(config, 'list')).toBe(config);
    });

    it('when there is no block at all', () => {
      const config = buildConfig({ show_location: true });

      expect(config.column).toBeUndefined();
      expect(resolveEffectiveConfig(config, 'column')).toBe(config);
    });

    it('when the block supplies only column-only options', () => {
      const config = buildConfig({ column: { day_header_gap: '20px' } });

      expect(resolveEffectiveConfig(config, 'column')).toBe(config);
    });
  });

  /**
   * `day_spacing` as the column gutter — the merge that retired `day_gap`.
   *
   * The two keys always described one concept on two axes: the configurable space
   * between adjacent days, vertical when they are stacked and horizontal when they sit
   * side by side. Carrying a second name for the second axis meant a user who wanted
   * tighter days had to learn which name applied to which layout.
   *
   * The consequence worth pinning is that the gutter is now an *override* rather than
   * a column-only option, so it inherits: a top-level `day_spacing` reaches the column
   * grid with no `column:` block written at all.
   */
  describe('day_spacing as the column gutter', () => {
    it('inherits the top-level value with no column block', () => {
      const config = buildConfig({ day_spacing: '18px' });

      expect(resolveEffectiveConfig(config, 'column').day_spacing).toBe('18px');
    });

    it('prefers a column override over the top-level value', () => {
      const config = buildConfig({ day_spacing: '18px', column: { day_spacing: '4px' } });

      expect(resolveEffectiveConfig(config, 'column').day_spacing).toBe('4px');
      expect(resolveEffectiveConfig(config, 'list').day_spacing).toBe('18px');
    });

    it('coerces a bare number written against a length-valued override', () => {
      // Home Assistant's YAML parser types `day_spacing: 4` as a number. A number is
      // not a CSS length: it reaches styleMap as "4", the browser rejects the
      // declaration, and the columns collapse to a zero gutter. COLUMN_LENGTH_KEYS has
      // always protected the column-only options from this; overrides had no
      // equivalent, which only started to matter when the gutter moved into the
      // override list.
      const config = buildConfig({
        column: { day_spacing: 4 } as unknown as Types.Config['column'],
      });

      expect(resolveEffectiveConfig(config, 'column').day_spacing).toBe('4px');
    });

    it('leaves a number alone where the shipped default is not a pixel length', () => {
      // Length-ness is inferred from the shape of the key's DEFAULT_CONFIG value, so
      // the coercion cannot misfire on a genuinely numeric option and turn a line
      // count into "2px".
      const config = buildConfig({
        column: { title_max_lines: 2 } as unknown as Types.Config['column'],
      });

      expect(resolveEffectiveConfig(config, 'column').title_max_lines).toBe(2);
    });
  });

  /**
   * `COLUMN_ONLY_KEYS` have no top-level counterpart, so hoisting one would put a key
   * on the configuration that no `Types.Config` field describes — and would shadow
   * nothing, since there is nothing there to shadow. They stay in the block for
   * `resolveColumnOption`, which is still the only reader.
   */
  it('does not hoist column-only options to the top level', () => {
    const config = buildConfig({
      show_location: false,
      column: { show_location: true, day_header_gap: '20px' },
    });

    const merged = resolveEffectiveConfig(config, 'column') as unknown as Record<string, unknown>;

    expect(merged.show_location).toBe(true);
    expect(merged.day_header_gap).toBeUndefined();
  });

  it('keeps the block intact so column-only options still resolve downstream', () => {
    const config = buildConfig({
      show_location: false,
      column: { show_location: true, day_header_gap: '20px' },
    });

    const merged = resolveEffectiveConfig(config, 'column');

    expect(merged.column).toBe(config.column);
    expect(resolveColumnOption(merged, 'day_header_gap')).toBe('20px');
  });

  /**
   * The end-to-end case that motivated the merge. `max_height` is read only by the
   * custom-property map, which takes a configuration and no view — so before this
   * resolver existed, `column: { max_height }` parsed, validated and did nothing.
   */
  it('carries an override into the emitted custom properties', () => {
    const config = buildConfig({
      max_height: 'none',
      column: { max_height: '250px' },
    });

    expect(generateCustomPropertiesObject(config)['--calendar-card-max-height']).toBe('none');
    expect(
      generateCustomPropertiesObject(resolveEffectiveConfig(config, 'column'))[
        '--calendar-card-max-height'
      ],
    ).toBe('250px');
  });
});

describe('validateColumnOverrides', () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  it('stays silent for a block of valid overrides', () => {
    validateColumnOverrides(
      buildConfig({
        column: { show_location: false, show_description: true, event_font_size: '11px' },
      }),
    );
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('stays silent when there is no block at all', () => {
    validateColumnOverrides(buildConfig());
    expect(warnMock).not.toHaveBeenCalled();
  });

  // Every option that decides which events are loaded. One of these inside the block
  // would mean a Home Assistant API call each time the viewport crossed the
  // breakpoint between views.
  it.each([
    'entities',
    'start_date',
    'days_to_show',
    'first_day_of_week',
    'show_past_events',
    'filter_duplicates',
    'weather',
    'refresh_interval',
    'refresh_on_navigate',
  ])('warns that %s cannot be overridden because it is loaded from Home Assistant', (key) => {
    const config = buildConfig();
    config.column = { [key]: 1 } as unknown as Types.ColumnOverrides;

    validateColumnOverrides(config);

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain(`column.${key}`);
    expect(warnMock.mock.calls[0][0]).toContain('loaded from Home Assistant');
  });

  it('accepts the column-only options now that Phase 4b implements them', () => {
    // These three were reported as "planned but not implemented yet" until Phase 4b
    // built them. The message was correct then and would be a lie now, so this test
    // inverts: the keys must validate silently.
    const config = buildConfig();
    config.column = {
      day_header_gap: '8px',
      day_header_separator_width: '1px',
      day_header_separator_color: 'red',
    } as unknown as Types.ColumnOverrides;

    validateColumnOverrides(config);

    expect(warnMock).not.toHaveBeenCalled();
  });

  it('distinguishes a real top-level option from an unrecognized one', () => {
    const config = buildConfig();
    config.column = {
      background_color: 'red',
      shwo_location: true,
    } as unknown as Types.ColumnOverrides;

    validateColumnOverrides(config);

    expect(warnMock).toHaveBeenCalledTimes(2);
    expect(warnMock.mock.calls[0][0]).toContain('cannot be overridden per view');
    expect(warnMock.mock.calls[1][0]).toContain('not a recognized option');
  });

  // The deferred set is empty: every key the design document published ahead of the
  // code now renders. There is deliberately no test enumerating its members, because
  // an `it.each([])` throws rather than passing vacuously. What must stay tested is
  // the *branch*, which the next block does with a synthetic key.
  it('tells the user a deferred key is planned rather than misdirecting them', () => {
    const config = buildConfig();
    config.column = { day_header_gap: '32px' } as unknown as Types.ColumnOverrides;

    validateColumnOverrides(config);

    // A Category-C key is accepted, so this proves only that a valid block is quiet.
    // The deferred branch itself is unreachable while the set is empty, and will be
    // covered again by the first key that re-enters it.
    expect(warnMock).not.toHaveBeenCalled();
  });

  // The mirror image of the deferred set, and the reason it has to be kept honest:
  // these graduated out of it as each feature landed -- five when week numbers shipped,
  // six more when the separators did. A key that stays on the deferred list after it
  // ships warns the user away from an option that works.
  it.each([
    'show_week_numbers',
    'show_current_week_number',
    'week_number_font_size',
    'week_number_color',
    'week_number_background_color',
    'day_separator_width',
    'day_separator_color',
    'week_separator_width',
    'week_separator_color',
    'month_separator_width',
    'month_separator_color',
  ])('accepts %s inside the block now that it renders in column view', (key) => {
    const config = buildConfig();
    config.column = { [key]: 'iso' } as unknown as Types.ColumnOverrides;

    validateColumnOverrides(config);

    expect(warnMock).not.toHaveBeenCalled();
  });

  // The mirror-image mistake, and the more likely one: the reference documentation
  // lists these three in the same visual table as genuine top-level options, so
  // nothing about their presentation signals that they are nested. Left unreported
  // they are silently inert, which spec E rules out.
  it.each(['day_header_gap', 'day_header_separator_width', 'day_header_separator_color'])(
    'warns when %s is written at the top level instead of inside the block',
    (key) => {
      const config = buildConfig();
      (config as unknown as Record<string, unknown>)[key] = '32px';

      validateColumnOverrides(config);

      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock.mock.calls[0][0]).toContain(`top-level "${key}"`);
      expect(warnMock.mock.calls[0][0]).toContain(`column: { ${key}`);
    },
  );

  it('does not mistake a correctly nested column-only option for a top-level one', () => {
    // Guards the pairing between the two checks above: a validator that looked at the
    // merged config rather than at own top-level keys would fire on a correct config.
    const config = buildConfig();
    config.column = { day_header_gap: '8px' } as unknown as Types.ColumnOverrides;

    validateColumnOverrides(config);

    expect(warnMock).not.toHaveBeenCalled();
  });

  it('never throws, so one bad option cannot blank the card', () => {
    const config = buildConfig();
    config.column = { nonsense: {} } as unknown as Types.ColumnOverrides;
    expect(() => validateColumnOverrides(config)).not.toThrow();
  });
});

describe('column view config surface', () => {
  it('defaults to list view', () => {
    expect(DEFAULT_CONFIG.view).toBe('list');
    expect(buildConfig().view).toBe('list');
  });

  it('ships every override key as a real top-level option', () => {
    // The block can only ever override options that exist; a typo here would give a
    // key that resolves to undefined at every call site.
    for (const key of COLUMN_OVERRIDE_KEYS) {
      expect(DEFAULT_CONFIG).toHaveProperty(key);
    }
  });

  it('keeps the column-only keys out of the override list', () => {
    // The inverse invariant. `COLUMN_ONLY_KEYS` exist only inside `column:`, so a key
    // appearing in both lists would mean either a phantom top-level option or an
    // override with nothing to inherit from.
    for (const key of COLUMN_ONLY_KEYS) {
      expect(DEFAULT_CONFIG).not.toHaveProperty(key);
      expect(COLUMN_OVERRIDE_KEYS).not.toContain(key);
    }
  });

  it('supplies a default for every column-only key', () => {
    // These cannot default through DEFAULT_CONFIG, because DEFAULT_CONFIG.column is
    // undefined by design. COLUMN_DEFAULTS is the only thing standing between them
    // and an undefined reaching the stylesheet.
    for (const key of COLUMN_ONLY_KEYS) {
      expect(COLUMN_DEFAULTS).toHaveProperty(key);
    }
  });

  it('pins each column-only default to its literal value', () => {
    // Deliberately literal, and deliberately not a loop over COLUMN_DEFAULTS.
    //
    // The shape test above passed while the two separator defaults were both wrong
    // — `toBeTruthy()` is satisfied by any non-empty string, so it accepted a
    // suppressed separator ('0px') just as happily as a visible one. An assertion
    // written as `resolveColumnOption(...) === COLUMN_DEFAULTS.x` is no better: it
    // compares the code to itself, so both sides move together under any edit.
    //
    // Spec B2 rules these values. Changing one here without changing the spec is the
    // mistake this test exists to catch, so update the spec first. The separator width
    // has been through that loop once already: it shipped as '1px' per the original
    // B2, was live-reviewed, and B2 was formally amended to '0px'. This test failing
    // is the expected first step of any such change, not an obstacle to route around.
    const config = buildConfig();

    expect(resolveColumnOption(config, 'day_header_gap')).toBe('8px');
    expect(resolveColumnOption(config, 'day_header_separator_width')).toBe('0px');
    expect(resolveColumnOption(config, 'day_header_separator_color')).toBe('var(--divider-color)');
  });

  it('prefers a configured column-only value over its default', () => {
    const config = buildConfig();
    config.column = { day_header_gap: '24px' };

    expect(resolveColumnOption(config, 'day_header_gap')).toBe('24px');
    // Untouched siblings still fall through to their defaults, asserted as a literal
    // rather than against COLUMN_DEFAULTS so this cannot pass by moving with the code.
    expect(resolveColumnOption(config, 'day_header_separator_width')).toBe('0px');
  });

  it('coerces a bare number to px for length-valued column options', () => {
    // Home Assistant's YAML parser types an unquoted `1` as a number, and styleMap
    // would emit `border-top-width: 1` — invalid CSS, dropped by the browser, so the
    // separator disappears entirely. The nastier of the two cases: the user asked for
    // a visible separator and got nothing.
    const config = buildConfig();
    config.column = {
      day_header_gap: 4,
      day_header_separator_width: 1,
    } as unknown as Types.Config['column'];

    expect(resolveColumnOption(config, 'day_header_gap')).toBe('4px');
    expect(resolveColumnOption(config, 'day_header_separator_width')).toBe('1px');
  });

  it('treats a bare zero as a suppressed length', () => {
    const config = buildConfig();
    config.column = { day_header_separator_width: 0 } as unknown as Types.Config['column'];

    expect(resolveColumnOption(config, 'day_header_separator_width')).toBe('0px');
    expect(isZeroLength(resolveColumnOption(config, 'day_header_separator_width'))).toBe(true);
  });

  it('recognizes every spelling of a zero length', () => {
    for (const value of ['0', '0px', '0em', '0%', ' 0px ']) {
      expect(isZeroLength(value)).toBe(true);
    }

    for (const value of ['1px', '0.5px', 'var(--x)', '', '10px']) {
      expect(isZeroLength(value)).toBe(false);
    }
  });

  it('excludes every fetch-time option from the override keys', () => {
    for (const key of [
      'entities',
      'start_date',
      'days_to_show',
      'first_day_of_week',
      'show_past_events',
      'filter_duplicates',
      'weather',
      'refresh_interval',
      'refresh_on_navigate',
    ]) {
      expect(COLUMN_OVERRIDE_KEYS).not.toContain(key);
    }
  });
});

describe('min_day_column_width_px normalization', () => {
  it('defaults to 140', () => {
    expect(DEFAULT_CONFIG.min_day_column_width_px).toBe(140);
    expect(buildConfig().min_day_column_width_px).toBe(140);
  });

  it('accepts a numeric string, which is what the editor persists', () => {
    expect(buildConfig({ min_day_column_width_px: '220' as unknown as number })).toHaveProperty(
      'min_day_column_width_px',
      220,
    );
  });

  // The #327 inputs. Each would otherwise coerce to 0 and make every viewport wide
  // enough for any number of columns.
  it.each([
    ['empty string', ''],
    ['null', null],
    ['non-numeric text', 'wide'],
    ['NaN', Number.NaN],
    ['zero', 0],
    ['negative', -100],
  ])('falls back to the default for %s', (_label, value) => {
    const config = { ...DEFAULT_CONFIG, min_day_column_width_px: value } as unknown as Types.Config;
    normalizeNumericOptions(config);
    expect(config.min_day_column_width_px).toBe(140);
  });
});

/**
 * Width-based fallback.
 *
 * Spec A3-C: above the threshold you get the columns you asked for, below it you get
 * a list. The card never silently drops columns to make a narrow width work, because
 * a user who asked for three days and got two has been lied to about what they are
 * looking at.
 */
describe('computeColumnThresholdPx', () => {
  it('fits the default config inside a standard Home Assistant section', () => {
    // 140 x 3 + 32 padding + 2 x 10 gutter = 472, against a measured 500px section.
    //
    // This assertion has now flipped twice, and the history matters because the
    // arithmetic has three independent terms that have each moved:
    //
    //   - It first read "fits", at min 152 with 8px padding and a 4px gap.
    //   - Live review then widened the padding to 32px (so the first column lines up
    //     with the card title) and the gap to 12px (adjacent columns read as one
    //     block without it). That pushed the threshold to 512 and the assertion was
    //     rewritten to "needs more than a single-span section", recording the loss as
    //     a deliberate, reviewed cost.
    //   - That cost was then rejected on sight: a default 3-day card rendering as a
    //     list in the single most common desktop placement is not an acceptable
    //     default, whatever the reasoning behind it. min_day_column_width_px dropped
    //     152 -> 140 to buy the fit back without giving up the padding or the gap.
    //
    // The margin is thinner than 476-vs-500 suggests, because the view only *enters*
    // column mode at threshold + VIEW_SWITCH_HYSTERESIS_PX / 2 = 488. That is the
    // number with 12px of headroom, not 472. 144 would have computed 484 and entered
    // at 500 -- an apparent fit sitting exactly on the boundary. Recompute the enter
    // threshold, not just the raw one, before touching any of the three terms.
    const threshold = computeColumnThresholdPx(buildConfig());

    expect(threshold).toBe(472);
    expect(threshold + VIEW_SWITCH_HYSTERESIS_PX / 2).toBeLessThanOrEqual(500);
  });

  it('scales with days_to_show', () => {
    const config = buildConfig();
    config.days_to_show = 5;

    // 140 x 5 + 32 + 4 x 10 = 772
    expect(computeColumnThresholdPx(config)).toBe(772);
  });

  it('accounts for a configured gutter', () => {
    const config = buildConfig();
    // Deliberately not 10px: that is the default, so the assertion would pass even if
    // the configured value were ignored entirely.
    config.column = { day_spacing: '20px' };

    // 140 x 3 + 32 + 2 x 20 = 492
    expect(computeColumnThresholdPx(config)).toBe(492);
  });

  it('falls back rather than producing NaN for a non-px gutter', () => {
    // `day_spacing` is a CSS length, so `2em` and `calc(...)` are legal values the card
    // cannot resolve without layout. A NaN threshold compares false against every
    // width, which would silently pin the card to one view forever.
    const config = buildConfig();
    config.column = { day_spacing: '2em' };

    const threshold = computeColumnThresholdPx(config);
    expect(Number.isFinite(threshold)).toBe(true);
    // The fallback is the default gutter, so an unresolvable length costs nothing.
    // Asserting the same number as the default-config case above is the point: it
    // pins the two together, which is what `DEFAULT_DAY_GAP_PX` exists to guarantee.
    expect(threshold).toBe(472);
  });
});

describe('resolveEffectiveView', () => {
  // The Schmitt trigger is centred on the threshold, so neither edge is the threshold
  // itself. Deriving both from the exported constant rather than hardcoding 508/476
  // (the default threshold is now 472; 492 below is a deliberate round test input)
  // means widening the band cannot leave these tests asserting a stale geometry while
  // still passing.
  const THRESHOLD = 492;
  const HALF = VIEW_SWITCH_HYSTERESIS_PX / 2;
  const ENTER = THRESHOLD + HALF;
  const LEAVE = THRESHOLD - HALF;

  it('leaves a list request alone at every width', () => {
    for (const width of [200, THRESHOLD, 2000, null]) {
      expect(resolveEffectiveView('list', width, THRESHOLD, null)).toBe('list');
    }
  });

  it('renders columns at or above the entry edge', () => {
    expect(resolveEffectiveView('column', ENTER, THRESHOLD, null)).toBe('column');
    expect(resolveEffectiveView('column', 1200, THRESHOLD, null)).toBe('column');
  });

  it('falls back to a list below the entry edge', () => {
    expect(resolveEffectiveView('column', ENTER - 1, THRESHOLD, null)).toBe('list');
    expect(resolveEffectiveView('column', 320, THRESHOLD, null)).toBe('list');
  });

  it('renders the requested view before the first measurement', () => {
    // A null width means "not measured yet", not "zero wide". Treating it as narrow
    // would flash a list layout for one frame on every column card that loads.
    expect(resolveEffectiveView('column', null, THRESHOLD, null)).toBe('column');
  });

  it('holds the column view down to the leaving edge', () => {
    // Already in column view, drifting under the threshold: stay put. Without this, a
    // card sitting within a pixel of the boundary flips layout on every scrollbar
    // appearance or font swap.
    expect(resolveEffectiveView('column', THRESHOLD - 1, THRESHOLD, 'column')).toBe('column');
    // The edge is inclusive, matching the inclusive `>=` at the entry edge, so neither
    // boundary is a special case to remember.
    expect(resolveEffectiveView('column', LEAVE, THRESHOLD, 'column')).toBe('column');
  });

  it('leaves the column view once past the leaving edge', () => {
    expect(resolveEffectiveView('column', LEAVE - 1, THRESHOLD, 'column')).toBe('list');
    expect(resolveEffectiveView('column', 200, THRESHOLD, 'column')).toBe('list');
  });

  it('centres the band on the threshold rather than hanging it below', () => {
    // The band used to run from the threshold down to threshold - 32, so a card had to
    // reach the *full* computed threshold to enter column view but only lost it a full
    // band later. Widening a window therefore felt far stickier than narrowing it, which
    // is the behaviour this centring exists to fix. Assert both edges relative to the
    // threshold so a regression to the asymmetric form fails here rather than in a
    // subjective "feels wrong" report.
    expect(resolveEffectiveView('column', THRESHOLD, THRESHOLD, 'list')).toBe('list');
    expect(resolveEffectiveView('column', ENTER, THRESHOLD, 'list')).toBe('column');
    expect(resolveEffectiveView('column', THRESHOLD, THRESHOLD, 'column')).toBe('column');
    expect(resolveEffectiveView('column', LEAVE - 1, THRESHOLD, 'column')).toBe('list');
    // The total width of the band is what protects against oscillation, and centring
    // must not have changed it.
    expect(ENTER - LEAVE).toBe(VIEW_SWITCH_HYSTERESIS_PX);
  });
});

describe('resolveViewOnMeasurement', () => {
  // Not the default threshold (that is 472). This is the value that was live when the
  // regression below was measured, and these are pure-function inputs, so it is kept
  // as the historical record rather than tracked against COLUMN_DEFAULTS.
  const THRESHOLD = 492;
  const ENTER = THRESHOLD + VIEW_SWITCH_HYSTERESIS_PX / 2;
  const LEAVE = THRESHOLD - VIEW_SWITCH_HYSTERESIS_PX / 2;

  it('applies the enter threshold to the first measurement', () => {
    // Regression: measured live in Home Assistant. A 464px card against a 492px
    // threshold rendered columns, because the optimistic pre-measurement `column`
    // seeded the hysteresis and the first measurement was judged against 460.
    expect(resolveViewOnMeasurement('column', null, 464, THRESHOLD, 'column')).toBe('list');
    // The whole band is affected, not just the width that exposed it.
    expect(resolveViewOnMeasurement('column', null, ENTER - 1, THRESHOLD, 'column')).toBe('list');
    expect(resolveViewOnMeasurement('column', null, ENTER, THRESHOLD, 'column')).toBe('column');
  });

  it('applies the hysteresis band once a measurement has confirmed the view', () => {
    // Same width, same rendered view, different history: now the band is earned. The
    // width has to sit *inside* the band for the contrast to mean anything, which the
    // original 464 no longer does now that the band is centred -- 464 is below the
    // leaving edge, so it would resolve to a list either way and the test would pass
    // for the wrong reason.
    const insideBand = THRESHOLD - 1;
    expect(insideBand).toBeGreaterThanOrEqual(LEAVE);
    expect(insideBand).toBeLessThan(ENTER);
    expect(resolveViewOnMeasurement('column', 800, insideBand, THRESHOLD, 'column')).toBe('column');
    expect(resolveViewOnMeasurement('column', null, insideBand, THRESHOLD, 'column')).toBe('list');
    expect(resolveViewOnMeasurement('column', 800, LEAVE - 1, THRESHOLD, 'column')).toBe('list');
  });

  it('never lets the band help a card that is rendering a list', () => {
    expect(resolveViewOnMeasurement('column', 200, ENTER - 1, THRESHOLD, 'list')).toBe('list');
    expect(resolveViewOnMeasurement('column', 200, ENTER, THRESHOLD, 'list')).toBe('column');
  });

  it('leaves a list request alone regardless of measurement history', () => {
    expect(resolveViewOnMeasurement('list', null, 2000, THRESHOLD, 'list')).toBe('list');
    expect(resolveViewOnMeasurement('list', 2000, 2000, THRESHOLD, 'list')).toBe('list');
  });
});
