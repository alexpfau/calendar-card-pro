import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG, normalizeNumericOptions } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  COLUMN_DEFAULTS,
  COLUMN_ONLY_KEYS,
  COLUMN_OVERRIDE_KEYS,
  computeColumnThresholdPx,
  isZeroLength,
  resolveColumnOption,
  resolveEffectiveView,
  resolveViewOnMeasurement,
  resolveViewOption,
  validateColumnOverrides,
} from '../src/config/view';

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
      day_gap: '8px',
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
    // Spec B2 rules these three values. Changing one here without changing the spec
    // is the mistake this test exists to catch, so update the spec first.
    const config = buildConfig();

    expect(resolveColumnOption(config, 'day_gap')).toBe('4px');
    expect(resolveColumnOption(config, 'day_header_separator_width')).toBe('1px');
    expect(resolveColumnOption(config, 'day_header_separator_color')).toBe('var(--divider-color)');
  });

  it('prefers a configured column-only value over its default', () => {
    const config = buildConfig();
    config.column = { day_gap: '24px' };

    expect(resolveColumnOption(config, 'day_gap')).toBe('24px');
    // Untouched siblings still fall through to their defaults, asserted as a literal
    // rather than against COLUMN_DEFAULTS so this cannot pass by moving with the code.
    expect(resolveColumnOption(config, 'day_header_separator_width')).toBe('1px');
  });

  it('coerces a bare number to px for length-valued column options', () => {
    // Home Assistant's YAML parser types an unquoted `1` as a number, and styleMap
    // would emit `border-top-width: 1` — invalid CSS, dropped by the browser, so the
    // separator disappears entirely. The nastier of the two cases: the user asked for
    // a visible separator and got nothing.
    const config = buildConfig();
    config.column = {
      day_gap: 4,
      day_header_separator_width: 1,
    } as unknown as Types.Config['column'];

    expect(resolveColumnOption(config, 'day_gap')).toBe('4px');
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
  it('defaults to 152', () => {
    expect(DEFAULT_CONFIG.min_day_column_width_px).toBe(152);
    expect(buildConfig().min_day_column_width_px).toBe(152);
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
    expect(config.min_day_column_width_px).toBe(152);
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
    // 152 x 3 + 16 padding + 2 x 4 gutter = 480, against a measured 500px section.
    //
    // This assertion is the reason min_day_column_width_px is 152 rather than the
    // 160 originally proposed: at 160 the threshold is 512px, so the column view
    // would never have activated in the default HA layout at all. Do not "restore"
    // 160 for consistency with the design doc — measurement supersedes it.
    //
    // The 20px of headroom here is the entire margin the default config has. It was
    // 8px until `day_gap` dropped from 10px to the 4px the spec's worked example
    // uses. Anything that widens the gutter or the minimum column width spends it.
    const threshold = computeColumnThresholdPx(buildConfig());

    expect(threshold).toBe(480);
    expect(threshold).toBeLessThanOrEqual(500);
  });

  it('scales with days_to_show', () => {
    const config = buildConfig();
    config.days_to_show = 5;

    // 152 x 5 + 16 + 4 x 4 = 792
    expect(computeColumnThresholdPx(config)).toBe(792);
  });

  it('accounts for a configured gutter', () => {
    const config = buildConfig();
    // Deliberately not 4px: that is the default, so the assertion would pass even if
    // the configured value were ignored entirely.
    config.column = { day_gap: '10px' };

    // 152 x 3 + 16 + 2 x 10 = 492
    expect(computeColumnThresholdPx(config)).toBe(492);
  });

  it('falls back rather than producing NaN for a non-px gutter', () => {
    // `day_gap` is a CSS length, so `2em` and `calc(...)` are legal values the card
    // cannot resolve without layout. A NaN threshold compares false against every
    // width, which would silently pin the card to one view forever.
    const config = buildConfig();
    config.column = { day_gap: '2em' };

    const threshold = computeColumnThresholdPx(config);
    expect(Number.isFinite(threshold)).toBe(true);
    // The fallback is the default gutter, so an unresolvable length costs nothing.
    expect(threshold).toBe(480);
  });
});

