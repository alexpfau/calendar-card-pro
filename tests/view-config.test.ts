import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG, normalizeNumericOptions } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  COLUMN_OVERRIDE_KEYS,
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

  it('reports a planned but unimplemented option as such, not as a typo', () => {
    const config = buildConfig();
    config.column = { day_gap: '8px' } as unknown as Types.ColumnOverrides;

    validateColumnOverrides(config);

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain('not implemented yet');
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
  it('defaults to 160', () => {
    expect(DEFAULT_CONFIG.min_day_column_width_px).toBe(160);
    expect(buildConfig().min_day_column_width_px).toBe(160);
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
    expect(config.min_day_column_width_px).toBe(160);
  });
});
