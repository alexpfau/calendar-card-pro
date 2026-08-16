import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  COLUMN_DEFAULTS,
  COLUMN_DEFAULT_OVERRIDES,
  COLUMN_ONLY_KEYS,
  COLUMN_OVERRIDE_KEYS,
  VIEW_SWITCH_HYSTERESIS_PX,
  computeColumnThresholdPx,
  computeColumnThresholdPxFor,
  isZeroLength,
  resolveColumnFit,
  resolveColumnFitOnMeasurement,
  resolveColumnOption,
  resolveEffectiveConfig,
  resolveEffectiveView,
  resolveMinDaysFallback,
  resolveMinDaysToShow,
  resolveViewOnMeasurement,
  resolveViewOption,
  validateColumnOverrides,
  validateView,
  viewAppliesCompactLimits,
  viewForcesMultidaySplit,
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
  describe('object identity', () => {
    it('returns the original in list view, however populated the block', () => {
      const config = buildConfig({
        show_location: true,
        column: { show_location: false, event_font_size: '11px' },
      });

      expect(resolveEffectiveConfig(config, 'list')).toBe(config);
    });

    // Column view always allocates, because `COLUMN_DEFAULT_OVERRIDES` applies there
    // whether or not a block exists. Cheap only because the card memoizes the call on
    // configuration *and* view identity; see the `effectiveConfig` getter.
    it('allocates in column view even with no block at all', () => {
      const config = buildConfig({ show_location: true });

      expect(config.column).toBeUndefined();
      expect(resolveEffectiveConfig(config, 'column')).not.toBe(config);
      expect(resolveEffectiveConfig(config, 'column').show_location).toBe(true);
    });

    it('allocates in column view when the block supplies only column-only options', () => {
      const config = buildConfig({ column: { day_header_gap: '20px' } });

      expect(resolveEffectiveConfig(config, 'column')).not.toBe(config);
    });
  });

  /**
   * The keys where the two views disagree about what "unconfigured" means. These do
   * not inherit the top-level value in column view at all — the column default stands
   * until the block overrides it, so the escape hatch is always the block.
   */
  describe('divergent column defaults', () => {
    it('defaults show_empty_days to true in column view and false in list view', () => {
      const config = buildConfig({});

      expect(config.show_empty_days).toBe(false);
      expect(resolveEffectiveConfig(config, 'list').show_empty_days).toBe(false);
      expect(resolveEffectiveConfig(config, 'column').show_empty_days).toBe(true);
    });

    it('does not inherit an explicit top-level false into column view', () => {
      const config = buildConfig({ show_empty_days: false });

      expect(resolveEffectiveConfig(config, 'list').show_empty_days).toBe(false);
      expect(resolveEffectiveConfig(config, 'column').show_empty_days).toBe(true);
    });

    it('lets the block switch the column default back off', () => {
      const config = buildConfig({ column: { show_empty_days: false } });

      expect(resolveEffectiveConfig(config, 'column').show_empty_days).toBe(false);
      expect(resolveEffectiveConfig(config, 'list').show_empty_days).toBe(false);
    });

    it('applies the same precedence through resolveViewOption', () => {
      const plain = buildConfig({ show_empty_days: false });
      const blocked = buildConfig({ column: { show_empty_days: false } });

      expect(resolveViewOption(plain, 'show_empty_days', 'list')).toBe(false);
      expect(resolveViewOption(plain, 'show_empty_days', 'column')).toBe(true);
      expect(resolveViewOption(blocked, 'show_empty_days', 'column')).toBe(false);
    });

    it('defaults split_multiday_events to true in column view and false in list view', () => {
      // The second divergent default, and the one with a visible failure mode: a
      // multi-day event that is not split appears in the column of the day it starts
      // and nowhere else, so every later day it covers reads as free. In a grid that
      // is a lie the layout invites — the empty column is right there next to it.
      const config = buildConfig({});

      expect(config.split_multiday_events).toBe(false);
      expect(resolveEffectiveConfig(config, 'list').split_multiday_events).toBe(false);
      expect(resolveEffectiveConfig(config, 'column').split_multiday_events).toBe(true);
    });

    it('does not inherit an explicit top-level split_multiday_events false into column view', () => {
      const config = buildConfig({ split_multiday_events: false });

      expect(resolveEffectiveConfig(config, 'list').split_multiday_events).toBe(false);
      expect(resolveEffectiveConfig(config, 'column').split_multiday_events).toBe(true);
    });

    it('lets the block switch splitting back off in column view', () => {
      const config = buildConfig({ column: { split_multiday_events: false } });

      expect(resolveEffectiveConfig(config, 'column').split_multiday_events).toBe(false);
      expect(resolveEffectiveConfig(config, 'list').split_multiday_events).toBe(false);
    });

    // A default that no block can reach is unconditional, not a default.
    it('keeps every divergent default reachable through the block', () => {
      Object.keys(COLUMN_DEFAULT_OVERRIDES).forEach((key) => {
        expect(COLUMN_OVERRIDE_KEYS).toContain(key);
      });
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

/**
 * View-semantics predicates.
 *
 * These replaced inline `=== 'column'` comparisons so that a third view has somewhere
 * to be answered rather than silently inheriting the list answer from a negative-form
 * check. The tests pin the two shipped answers and, deliberately, nothing about a view
 * that does not exist yet.
 */
describe('view-semantics predicates', () => {
  it('applies compact-mode limits in list view but not in column view', () => {
    expect(viewAppliesCompactLimits('list')).toBe(true);
    expect(viewAppliesCompactLimits('column')).toBe(false);
  });

  it('forces the multi-day split in column view but not in list view', () => {
    expect(viewForcesMultidaySplit('column')).toBe(true);
    expect(viewForcesMultidaySplit('list')).toBe(false);
  });
});

describe('validateView', () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  it.each(['list', 'column'] as const)('leaves %s untouched and stays silent', (view) => {
    const config = buildConfig({ view });

    validateView(config);

    expect(config.view).toBe(view);
    expect(warnMock).not.toHaveBeenCalled();
  });

  // The failure this exists for: a typo matches no `=== 'column'` branch anywhere, so
  // the card renders a complete, correct-looking list with nothing to connect it to
  // what the user wrote.
  it('coerces a misspelled view to list and names the offending value', () => {
    const config = buildConfig();
    config.view = 'colunm' as unknown as Types.EffectiveView;

    validateView(config);

    expect(config.view).toBe('list');
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain('colunm');
  });

  // `{ ...DEFAULT_CONFIG, ...config }` lets an explicitly-undefined key overwrite the
  // shipped default, so `view` can be absent despite being a required field.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 3],
  ])('coerces %s to list', (_label, value) => {
    const config = buildConfig();
    config.view = value as unknown as Types.EffectiveView;

    validateView(config);

    expect(config.view).toBe('list');
    expect(warnMock).toHaveBeenCalledTimes(1);
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

  // These graduated out of the "planned but not implemented" set as each feature landed
  // -- five when week numbers shipped, six more when the separators did. That set is now
  // empty and its warning branch is gone from `validateColumnOverrides`, so what is left
  // to protect is the inverse: a shipped key must never warn the user away from an option
  // that works.
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
    //
    // One key is exempt, and the exemption is named rather than implied:
    // `min_days_to_show` defaults to `days_to_show`, which is not a constant and so
    // cannot live in a static table. It is covered by its own assertion below, so the
    // invariant "every column-only key has a default" still holds end to end -- what
    // is relaxed is only *where* that default is written down.
    const DYNAMIC_DEFAULT_KEYS = ['min_days_to_show'];

    for (const key of COLUMN_ONLY_KEYS) {
      if (DYNAMIC_DEFAULT_KEYS.includes(key)) continue;
      expect(COLUMN_DEFAULTS).toHaveProperty(key);
    }
  });

  it('defaults min_days_to_show to days_to_show', () => {
    // The other half of the exemption above. Without this the dynamic default would
    // be unasserted, and the loop's `continue` would be a hole rather than a
    // redirection.
    expect(resolveMinDaysToShow({ ...DEFAULT_CONFIG, days_to_show: 7 })).toBe(7);
    expect(resolveMinDaysToShow({ ...DEFAULT_CONFIG, days_to_show: 3 })).toBe(3);
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

  it('coerces a bare number typed as a string, which is what the editor hands back', () => {
    // The test above covers YAML's number. The visual editor cannot produce one: both
    // of these fields are `selector: { text: {} }` (schemas/layout.ts, schemas/separators.ts),
    // and an HA text field always hands back a string. So typing `12` into "Day header
    // gap" stores `'12'`, which is the *same* invalid CSS as the number case — the style
    // attribute is written as `border-top-width:12` and the browser discards it.
    //
    // This half was missed because the two coercion paths were separate: `coercePixelLength`
    // infers length-ness from `DEFAULT_CONFIG`, and neither of these keys is in it — they
    // live in `COLUMN_DEFAULTS`. Both paths now share `coercePixelLengthAgainst`, so a new
    // length-valued column option is covered by construction rather than by remembering.
    const config = buildConfig();
    config.column = {
      day_header_gap: '12',
      day_header_separator_width: '1',
    } as unknown as Types.Config['column'];

    expect(resolveColumnOption(config, 'day_header_gap')).toBe('12px');
    expect(resolveColumnOption(config, 'day_header_separator_width')).toBe('1px');
  });

  it('leaves a column-only option that is not a length alone', () => {
    // The other half of the invariant, and the reason length-ness is inferred from the
    // shipped default rather than assumed: a bare number is meaningful for some options
    // and appending `px` to those would be the mirror-image bug.
    const config = buildConfig();
    config.column = {
      day_header_separator_color: '12',
      min_days_fallback: 'cramp',
    } as unknown as Types.Config['column'];

    expect(resolveColumnOption(config, 'day_header_separator_color')).toBe('12');
    expect(resolveColumnOption(config, 'min_days_fallback')).toBe('cramp');
  });

  it('leaves an already-suffixed length alone, from either source', () => {
    const config = buildConfig();
    config.column = { day_header_gap: '12px' };

    expect(resolveColumnOption(config, 'day_header_gap')).toBe('12px');
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
    // `show_past_events` and `filter_duplicates` were in this list until each was traced
    // to the API call and found not to reach it. Membership is decided by that trace, not
    // by whether an option sounds like it selects events — see the note on
    // FETCH_TIME_KEYS. The two are now overridable and covered by
    // tests/view-content-overrides.test.ts.
    for (const key of [
      'entities',
      'start_date',
      'days_to_show',
      'first_day_of_week',
      'weather',
      'refresh_interval',
      'refresh_on_navigate',
    ]) {
      expect(COLUMN_OVERRIDE_KEYS).not.toContain(key);
    }
  });

  /**
   * Cluster completeness for the today indicator.
   *
   * `today_indicator_color` shipped absent from the override list while `today_indicator`
   * and `_size` were both present, so a card could override whether the dot appears and
   * how large it is but not what colour it is. Nothing failed -- an override list is a
   * flat array, and a missing entry is indistinguishable from a deliberate exclusion
   * until someone tries to use it. Asserting the cluster as a unit means the next key
   * added to it cannot be half-wired the same way.
   *
   * `_position` is the deliberate exclusion, and it is asserted rather than merely
   * omitted: column view renders the dot inline on the weekday row, so the key is inert
   * there, and an override for an inert key is a no-op wearing the costume of a feature.
   */
  it('carries the whole today-indicator cluster except the inert position key', () => {
    for (const key of ['today_indicator', 'today_indicator_size', 'today_indicator_color']) {
      expect(COLUMN_OVERRIDE_KEYS).toContain(key);
    }

    expect(COLUMN_OVERRIDE_KEYS).not.toContain('today_indicator_position');
  });
});

describe('column.min_day_width normalization', () => {
  it('defaults to 140', () => {
    expect(resolveColumnOption(buildConfig(), 'min_day_width')).toBe(140);
  });

  it('reads a configured value out of the column block', () => {
    const config = buildConfig({ column: { min_day_width: 220 } });
    expect(resolveColumnOption(config, 'min_day_width')).toBe(220);
  });

  it('accepts a numeric string, which is what the editor persists', () => {
    const config = buildConfig({
      column: { min_day_width: '220' as unknown as number },
    });
    expect(resolveColumnOption(config, 'min_day_width')).toBe(220);
  });

  // The #327 inputs. Each would otherwise coerce to 0 or NaN and make every viewport
  // wide enough for any number of columns — or none.
  //
  // This matters more here than it did at the top level. The key used to be swept by
  // `normalizeNumericOptions`; inside `column:` it is raw user input that reaches
  // `computeColumnThresholdPx` unvalidated unless `normalizeColumnValue` catches it.
  it.each([
    ['empty string', ''],
    ['null', null],
    ['non-numeric text', 'wide'],
    ['NaN', Number.NaN],
    ['zero', 0],
    ['negative', -100],
  ])('falls back to the default for %s', (_label, value) => {
    const config = buildConfig({
      column: { min_day_width: value as unknown as number },
    });
    expect(resolveColumnOption(config, 'min_day_width')).toBe(140);
  });

  // The threshold is the reason the validation above exists, so assert the outcome
  // and not only the resolver: a bad value must not widen or disable the fallback.
  it('keeps the view-switch threshold finite for an unusable value', () => {
    const config = buildConfig({
      days_to_show: 3,
      column: { min_day_width: 'wide' as unknown as number },
    });
    expect(computeColumnThresholdPx(config)).toBe(140 * 3 + 32 + 2 * 10);
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
    //     default, whatever the reasoning behind it. min_day_width dropped
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
    // Asserting the same number as the default-config case above is the point: it pins
    // the two together, which is what `DEFAULT_DAY_GAP_PX` exists to guarantee.
    //
    // It is a fallback, not a free lunch. A resolvable-but-non-px gutter is under-counted
    // by twice its excess over the default — `3rem` (48px) should threshold at 548 and
    // gets 472 — so the card switches to columns some 76px narrower than it should, which
    // is the overflow the threshold exists to prevent. Accepted, because resolving
    // `em`/`rem` needs layout this pass does not have, and an under-count degrades
    // gradually where NaN pins the card to one view forever.
    expect(threshold).toBe(472);
  });

  it('refuses to reserve space a negative gutter does not save', () => {
    // `column-gap` is `normal | <length-percentage [0,∞]>`, so a browser discards a
    // negative value and renders no gutter. Subtracting it from the threshold would
    // reserve space the layout is not saving and select columns that cannot fit: this
    // configuration thresholds at 252px unguarded, so a 280px card renders three 83px
    // columns against the 140px floor it was told to honour. Tracks are `minmax(0, 1fr)`,
    // so the arithmetic is the only thing holding that floor.
    const config = buildConfig();
    config.column = { day_spacing: '-100px', min_day_width: 140 };

    // Same number as the default-gutter case: the negative value is replaced, not clamped.
    expect(computeColumnThresholdPx(config)).toBe(472);
    expect(resolveColumnFit('column', config, 280, null)).toEqual({ view: 'list', columns: 0 });
  });

  it('keeps a zero gutter, which is a legitimate request', () => {
    // The guard above mirrors the `> 0` test `min_day_width` already applies, but the
    // two floors differ: a card with no gutter is a real layout, a zero-width column
    // is not. Pinning this stops the guard being tightened to `> 0` by symmetry.
    const config = buildConfig();
    config.column = { day_spacing: '0px' };

    // 140 x 3 + 32 + 2 x 0 = 452
    expect(computeColumnThresholdPx(config)).toBe(452);
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

describe('computeColumnThresholdPxFor', () => {
  it('reproduces computeColumnThresholdPx at days_to_show', () => {
    // The generalization must be a strict superset, not a reimplementation that
    // happens to agree at the default. Swept, because a single spot check would pass
    // for a function that ignored its argument entirely.
    for (const days of [1, 2, 3, 5, 7, 14]) {
      const config = buildConfig();
      config.days_to_show = days;

      expect(computeColumnThresholdPxFor(config, days)).toBe(computeColumnThresholdPx(config));
    }
  });

  it('costs one column width plus one gutter per additional column', () => {
    const config = buildConfig();

    expect(computeColumnThresholdPxFor(config, 1)).toBe(140 + 32);
    expect(computeColumnThresholdPxFor(config, 2)).toBe(140 * 2 + 32 + 10);
    expect(computeColumnThresholdPxFor(config, 3)).toBe(140 * 3 + 32 + 2 * 10);
    expect(computeColumnThresholdPxFor(config, 7)).toBe(140 * 7 + 32 + 6 * 10);
  });
});

describe('resolveMinDaysToShow', () => {
  it('defaults to days_to_show, collapsing the reduction range to a point', () => {
    const config = buildConfig();
    config.days_to_show = 7;

    expect(resolveMinDaysToShow(config)).toBe(7);
  });

  it('reads a configured floor out of the column block', () => {
    const config = buildConfig();
    config.days_to_show = 7;
    config.column = { min_days_to_show: 3 };

    expect(resolveMinDaysToShow(config)).toBe(3);
  });

  it('clamps a floor above the ceiling down to days_to_show', () => {
    // Asking for at least 9 columns out of a 7-day fetch is not a layout the card can
    // produce; the honest reading is "never reduce", which is days_to_show.
    const config = buildConfig();
    config.days_to_show = 7;
    config.column = { min_days_to_show: 9 };

    expect(resolveMinDaysToShow(config)).toBe(7);
  });

  it('clamps zero and negatives up to one', () => {
    const config = buildConfig();
    config.days_to_show = 7;

    for (const value of [0, -1, -100]) {
      config.column = { min_days_to_show: value };
      expect(resolveMinDaysToShow(config)).toBe(1);
    }
  });

  it('floors a fractional floor rather than rendering a fraction of a column', () => {
    const config = buildConfig();
    config.days_to_show = 7;
    config.column = { min_days_to_show: 3.9 };

    expect(resolveMinDaysToShow(config)).toBe(3);
  });

  it('falls back to days_to_show for a value that is not a number', () => {
    // The column block is raw user input and never passes through normalizeConfig's
    // numeric sweep, so a string reaches this function intact.
    const config = buildConfig();
    config.days_to_show = 7;

    for (const value of ['banana', '', Number.NaN, Number.POSITIVE_INFINITY]) {
      config.column = { min_days_to_show: value as unknown as number };
      expect(resolveMinDaysToShow(config)).toBe(7);
    }
  });

  it('accepts a numeric string, matching every other column length', () => {
    const config = buildConfig();
    config.days_to_show = 7;
    config.column = { min_days_to_show: '4' as unknown as number };

    expect(resolveMinDaysToShow(config)).toBe(4);
  });
});

describe('resolveMinDaysFallback', () => {
  it('defaults to the wholesale list fallback the card shipped with', () => {
    expect(resolveMinDaysFallback(buildConfig())).toBe('list');
  });

  it('honours an explicit cramp', () => {
    const config = buildConfig();
    config.column = { min_days_fallback: 'cramp' };

    expect(resolveMinDaysFallback(config)).toBe('cramp');
  });

  it('treats an unrecognized value as list rather than as not-list', () => {
    // The trap this function exists to close. `normalizeColumnValue` has no notion of
    // an enum, so a typo arrives here as a plain string -- and a naive
    // `value === 'list' ? 'list' : 'cramp'` would read every typo as an instruction to
    // cramp, which is the behaviour the user did not ask for.
    const config = buildConfig();

    for (const value of ['lst', 'List', 'columns', '', 'true']) {
      config.column = { min_days_fallback: value as Types.ColumnMinDaysFallback };
      expect(resolveMinDaysFallback(config)).toBe('list');
    }
  });
});

describe('resolveColumnFit — equivalence with resolveEffectiveView at defaults', () => {
  // The load-bearing test of the whole density framework.
  //
  // min_days_to_show defaults to days_to_show, at which the staircase has exactly one
  // step and must be indistinguishable from the boundary it replaces. Anything else is
  // a silent behavioural change shipped to every existing column-view user, none of
  // whom asked for the feature.
  //
  // Swept rather than spot-checked, and swept across both hysteresis states, because
  // the two functions apply the band in structurally different places -- one adjusts
  // the threshold, the other adjusts the width -- and agreement at a handful of widths
  // would not establish that those are the same thing.
  const widthsAround = (threshold: number) => {
    const offsets = [-400, -100, -33, -17, -16, -15, -1, 0, 1, 15, 16, 17, 33, 100, 400];
    return offsets.map((offset) => threshold + offset).filter((width) => width > 0);
  };

  for (const days of [1, 3, 7]) {
    it(`agrees at every sampled width for days_to_show: ${days}`, () => {
      const config = buildConfig();
      config.days_to_show = days;
      const threshold = computeColumnThresholdPx(config);

      for (const width of widthsAround(threshold)) {
        for (const previousView of ['list', 'column'] as Types.EffectiveView[]) {
          const previousFit = { view: previousView, columns: previousView === 'column' ? days : 0 };

          expect(resolveColumnFit('column', config, width, previousFit).view).toBe(
            resolveEffectiveView('column', width, threshold, previousView),
          );
        }

        // And with no confirmed previous layout, where neither applies the band.
        expect(resolveColumnFit('column', config, width, null).view).toBe(
          resolveEffectiveView('column', width, threshold, null),
        );
      }
    });
  }

  it('renders every configured column whenever it renders columns at all', () => {
    const config = buildConfig();
    config.days_to_show = 7;
    const threshold = computeColumnThresholdPx(config);

    for (const width of widthsAround(threshold)) {
      const fit = resolveColumnFit('column', config, width, null);
      expect(fit.columns).toBe(fit.view === 'column' ? 7 : 0);
    }
  });

  it('answers optimistically before the first measurement', () => {
    const config = buildConfig();
    config.days_to_show = 7;

    expect(resolveColumnFit('column', config, null, null)).toEqual({ view: 'column', columns: 7 });
    expect(resolveColumnFit('column', config, 0, null)).toEqual({ view: 'column', columns: 7 });
  });

  it('leaves a list request alone', () => {
    const config = buildConfig();

    expect(resolveColumnFit('list', config, 2000, null)).toEqual({ view: 'list', columns: 0 });
    expect(resolveColumnFit('list', config, 100, null)).toEqual({ view: 'list', columns: 0 });
  });
});

describe('resolveColumnFit — reduction', () => {
  // The worked example from the density spec: 7 configured days, floor of 3.
  //
  // Thresholds at defaults (140 wide, 10 gutter, 32 padding) are
  // 140n + 32 + 10(n-1), so: 3 -> 472, 4 -> 622, 5 -> 772, 6 -> 922, 7 -> 1072.
  const build = (overrides: Partial<Types.ColumnOverrides> = {}) => {
    const config = buildConfig();
    config.days_to_show = 7;
    config.column = { min_days_to_show: 3, ...overrides };
    return config;
  };

  it('drops one column at a time from a cold start', () => {
    // With no confirmed previous layout each column must clear its *enter* threshold,
    // raw + VIEW_SWITCH_HYSTERESIS_PX / 2, for the same reason a cold-started view has
    // to clear it: nothing has yet demonstrated that the card is that wide.
    const config = build();

    for (const [width, columns] of [
      [2000, 7],
      [1088, 7],
      [1087, 6],
      [938, 6],
      [937, 5],
      [788, 5],
      [787, 4],
      [638, 4],
      [637, 3],
      [488, 3],
    ] as const) {
      expect(resolveColumnFit('column', config, width, null)).toEqual({
        view: 'column',
        columns,
      });
    }
  });

  it('drops one column at a time across a continuous resize', () => {
    // What actually happens in a browser: a settled layout, then a width that moves a
    // pixel at a time. Asserted as a sweep rather than a table because the property
    // that matters is monotonicity -- the count may only ever decrease as the card
    // narrows, and only by one at a time.
    const config = build();
    let fit = resolveColumnFit('column', config, 2000, null);
    const drops: number[] = [];

    expect(fit).toEqual({ view: 'column', columns: 7 });

    for (let width = 2000; width >= 300; width -= 1) {
      const next = resolveColumnFit('column', config, width, fit);

      if (next.view === 'column' && fit.view === 'column' && next.columns !== fit.columns) {
        expect(next.columns).toBe(fit.columns - 1);
        drops.push(width);
      }

      fit = next;
    }

    // Leave thresholds: raw - VIEW_SWITCH_HYSTERESIS_PX / 2, one per boundary.
    expect(drops).toEqual([1055, 905, 755, 605]);
    expect(fit).toEqual({ view: 'list', columns: 0 });
  });

  it('falls back to list below the floor by default', () => {
    const config = build();

    expect(resolveColumnFit('column', config, 471, null)).toEqual({ view: 'list', columns: 0 });
    expect(resolveColumnFit('column', config, 200, null)).toEqual({ view: 'list', columns: 0 });
  });

  it('holds the floor below it when asked to cramp', () => {
    const config = build({ min_days_fallback: 'cramp' });

    // Columns now narrower than min_day_width, which is the entire point: the
    // minimum is a judgement about legibility and the user is entitled to overrule it.
    expect(resolveColumnFit('column', config, 471, null)).toEqual({ view: 'column', columns: 3 });
    expect(resolveColumnFit('column', config, 200, null)).toEqual({ view: 'column', columns: 3 });
    expect(resolveColumnFit('column', config, 1, null)).toEqual({ view: 'column', columns: 3 });
  });

  it('never exceeds days_to_show however wide the card gets', () => {
    const config = build();

    expect(resolveColumnFit('column', config, 100000, null).columns).toBe(7);
  });

  it('applies hysteresis at every boundary, not just the last one', () => {
    const config = build();

    // Sitting just below the 5-column threshold of 772. Coming from 5 columns the
    // band holds it there; coming from 4 it does not yet grant the fifth.
    const holding = { view: 'column' as const, columns: 5 };
    const growing = { view: 'column' as const, columns: 4 };

    expect(resolveColumnFit('column', config, 765, holding).columns).toBe(5);
    expect(resolveColumnFit('column', config, 765, growing).columns).toBe(4);

    // Outside the band both agree.
    expect(resolveColumnFit('column', config, 750, holding).columns).toBe(4);
    expect(resolveColumnFit('column', config, 790, growing).columns).toBe(5);
  });

  it('keeps adjacent hysteresis bands from overlapping at a pathological width floor', () => {
    // With min_day_width at 12 and a 10px gutter the boundaries sit 22px apart,
    // so an unclamped +/-16 band would reach past its neighbour and the trigger would
    // oscillate rather than damp. The clamp caps the half-band at (22 - 1) / 2.
    //
    // Swept over every width in the dense region, asserting the only property that
    // actually matters: the answer never moves by more than one column per pixel, in
    // either direction, from any starting layout.
    const config = buildConfig();
    config.days_to_show = 7;
    config.column = { min_days_to_show: 1, min_day_width: 12 };

    for (let width = 40; width <= 220; width += 1) {
      const from = resolveColumnFit('column', config, width, null);
      const stepped = resolveColumnFit('column', config, width + 1, from);

      expect(Math.abs(stepped.columns - from.columns)).toBeLessThanOrEqual(1);
    }
  });
});

describe('resolveColumnFitOnMeasurement', () => {
  const config = (() => {
    const built = buildConfig();
    built.days_to_show = 7;
    built.column = { min_days_to_show: 3 };
    return built;
  })();

  it('ignores the optimistic pre-measurement layout as a hysteresis seed', () => {
    // The mistake this wrapper exists to prevent, in its column-count form: the
    // optimistic answer claims 7 columns, and letting that seed the band would grant
    // the seventh column at a width that has never qualified for it.
    const optimistic = { view: 'column' as const, columns: 7 };

    expect(resolveColumnFitOnMeasurement('column', config, null, 1065, optimistic).columns).toBe(6);
  });

  it('applies the band once a measurement has confirmed the layout', () => {
    const confirmed = { view: 'column' as const, columns: 7 };

    expect(resolveColumnFitOnMeasurement('column', config, 1200, 1065, confirmed).columns).toBe(7);
  });
});

describe('resolveViewOption and resolveEffectiveConfig agree', () => {
  // Both resolvers read the same `column:` block, so a caller must get the same answer
  // whichever it reaches for. They diverged once: only `resolveEffectiveConfig` applied
  // `coercePixelLength`, so a bare `day_spacing: 4` resolved to `4` through one path and
  // `'4px'` through the other. Nothing caught it because every `resolveViewOption` call
  // site happened to pass a boolean, where the coercion is a no-op — the divergence was
  // waiting for the first length-valued caller.
  const bareNumberOverrides = Object.fromEntries(
    COLUMN_OVERRIDE_KEYS.map((key) => [key, 4]),
  ) as Types.ColumnOverrides;

  it('returns identical values for every override key', () => {
    const config = buildConfig({ view: 'column', column: bareNumberOverrides });
    const effective = resolveEffectiveConfig(config, 'column');

    const mismatches = COLUMN_OVERRIDE_KEYS.filter(
      (key) => resolveViewOption(config, key, 'column') !== effective[key],
    );

    expect(mismatches).toEqual([]);
  });

  it('coerces a bare number on a length-valued key, through either path', () => {
    // Cast because the type says `string` while YAML and the editor both hand over a
    // bare number — which is the whole reason `coercePixelLength` exists.
    const config = buildConfig({
      view: 'column',
      column: { day_spacing: 4 as unknown as string },
    });

    expect(resolveViewOption(config, 'day_spacing', 'column')).toBe('4px');
    expect(resolveEffectiveConfig(config, 'column').day_spacing).toBe('4px');
  });

  it('leaves a non-length key untouched, through either path', () => {
    const config = buildConfig({ view: 'column', column: { description_max_lines: 4 } });

    expect(resolveViewOption(config, 'description_max_lines', 'column')).toBe(4);
    expect(resolveEffectiveConfig(config, 'column').description_max_lines).toBe(4);
  });
});