describe('resolveEffectiveView', () => {
  const THRESHOLD = 492;

  it('leaves a list request alone at every width', () => {
    for (const width of [200, 492, 2000, null]) {
      expect(resolveEffectiveView('list', width, THRESHOLD, null)).toBe('list');
    }
  });

  it('renders columns at or above the threshold', () => {
    expect(resolveEffectiveView('column', THRESHOLD, THRESHOLD, null)).toBe('column');
    expect(resolveEffectiveView('column', 1200, THRESHOLD, null)).toBe('column');
  });

  it('falls back to a list below the threshold', () => {
    expect(resolveEffectiveView('column', THRESHOLD - 1, THRESHOLD, null)).toBe('list');
    expect(resolveEffectiveView('column', 320, THRESHOLD, null)).toBe('list');
  });

  it('renders the requested view before the first measurement', () => {
    // A null width means "not measured yet", not "zero wide". Treating it as narrow
    // would flash a list layout for one frame on every column card that loads.
    expect(resolveEffectiveView('column', null, THRESHOLD, null)).toBe('column');
  });

  it('holds the column view through the hysteresis band', () => {
    // Already in column view, drifting just under the threshold: stay put. Without
    // this, a card sitting within a pixel of the boundary flips layout on every
    // scrollbar appearance or font swap.
    expect(resolveEffectiveView('column', THRESHOLD - 1, THRESHOLD, 'column')).toBe('column');
    // The band's far edge is inclusive, matching the inclusive `>=` at the entry
    // threshold above. Both comparisons read the same way, so neither boundary is a
    // special case to remember.
    expect(resolveEffectiveView('column', THRESHOLD - 32, THRESHOLD, 'column')).toBe('column');
  });

  it('leaves the column view once past the hysteresis band', () => {
    expect(resolveEffectiveView('column', THRESHOLD - 33, THRESHOLD, 'column')).toBe('list');
    expect(resolveEffectiveView('column', 200, THRESHOLD, 'column')).toBe('list');
  });

  it('requires the full threshold to re-enter the column view', () => {
    // Asymmetric by design: the band is only lenient in the direction that keeps the
    // current layout. Coming back from a list, nothing short of the real threshold
    // will do, or the two rules would fight and the card would oscillate anyway.
    expect(resolveEffectiveView('column', THRESHOLD - 1, THRESHOLD, 'list')).toBe('list');
    expect(resolveEffectiveView('column', THRESHOLD, THRESHOLD, 'list')).toBe('column');
  });
});

describe('resolveViewOnMeasurement', () => {
  // Not the default threshold (that is 480). This is the value that was live when the
  // regression below was measured, and these are pure-function inputs, so it is kept
  // as the historical record rather than tracked against COLUMN_DEFAULTS.
  const THRESHOLD = 492;

  it('applies the enter threshold to the first measurement', () => {
    // Regression: measured live in Home Assistant. A 464px card against a 492px
    // threshold rendered columns, because the optimistic pre-measurement `column`
    // seeded the hysteresis and the first measurement was judged against 460.
    expect(resolveViewOnMeasurement('column', null, 464, THRESHOLD, 'column')).toBe('list');
    // The whole band is affected, not just the width that exposed it.
    expect(resolveViewOnMeasurement('column', null, THRESHOLD - 1, THRESHOLD, 'column')).toBe(
      'list',
    );
    expect(resolveViewOnMeasurement('column', null, THRESHOLD, THRESHOLD, 'column')).toBe('column');
  });

  it('applies the hysteresis band once a measurement has confirmed the view', () => {
    // Same width, same rendered view, different history: now the band is earned.
    expect(resolveViewOnMeasurement('column', 800, 464, THRESHOLD, 'column')).toBe('column');
    expect(resolveViewOnMeasurement('column', 800, THRESHOLD - 33, THRESHOLD, 'column')).toBe(
      'list',
    );
  });

  it('never lets the band help a card that is rendering a list', () => {
    expect(resolveViewOnMeasurement('column', 200, THRESHOLD - 1, THRESHOLD, 'list')).toBe('list');
    expect(resolveViewOnMeasurement('column', 200, THRESHOLD, THRESHOLD, 'list')).toBe('column');
  });

  it('leaves a list request alone regardless of measurement history', () => {
    expect(resolveViewOnMeasurement('list', null, 2000, THRESHOLD, 'list')).toBe('list');
    expect(resolveViewOnMeasurement('list', 2000, 2000, THRESHOLD, 'list')).toBe('list');
  });
});
