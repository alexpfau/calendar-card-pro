import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG, DEPRECATED_CONFIG_MAP, normalizeEntities } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  COLUMN_DEFAULTS,
  COLUMN_DEFAULT_OVERRIDES,
  COLUMN_ONLY_KEYS,
  COLUMN_OVERRIDE_KEYS,
  ENTITY_VIEW_SCOPE,
  VIEWS,
  VIEW_SCOPE,
  appliesToView,
  describeColumnLayoutBands,
  entityScopeFor,
  resolveColumnFit,
} from '../src/config/view';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import {
  clearCopiedSettings,
  copiedSettings,
  copySettings,
  fromEntityFormData,
  pasteSettings,
  toEntityFormData,
  writeEntity,
} from '../src/rendering/editor/entities';
import {
  applySelection,
  declaredKeys,
  eligibleFields,
  removeException,
} from '../src/rendering/editor/exceptions';
import type { HaFormSchema, SelectOption } from '../src/rendering/editor/ha-form';
import {
  applicabilityNote,
  computeHelper,
  computeLabel,
  computeSubformHelper,
} from '../src/rendering/editor/localize';
import * as Overrides from '../src/rendering/editor/overrides';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { buildDayHeaderSchema } from '../src/rendering/editor/schemas/day-header';
import {
  ENTITY_TRISTATE_STORED,
  ENTITY_TRISTATE_VALUES,
  entitySchemaFor,
} from '../src/rendering/editor/schemas/entity';
import { buildLayoutSchema, widthTableRows } from '../src/rendering/editor/schemas/layout';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { exceptionSubforms } from '../src/rendering/editor/subforms';
import {
  SYNTHETIC_FIELDS,
  deriveSyntheticData,
  isCommittableOffset,
  isSyntheticKey,
  languageMode,
  startDateMode,
} from '../src/rendering/editor/synthetic';
import {
  applyFormChange,
  changedKeys,
  columnFormBlock,
  exceptionFormBlock,
  stripColumnDefaults,
  toStoredConfig,
} from '../src/rendering/editor/value';
import { getEffectiveLanguage } from '../src/translations/localize';
import { memoizeLast, resolveLabelType } from '../src/utils/helpers';

/**
 * Tests for the schema-driven editor's foundation.
 *
 * The old editor has no tests at all, which is the single biggest risk in replacing
 * it: nothing catches a migration regression. These cover the write path, which is
 * where the damage would be silent — a config that renders correctly today and has
 * quietly grown ninety default values, or lost a setting on a view switch.
 *
 * **Every test that cares about column view sets `view: 'column'` explicitly.** The
 * suite is built from default config, where `view` is `'list'`, and four branches have
 * previously been missed exactly that way — including two the suite existed to protect.
 */

/** A column-view config, since the default is a list and would test nothing. */
function columnConfig(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ view: 'column', ...overrides });
}

describe('editor: default stripping', () => {
  it('writes nothing but the entities for an untouched config', () => {
    const stored = toStoredConfig(buildConfig());

    // `entities` survives by design — it is the one key with no useful default.
    expect(Object.keys(stored)).toEqual(['entities']);
  });

  it('keeps a value that differs from its default', () => {
    const stored = toStoredConfig(buildConfig({ days_to_show: 7 }));

    expect(stored.days_to_show).toBe(7);
  });

  it('drops a value that has been set back to its default', () => {
    const stored = toStoredConfig(buildConfig({ days_to_show: DEFAULT_CONFIG.days_to_show }));

    expect(stored).not.toHaveProperty('days_to_show');
  });

  it('never writes a synthetic field into the config', () => {
    const config = buildConfig() as unknown as Record<string, unknown>;
    config.height_mode = 'fixed';
    config.start_date_offset = '-7';

    const stored = toStoredConfig(config as unknown as Types.Config);

    expect(stored).not.toHaveProperty('height_mode');
    expect(stored).not.toHaveProperty('start_date_offset');
  });

  /**
   * `filterDefaultValues` recurses into any key whose default is an object, and an
   * action config's default is `{ action: 'none' }`. Left to that recursion,
   * `{ action: 'none', navigation_path: '/x' }` loses its `action` key and becomes an
   * action with no action in it. `value.ts` holds these out and treats them whole.
   */
  it('keeps an action config intact rather than stripping its default members', () => {
    const stored = toStoredConfig(
      buildConfig({
        tap_action: { action: 'none', navigation_path: '/lovelace/0' } as Types.ActionConfig,
      }),
    );

    expect(stored.tap_action).toEqual({ action: 'none', navigation_path: '/lovelace/0' });
  });

  it('drops an action config that equals the default', () => {
    const stored = toStoredConfig(buildConfig({ tap_action: { action: 'none' } }));

    expect(stored).not.toHaveProperty('tap_action');
  });

  /**
   * `filterDefaultValues` passes `weather` through unconditionally — its comment says
   * "preserve entire structure once defined", but a merged config always has it
   * defined, because `DEFAULT_CONFIG` supplies it. So `toStoredConfig` strips the
   * block itself; left to that function, the first edit of any kind would write
   * twenty default weather keys into the user's YAML.
   */
  it('does not write the default weather block into an untouched config', () => {
    expect(toStoredConfig(buildConfig())).not.toHaveProperty('weather');
  });

  it('strips a configured weather block down to what differs from the defaults', () => {
    const weather = {
      ...DEFAULT_CONFIG.weather,
      entity: 'weather.home',
    } as Types.WeatherConfig;

    const stored = toStoredConfig(buildConfig({ weather }));

    expect(stored.weather).toEqual({ entity: 'weather.home' });
  });

  it('keeps every nested weather option the user actually changed', () => {
    const weather = {
      entity: 'weather.home',
      position: 'both',
      date: { show_conditions: false, show_high_temp: true, font_size: '20px' },
      event: { show_temp: true, max_lines: 2 },
    } as Types.WeatherConfig;

    const stored = toStoredConfig(buildConfig({ weather }));

    expect(stored.weather).toEqual({
      entity: 'weather.home',
      position: 'both',
      date: { show_conditions: false, font_size: '20px' },
      event: { max_lines: 2 },
    });
  });

  /**
   * The round trip for the one key stage 5 added.
   *
   * `weather` is written whole or not at all, so a sub-key set and cleared again has to
   * leave the block equal to the default — otherwise a user who tried a line limit and
   * changed their mind is left with a `weather:` block in their YAML that does nothing.
   */
  it('drops the whole weather block when the line limit goes back to its default', () => {
    const withLimit = buildConfig({
      weather: {
        ...DEFAULT_CONFIG.weather,
        event: { ...DEFAULT_CONFIG.weather!.event, max_lines: 2 },
      } as Types.WeatherConfig,
    });

    const stored = toStoredConfig(withLimit);
    expect((stored.weather as Types.WeatherConfig).event?.max_lines).toBe(2);

    const cleared = buildConfig({
      weather: {
        ...DEFAULT_CONFIG.weather,
        event: { ...DEFAULT_CONFIG.weather!.event, max_lines: 0 },
      } as Types.WeatherConfig,
    });

    expect(toStoredConfig(cleared)).not.toHaveProperty('weather');
  });
});

describe('editor: the column block', () => {
  it('round-trips an override that differs from the top-level value', () => {
    const config = columnConfig({
      show_location: true,
      column: { show_location: false },
    });

    const stored = toStoredConfig(config);

    expect(stored.column).toEqual({ show_location: false });
  });

  it('drops an override equal to the value it would inherit', () => {
    const config = columnConfig({
      event_font_size: '18px',
      column: { event_font_size: '18px' },
    });

    expect(toStoredConfig(config)).not.toHaveProperty('column');
  });

  it('drops a column-only key equal to its column default', () => {
    const config = columnConfig({
      column: { min_day_width: COLUMN_DEFAULTS.min_day_width },
    });

    expect(toStoredConfig(config)).not.toHaveProperty('column');
  });

  it('keeps a column-only key that differs from its column default', () => {
    const config = columnConfig({ column: { min_day_width: 220 } });

    expect(toStoredConfig(config).column).toEqual({ min_day_width: 220 });
  });

  /**
   * Two keys default *differently* in column view, so an override matching the column
   * default is redundant even when it differs from the top-level value. Comparing
   * against the top level alone would keep it and teach users the block needs lines it
   * does not.
   */
  it('drops an override equal to a divergent column default', () => {
    expect(COLUMN_DEFAULT_OVERRIDES.show_empty_days).toBe(true);

    const config = columnConfig({
      show_empty_days: false,
      column: { show_empty_days: true },
    });

    expect(toStoredConfig(config)).not.toHaveProperty('column');
  });

  it('keeps an override that opts out of a divergent column default', () => {
    const config = columnConfig({
      show_empty_days: false,
      column: { show_empty_days: false },
    });

    expect(toStoredConfig(config).column).toEqual({ show_empty_days: false });
  });

  it('drops a column floor at or above days_to_show, which cannot reduce anything', () => {
    const config = columnConfig({ days_to_show: 3, column: { min_days_to_show: 3 } });

    expect(toStoredConfig(config)).not.toHaveProperty('column');
  });

  /**
   * The runtime parses this with `parseFloat` and clamps the result, so `'2junk'` is a
   * floor of 2. Re-deriving the arithmetic with `Number()` would read it as `NaN`,
   * delete the line and silently change the rendered column count.
   */
  it('keeps a malformed floor the runtime still resolves to something', () => {
    const config = columnConfig({
      days_to_show: 3,
      column: { min_days_to_show: '2junk' as unknown as number },
    });

    expect(toStoredConfig(config).column).toEqual({ min_days_to_show: '2junk' });
  });

  it('keeps a column floor that genuinely reduces', () => {
    const config = columnConfig({ days_to_show: 5, column: { min_days_to_show: 2 } });

    expect(toStoredConfig(config).column).toEqual({ min_days_to_show: 2 });
  });

  /**
   * Resolution inside the block is presence-based, so a `null` here is a real
   * instruction to suppress week numbers in column layout even though the same value
   * at the top level means "unset".
   */
  it('keeps a null override, which is a value rather than an absence', () => {
    const config = columnConfig({
      show_week_numbers: 'iso',
      column: { show_week_numbers: null },
    });

    expect(toStoredConfig(config).column).toEqual({ show_week_numbers: null });
  });

  it('prunes the block when its last meaningful entry goes', () => {
    const config = columnConfig({ column: { min_day_width: 220 } });
    expect(toStoredConfig(config)).toHaveProperty('column');

    const reset = columnConfig({ column: { min_day_width: COLUMN_DEFAULTS.min_day_width } });
    expect(toStoredConfig(reset)).not.toHaveProperty('column');
  });

  it('never leaves an empty block behind', () => {
    expect(toStoredConfig(columnConfig({ column: {} }))).not.toHaveProperty('column');
    expect(stripColumnDefaults(columnConfig({ column: {} }))).toBeUndefined();
  });

  it('ignores an own property explicitly set to undefined', () => {
    const config = columnConfig({ column: { min_day_width: undefined } });

    expect(toStoredConfig(config)).not.toHaveProperty('column');
  });
});

describe('editor: dead keys are pruned, dormant keys are kept', () => {
  it('prunes every key the runtime removed in v3.0.0', () => {
    const config = buildConfig() as unknown as Record<string, unknown>;
    for (const dead of Object.keys(DEPRECATED_CONFIG_MAP)) {
      config[dead] = 'something';
    }

    const stored = toStoredConfig(config as unknown as Types.Config);

    for (const dead of Object.keys(DEPRECATED_CONFIG_MAP)) {
      expect(stored).not.toHaveProperty(dead);
    }
  });

  /**
   * The key has to be re-attached *after* `buildConfig`.
   *
   * `normalizeEntities` rebuilds every entity from an allowlist of known
   * fields, so a deprecated key handed to `buildConfig` is gone before
   * `toStoredConfig` is ever called. Asserting on that config proves only that
   * normalization dropped it — the assertion holds with the entity arm of
   * `pruneDeprecatedKeys` deleted, which is exactly the vacuum this test
   * existed to prevent. The editor is handed the stored YAML, not a normalized
   * config, so the key genuinely does reach `toStoredConfig` in production.
   */
  it('prunes the per-entity key the same cleanup removed', () => {
    const config = buildConfig({ entities: [{ entity: 'calendar.personal' }] });
    const entity = (config.entities as unknown as Array<Record<string, unknown>>)[0];
    entity.max_events_to_show = 3;

    expect(entity).toHaveProperty('max_events_to_show');

    const stored = toStoredConfig(config);
    const entities = stored.entities as Array<Record<string, unknown>>;

    expect(entities[0]).not.toHaveProperty('max_events_to_show');
    expect(entities[0].entity).toBe('calendar.personal');
  });

  /**
   * The opposite rule, and the reason the two are tested together. A column card
   * renders as a list on a narrow screen, so a list-only option is still live; and
   * switching a card to `view: list` must not destroy the column settings the user
   * would get back by switching again.
   */
  it('keeps the column block when the card is switched to the list view', () => {
    const config = buildConfig({ view: 'list', column: { min_day_width: 220 } });

    expect(toStoredConfig(config).column).toEqual({ min_day_width: 220 });
  });

  it('keeps a list-only option on a column card', () => {
    const config = columnConfig({ date_vertical_alignment: 'top' });

    expect(toStoredConfig(config).date_vertical_alignment).toBe('top');
  });

  it('keeps an unrecognised key inside the block rather than silently deleting it', () => {
    const config = columnConfig({
      column: { not_a_real_option: 'x' } as unknown as Types.ColumnOverrides,
    });

    expect(toStoredConfig(config).column).toEqual({ not_a_real_option: 'x' });
  });
});

describe('editor: start_date_offset survives being typed', () => {
  /**
   * The single most likely source of a shipped regression in this migration.
   *
   * The old editor deferred the write until blur, guarding on `event.type`, because an
   * intermediate value re-derives the mode and yanks the field out from under the
   * cursor. `ha-form` fires one event for the whole form and exposes no DOM event, so
   * that guard has no equivalent; the replacement holds the text and commits it only
   * once it parses.
   */
  function typeInto(config: Types.Config, pending: Record<string, string>, text: string) {
    const before = { ...config, ...deriveSyntheticData(config, pending) } as Record<
      string,
      unknown
    >;
    const after = { ...before, start_date_offset: text };

    return applyFormChange(config, before, after, pending);
  }

  it('recognises a partial expression as not yet committable', () => {
    expect(isCommittableOffset('-')).toBe(false);
    expect(isCommittableOffset('')).toBe(false);
    expect(isCommittableOffset('+')).toBe(false);
    expect(isCommittableOffset('-7')).toBe(true);
    expect(isCommittableOffset('start_of_week+7')).toBe(true);
  });

  it('does not write an intermediate "-" to the config', () => {
    const config = buildConfig({ start_date: '-7' });

    const step = typeInto(config, {}, '-');

    expect(step.config.start_date).toBe('-7');
    expect(step.pending.start_date_offset).toBe('-');
  });

  it('keeps showing what the user typed rather than the last committed value', () => {
    const config = buildConfig({ start_date: '-7' });

    const step = typeInto(config, {}, '-');
    const data = deriveSyntheticData(step.config, step.pending);

    expect(data.start_date_offset).toBe('-');
  });

  it('leaves the field in place while the value is unparseable', () => {
    const config = buildConfig({ start_date: '-7' });

    const step = typeInto(config, {}, '-');
    const data = deriveSyntheticData(step.config, step.pending);

    // The mode is what decides whether the field is rendered at all. It is derived
    // from `start_date`, which the intermediate value never reached.
    expect(data.start_date_mode).toBe('offset');
  });

  it('commits on the keystroke that completes a valid expression', () => {
    const config = buildConfig({ start_date: '-7' });

    const partial = typeInto(config, {}, '-');
    const complete = typeInto(partial.config, partial.pending, '-3');

    expect(complete.config.start_date).toBe('-3');
    expect(complete.pending).not.toHaveProperty('start_date_offset');
  });

  it('survives clearing the field completely', () => {
    const config = buildConfig({ start_date: '-7' });

    const cleared = typeInto(config, {}, '');
    const data = deriveSyntheticData(cleared.config, cleared.pending);

    expect(cleared.config.start_date).toBe('-7');
    expect(data.start_date_offset).toBe('');
    expect(data.start_date_mode).toBe('offset');
  });

  it('discards held text when the mode is switched away and back', () => {
    const config = buildConfig({ start_date: '-7' });

    const partial = typeInto(config, {}, '-');
    expect(partial.pending.start_date_offset).toBe('-');

    // Switching mode abandons the keystrokes. Holding them would show '-' again on
    // return, masking the value the mode switch just stored.
    const before = { ...partial.config, ...deriveSyntheticData(partial.config, partial.pending) };
    const switched = applyFormChange(
      partial.config,
      before,
      { ...before, start_date_mode: 'fixed' },
      partial.pending,
    );

    expect(switched.pending).not.toHaveProperty('start_date_offset');
  });

  it('never lets a pending value reach the stored config', () => {
    const config = buildConfig({ start_date: '-7' });

    const step = typeInto(config, {}, '-');

    expect(toStoredConfig(step.config).start_date).toBe('-7');
  });
});

/**
 * The same defect as the per-calendar label, found by looking for its shape rather than
 * by waiting for it to be reported: a control whose *visibility* is derived from a value
 * the user can transiently empty.
 *
 * Two of the six candidates were live. `today_indicator_icon`, `today_indicator_custom`,
 * `card_height` and `card_max_height` were already held; `location_country_pattern`
 * stores `''` deliberately so its mode still reads *custom*; and the empty-day fields are
 * gated on a switch rather than on a value, so they cannot reach this state at all.
 *
 * Both fixes use a mechanism already in the file, one each: the date picker is held like
 * the two measurements, and the language box takes the `location_country_pattern` route
 * of letting `''` still count.
 */
describe('editor: a cleared field keeps its control', () => {
  /** Applies one field's change through the real diff, as the chassis does. */
  function clear(config: Types.Config, field: string, pending: Record<string, string> = {}) {
    const before = { ...config, ...deriveSyntheticData(config, pending) } as Record<
      string,
      unknown
    >;

    return applyFormChange(config, before, { ...before, [field]: '' }, pending);
  }

  /**
   * The mode reads whether `start_date` is set, so writing `undefined` on an emptied
   * picker removed the key, re-derived the mode as *default* and took the picker away —
   * which is the reported label bug with a date in it.
   */
  it('holds an emptied fixed start date instead of dropping the picker', () => {
    const config = buildConfig({ start_date: '2026-01-01' });
    expect(startDateMode(config)).toBe('fixed');

    const step = clear(config, 'start_date_fixed');

    expect(startDateMode(step.config), 'the picker survived').toBe('fixed');
    expect(step.config.start_date, 'and the date it had is not lost').toBe('2026-01-01');
    expect(step.pending.start_date_fixed, 'the empty box is what is shown').toBe('');

    // And the next date typed commits and releases the held text.
    const before = { ...step.config, ...deriveSyntheticData(step.config, step.pending) };
    const retyped = applyFormChange(
      step.config,
      before,
      { ...before, start_date_fixed: '2026-02-02' },
      step.pending,
    );

    expect(retyped.config.start_date).toBe('2026-02-02');
    expect(retyped.pending).not.toHaveProperty('start_date_fixed');
  });

  /**
   * `language` is a real config key bound straight to a text box, so it cannot be held
   * the way a synthetic field is — naming it in `SYNTHETIC_FIELDS` would have
   * `toStoredConfig` delete it as UI state. The mode reads presence instead, so an empty
   * box is still *custom*.
   *
   * Safe because the card already agrees: `getEffectiveLanguage` tests
   * `configLanguage.trim() !== ''`, so an empty custom language follows Home Assistant
   * exactly as *system* does. The preview does not change while the box is empty.
   */
  it('keeps the language box on screen while it is cleared and retyped', () => {
    const config = buildConfig({ language: 'de' });
    expect(languageMode(config)).toBe('custom');

    const step = clear(config, 'language');

    expect(languageMode(step.config), 'the box survived').toBe('custom');
    expect(getEffectiveLanguage(step.config.language, { language: 'fr' })).toBe('fr');

    const before = { ...step.config, ...deriveSyntheticData(step.config, step.pending) };
    const retyped = applyFormChange(
      step.config,
      before,
      { ...before, language: 'nl' },
      step.pending,
    );

    expect(retyped.config.language).toBe('nl');
    expect(languageMode(retyped.config)).toBe('custom');
  });

  it('still returns the language to the system when the mode says so', () => {
    const config = buildConfig({ language: '' });
    const before = { ...config, ...deriveSyntheticData(config) };
    const switched = applyFormChange(config, before, { ...before, language_mode: 'system' }, {});

    expect(languageMode(switched.config)).toBe('system');
    expect(switched.config).not.toHaveProperty('language');
  });
});

describe('editor: the column block as the form shows it', () => {
  /**
   * `DEFAULT_CONFIG.column` is `undefined` by design, so nothing merges defaults into
   * the block the way `setConfig` does for top-level options. Without projecting them
   * every density control renders blank while the card is quietly using 140px.
   */
  it('shows the effective value of an option the user has not set', () => {
    const block = columnFormBlock(columnConfig());

    expect(block.min_day_width).toBe(COLUMN_DEFAULTS.min_day_width);
    expect(block.min_days_fallback).toBe(COLUMN_DEFAULTS.min_days_fallback);
    expect(block.day_header_gap).toBe(COLUMN_DEFAULTS.day_header_gap);
  });

  it('resolves the dynamic default of the column floor', () => {
    expect(columnFormBlock(columnConfig({ days_to_show: 5 })).min_days_to_show).toBe(5);
  });

  it('lets a configured override win over the projected default', () => {
    const block = columnFormBlock(columnConfig({ column: { min_day_width: 220 } }));

    expect(block.min_day_width).toBe(220);
  });

  /**
   * The projection is only safe because the write path strips it again. If it were
   * not, merely opening the editor would persist the whole default block.
   */
  it('is stripped straight back out again on the way to storage', () => {
    const config = columnConfig();
    const withProjection = { ...config, column: columnFormBlock(config) } as Types.Config;

    expect(toStoredConfig(withProjection)).not.toHaveProperty('column');
  });
});

describe('editor: synthetic height mode', () => {
  function change(config: Types.Config, value: string) {
    const before = { ...config, ...deriveSyntheticData(config) } as Record<string, unknown>;
    return applyFormChange(config, before, { ...before, height_mode: value }, {});
  }

  it('derives the mode from which height key is set', () => {
    expect(deriveSyntheticData(buildConfig()).height_mode).toBe('auto');
    expect(deriveSyntheticData(buildConfig({ height: '400px' })).height_mode).toBe('fixed');
    expect(deriveSyntheticData(buildConfig({ max_height: '400px' })).height_mode).toBe('maximum');
  });

  it('clears both height keys when switching back to automatic', () => {
    const config = buildConfig({ height: '400px' });

    const stored = toStoredConfig(change(config, 'auto').config);

    expect(stored).not.toHaveProperty('height');
    expect(stored).not.toHaveProperty('max_height');
  });

  it('carries a measurement across a mode switch rather than discarding it', () => {
    const config = buildConfig({ height: '400px' });

    const viaAuto = change(config, 'auto');
    const back = change(viaAuto.config, 'fixed');

    // The value is gone, so the mode switch seeds a usable one instead of an empty
    // field that renders as a zero-height card.
    expect(back.config.height).toBe('300px');
  });

  it('keeps the two height keys mutually exclusive', () => {
    const config = buildConfig({ height: '400px' });

    const maximum = change(config, 'maximum');

    // The measurement is not carried across, matching the editor that ships: a fixed
    // height and a maximum height are different claims about the card, and reusing
    // one as the other would silently change what a switch does.
    expect(maximum.config.height).toBeUndefined();
    expect(maximum.config.max_height).toBe('300px');
  });
});

describe('editor: change detection', () => {
  it('names only the keys that moved', () => {
    expect(changedKeys({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
  });

  it('sees a key being added and a key being removed', () => {
    expect(changedKeys({ a: 1 }, { a: 1, b: 2 })).toEqual(['b']);
    expect(changedKeys({ a: 1, b: 2 }, { a: 1 })).toEqual(['b']);
  });

  it('compares nested blocks structurally, not by identity', () => {
    expect(changedKeys({ column: { x: 1 } }, { column: { x: 1 } })).toEqual([]);
    expect(changedKeys({ column: { x: 1 } }, { column: { x: 2 } })).toEqual(['column']);
  });

  /**
   * Walking `SYNTHETIC_FIELDS` to assert something about each entry cannot notice a
   * deleted entry — the loop simply runs one fewer time. Deleting `card_max_height`
   * left the whole suite green even though the field then stopped deriving its value,
   * silently discarded every edit, and wrote its own name into the stored YAML. Pin
   * the membership instead, so both a removal and an unreviewed addition fail here.
   */
  it('holds the exact set of synthetic keys', () => {
    expect(Object.keys(SYNTHETIC_FIELDS).sort()).toEqual([
      'accent_color_mode',
      'calendars',
      'card_height',
      'card_max_height',
      'height_mode',
      'language_mode',
      'location_country_mode',
      'location_country_pattern',
      'start_date_fixed',
      'start_date_mode',
      'start_date_offset',
      'time_format',
      'today_indicator_custom',
      'today_indicator_icon',
      'today_indicator_style',
      'week_number_mode',
    ]);
  });

  it('recognises every synthetic key it must keep out of the config', () => {
    for (const key of ['height_mode', 'start_date_mode', 'start_date_fixed', 'start_date_offset']) {
      expect(isSyntheticKey(key)).toBe(true);
    }
    expect(isSyntheticKey('days_to_show')).toBe(false);
  });

  it('writes an ordinary key straight through', () => {
    const config = buildConfig();
    const before = { ...config, ...deriveSyntheticData(config) } as Record<string, unknown>;

    const applied = applyFormChange(config, before, { ...before, days_to_show: 9 }, {});

    expect(applied.config.days_to_show).toBe(9);
  });

  it('edits the column block through the form without touching anything else', () => {
    const config = columnConfig({ days_to_show: 5 });
    const before = { ...config, ...deriveSyntheticData(config) } as Record<string, unknown>;

    const applied = applyFormChange(
      config,
      before,
      { ...before, column: { min_day_width: 200 } },
      {},
    );

    const stored = toStoredConfig(applied.config);

    // `entities` is passed through as-is, so it arrives in the normalized object form
    // `setConfig` produced rather than as the bare string the user wrote. That is the
    // shipped behaviour and the per-entity widget owns narrowing it; asserted here so
    // that it is a recorded fact rather than a surprise when that widget lands.
    expect(Object.keys(stored).sort()).toEqual(['column', 'days_to_show', 'entities', 'view']);
    expect(stored.column).toEqual({ min_day_width: 200 });
    expect(stored.view).toBe('column');
    expect(stored.days_to_show).toBe(5);
  });
});

describe('editor: applicability', () => {
  it('says nothing about an option that applies everywhere', () => {
    expect(applicabilityNote('en', 'day_spacing', 'column')).toBeUndefined();
    expect(applicabilityNote('en', 'day_spacing', 'list')).toBeUndefined();
  });

  it('says nothing about a list-only option on a list card', () => {
    expect(applicabilityNote('en', 'date_vertical_alignment', 'list')).toBeUndefined();
  });

  it('states what a list-only option applies to on a column card', () => {
    const note = applicabilityNote('en', 'date_vertical_alignment', 'column');

    expect(note).toBeDefined();
    // Framed as what it does affect. Both layouts are live for one card, so calling
    // it inert would be inaccurate as well as unhelpful.
    expect(note).toMatch(/list layout/i);
    expect(note).not.toMatch(/no effect|does nothing|inert/i);
  });

  it('covers every key in VIEW_SCOPE with a note', () => {
    for (const key of Object.keys(VIEW_SCOPE)) {
      const scope = VIEW_SCOPE[key];
      const absent = VIEWS.find((view) => !scope.has(view));

      expect(absent, `${key} is scoped to every view, so it should not be listed`).toBeDefined();
      expect(applicabilityNote('en', key, absent!), `no note for ${key}`).toBeDefined();
    }
  });

  it('lists exactly the options that are inert in some view', () => {
    // The test above only walks whatever keys the table happens to contain, so deleting an
    // entry satisfies it trivially: the option silently becomes "applies everywhere", the
    // editor stops warning that it does nothing, and every gate stays green. Two of these
    // five entries could be removed that way without a single test noticing. Pinning the
    // membership means an option can neither lose its scope by accident nor gain one
    // without someone stating, here, which views it is inert in and why.
    expect(
      Object.fromEntries(
        Object.entries(VIEW_SCOPE).map(([key, views]) => [key, [...views].sort()]),
      ),
    ).toEqual({
      // Column view draws the indicator inline and never reads a position.
      today_indicator_position: ['list'],
      // Column view stacks the date above its events, so there is nothing to align against.
      date_vertical_alignment: ['list'],
      // `viewAppliesCompactLimits` is false for column view, so none of the compact
      // limiting runs there at all.
      compact_events_to_show: ['list'],
      compact_days_to_show: ['list'],
      compact_events_complete_days: ['list'],
    });

    expect(
      Object.fromEntries(
        Object.entries(ENTITY_VIEW_SCOPE).map(([key, views]) => [key, [...views].sort()]),
      ),
    ).toEqual({
      // A per-calendar opt-out is ignored in column view, so later days of a multi-day
      // event cannot vanish from the columns they belong to.
      split_multiday_events: ['list'],
    });
  });

  it('prefixes the option helper rather than replacing it', () => {
    const helper = computeHelper('en', 'column', {
      name: 'compact_days_to_show',
      selector: { boolean: {} },
    });

    expect(helper).toMatch(/list layout/i);
  });

  it('agrees with appliesToView', () => {
    expect(appliesToView('date_vertical_alignment', 'list')).toBe(true);
    expect(appliesToView('date_vertical_alignment', 'column')).toBe(false);
    expect(appliesToView('day_spacing', 'column')).toBe(true);
  });
});

describe('editor: labels', () => {
  it('resolves a label from the editor string table', () => {
    expect(computeLabel('en', { name: 'day_spacing', selector: { text: {} } })).toBe('Day Spacing');
  });

  it('qualifies a label with the group it sits in', () => {
    const label = computeLabel('en', { name: 'min_day_width', selector: { text: {} } }, ['column']);

    expect(label).toBe('Minimum Day Width');
  });

  /**
   * Home Assistant threads the group path through as `{ path }`, not as a bare array —
   * `ha-form-expandable` builds `{ ...options, path: [...] }` as it descends. The
   * chassis unwraps it; spreading the object instead would throw on every nested
   * group, which is silent until someone opens one.
   */
  it('unwraps the descent options Home Assistant actually passes', () => {
    const options: { path?: string[] } = { path: ['column'] };

    expect(
      computeLabel('en', { name: 'min_day_width', selector: { text: {} } }, options.path),
    ).toBe('Minimum Day Width');
  });

  it('falls back to a readable form rather than a raw key', () => {
    expect(computeLabel('en', { name: 'not_a_real_option', selector: { text: {} } })).toBe(
      'Not a real option',
    );
  });

  it('gives every field in the Layout panel a label that is not its own key', () => {
    const ctx = { view: 'column' as const, config: columnConfig(), language: 'en' };

    for (const { node, path } of walkSchema(buildLayoutSchema(ctx))) {
      if ('schema' in node || node.name === '') continue;

      const label = computeLabel('en', node, path);
      expect(label, `${node.name} has no label`).not.toBe(node.name);
    }
  });

  /**
   * No field may inherit its group's label.
   *
   * `translate` split a dotted key into exactly two segments, so a group-qualified key
   * such as `editor.time.show_end_time` matched on its `editor.time` prefix — a string —
   * and returned it. Every field inside the `time` group rendered as "Time", with the
   * group's helper text under it, and the same collapse hit `location`, `description`,
   * `event` and `date`. It reached a live editor because nothing asserted on what
   * resolution *returns*: the i18n gate proves each string exists, and the test above
   * only proves a label is not the raw key. "Time" is neither missing nor a raw key.
   *
   * This is the invariant that fails when a qualified lookup silently answers with its
   * parent, whatever the mechanism, so it does not need updating if the resolution chain
   * changes again.
   */
  it('never resolves a field to the label of the group holding it', () => {
    for (const panel of PANELS) {
      for (const view of ['list', 'column'] as const) {
        const config = buildConfig({ view }) as Types.Config;
        const schema = panel.build({ view, config, language: 'en' });
        const groupTitles = new Map<string, string>();

        for (const { node, path } of walkSchema(schema)) {
          if ('schema' in node) {
            if (node.name !== '') {
              groupTitles.set([...path, node.name].join('.'), computeLabel('en', node, path));
            }
            continue;
          }
          if (node.name === '' || path.length === 0) continue;

          const groupTitle = groupTitles.get(path.join('.'));
          if (groupTitle === undefined) continue;

          expect(
            computeLabel('en', node, path),
            `${panel.id}/${path.join('.')}/${node.name} inherited its group's label in ${view} view`,
          ).not.toBe(groupTitle);
        }
      }
    }
  });
});

describe('editor: the Layout panel', () => {
  const ctx = (config: Types.Config) => ({
    view: config.view,
    config,
    language: 'en',
  });

  /** The `view` node's select configuration, narrowed off the schema union. */
  function viewSelect() {
    const [view] = buildLayoutSchema(ctx(buildConfig()));
    if (!('selector' in view) || !('select' in view.selector) || !view.selector.select) {
      throw new Error('the first Layout node is expected to be the view selector');
    }
    return view.selector.select;
  }

  /** The options offered by the view selector. */
  function viewOptions(): ReadonlyArray<SelectOption> {
    return viewSelect().options as ReadonlyArray<SelectOption>;
  }

  function names(config: Types.Config): string[] {
    return [...walkSchema(buildLayoutSchema(ctx(config)))]
      .map(({ node }) => node.name)
      .filter((name) => name !== '');
  }

  it('offers the view selector', () => {
    expect(names(buildConfig())).toContain('view');
  });

  it('offers only the views the card can actually render', () => {
    expect(viewOptions().map((option) => option.value)).toEqual([...VIEWS]);
  });

  /**
   * `grid` is a reserved name in the design and nothing implements it, so `validateView`
   * rejects it and falls back to a list. Offering it would let the editor write a
   * configuration the card refuses to load.
   */
  it('does not offer the reserved grid view', () => {
    expect(viewOptions().map((option) => option.value)).not.toContain('grid');
  });

  it('renders the view selector as illustrated boxes', () => {
    expect(viewSelect().mode).toBe('box');
    for (const option of viewOptions()) {
      expect(option.image).toMatch(/^data:image\/svg\+xml,/);
    }
  });

  it('shows the column density group only for a view that has one', () => {
    expect(names(columnConfig())).toContain('min_day_width');
    expect(names(buildConfig({ view: 'list' }))).not.toContain('min_day_width');
  });

  it('nests the density options under the block they are stored in', () => {
    const found = [...walkSchema(buildLayoutSchema(ctx(columnConfig())))].find(
      ({ node }) => node.name === 'min_day_width',
    );

    expect(found?.path).toEqual(['column']);
  });

  it('bounds the column floor by the number of days shown', () => {
    const found = [...walkSchema(buildLayoutSchema(ctx(columnConfig({ days_to_show: 5 }))))].find(
      ({ node }) => node.name === 'min_days_to_show',
    );

    const node = found?.node;
    if (!node || !('selector' in node) || !('number' in node.selector)) {
      throw new Error('min_days_to_show is expected to be a number selector');
    }
    expect(node.selector.number?.max).toBe(5);
  });

  it('shows the height field the chosen mode calls for, and only that one', () => {
    // The two measurements are bound to synthetic fields rather than to `height` and
    // `max_height`, so that clearing one to retype it does not delete the value and
    // take the field with it. See the typing tests below.
    expect(names(buildConfig({ height: '400px' }))).toContain('card_height');
    expect(names(buildConfig({ height: '400px' }))).not.toContain('card_max_height');
    expect(names(buildConfig({ max_height: '400px' }))).toContain('card_max_height');
    expect(names(buildConfig())).not.toContain('card_height');
  });
});

describe('editor: the width table', () => {
  const ctx = (config: Types.Config) => ({ view: config.view, config, language: 'en' });

  it('describes one band per column count, plus the fallback', () => {
    const config = columnConfig({ days_to_show: 3, column: { min_days_to_show: 1 } });

    // Three column counts (3, 2, 1) and one row for what happens below the last.
    expect(widthTableRows(ctx(config))).toHaveLength(4);
  });

  it('reduces to one band and a fallback at the default floor', () => {
    const rows = widthTableRows(ctx(columnConfig({ days_to_show: 3 })));

    expect(rows).toHaveLength(2);
    expect(rows[1].layout).toBe('as a list');
  });

  /**
   * The figures come from the same arithmetic the renderer uses, so the table cannot
   * describe a card the code would not produce. At defaults that is
   * `140 x 3 + 32 + 2 x 10 = 472`, entered at 472 + 16 of hysteresis.
   */
  it('agrees with the thresholds the renderer computes', () => {
    const config = columnConfig({ days_to_show: 3 });
    const bands = describeColumnLayoutBands(config);
    const rows = widthTableRows(ctx(config));

    expect(bands.bands[0].minWidthPx).toBe(488);
    expect(rows[0].width).toBe('≥ 488 px');
    expect(rows[0].layout).toBe('3 columns');
  });

  it('tracks a raised minimum column width', () => {
    const config = columnConfig({ days_to_show: 3, column: { min_day_width: 200 } });

    // 200 x 3 + 32 + 2 x 10 = 652, entered at 668.
    expect(describeColumnLayoutBands(config).bands[0].minWidthPx).toBe(668);
  });

  it('names the cramped fallback when that is what the card would do', () => {
    const config = columnConfig({
      days_to_show: 3,
      column: { min_days_to_show: 2, min_days_fallback: 'cramp' },
    });

    const rows = widthTableRows(ctx(config));
    expect(rows[rows.length - 1].layout).toMatch(/narrower than the minimum/);
  });

  it('says "1 column" rather than "1 columns"', () => {
    const config = columnConfig({ days_to_show: 1 });

    expect(widthTableRows(ctx(config))[0].layout).toBe('1 column');
  });

  /**
   * The strongest check available: the table is not merely derived from the same
   * formula, it predicts what `resolveColumnFit` — the function the card actually
   * renders by — returns at each width it names. A table that is right about the
   * arithmetic and wrong about the outcome would be worse than no table at all,
   * because it would be believed.
   */
  it.each([
    [3, 3],
    [5, 2],
    [7, 1],
    [2, 1],
  ])('predicts what the resolver does at days=%i, floor=%i', (days, floor) => {
    const config = columnConfig({
      days_to_show: days,
      column: { min_days_to_show: floor },
    });
    const bands = describeColumnLayoutBands(config);

    for (const band of bands.bands) {
      expect(
        resolveColumnFit('column', config, band.minWidthPx, null),
        `at ${band.minWidthPx}px the table promises ${band.columns} columns`,
      ).toEqual({ view: 'column', columns: band.columns });
    }

    const below = resolveColumnFit('column', config, bands.fallbackBelowPx - 1, null);
    expect(below.view).toBe(bands.fallback === 'cramp' ? 'column' : 'list');
  });
});

describe('editor: the memoiser', () => {
  it('returns the previous result while the arguments hold', () => {
    let calls = 0;
    const build = memoizeLast((n: number) => {
      calls += 1;
      return { n };
    });

    const first = build(1);
    expect(build(1)).toBe(first);
    expect(calls).toBe(1);
  });

  it('recomputes when an argument changes', () => {
    let calls = 0;
    const build = memoizeLast((n: number) => {
      calls += 1;
      return { n };
    });

    build(1);
    build(2);
    expect(calls).toBe(2);
  });

  it('does not cache a result that was never produced', () => {
    let attempts = 0;
    const build = memoizeLast((n: number) => {
      attempts += 1;
      if (attempts === 1) throw new Error('first attempt fails');
      return { n };
    });

    expect(() => build(1)).toThrow();

    // Committing the arguments before calling would leave this retry returning an
    // uninitialised result rather than recomputing.
    expect(build(1)).toEqual({ n: 1 });
  });

  it('treats NaN as unchanged, which is what "the argument did not move" means', () => {
    let calls = 0;
    const build = memoizeLast((n: number) => {
      calls += 1;
      return n;
    });

    build(Number.NaN);
    build(Number.NaN);
    expect(calls).toBe(1);
  });

  it('actually memoises the panel schema it is used for', () => {
    const ctx = { view: 'column' as const, config: columnConfig(), language: 'en' };

    // A fresh context object each time, which is the case that would defeat a
    // memoiser keyed on the context rather than on the values read from it.
    const first = buildLayoutSchema({ ...ctx });
    expect(buildLayoutSchema({ ...ctx, config: columnConfig() })).toBe(first);
  });
});

describe('editor: the chassis', () => {
  /**
   * Mounts the editor and returns handles for driving it.
   *
   * `ha-form` is Home Assistant's element and is not defined here, but Lit still
   * creates it and sets its properties, and it is the node the change listener is
   * bound to — which is all this needs. Nothing about the assertions below depends on
   * Home Assistant actually rendering a field.
   */
  // Registered once, under a tag of this suite's own, because a custom element has to
  // be defined before it can be constructed.
  const TAG = 'test-calendar-card-pro-editor';
  if (!customElements.get(TAG)) {
    customElements.define(TAG, class extends CalendarCardProEditor {});
  }

  async function mount(config: Partial<Types.Config>) {
    const element = document.createElement(TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig(config as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    const dispatched: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      dispatched.push((event as CustomEvent).detail.config);
    });

    /**
     * Fires a form change the way `ha-form` does: the whole merged data object.
     *
     * Defaults to the first panel's form, since every panel is handed the same data
     * object and the handler recovers the edited key by comparison rather than from
     * the event. Pass an index where the panel itself is under test.
     */
    const change = async (patch: Record<string, unknown>, panelIndex = 0) => {
      const target = element.shadowRoot!.querySelectorAll('ha-form.panel-form')[panelIndex];
      const data = (target as unknown as { data: Record<string, unknown> }).data;
      target.dispatchEvent(
        new CustomEvent('value-changed', { detail: { value: { ...data, ...patch } } }),
      );
      await element.updateComplete;
    };

    return { element, dispatched, change };
  }

  it('reports an ordinary edit to Home Assistant', async () => {
    const { dispatched, change } = await mount({ entities: ['calendar.personal'] });

    await change({ days_to_show: 9 });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].days_to_show).toBe(9);
  });

  /**
   * The failure this prevents is subtle and total. Typing `-` commits nothing, but
   * dispatching anyway makes Home Assistant answer with a `setConfig` carrying the
   * configuration it already had — and the keystroke being held is erased by the echo
   * of the keystroke that produced it. The field then appears to reject `-` entirely.
   */
  it('says nothing when an edit only moved uncommitted text', async () => {
    const { dispatched, change } = await mount({
      entities: ['calendar.personal'],
      start_date: '-7',
      // Stored explicitly at its default, so the first write would otherwise strip it
      // and look like a real change.
      days_to_show: DEFAULT_CONFIG.days_to_show,
    });

    await change({ start_date_offset: '-' });

    expect(dispatched).toEqual([]);
  });

  it('keeps held text through Home Assistant echoing the config back', async () => {
    const { element, dispatched, change } = await mount({
      entities: ['calendar.personal'],
      start_date: '-7',
    });

    await change({ days_to_show: 9 });
    await change({ start_date_offset: '-' });

    // Home Assistant answers a `config-changed` by feeding the configuration back in.
    // That echo must not reset the editor's uncommitted state.
    element.setConfig(dispatched[dispatched.length - 1] as unknown as Types.Config);
    await element.updateComplete;

    const form = element.shadowRoot!.querySelector('ha-form.panel-form')!;
    const data = (form as unknown as { data: Record<string, unknown> }).data;
    expect(data.start_date_offset).toBe('-');
  });

  it('never writes a synthetic key out to Home Assistant', async () => {
    const { dispatched, change } = await mount({ entities: ['calendar.personal'] });

    await change({ height_mode: 'fixed' });

    expect(dispatched[0]).not.toHaveProperty('height_mode');
    expect(dispatched[0].height).toBe('300px');
  });

  it('mounts one form per registered panel', async () => {
    const { element } = await mount({ entities: ['calendar.personal'] });

    // `.panel-form` rather than every form: the two hand-written widgets render forms
    // of their own inside the panels that own them, and those are not panels.
    expect(element.shadowRoot!.querySelectorAll('ha-form.panel-form')).toHaveLength(PANELS.length);
  });

  /**
   * The unit tests cover the mechanism; this covers the loop it lives in. Typing a lone
   * minus has to leave the panel that owns the field standing, report nothing to Home
   * Assistant, and still commit the moment the expression is complete — and all three
   * only hold together once the panel, the change handler and the echo suppression are
   * wired to each other.
   */
  it('keeps the offset field standing while a lone minus is typed into it', async () => {
    const { element, dispatched, change } = await mount({
      entities: ['calendar.personal'],
      start_date: '-7',
      days_to_show: DEFAULT_CONFIG.days_to_show,
    });

    const panelIndex = PANELS.findIndex((panel) => panel.id === 'content');
    const contentForm = () =>
      element.shadowRoot!.querySelectorAll('ha-form.panel-form')[panelIndex];
    const dataOf = (form: Element) => (form as unknown as { data: Record<string, unknown> }).data;
    const namesOf = (form: Element) =>
      [...walkSchema((form as unknown as { schema: HaFormSchema[] }).schema)].map(
        (entry) => entry.node.name,
      );

    await change({ start_date_offset: '-' }, panelIndex);

    expect(dispatched).toEqual([]);
    expect(dataOf(contentForm()).start_date_offset).toBe('-');
    expect(namesOf(contentForm())).toContain('start_date_offset');

    await change({ start_date_offset: '-14' }, panelIndex);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].start_date).toBe('-14');
  });

  it('keeps a calendar object through being reordered in the picker', async () => {
    const { dispatched, change } = await mount({
      entities: [{ entity: 'calendar.a', label: 'Home', color: '#0f0' }, 'calendar.b'],
    });

    await change({ calendars: ['calendar.b', 'calendar.a'] });

    expect(dispatched[0].entities).toEqual([
      'calendar.b',
      { entity: 'calendar.a', label: 'Home', color: '#0f0' },
    ]);
  });

  it('does not persist the projected column defaults just by being opened', async () => {
    const { dispatched, change } = await mount({
      entities: ['calendar.personal'],
      view: 'column',
    });

    await change({ days_to_show: 4 });

    expect(dispatched[0]).not.toHaveProperty('column');
  });
});

describe('editor: the panel set', () => {
  /**
   * Builds every panel for a configuration, and yields every node it produced.
   *
   * A panel is only as good as what it offers for the configuration in front of it, so
   * anything asserted over "the editor" has to be asserted over every panel rather
   * than over the one that happens to be open.
   */
  function* everyNode(config: Types.Config) {
    const view = config.view;
    for (const panel of PANELS) {
      for (const entry of walkSchema(panel.build({ view, config, language: 'en' }))) {
        yield { panel, ...entry };
      }
    }
  }

  it('registers the nine panels the design names, in order', () => {
    expect(PANELS.map((panel) => panel.id)).toEqual([
      'calendars',
      'layout',
      'content',
      'card',
      'day_header',
      'events',
      'separators',
      'weather',
      'actions',
    ]);
  });

  it('gives every panel a heading and a sentence saying what it is for', () => {
    for (const panel of PANELS) {
      expect(computeLabel('en', { name: panel.titleKey, selector: { text: {} } })).not.toBe(
        panel.titleKey,
      );
      expect(EDITOR_STRINGS[`${panel.titleKey}.helper`]).toBeTypeOf('string');
    }
  });

  /**
   * A helper that repeats its label is worse than no helper: it costs a line of vertical
   * space and teaches the reader that helpers are not worth reading. Two shipped that
   * way — the card-height mode restated its own three option labels in prose, and the
   * today-indicator group said "a mark on the current day" under the heading *Today
   * Indicator* — and both are deleted rather than rewritten, because there was nothing
   * left for them to say.
   *
   * Pinned as a rule rather than as a list, so a new one fails here instead of being
   * caught in review. The test is deliberately narrow: it asks only whether every word
   * of the helper is already in the label, which is the one case that is unambiguous.
   */
  it('never writes a helper that only repeats its label', () => {
    const words = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    const filler = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'and', 'this', 'is', 'in', 'it']);

    const offenders = Object.keys(EDITOR_STRINGS)
      .filter((key) => key.endsWith('.helper'))
      .filter((key) => {
        const label = EDITOR_STRINGS[key.slice(0, -'.helper'.length)];
        if (label === undefined) return false;

        const labelWords = new Set(words(label));
        const helperWords = words(EDITOR_STRINGS[key]).filter((word) => !filler.has(word));

        return helperWords.length > 0 && helperWords.every((word) => labelWords.has(word));
      });

    expect(offenders).toEqual([]);
  });

  it('builds every panel for every view without producing an empty one', () => {
    for (const view of VIEWS) {
      for (const panel of PANELS) {
        const schema = panel.build({ view, config: buildConfig({ view }), language: 'en' });
        expect(schema.length, `${panel.id} in ${view} view`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The whole editor, not one panel. Stage 1 asserted this over the Layout panel; the
   * value of the schema being a registry is that the same assertion now covers every
   * field the card has.
   *
   * Asserted against `EDITOR_STRINGS` rather than only through `computeLabel`, and the
   * difference is not academic. `lookup` falls through to the language files, whose
   * `editor` sections are dormant but still present — and several of their keys are
   * spelled exactly like the new ones. `refresh_on_navigate`, `event_color` and
   * `show_location` are all among them, so a field with no string of its own would be
   * labelled from copy written for the editor that was replaced, and a check that only
   * asked whether *something* resolved would pass.
   */
  it('gives every field a label of its own, not one inherited from the old editor', () => {
    for (const view of VIEWS) {
      for (const { panel, node, path } of everyNode(buildConfig({ view }))) {
        // Grids draw no heading, and a group resolves its own when it is built.
        if (('type' in node && node.type === 'grid') || !node.name || 'titleKey' in node) continue;

        const where = `${panel.id} → ${[...path, node.name].join('.')}`;
        const qualified = [...path, node.name].join('.');

        expect(qualified in EDITOR_STRINGS || node.name in EDITOR_STRINGS, where).toBe(true);
        expect(computeLabel('en', node, path), where).not.toBe(node.name);
      }
    }
  });

  it('covers every option the card has, bar the ones a later stage owns', () => {
    const offered = new Set<string>();
    const configs = [
      buildConfig({ show_time: true, show_location: true, show_description: true }),
      buildConfig({ show_countdown: true, show_progress_bar: true, show_month: true }),
      buildConfig({ view: 'column' }),
      buildConfig({ start_date: 'today+7' }),
      buildConfig({ today_indicator: 'mdi:star' }),
      buildConfig({ show_week_numbers: 'iso' }),
      buildConfig({ language: 'de' }),
      buildConfig({ remove_location_country: 'Germany' }),
      buildConfig({ height: '300px' }),
      buildConfig({ max_height: '400px' }),
      // Reveals the complete-days modifier, which is held back until there is an event
      // limit for it to modify.
      buildConfig({ compact_events_to_show: 3 }),
      buildConfig({
        weather: { entity: 'weather.home', position: 'both', date: {}, event: {} },
      }),
    ];

    for (const config of configs) {
      for (const { node } of everyNode(config)) {
        if (node.name) offered.add(node.name);
      }
    }

    // Synthetic fields stand in for the config keys whose stored shape no selector can
    // emit, so a key is covered when either it or its stand-in is offered.
    const standIns: Record<string, string> = {
      entities: 'calendars',
      start_date: 'start_date_mode',
      language: 'language_mode',
      time_24h: 'time_format',
      show_week_numbers: 'week_number_mode',
      remove_location_country: 'location_country_mode',
      today_indicator: 'today_indicator_style',
      height: 'height_mode',
      max_height: 'height_mode',
    };

    // `weather` and `column` are containers offered as their members rather than under
    // their own name, so neither is expected here. Their members are reconciled by the
    // test below — skipping a container here once skipped everything inside it too.
    const containers = new Set(['weather', 'column']);

    const missing = Object.keys(DEFAULT_CONFIG).filter((key) => {
      if (containers.has(key)) return false;
      return !offered.has(key) && !offered.has(standIns[key] ?? key);
    });

    expect(missing).toEqual([]);
  });

  /**
   * The test above walks `DEFAULT_CONFIG`'s top level, so a container option is one key
   * there however many fields it holds. It exempted `weather` and `column` on the
   * grounds that their members are offered individually — which is true, and which
   * also meant nothing checked that they were. Deleting the whole `min_days_fallback`
   * node from the Layout schema left `tsc`, `lint`, the suite, `check:i18n` and
   * `check:docs` all green; 21 fields could be removed outright that way.
   *
   * The members are reconciled against the source that defines each one rather than
   * against a list written here, so a new column or weather option is covered the day
   * it is added. The paths are the ones `walkSchema` yields: an expandable group adds
   * its own name, so a weather member arrives as `date.icon_size`, not
   * `weather.date.icon_size`.
   */
  it('covers every member of the options it offers as a container', () => {
    const weather = DEFAULT_CONFIG.weather as unknown as Record<string, unknown>;
    const group = (name: string) => Object.keys(weather[name] as Record<string, unknown>);

    const expected = [
      // `entity` and `position` sit directly on the Weather panel, outside either group.
      'entity',
      'position',
      ...group('date').map((key) => `date.${key}`),
      ...group('event').map((key) => `event.${key}`),
      ...COLUMN_ONLY_KEYS.map((key) => `column.${key}`),
    ];

    // A container that stopped resolving would empty the domain and pass silently.
    expect(expected.length).toBeGreaterThan(20);

    const offered = new Set<string>();
    const configs = [
      buildConfig({ view: 'column' }),
      // The UV threshold is held back until UV is on, in both groups.
      buildConfig({
        weather: {
          entity: 'weather.home',
          position: 'both',
          date: { show_uv_index: true },
          event: { show_uv_index: true },
        },
      }),
    ];

    for (const config of configs) {
      for (const { node, path } of everyNode(config)) {
        if (node.name) offered.add([...path, node.name].join('.'));
      }
    }

    expect(expected.filter((name) => !offered.has(name))).toEqual([]);
  });

  /**
   * The editor is the one place in `src/` written with two views known, so it is the
   * one place that can be held to naming neither. A third view should cost a registry
   * entry and a string, not a hunt through nine modules for comparisons.
   */
  it('never compares against a view by name', () => {
    const dir = join(process.cwd(), 'src/rendering/editor');
    const files = [
      ...readdirSync(dir).filter((name) => name.endsWith('.ts')),
      ...readdirSync(join(dir, 'schemas')).map((name) => join('schemas', name)),
    ];

    // Every module, found rather than listed, so a new one cannot slip past by not
    // having been added here.
    expect(files.length).toBeGreaterThan(9);

    const comparison = /[!=]==?\s*'(list|column)'|'(list|column)'\s*[!=]==?/;

    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf-8');
      const offending = source
        .split('\n')
        .map((line, index) => ({ line, number: index + 1 }))
        // Prose in a comment may name a view; only code may not compare against one.
        .filter(({ line }) => !/^\s*(\*|\/\/)/.test(line))
        .filter(({ line }) => comparison.test(line));

      expect(offending.map((o) => `${file}:${o.number} ${o.line.trim()}`)).toEqual([]);
    }
  });
});

describe('editor: the fields whose stored shape no selector can emit', () => {
  /** Applies one synthetic change and returns the configuration it would store. */
  function applyOne(config: Types.Config, key: string, value: unknown) {
    const previous = { ...(config as unknown as Record<string, unknown>) };
    const applied = applyFormChange(config, previous, { ...previous, [key]: value }, {});
    return { config: applied.config, stored: toStoredConfig(applied.config), applied };
  }

  it('writes a real boolean for the time format, not the string a select emits', () => {
    const { config, stored } = applyOne(buildConfig(), 'time_format', '24');

    // The formatter tests `config.time_24h === true`, so the string `'true'` would
    // leave the card on twelve-hour time while the editor showed twenty-four.
    expect(config.time_24h).toBe(true);
    expect(stored.time_24h).toBe(true);
  });

  it('returns the time format to the system default rather than pinning it', () => {
    const configured = buildConfig({ time_24h: true });
    const { stored } = applyOne(configured, 'time_format', 'system');

    expect(stored).not.toHaveProperty('time_24h');
  });

  it('removes week numbers rather than storing the string a select would emit', () => {
    const configured = buildConfig({ show_week_numbers: 'iso' });
    const { config, stored } = applyOne(configured, 'week_number_mode', 'none');

    expect(config.show_week_numbers).toBeUndefined();
    expect(stored).not.toHaveProperty('show_week_numbers');
  });

  it('round-trips the three shapes of country removal', () => {
    const off = applyOne(buildConfig(), 'location_country_mode', 'keep');
    expect(off.stored).not.toHaveProperty('remove_location_country');

    const builtin = applyOne(buildConfig(), 'location_country_mode', 'builtin');
    expect(builtin.stored.remove_location_country).toBe(true);

    const custom = applyOne(builtin.config, 'location_country_mode', 'custom');
    const typed = applyOne(custom.config, 'location_country_pattern', 'Germany|Austria');
    expect(typed.stored.remove_location_country).toBe('Germany|Austria');
  });

  it('keeps the country field in place while its pattern is being cleared', () => {
    const configured = buildConfig({ remove_location_country: 'Germany' });
    const { config } = applyOne(configured, 'location_country_pattern', '');

    // An empty pattern stays a string, so the mode still derives as custom and the
    // field the user is typing into does not disappear from under them.
    expect(deriveSyntheticData(config).location_country_mode).toBe('custom');
  });

  it('derives each today-indicator style from the shape of the stored value', () => {
    const styles = deriveSyntheticData;

    expect(styles(buildConfig()).today_indicator_style).toBe('none');
    expect(styles(buildConfig({ today_indicator: true })).today_indicator_style).toBe('dot');
    expect(styles(buildConfig({ today_indicator: 'pulse' })).today_indicator_style).toBe('pulse');
    expect(styles(buildConfig({ today_indicator: 'mdi:star' })).today_indicator_style).toBe('icon');
    expect(styles(buildConfig({ today_indicator: '⭐' })).today_indicator_style).toBe('custom');
    expect(styles(buildConfig({ today_indicator: '/local/x.png' })).today_indicator_style).toBe(
      'custom',
    );
  });

  it('carries an icon across a style switch rather than discarding it', () => {
    const configured = buildConfig({ today_indicator: 'mdi:star' });

    const away = applyOne(configured, 'today_indicator_style', 'dot');
    expect(away.config.today_indicator).toBe('dot');

    // Switching back seeds a usable icon rather than leaving the picker holding a
    // value the style cannot represent.
    const back = applyOne(away.config, 'today_indicator_style', 'icon');
    expect(String(back.config.today_indicator)).toMatch(/^mdi:/);
  });

  it('keeps the indicator picker in place while it is empty', () => {
    const configured = buildConfig({ today_indicator: 'mdi:star' });
    const previous = { ...(configured as unknown as Record<string, unknown>) };
    const applied = applyFormChange(
      configured,
      previous,
      { ...previous, today_indicator_icon: '' },
      {},
    );

    // Nothing committed, so the style still derives as `icon` and the picker survives.
    expect(applied.config.today_indicator).toBe('mdi:star');
    expect(applied.pending.today_indicator_icon).toBe('');
  });

  it('turns the language back over to Home Assistant rather than pinning English', () => {
    const configured = buildConfig({ language: 'de' });
    const { stored } = applyOne(configured, 'language_mode', 'system');

    expect(stored).not.toHaveProperty('language');
  });

  it('seeds a language rather than leaving the field to vanish on the next render', () => {
    const { config } = applyOne(buildConfig(), 'language_mode', 'custom');

    expect(config.language).toBeTruthy();
    expect(deriveSyntheticData(config).language_mode).toBe('custom');
  });
});

describe('editor: the calendars picker', () => {
  /**
   * A configuration as the *editor* sees one.
   *
   * `buildConfig` mirrors the card's `setConfig`, which normalizes every entity into an
   * object. The editor's does not, deliberately: it edits the configuration the user
   * wrote, and rewriting a bare `calendar.x` into an object on open would rewrite every
   * card's YAML the moment its editor was looked at.
   */
  function editorConfig(overrides: Partial<Types.Config> = {}): Types.Config {
    return { ...DEFAULT_CONFIG, ...overrides } as Types.Config;
  }

  it('shows a per-calendar object as its entity id', () => {
    const config = editorConfig({
      entities: ['calendar.a', { entity: 'calendar.b', label: 'Work', color: '#f00' }],
    });

    expect(deriveSyntheticData(config).calendars).toEqual(['calendar.a', 'calendar.b']);
  });

  it('leaves a bare entity id bare rather than promoting it to an object', () => {
    const config = editorConfig({ entities: ['calendar.a'] });
    const previous = { ...(config as unknown as Record<string, unknown>) };

    const added = applyFormChange(
      config,
      { ...previous, calendars: ['calendar.a'] },
      { ...previous, calendars: ['calendar.a', 'calendar.b'] },
      {},
    );

    expect(added.config.entities).toEqual(['calendar.a', 'calendar.b']);
  });

  /**
   * The behaviour that makes a picker safe to use at all. Home Assistant's multi-entity
   * selector hands back a list of ids, so writing it through would replace every
   * per-calendar object with a bare string — silently deleting the label, colour and
   * filters the user configured for it.
   */
  it('keeps a calendar object through being deselected and selected again', () => {
    const entry = { entity: 'calendar.b', label: 'Work', color: '#f00' };
    const config = editorConfig({ entities: ['calendar.a', entry] });
    const previous = { ...(config as unknown as Record<string, unknown>) };

    const removed = applyFormChange(
      config,
      { ...previous, calendars: ['calendar.a', 'calendar.b'] },
      { ...previous, calendars: ['calendar.a'] },
      {},
    );
    expect(removed.config.entities).toEqual(['calendar.a']);

    // Re-added from the configuration that still held it — which is the case a user
    // hits by unticking and reticking without leaving the editor.
    const readded = applyFormChange(
      config,
      { ...previous, calendars: ['calendar.a'] },
      { ...previous, calendars: ['calendar.a', 'calendar.b'] },
      {},
    );
    expect(readded.config.entities).toEqual(['calendar.a', entry]);
  });

  it('follows the order of the picker, because the order decides which copy wins', () => {
    const config = editorConfig({ entities: ['calendar.a', 'calendar.b'] });
    const previous = { ...(config as unknown as Record<string, unknown>) };

    const reordered = applyFormChange(
      config,
      { ...previous, calendars: ['calendar.a', 'calendar.b'] },
      { ...previous, calendars: ['calendar.b', 'calendar.a'] },
      {},
    );

    expect(reordered.config.entities).toEqual(['calendar.b', 'calendar.a']);
  });

  it('never writes the picker own key to the configuration', () => {
    const config = editorConfig({ entities: ['calendar.a'] });

    expect(toStoredConfig(config)).not.toHaveProperty('calendars');
  });
});

describe('editor: the Weather panel', () => {
  function weatherSchemaFor(config: Types.Config) {
    const panel = PANELS.find((entry) => entry.id === 'weather')!;
    return panel.build({ view: config.view, config, language: 'en' });
  }

  function namesIn(config: Types.Config): string[] {
    return [...walkSchema(weatherSchemaFor(config))]
      .map((entry) => entry.node.name)
      .filter((name): name is string => Boolean(name));
  }

  it('offers nothing but the entity until one is chosen', () => {
    expect(namesIn(buildConfig())).toEqual(['weather', 'entity']);
  });

  it('nests the whole panel under the key it is stored in, without a second heading', () => {
    const [root] = weatherSchemaFor(buildConfig());

    // A named grid nests the data exactly as an expandable would and draws no heading,
    // which is what keeps a "Weather" group out of the Weather panel.
    expect('type' in root && root.type).toBe('grid');
    expect(root.name).toBe('weather');
    expect(root).not.toHaveProperty('flatten');
  });

  it('offers each position only where it is shown', () => {
    const dateOnly = namesIn(
      buildConfig({ weather: { entity: 'weather.home', position: 'date' } }),
    );
    expect(dateOnly).toContain('show_high_temp');
    expect(dateOnly).not.toContain('daily_forecast_fallback');

    const both = namesIn(buildConfig({ weather: { entity: 'weather.home', position: 'both' } }));
    expect(both).toContain('show_high_temp');
    expect(both).toContain('daily_forecast_fallback');
  });

  it('holds the UV threshold back until the index is shown', () => {
    const off = buildConfig({
      weather: { entity: 'weather.home', position: 'date', date: { show_uv_index: false } },
    });
    expect(namesIn(off)).not.toContain('uv_index_threshold');

    const on = buildConfig({
      weather: { entity: 'weather.home', position: 'date', date: { show_uv_index: true } },
    });
    expect(namesIn(on)).toContain('uv_index_threshold');
  });

  it('labels the two positions after where the forecast appears', () => {
    const config = buildConfig({ weather: { entity: 'weather.home', position: 'both' } });
    const groups = [...walkSchema(weatherSchemaFor(config))]
      .map((entry) => entry.node)
      .filter((node) => 'titleKey' in node);

    expect(groups.map((node) => (node as { titleKey?: string }).titleKey)).toEqual([
      'weather.date',
      'weather.event',
    ]);
  });
});

describe('editor: the Separators panel', () => {
  function namesIn(config: Types.Config): string[] {
    const panel = PANELS.find((entry) => entry.id === 'separators')!;
    return [...walkSchema(panel.build({ view: config.view, config, language: 'en' }))]
      .map((entry) => entry.node.name)
      .filter((name): name is string => Boolean(name));
  }

  it('offers the three rules every view draws', () => {
    const names = namesIn(buildConfig());

    expect(names).toContain('day_separator_width');
    expect(names).toContain('week_separator_width');
    expect(names).toContain('month_separator_width');
  });

  /**
   * Sited by what it is rather than by where it is stored: the day-header rule lives
   * inside a view's override block, and belongs beside the three rules it is a fourth
   * of rather than in the panel that happens to own that block.
   */
  it('offers the day-header rule only for a view that has one', () => {
    expect(namesIn(buildConfig())).not.toContain('day_header_separator_width');
    expect(namesIn(columnConfig())).toContain('day_header_separator_width');
  });

  it('stores the day-header rule inside the block it belongs to', () => {
    const panel = PANELS.find((entry) => entry.id === 'separators')!;
    const config = columnConfig();
    const schema = panel.build({ view: 'column', config, language: 'en' });
    const block = schema.find((node) => 'schema' in node && node.name === 'column');

    expect(block).toBeDefined();
    expect(block).not.toHaveProperty('flatten');
  });
});

describe('editor: the Time Range & Content panel', () => {
  function namesIn(config: Types.Config): string[] {
    const panel = PANELS.find((entry) => entry.id === 'content')!;
    return [...walkSchema(panel.build({ view: config.view, config, language: 'en' }))]
      .map((entry) => entry.node.name)
      .filter((name): name is string => Boolean(name));
  }

  it('shows the start-date control the stored value calls for, and only that one', () => {
    expect(namesIn(buildConfig())).not.toContain('start_date_offset');

    const fixed = namesIn(buildConfig({ start_date: '2026-01-01' }));
    expect(fixed).toContain('start_date_fixed');
    expect(fixed).not.toContain('start_date_offset');

    const offset = namesIn(buildConfig({ start_date: 'today+7' }));
    expect(offset).toContain('start_date_offset');
    expect(offset).not.toContain('start_date_fixed');
  });

  it('holds the offset field in place while a lone minus is typed', () => {
    const config = buildConfig({ start_date: '-7' });
    const previous = { ...(config as unknown as Record<string, unknown>) };
    const applied = applyFormChange(config, previous, { ...previous, start_date_offset: '-' }, {});

    // The panel is rebuilt from the configuration, which never saw the `-`, so the
    // control cannot be re-derived away mid-edit.
    expect(namesIn(applied.config)).toContain('start_date_offset');
    expect(applied.config.start_date).toBe('-7');
  });

  it('holds the language field in place while its code is being retyped', () => {
    const config = buildConfig({ language: 'de' });
    expect(namesIn(config)).toContain('language');
  });

  /**
   * A view may start this option from a different default and not inherit, so a card
   * can show empty days while its top-level value says otherwise. Reading the top level
   * would hide the controls for something that is on screen.
   */
  it('offers the empty-day fields whenever empty days can actually appear', () => {
    expect(namesIn(buildConfig())).not.toContain('empty_day_text');
    expect(namesIn(buildConfig({ show_empty_days: true }))).toContain('empty_day_text');
    expect(namesIn(columnConfig())).toContain('empty_day_text');
  });

  /**
   * The compact-mode group, and the one place where reading the code contradicted the
   * request.
   *
   * The group has no master switch. `compact_days_to_show` and `compact_events_to_show`
   * *are* compact mode — either one on its own switches it on — and
   * `compact_events_complete_days` is not a third limit but a modifier of the event
   * one: `groupEventsByDay` reads it only inside the branch guarded by a finite
   * `compact_events_to_show`. So the two numbers are never inert, and hiding them
   * behind the switch would hide the only live controls in the group.
   */
  it('always offers the two limits, which are what compact mode is', () => {
    const names = namesIn(buildConfig());

    expect(names).toContain('compact_days_to_show');
    expect(names).toContain('compact_events_to_show');
  });

  it('holds the complete-days modifier back until there is a limit to modify', () => {
    expect(namesIn(buildConfig())).not.toContain('compact_events_complete_days');
    expect(namesIn(buildConfig({ compact_events_to_show: 3 }))).toContain(
      'compact_events_complete_days',
    );
  });

  it('treats a zero limit as a limit, because the card does', () => {
    // `compact_events_to_show: 0` is a valid setting and the card honours it, so the
    // modifier is live. A truthiness test here would hide a control that is working.
    expect(namesIn(buildConfig({ compact_events_to_show: 0 }))).toContain(
      'compact_events_complete_days',
    );
  });

  it('offers no modifier for a day limit alone, which it does not modify', () => {
    expect(namesIn(buildConfig({ compact_days_to_show: 2 }))).not.toContain(
      'compact_events_complete_days',
    );
  });

  /**
   * The editor and the card must agree about what counts as a limit, and they do not
   * see the same value: the card normalizes on every `setConfig`, while the editor
   * merges the raw configuration over the defaults and nothing coerces it. A bare
   * `Number.isFinite` here would therefore answer a different question from the one
   * `groupEventsByDay` asks, in both directions.
   *
   * Built without `buildConfig`, deliberately — that helper normalizes, which is
   * exactly the step the editor does not take, so using it would hide the divergence
   * these two assert.
   */
  function asEditorSees(overrides: Record<string, unknown>): Types.Config {
    return {
      ...DEFAULT_CONFIG,
      entities: ['calendar.personal'],
      ...overrides,
    } as unknown as Types.Config;
  }

  it('offers the modifier for a limit YAML happened to quote', () => {
    // The card coerces `'3'` to 3 and caps events at three. Hiding the modifier here
    // would make it unreachable while the limit it modifies is actively working.
    expect(namesIn(asEditorSees({ compact_events_to_show: '3' }))).toContain(
      'compact_events_complete_days',
    );
  });

  it('offers no modifier for a value the card will discard', () => {
    // Below the minimum, so the card reduces it to "no limit". Offering the modifier
    // would be a control for something that is not happening.
    expect(namesIn(asEditorSees({ compact_events_to_show: -1 }))).not.toContain(
      'compact_events_complete_days',
    );
  });

  it('keeps a set modifier in the configuration while it is out of the schema', () => {
    // Dormant, not dead: clearing the event limit must not destroy a preference the
    // user gets back by setting one again.
    const config = buildConfig({
      compact_events_to_show: undefined,
      compact_events_complete_days: true,
    });

    expect(namesIn(config)).not.toContain('compact_events_complete_days');
    expect(toStoredConfig(config).compact_events_complete_days).toBe(true);
  });
});

describe('editor: a group states its family applicability once', () => {
  /**
   * All three compact fields are list-only, so each carried the same sentence and the
   * group read as three separate problems rather than one scoped family.
   *
   * Asserted through `computeHelper` rather than against the string table, because the
   * question is what a user reads. The note has to appear once, on the group, and not
   * again on the fields inside it.
   */
  function contentNodes(view: Types.EffectiveView) {
    const panel = PANELS.find((entry) => entry.id === 'content')!;
    const config = buildConfig({ view, compact_events_to_show: 3 });
    return [...walkSchema(panel.build({ view, config, language: 'en' }))];
  }

  it('states it on the group', () => {
    const group = contentNodes('column').find((entry) => entry.node.name === 'compact_mode')!;

    expect(computeHelper('en', 'column', group.node, group.path)).toMatch(/list layout/i);
  });

  it('does not repeat it on the fields inside', () => {
    for (const { node, path } of contentNodes('column')) {
      if (!path.includes('compact_mode')) continue;
      if ('schema' in node || node.name === '') continue;

      expect(computeHelper('en', 'column', node, path) ?? '', node.name).not.toMatch(
        /list layout/i,
      );
    }
  });

  it('says nothing at all on a list card', () => {
    for (const { node, path } of contentNodes('list')) {
      if (node.name !== 'compact_mode' && !path.includes('compact_mode')) continue;

      expect(computeHelper('en', 'list', node, path) ?? '', node.name).not.toMatch(/list layout/i);
    }
  });

  /**
   * The silencing is keyed on the enclosing group's path, so the same option outside
   * that group still carries its own note.
   *
   * This is the half of the rule that can be exercised today: every entry in
   * `VIEW_SCOPE` currently states the same scope, so a field whose scope *differs* from
   * its group's cannot be built from real keys. `sameScope` is what will keep that case
   * annotated when a differently-scoped option, or a third view, arrives — the group
   * speaks only for children that share its statement.
   */
  it('still annotates the same option outside the group', () => {
    const note = computeHelper('en', 'column', {
      name: 'compact_events_to_show',
      selector: { number: { min: 1 } },
    });

    expect(note).toMatch(/list layout/i);
  });
});

describe('editor: every panel writes a minimal configuration', () => {
  /**
   * The failure this prevents shipped twice in the card nearest to this one, the second
   * time introduced by its own move to `ha-form`: the form hands back the whole merged
   * object, so writing it through persists every default into the user's YAML.
   */
  it('adds nothing to a configuration by rendering every panel against it', () => {
    for (const view of VIEWS) {
      const config = buildConfig({ view, entities: ['calendar.personal'] });
      const stored = toStoredConfig(config);

      expect(Object.keys(stored).sort(), `${view} view`).toEqual(
        view === DEFAULT_CONFIG.view ? ['entities'] : ['entities', 'view'],
      );
    }
  });

  it('removes a key again when its field is set back to the default', () => {
    const cases: Array<[string, unknown]> = [
      ['event_font_size', '20px'],
      ['show_location', false],
      ['refresh_interval', 60],
      ['title_max_lines', 3],
      ['week_separator_color', '#fff'],
    ];

    for (const [key, value] of cases) {
      const set = buildConfig({ [key]: value } as Partial<Types.Config>);
      expect(toStoredConfig(set), key).toHaveProperty(key);

      const cleared = buildConfig({
        [key]: DEFAULT_CONFIG[key as keyof Types.Config],
      } as Partial<Types.Config>);
      expect(toStoredConfig(cleared), key).not.toHaveProperty(key);
    }
  });
});

describe('editor: the write path over the whole configuration', () => {
  /**
   * A configuration with every top-level option set to something other than its
   * default, so that nothing is tested by accident of matching a default.
   */
  function everythingSet(): Types.Config {
    const custom: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      if (key === 'entities') custom[key] = ['calendar.a'];
      else if (key === 'view') custom[key] = 'column';
      else if (key === 'weather') custom[key] = { ...(value as object), entity: 'weather.home' };
      else if (key === 'column') custom[key] = { min_day_width: 200, show_location: false };
      else if (key === 'tap_action' || key === 'hold_action')
        custom[key] = { action: 'navigate', navigation_path: '/x' };
      else if (typeof value === 'boolean') custom[key] = !value;
      else if (typeof value === 'number') custom[key] = value + 7;
      else if (typeof value === 'string') custom[key] = `${value}-x`;
      // `undefined` and `null` defaults, which any value differs from.
      else custom[key] = 'set';
    }

    return { ...DEFAULT_CONFIG, ...custom } as Types.Config;
  }

  /**
   * The other half of default-stripping, and the one that is easy to forget. Writing
   * too much bloats a configuration; writing too little destroys one. Every key the
   * user set differs from its default by construction here, so every one of them has
   * to survive.
   */
  it('drops nothing the user configured', () => {
    const config = everythingSet();
    const stored = toStoredConfig(config);

    const lost = Object.keys(config).filter((key) => !(key in stored));
    expect(lost).toEqual([]);
  });

  /**
   * Home Assistant answers a `config-changed` by feeding the configuration back in, so
   * the write path runs over its own output on every edit. If it were not a fixed
   * point, a configuration would drift a little further on each keystroke.
   */
  it('is a fixed point, so a configuration cannot drift by being edited', () => {
    const stored = toStoredConfig(everythingSet());
    const again = toStoredConfig({ ...DEFAULT_CONFIG, ...stored } as Types.Config);

    expect(again).toEqual(stored);
  });
});

describe('editor: fields that must survive being typed into', () => {
  /**
   * Three fields hold a value that the control editing them is derived from, so a
   * half-typed value re-derives the control away mid-word. `start_date_offset` is the
   * one the design named; these are the two found beside it.
   *
   * Types one character at a time through the real change handler, which is the only
   * way the failure shows: each keystroke individually looks harmless.
   */
  function type(
    config: Types.Config,
    field: string,
    keystrokes: ReadonlyArray<string>,
  ): { config: Types.Config; pending: Record<string, string> } {
    let current = config;
    let pending: Record<string, string> = {};

    for (const value of keystrokes) {
      const form = {
        ...(current as unknown as Record<string, unknown>),
        ...deriveSyntheticData(current, pending),
      };
      const applied = applyFormChange(current, form, { ...form, [field]: value }, pending);
      current = applied.config;
      pending = applied.pending;
    }

    return { config: current, pending };
  }

  function fieldNames(build: () => HaFormSchema[]): string[] {
    return [...walkSchema(build())].map((entry) => entry.node.name).filter(Boolean);
  }

  /**
   * The renderer classifies any string it does not recognise as a plain dot, so
   * committing each keystroke of `star.png` would switch the style to Dot on the `s`,
   * remove this field, and leave `s` in the user's configuration.
   */
  it('keeps the custom indicator field standing while an image path is typed', () => {
    const start = buildConfig({ today_indicator: '⭐' });

    for (const partial of ['s', 'st', 'star', 'star.pn']) {
      const { config, pending } = type(start, 'today_indicator_custom', [partial]);

      expect(config.today_indicator, partial).toBe('⭐');
      expect(pending.today_indicator_custom, partial).toBe(partial);
      expect(
        fieldNames(() => buildDayHeaderSchema({ view: 'list', config, language: 'en' })),
        partial,
      ).toContain('today_indicator_custom');
    }

    const done = type(start, 'today_indicator_custom', ['s', 'st', 'star', 'star.pn', 'star.png']);
    expect(done.config.today_indicator).toBe('star.png');
  });

  /**
   * The same field accepts two kinds of value, and only the image half was covered above.
   * An emoji is complete the moment it is typed, so it commits on the first keystroke
   * rather than being held pending — the opposite of the image path, and the reason both
   * arms of the committability test need asserting. Mutation testing found that dropping
   * the emoji arm left every gate green while the editor silently refused to ever store an
   * emoji the user typed.
   */
  it('commits an emoji indicator on the keystroke that completes it', () => {
    const start = buildConfig({ today_indicator: 'star.png' });
    const typed = type(start, 'today_indicator_custom', ['⭐']);

    expect(typed.config.today_indicator).toBe('⭐');
    expect(typed.pending.today_indicator_custom ?? null).toBeNull();
  });

  /**
   * Home Assistant's text selector reports every keystroke and turns an emptied field
   * into `undefined`, so binding `height` directly would delete the measurement the
   * moment the box was cleared to retype it — and take the field with it, since the
   * height mode is derived from whether the key is set.
   */
  it('keeps the height field standing while its measurement is retyped', () => {
    const start = buildConfig({ height: '500px' });
    const cleared = type(start, 'card_height', ['']);

    expect(cleared.config.height).toBe('500px');
    expect(cleared.pending.card_height).toBe('');
    expect(
      fieldNames(() => buildLayoutSchema({ view: 'list', config: cleared.config, language: 'en' })),
    ).toContain('card_height');

    const retyped = type(start, 'card_height', ['', '4', '40', '400px']);
    expect(retyped.config.height).toBe('400px');
  });

  it('keeps the maximum-height field standing on the same terms', () => {
    const start = buildConfig({ height: 'auto', max_height: '600px' });
    const cleared = type(start, 'card_max_height', ['']);

    expect(cleared.config.max_height).toBe('600px');
    expect(
      fieldNames(() => buildLayoutSchema({ view: 'list', config: cleared.config, language: 'en' })),
    ).toContain('card_max_height');
  });

  /**
   * The assertions above hold whether or not the field is synthetic at all — clearing it
   * is meant to be a no-op, so a version that never handled the key passed them too. These
   * are the three that fail when it stops being synthetic: the field renders empty over a
   * configured maximum, a typed measurement never reaches `max_height`, and the synthetic
   * name itself is written into the user's YAML.
   */
  it('derives, commits and hides the maximum-height measurement', () => {
    const config = buildConfig({ height: 'auto', max_height: '600px' });
    const before = { ...config, ...deriveSyntheticData(config) } as Record<string, unknown>;
    expect(before.card_max_height).toBe('600px');

    const applied = applyFormChange(config, before, { ...before, card_max_height: '900px' }, {});
    const stored = toStoredConfig(applied.config);

    expect(stored.max_height).toBe('900px');
    expect(stored).not.toHaveProperty('card_max_height');
  });

  it('never lets a held measurement reach the stored configuration', () => {
    const { config, pending } = type(buildConfig({ height: '500px' }), 'card_height', ['']);

    expect(toStoredConfig(config).height).toBe('500px');
    expect(toStoredConfig(config)).not.toHaveProperty('card_height');
    expect(pending.card_height).toBe('');
  });
});

describe('editor: group headings resolve their own strings', () => {
  /**
   * `ha-form-expandable` asks for a group's description by calling the helper hook on
   * itself with **no path**, so a group whose string key differs from its config key —
   * `weather.date`, stored under `date` — is asked for under the bare name unless the
   * resolver prefers its title key.
   *
   * Left that way the helper is not merely missing: `date` and `event` are also keys in
   * the dormant `editor.*` sections, so the lookup succeeds and renders a word written
   * for the editor that was replaced.
   */
  it('resolves a group helper from the key its heading came from', () => {
    const config = buildConfig({
      view: 'column',
      weather: { entity: 'weather.home', position: 'both' },
    });

    const groups = PANELS.flatMap((panel) => [
      ...walkSchema(panel.build({ view: 'column', config, language: 'en' })),
    ]).filter((entry) => 'titleKey' in entry.node);

    expect(groups.length).toBeGreaterThan(8);

    for (const { node, path } of groups) {
      const titleKey = (node as { titleKey?: string }).titleKey!;
      const expected = EDITOR_STRINGS[`${titleKey}.helper`];
      if (expected === undefined) continue;

      // A group that states an applicability note on behalf of its children carries it
      // *after* its own helper, unlike a field, which carries its note first. The
      // difference is not cosmetic: a field's note qualifies a control the reader can
      // already see and name, whereas a group's would arrive before the reader knew what
      // the group was. What this asserts either way is which key the helper came from —
      // resolving from the wrong key produces a different string entirely, which is the
      // failure being guarded against.
      const helper = computeHelper('en', 'column', node, path);

      expect(helper, titleKey).toBeDefined();
      expect(
        helper!.startsWith(expected) || helper!.endsWith(expected),
        `${titleKey} resolved "${helper}"`,
      ).toBe(true);
    }
  });

  /**
   * The compact-mode group states one scope on behalf of its three fields, and the two
   * sentences have to read as one paragraph. They did not: the note was prefixed, so the
   * group opened with "These apply to the list layout…" above the sentence that said
   * what "these" were, and both halves used the word "apply".
   */
  it('reads a group and its scope note as one paragraph', () => {
    const group = [
      ...walkSchema(
        PANELS.find((panel) => panel.id === 'content')!.build({
          view: 'column',
          config: buildConfig({ view: 'column' }),
          language: 'en',
        }),
      ),
    ].find((entry) => (entry.node as { titleKey?: string }).titleKey === 'compact_mode')!;

    const helper = computeHelper('en', 'column', group.node, group.path)!;

    expect(helper.startsWith(EDITOR_STRINGS['compact_mode.helper'])).toBe(true);
    expect(helper.endsWith(EDITOR_STRINGS['scope.list_only.compact_mode'])).toBe(true);

    // In the layout it applies to there is no note at all, so the helper stands alone.
    expect(computeHelper('en', 'list', group.node, group.path)).toBe(
      EDITOR_STRINGS['compact_mode.helper'],
    );
  });

  it('does not fall back to a bare key that belongs to the old namespace', () => {
    const config = buildConfig({ weather: { entity: 'weather.home', position: 'both' } });
    const groups = [
      ...walkSchema(
        PANELS.find((panel) => panel.id === 'weather')!.build({
          view: 'list',
          config,
          language: 'en',
        }),
      ),
    ].filter((entry) => 'titleKey' in entry.node);

    // `editor.date` and `editor.event` still exist in en.json and resolve to "Date" and
    // "Event" — the exact strings a bare-name fallback would render here.
    for (const { node, path } of groups) {
      expect(computeHelper('en', 'list', node, path)).not.toBe('Date');
      expect(computeHelper('en', 'list', node, path)).not.toBe('Event');
    }
  });
});

/**
 * A tag of this file's own for the widgets mounted below, since a custom element has to
 * be defined before it can be constructed and may only be defined once.
 */
const CHASSIS_TAG = 'test-calendar-card-pro-editor-widgets';
if (!customElements.get(CHASSIS_TAG)) {
  customElements.define(CHASSIS_TAG, class extends CalendarCardProEditor {});
}

/** Reads a mounted form's schema. */
function schemaOf(form: Element): HaFormSchema[] {
  return (form as unknown as { schema: HaFormSchema[] }).schema;
}

/** Which exception picker offers a given option. */
function pickerIndexFor(element: CalendarCardProEditor, key: string): number {
  const pickers = [...element.shadowRoot!.querySelectorAll('ha-form.exception-picker')];

  return pickers.findIndex((form) => {
    const node = schemaOf(form)[0] as unknown as {
      selector: { select: { options: SelectOption[] } };
    };
    return node.selector.select.options.some((option) => option.value === key);
  });
}

/** Which exception form renders a given option. */
function exceptionFormIndexFor(element: CalendarCardProEditor, key: string): number {
  const forms = [...element.shadowRoot!.querySelectorAll('ha-form.exception-form')];

  return forms.findIndex((form) => schemaOf(form).some((node) => node.name === key));
}

/** Fires a change from one of the editor's forms, the way `ha-form` does. */
async function fire(
  element: CalendarCardProEditor,
  selector: string,
  patch: Record<string, unknown>,
  index = 0,
) {
  const form = element.shadowRoot!.querySelectorAll(selector)[index];
  const data = (form as unknown as { data: Record<string, unknown> }).data;
  form.dispatchEvent(
    new CustomEvent('value-changed', { detail: { value: { ...data, ...patch } } }),
  );
  await element.updateComplete;
}

/**
 * The weather block the card actually runs on, versus the one the editor binds.
 *
 * Every nested weather option resolves as `!== false` at render time, so an omitted
 * one draws as its default. Binding the stored block raw therefore showed the five
 * default-on toggles unchecked while the card drew them enabled.
 */
describe('editor: the weather block', () => {
  /** Mounts the editor on a raw config and returns the panel form data holding `weather`. */
  async function weatherFormData(weather: unknown): Promise<Record<string, unknown>> {
    const element = document.createElement(CHASSIS_TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig({ entities: ['calendar.a'], weather } as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    const form = [...element.shadowRoot!.querySelectorAll('ha-form.panel-form')].find(
      (candidate) =>
        (candidate as unknown as { data: Record<string, unknown> }).data?.weather !== undefined,
    )!;

    return (form as unknown as { data: { weather: Record<string, unknown> } }).data.weather;
  }

  it('binds every defaulted option a minimal weather block leaves out', async () => {
    const bound = await weatherFormData({ entity: 'weather.home', position: 'both' });
    const defaults = DEFAULT_CONFIG.weather as unknown as Record<string, Record<string, unknown>>;

    const unbound = ['date', 'event'].flatMap((group) => {
      const group_bound = (bound[group] ?? {}) as Record<string, unknown>;

      return Object.keys(defaults[group])
        .filter((option) => group_bound[option] === undefined)
        .map((option) => `${group}.${option}`);
    });

    expect(unbound).toEqual([]);
  });

  /**
   * The five the user would actually see wrong: each renders on, so an unbound one is a
   * toggle sitting off in the editor while the card draws it enabled.
   */
  it('shows the default-on toggles on, the way the card renders them', async () => {
    const bound = await weatherFormData({ entity: 'weather.home', position: 'both' });

    const date = bound.date as Record<string, unknown>;
    const event = bound.event as Record<string, unknown>;

    expect({
      date_conditions: date.show_conditions,
      date_high_temp: date.show_high_temp,
      event_conditions: event.show_conditions,
      event_temp: event.show_temp,
      event_fallback: event.daily_forecast_fallback,
    }).toEqual({
      date_conditions: true,
      date_high_temp: true,
      event_conditions: true,
      event_temp: true,
      event_fallback: true,
    });
  });

  it('binds the default position when the block omits it', async () => {
    const bound = await weatherFormData({ entity: 'weather.home' });

    expect(bound.position).toBe('date');
  });

  /** The one non-default position, which #443 made meaningful, must survive the merge. */
  it('keeps a position the user set', async () => {
    const bound = await weatherFormData({ entity: 'weather.home', position: 'none' });

    expect(bound.position).toBe('none');
  });
});

describe('editor: per-calendar settings', () => {
  const calendars = PANELS.find((panel) => panel.id === 'calendars')!;
  /** The per-calendar schema, as the Calendars panel declares it. */
  function entitySchema(config: Types.Config = buildConfig()) {
    return calendars.subforms!({ view: config.view, config, language: 'en' })[0];
  }

  beforeEach(() => {
    clearCopiedSettings();
  });

  it('renders one collapsible form per configured calendar', async () => {
    const element = document.createElement(CHASSIS_TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig({ entities: ['calendar.a', 'calendar.b'] } as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    expect(element.shadowRoot!.querySelectorAll('ha-form.entity-form')).toHaveLength(2);
  });

  /**
   * The wiring, not the pure functions. Each calendar's form is narrowed to its own
   * label shape, which is the one place the per-calendar list renders something other
   * than the schema the panel declares — so it is worth seeing it happen through the
   * element rather than only through `entitySchemaFor`.
   */
  it('narrows each calendar to its own label shape, through the chassis', async () => {
    const element = document.createElement(CHASSIS_TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig({
      entities: [{ entity: 'calendar.a', label: 'mdi:home' }, 'calendar.b'],
    } as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    const forms = [...element.shadowRoot!.querySelectorAll('ha-form.entity-form')];
    const names = forms.map((form) => schemaOf(form).map((node) => node.name));

    // The calendar with an icon label gets the picker and the icon colour; the one with
    // no label at all gets neither, and its shape dropdown reads *None*.
    expect(names[0]).toContain('label_icon_color');
    expect(names[1]).not.toContain('label_icon_color');
    expect(names[1]).not.toContain('label');

    const data = (forms[1] as unknown as { data: Record<string, unknown> }).data;
    expect(data.label_type).toBe('none');
  });

  it('stores a label chosen through the shape dropdown, through the chassis', async () => {
    const element = document.createElement(CHASSIS_TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig({ entities: ['calendar.a'] } as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    const dispatched: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      const config = (event as CustomEvent).detail.config as Types.Config;
      dispatched.push(config as unknown as Record<string, unknown>);
      element.setConfig(config);
    });

    await fire(element, 'ha-form.entity-form', { label_type: 'icon' });

    // The shape is what is stored; nothing is seeded into the picker for the user to
    // clear first. It has to be stored here, because an icon shape with no icon in it
    // is exactly the state reading the value back cannot express.
    expect(dispatched.at(-1)!.entities).toEqual([{ entity: 'calendar.a', label_type: 'icon' }]);

    // The picker is now on screen, empty, with the colour that only applies to it.
    const form = element.shadowRoot!.querySelector('ha-form.entity-form')!;
    expect(schemaOf(form).map((node) => node.name)).toContain('label_icon_color');

    const data = (form as unknown as { data: Record<string, unknown> }).data;
    expect(data.label_type).toBe('icon');
    expect(data.label ?? '').toBe('');
  });

  /**
   * The reported bug, as reported: pick *Text or Emoji*, type a label, clear it, and the
   * field vanishes and the dropdown snaps back to *None* — so a custom label can never
   * be typed at all.
   *
   * The cause is that the shape used to be read off the value, where an empty string and
   * an absent label are the same thing. Clearing the box therefore removed the key, which
   * re-derived the shape as *None* and took the box away mid-edit. Clearing a field is a
   * legitimate step on the way to typing another value, so the model has to be able to
   * hold "a text label, currently empty" — which is what `label_type` is for.
   *
   * Driven through the element rather than through `fromEntityFormData`, because the bug
   * is in the round trip: each keystroke stores a config, the element re-derives the form
   * from it, and it is that second half that dropped the field.
   */
  it('keeps the label field on screen while the text is cleared and retyped', async () => {
    const element = document.createElement(CHASSIS_TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig({ entities: ['calendar.a'] } as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    element.addEventListener('config-changed', (event) => {
      element.setConfig((event as CustomEvent).detail.config as Types.Config);
    });

    /** The names the one calendar's form is currently rendering. */
    const rendered = () =>
      schemaOf(element.shadowRoot!.querySelector('ha-form.entity-form')!).map((node) => node.name);
    /** That form's data, as `ha-form` would read it. */
    const formData = () =>
      (
        element.shadowRoot!.querySelector('ha-form.entity-form') as unknown as {
          data: Record<string, unknown>;
        }
      ).data;

    await fire(element, 'ha-form.entity-form', { label_type: 'text' });

    // Choosing the shape is enough to put the field on screen. It arrives empty: a seeded
    // value only ever existed to stop the shape deriving straight back to *None*, and an
    // explicit shape does not need one.
    expect(rendered()).toContain('label');
    expect(formData().label_type).toBe('text');
    expect(formData().label ?? '').toBe('');

    await fire(element, 'ha-form.entity-form', { label: 'Fam' });
    expect(formData().label).toBe('Fam');

    // The step that used to break it.
    await fire(element, 'ha-form.entity-form', { label: '' });

    expect(rendered(), 'the field survived being cleared').toContain('label');
    expect(formData().label_type, 'the shape did not snap back').toBe('text');

    // And the user can now type the label they wanted all along.
    await fire(element, 'ha-form.entity-form', { label: 'Familienkalender' });
    expect(formData().label).toBe('Familienkalender');
  });

  /**
   * The same failure one door along. An icon label's colour field is shown only while the
   * label *is* an icon, so clearing the icon picker to choose another one used to remove
   * the label, re-derive the shape as *None*, and take both controls away at once.
   */
  it('keeps the icon picker and its colour on screen while the icon is cleared', async () => {
    const element = document.createElement(CHASSIS_TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig({
      entities: [{ entity: 'calendar.a', label: 'mdi:home' }],
    } as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    element.addEventListener('config-changed', (event) => {
      element.setConfig((event as CustomEvent).detail.config as Types.Config);
    });

    await fire(element, 'ha-form.entity-form', { label: '' });

    const form = element.shadowRoot!.querySelector('ha-form.entity-form')!;
    const names = schemaOf(form).map((node) => node.name);

    expect(names, 'the picker survived being cleared').toContain('label');
    expect(names, 'so did the icon colour').toContain('label_icon_color');
    expect((form as unknown as { data: Record<string, unknown> }).data.label_type).toBe('icon');
  });

  it('offers every per-calendar option the card reads', () => {
    const offered = [...walkSchema(entitySchema().schema)]
      // Section headings are `constant` nodes, not options — they configure nothing and
      // are never written. The headings themselves are pinned separately below.
      .filter((entry) => !('type' in entry.node && entry.node.type === 'constant'))
      .map((entry) => entry.node.name)
      .filter(Boolean);

    // Every member of `EntityConfig` except the entity id itself, which is the
    // picker's business rather than a setting of the calendar's — plus `label_type`
    // and `accent_color_mode`, which are not config keys at all. Each names which of
    // several shapes one value holds, exactly as `today_indicator_style` does at card
    // level, and neither is ever written to the stored configuration.
    expect(offered.sort()).toEqual(
      [
        'accent_color',
        'accent_color_mode',
        'allday_expires_at',
        'event_type',
        'allowlist',
        'blocklist',
        'color',
        'compact_events_to_show',
        'days_of_week',
        'label',
        'label_icon_color',
        'label_type',
        'show_description',
        'show_location',
        'show_time',
        'split_multiday_events',
      ].sort(),
    );
  });

  /**
   * The defect in the editor this replaces, and the reason four of these are dropdowns.
   *
   * The card reads them presence-first — `getEntitySetting(…) ?? config.show_time`
   * (`buildEventPresentation` in `presentation.ts`), and `typeof … !== 'undefined'` for
   * the split (`shouldSplitEvent` in `events.ts`) — so absent means *follow the card*. Bound to a checkbox, that
   * state renders as "off", which is a different instruction, and the first touch
   * writes a literal `false` that no checkbox can take back.
   */
  it('offers a third state for the options that may be left to the card', () => {
    const inheritable = ['show_time', 'show_location', 'show_description', 'split_multiday_events'];

    for (const name of inheritable) {
      const node = [...walkSchema(entitySchema().schema)].find(
        (entry) => entry.node.name === name,
      )!.node;

      expect('selector' in node && 'select' in node.selector, name).toBe(true);

      const selector = (node as unknown as { selector: { select: { options: SelectOption[] } } })
        .selector;
      expect(
        selector.select.options.map((option) => option.value),
        name,
      ).toHaveLength(3);
      expect(selector.select.options[0].value, name).toBe('inherit');
    }
  });

  it('reads an unset option back as inheriting rather than as off', () => {
    const data = toEntityFormData({ entity: 'calendar.a', label: 'Work' });

    expect(data.show_time).toBe('inherit');
    expect(data.show_location).toBe('inherit');
    expect(data.split_multiday_events).toBe('inherit');
  });

  it('round-trips the three states of an inheritable option', () => {
    const cases: Array<[unknown, string]> = [
      [undefined, 'inherit'],
      [true, 'show'],
      [false, 'hide'],
    ];

    for (const [stored, offered] of cases) {
      const entry =
        stored === undefined
          ? { entity: 'calendar.a' }
          : ({ entity: 'calendar.a', show_time: stored } as Types.EntityConfig);

      expect(toEntityFormData(entry).show_time, String(stored)).toBe(offered);

      const written = fromEntityFormData('calendar.a', { show_time: offered });
      if (stored === undefined) {
        expect(written, String(stored)).toBe('calendar.a');
      } else {
        expect(written, String(stored)).toEqual({ entity: 'calendar.a', show_time: stored });
      }
    }
  });

  /**
   * The split shares the tristate machinery but not its vocabulary: its two
   * decided states are offered as `split` and `whole` rather than `show` and
   * `hide`, and those two words are mapped in a second table. The round-trip
   * above covers only the `show`/`hide` pair, so both split words could be
   * dropped from that table with every gate green — after which choosing
   * "Split" in the editor writes nothing at all, and the calendar silently
   * keeps inheriting from the card.
   */
  it('round-trips the two decided states of the split', () => {
    const cases: Array<[boolean, string]> = [
      [true, 'split'],
      [false, 'whole'],
    ];

    for (const [stored, offered] of cases) {
      const entry = {
        entity: 'calendar.a',
        split_multiday_events: stored,
      } as Types.EntityConfig;

      expect(toEntityFormData(entry).split_multiday_events, offered).toBe(offered);
      expect(fromEntityFormData('calendar.a', { split_multiday_events: offered }), offered).toEqual(
        { entity: 'calendar.a', split_multiday_events: stored },
      );
    }
  });

  /**
   * Both tristate tables, pinned by value.
   *
   * 🚨 The mapping table is keyed by **option** and must stay that way. Flat — one
   * value→stored map shared by every option — it can only hold booleans, and `event_type`
   * stores strings; widening it makes the dropdown values a shared namespace across
   * unrelated options. `hide` already means `false` to three options here, and this key
   * was first drafted with values `all` / `only` / `hide`: flat, its `hide` would have
   * read back as `inherit` and the next write would have dropped the key, so a configured
   * filter would vanish from the user's YAML on their first visit to the editor.
   *
   * Pinned by value in both directions rather than walked, because walking a table's own
   * keys cannot notice a key leaving it: delete an entry and the loop runs one fewer time
   * while every assertion still passes. That failure is silent here — a dropped option
   * stops being offered, and a dropped value stops being storable — so `toEqual` on the
   * whole shape is the only form that fails in both directions.
   */
  it('pins the vocabulary and the stored form of every inheritable option', () => {
    expect(ENTITY_TRISTATE_VALUES).toEqual({
      show_time: ['inherit', 'show', 'hide'],
      show_location: ['inherit', 'show', 'hide'],
      show_description: ['inherit', 'show', 'hide'],
      split_multiday_events: ['inherit', 'split', 'whole'],
      event_type: ['inherit', 'all', 'timed', 'all_day'],
      days_of_week: ['inherit', 'weekdays', 'weekends'],
    });

    expect(ENTITY_TRISTATE_STORED).toEqual({
      show_time: { inherit: undefined, show: true, hide: false },
      show_location: { inherit: undefined, show: true, hide: false },
      show_description: { inherit: undefined, show: true, hide: false },
      split_multiday_events: { inherit: undefined, split: true, whole: false },
      event_type: { inherit: undefined, all: 'all', timed: 'timed', all_day: 'all_day' },
      days_of_week: { inherit: undefined, weekdays: 'weekdays', weekends: 'weekends' },
    });

    // Every offered value must be storable, and nothing may be storable that is not
    // offered. Two tables describing one control drift apart silently otherwise: an
    // unmapped value stores nothing and the dropdown snaps back, and a mapped value with
    // no option is dead weight nobody can reach.
    for (const [name, values] of Object.entries(ENTITY_TRISTATE_VALUES)) {
      expect(Object.keys(ENTITY_TRISTATE_STORED[name]).sort(), name).toEqual([...values].sort());
    }
  });

  /**
   * `event_type` is the first inheritable option whose decided states store **strings**
   * rather than booleans, and the first with four states rather than three. Both are why
   * the mapping table had to become per-option; this round-trip is what proves each state
   * survives the trip out to the form and back.
   */
  it('round-trips the three decided states of the event type', () => {
    const cases: Array<[Types.EventType, string]> = [
      ['all', 'all'],
      ['timed', 'timed'],
      ['all_day', 'all_day'],
    ];

    for (const [stored, offered] of cases) {
      const entry = { entity: 'calendar.a', event_type: stored } as Types.EntityConfig;

      expect(toEntityFormData(entry).event_type, offered).toBe(offered);
      expect(fromEntityFormData('calendar.a', { event_type: offered }), offered).toEqual({
        entity: 'calendar.a',
        event_type: stored,
      });
    }

    // The absent key, which must read back as inheriting and be written as nothing at all
    // — not as `all`, which would pin the calendar against a later card-level change.
    expect(toEntityFormData({ entity: 'calendar.a' }).event_type).toBe('inherit');
    expect(fromEntityFormData('calendar.a', { event_type: 'inherit' })).toBe('calendar.a');
  });

  it('writes a bare entity id for a calendar that carries no settings', () => {
    expect(fromEntityFormData('calendar.a', { label: '', color: '', show_time: 'inherit' })).toBe(
      'calendar.a',
    );
  });

  /**
   * E12 — the label's shape.
   *
   * `label` holds four shapes in one key and `renderLabel` decides which by looking at
   * the value, so the dropdown is derived rather than stored. What these pin is the one
   * thing that cannot be got from the value alone: whether the user moved the *dropdown*
   * or edited the *value*, which arrive identically because `ha-form` reports only that
   * the form changed. The stored entry is what separates them.
   */
  it('derives the label shape from the value rather than storing one', () => {
    expect(toEntityFormData({ entity: 'calendar.a' }).label_type).toBe('none');
    expect(toEntityFormData({ entity: 'calendar.a', label: 'Work' }).label_type).toBe('text');
    expect(toEntityFormData({ entity: 'calendar.a', label: '🎉' }).label_type).toBe('text');
    expect(toEntityFormData({ entity: 'calendar.a', label: 'mdi:home' }).label_type).toBe('icon');
    expect(toEntityFormData({ entity: 'calendar.a', label: '/local/a.png' }).label_type).toBe(
      'image',
    );
  });

  it('never writes the shape dropdown into the configuration', () => {
    const written = fromEntityFormData(
      'calendar.a',
      { label_type: 'text', label: 'Work' },
      { entity: 'calendar.a', label: 'Work' },
    );

    expect(written).toEqual({ entity: 'calendar.a', label: 'Work' });
  });

  it('gives the icon shape a picker, and the others a text box', () => {
    const declared = entitySchema().schema;

    const shapes: Array<[string, string[]]> = [
      ['none', []],
      ['text', ['label']],
      ['image', ['label']],
      ['icon', ['label', 'label_icon_color']],
    ];

    for (const [type, expected] of shapes) {
      const narrowed = entitySchemaFor(declared, type);
      const labelFieldNames = [...walkSchema(narrowed)]
        .map((entry) => entry.node.name)
        .filter((name) => name === 'label' || name === 'label_icon_color');

      expect(labelFieldNames, type).toEqual(expected);
    }

    const iconNode = [...walkSchema(entitySchemaFor(declared, 'icon'))].find(
      (entry) => entry.node.name === 'label',
    )!.node;
    expect('selector' in iconNode && 'icon' in iconNode.selector, 'icon shape gets a picker').toBe(
      true,
    );

    const textNode = [...walkSchema(entitySchemaFor(declared, 'text'))].find(
      (entry) => entry.node.name === 'label',
    )!.node;
    expect('selector' in textNode && 'text' in textNode.selector).toBe(true);
  });

  /**
   * The colour did nothing unless the label was an icon, and said so in a helper under
   * every calendar. Shown only where it applies, the sentence is no longer needed.
   */
  it('shows the label icon colour only where there is an icon to colour', () => {
    const declared = entitySchema().schema;

    for (const type of ['none', 'text', 'image']) {
      const names = [...walkSchema(entitySchemaFor(declared, type))].map(
        (entry) => entry.node.name,
      );
      expect(names, type).not.toContain('label_icon_color');
    }
  });

  /**
   * Choosing a shape used to seed a value — `📅`, `mdi:calendar` — for one reason only:
   * the shape was read back off the value, so an unfilled shape read as *None* and the
   * control vanished on the keystroke that opened it. With the shape stored there is
   * nothing to prop up, and the prop was in the way: the seed had to be deleted before
   * a real label could be typed, and deleting it was the act that broke the field.
   *
   * So a chosen shape arrives empty, and it is the shape that is stored rather than a
   * value nobody asked for.
   */
  it('stores the chosen shape rather than seeding a value for it', () => {
    const chosen = fromEntityFormData(
      'calendar.a',
      { label_type: 'icon', label: '' },
      { entity: 'calendar.a' },
    ) as Types.EntityConfig;

    expect(chosen.label_type).toBe('icon');
    expect(chosen.label).toBeUndefined();

    // Chosen from nothing at all, where the form was showing no value field to carry it.
    const fromNone = fromEntityFormData(
      'calendar.a',
      { label_type: 'text' },
      'calendar.a',
    ) as Types.EntityConfig;

    expect(fromNone.label_type).toBe('text');
    expect(fromNone.label).toBeUndefined();
  });

  /**
   * The rule that keeps the new key out of almost every configuration: it is stored
   * exactly when reading the value back would give a different answer. An emoji reads
   * as text and an `mdi:` name reads as an icon, so neither stores anything new and
   * those calendars' YAML is what it was before the key existed.
   */
  it('stores the shape only where reading the value would get it wrong', () => {
    const ordinary = fromEntityFormData(
      'calendar.a',
      { label_type: 'text', label: '📅' },
      'calendar.a',
    ) as Types.EntityConfig;

    expect(ordinary).toEqual({ entity: 'calendar.a', label: '📅' });

    const icon = fromEntityFormData(
      'calendar.a',
      { label_type: 'icon', label: 'mdi:home' },
      'calendar.a',
    ) as Types.EntityConfig;

    expect(icon).toEqual({ entity: 'calendar.a', label: 'mdi:home' });

    // The two cases inference cannot express: a shape with nothing in it yet, and a
    // text label that happens to look like an icon.
    const looksLikeAnIcon = fromEntityFormData(
      'calendar.a',
      { label_type: 'text', label: 'mdi:home' },
      'calendar.a',
    ) as Types.EntityConfig;

    expect(looksLikeAnIcon).toEqual({
      entity: 'calendar.a',
      label: 'mdi:home',
      label_type: 'text',
    });
  });

  it('carries a value across a shape change that can still hold it', () => {
    const kept = fromEntityFormData(
      'calendar.a',
      { label_type: 'text', label: '🎉' },
      { entity: 'calendar.a', label: 'Work' },
    ) as Types.EntityConfig;

    expect(kept.label).toBe('🎉');
  });

  it('removes the label when the shape is set to none', () => {
    expect(
      fromEntityFormData(
        'calendar.a',
        { label_type: 'none', label: 'mdi:home' },
        { entity: 'calendar.a', label: 'mdi:home' },
      ),
    ).toBe('calendar.a');
  });

  /**
   * Typing `mdi:` into the text box is a *value* edit whose result happens to look like
   * an icon. The box used to be swapped for the icon picker on the keystroke that
   * completed the prefix — which is the same defect as the reported one, a control
   * moving under the cursor, and it made a literal text label of `mdi:home` impossible
   * to write at all.
   *
   * The shape the user chose now wins, so the value is stored verbatim, the box stays,
   * and the shape is written down alongside it because reading the value back would
   * disagree. The picker is still one dropdown away.
   */
  it('keeps a text label text even when it starts to look like an icon', () => {
    const previous = { entity: 'calendar.a', label: 'Work' };

    for (const typed of ['m', 'md', 'mdi', 'mdi:', 'mdi:c', 'mdi:calendar-check']) {
      const written = fromEntityFormData(
        'calendar.a',
        { label_type: 'text', label: typed },
        previous,
      ) as Types.EntityConfig;

      expect(written.label, typed).toBe(typed);
      // The box the user is typing into is still the box the form shows next.
      expect(toEntityFormData(written).label_type, typed).toBe('text');
    }

    // A calendar that never named a shape still reads it off the value, which is what
    // every configuration written before the key existed relies on.
    expect(toEntityFormData({ entity: 'calendar.a', label: 'mdi:c' }).label_type).toBe('icon');
  });

  /**
   * The whole back-compatibility claim in one place: a configuration written before
   * `label_type` existed resolves to exactly the shape it always did, and an edit that
   * does not change the label writes the same YAML back.
   */
  it('reads a shape off the value when the calendar names none', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['📅', 'text'],
      ['Familienkalender:', 'text'],
      ['mdi:home', 'icon'],
      ['phu:octopusenergy', 'icon'],
      ['/local/family.png', 'image'],
      ['holiday.JPEG', 'image'],
    ];

    for (const [label, shape] of cases) {
      const entry = { entity: 'calendar.a', label };
      expect(toEntityFormData(entry).label_type, label).toBe(shape);

      // Round-tripped untouched: no shape key appears, so the stored YAML is unchanged.
      expect(fromEntityFormData('calendar.a', toEntityFormData(entry), entry), label).toEqual(
        entry,
      );
    }

    // And a calendar with no label at all still reads as *None*.
    expect(toEntityFormData('calendar.a').label_type).toBe('none');
  });

  /**
   * A shape the card does not know is not a shape. `normalizeEntities` drops it, so the
   * value is read instead — a misspelling degrades to the pre-`label_type` behaviour
   * rather than to a blank control.
   */
  it('ignores a shape it does not recognise', () => {
    const [entry] = normalizeEntities([
      { entity: 'calendar.a', label: 'mdi:home', label_type: 'banana' },
    ] as unknown as Array<Types.EntityConfig>);

    expect(entry.label_type).toBeUndefined();
    expect(toEntityFormData(entry).label_type).toBe('icon');
  });

  /**
   * The claim the whole design rests on, tested rather than asserted: **no migration is
   * needed for a configuration that does not already carry `label_type`**, because absent
   * means *read the value*, so such a configuration is already a valid instance of the
   * model that has the key.
   *
   * The scope of that sentence is the honest part. A configuration that already spells
   * `label_type` — which no released version read, so it can only have been invented —
   * *does* change: the key is live now and wins over the value. That is the intended
   * behaviour of the key and there is no way to have both, so it is stated rather than
   * papered over.
   *
   * Worth pinning against a list rather than an argument, because the failure it guards
   * is silent: a label that resolved one way in v3 and another way here would change what
   * a dashboard draws with no error anywhere. The list is deliberately adversarial —
   * `label: ''`, no label at all, a stray icon colour on a text label.
   */
  it('leaves every configuration written before the shape key existed alone', () => {
    const legacy: ReadonlyArray<Record<string, unknown>> = [
      { entity: 'calendar.a', label: '📅' },
      { entity: 'calendar.a', label: 'Familienkalender: ' },
      { entity: 'calendar.a', label: 'mdi:home' },
      { entity: 'calendar.a', label: 'phu:octopusenergy' },
      { entity: 'calendar.a', label: '/local/x.png' },
      { entity: 'calendar.a', label: 'x.JPEG' },
      { entity: 'calendar.a', label: '' },
      { entity: 'calendar.a' },
      { entity: 'calendar.a', label: 'mdi:home', label_icon_color: '#f00' },
      { entity: 'calendar.a', label: '2024', color: '#0f0', accent_color: '#00f' },
      { entity: 'calendar.a', label: 'Work', show_time: false, compact_events_to_show: 3 },
      { entity: 'calendar.a', label: 'mdi:home', blocklist: 'Private', allowlist: 'X' },
    ];

    for (const raw of legacy) {
      const note = JSON.stringify(raw);
      const [normalized] = normalizeEntities([raw] as never);

      // What the card resolves is what the old code inferred, for every one of them.
      expect(resolveLabelType(normalized.label, normalized.label_type), note).toBe(
        resolveLabelType(normalized.label, undefined),
      );

      // And an edit that changes nothing writes the same entry back, with no shape key
      // invented for it.
      const entry = raw as unknown as Types.EntityConfig;
      const written = fromEntityFormData('calendar.a', toEntityFormData(entry), entry);

      const expected: Record<string, unknown> = { ...raw };
      // The two things the editor legitimately normalises: an empty label is absent, and
      // an icon colour on a label that is not an icon is inert and is not carried.
      if (expected.label === '') delete expected.label;
      if (resolveLabelType(expected.label, undefined) !== 'icon') delete expected.label_icon_color;

      expect(written, note).toEqual(Object.keys(expected).length === 1 ? 'calendar.a' : expected);
      expect(written, note).not.toHaveProperty('label_type');
    }
  });

  /**
   * Choosing a shape the current value cannot be must not leave the two glued together.
   * Switching a `Work` label to *Icon* used to seed `mdi:calendar` over it; with the
   * seeds gone the value was carried unchanged and marked an icon, which renders as
   * `<ha-icon icon="Work">` — a blank space where the label was.
   *
   * So a **transition** drops a value the new shape cannot render. That is not the seed
   * coming back: nothing is put in its place, and the control arrives empty. Only a real
   * dropdown move does this, so typing is never interfered with.
   */
  it('drops a value the shape it was moved to cannot render', () => {
    const previous = { entity: 'calendar.a', label: 'Work' };

    for (const type of ['icon', 'image']) {
      const moved = fromEntityFormData(
        'calendar.a',
        { ...toEntityFormData(previous), label_type: type },
        previous,
      ) as Types.EntityConfig;

      expect(moved.label, type).toBeUndefined();
      expect(moved.label_type, type).toBe(type);
    }

    // A value the new shape *can* render is kept, which is what makes switching away
    // and back non-destructive.
    const icon = { entity: 'calendar.a', label: 'mdi:home' };
    expect(
      fromEntityFormData('calendar.a', { ...toEntityFormData(icon), label_type: 'text' }, icon),
    ).toEqual({ entity: 'calendar.a', label: 'mdi:home', label_type: 'text' });

    // And any string is renderable as text, so nothing is ever lost moving to it.
    const image = { entity: 'calendar.a', label: '/local/x.png' };
    expect(
      (
        fromEntityFormData(
          'calendar.a',
          { ...toEntityFormData(image), label_type: 'text' },
          image,
        ) as Types.EntityConfig
      ).label,
    ).toBe('/local/x.png');
  });

  /**
   * The icon colour is dropped when the label stops being an icon — but only then. It
   * used to go on *any* edit to a calendar whose label was not an icon, so changing
   * `show_time` on a calendar carrying a stray colour from hand-written YAML deleted it
   * silently. An unrelated edit must not delete a setting the user cannot see.
   */
  it('drops the icon colour on the move away from an icon, and not before', () => {
    const iconned = { entity: 'calendar.a', label: 'mdi:home', label_icon_color: '#f00' };

    // The move away takes it.
    expect(
      fromEntityFormData(
        'calendar.a',
        { ...toEntityFormData(iconned), label_type: 'text' },
        iconned,
      ),
    ).toEqual({ entity: 'calendar.a', label: 'mdi:home', label_type: 'text' });

    // An unrelated edit does not.
    const strayed = { entity: 'calendar.a', label: '📅', label_icon_color: '#f00' };
    expect(
      fromEntityFormData(
        'calendar.a',
        { ...toEntityFormData(strayed), show_time: 'hide' },
        strayed,
      ),
    ).toEqual({ ...strayed, show_time: false });

    // Nor does an edit that leaves the label an icon.
    expect(fromEntityFormData('calendar.a', toEntityFormData(iconned), iconned)).toEqual(iconned);
  });

  it('carries the shape through a copy and paste', () => {
    const source = { entity: 'calendar.a', label_type: 'text' as const };
    copySettings(source);

    const pasted = pasteSettings(['calendar.b'], 0)[0] as Types.EntityConfig;
    expect(pasted).toEqual({ entity: 'calendar.b', label_type: 'text' });
    expect(toEntityFormData(pasted).label_type).toBe('text');
  });

  it('removes a per-calendar key again when its field is emptied', () => {
    const entities = writeEntity([{ entity: 'calendar.a', label: 'Work', color: '#f00' }], 0, {
      ...toEntityFormData({ entity: 'calendar.a', label: 'Work', color: '#f00' }),
      color: '',
    });

    expect(entities[0]).toEqual({ entity: 'calendar.a', label: 'Work' });
  });

  it('never stores a number field as text or as NaN', () => {
    expect(fromEntityFormData('calendar.a', { compact_events_to_show: '3' })).toEqual({
      entity: 'calendar.a',
      compact_events_to_show: 3,
    });

    expect(fromEntityFormData('calendar.a', { compact_events_to_show: 'x' })).toBe('calendar.a');
  });

  it('edits one calendar without disturbing the others, or their order', () => {
    const entities: Array<string | Types.EntityConfig> = [
      'calendar.a',
      { entity: 'calendar.b', label: 'Work' },
      'calendar.c',
    ];

    const next = writeEntity(entities, 1, {
      ...toEntityFormData(entities[1]),
      color: '#0f0',
    });

    expect(next).toEqual([
      'calendar.a',
      { entity: 'calendar.b', label: 'Work', color: '#0f0' },
      'calendar.c',
    ]);
  });

  /**
   * A blank list item in YAML is `null`, not absent, so this arrives from real
   * configurations. The editor is the one surface that has to survive reading a
   * configuration it did not write: throwing here takes the whole editor down and
   * leaves the user with no way to fix the list that caused it.
   */
  it('survives a null entry in the list rather than taking the editor down with it', () => {
    const broken = [null, 'calendar.a'] as unknown as Array<string | Types.EntityConfig>;

    expect(() => toEntityFormData(broken[0])).not.toThrow();
    expect(toEntityFormData(broken[0]).show_time).toBe('inherit');
    expect(() => copySettings(broken[0])).not.toThrow();
    expect(() => writeEntity(broken, 0, { label: 'x' })).not.toThrow();

    // The calendar beside it is untouched by the broken one being read.
    expect(writeEntity(broken, 0, { label: 'x' })[1]).toBe('calendar.a');
  });

  it('copies settings between calendars without carrying the entity id across', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: 'calendar.a', label: 'Work', color: '#f00' },
      'calendar.b',
    ];

    copySettings(entities[0]);
    expect(copiedSettings()).toEqual({ label: 'Work', color: '#f00' });

    const pasted = pasteSettings(entities, 1);

    expect(pasted[1]).toEqual({ entity: 'calendar.b', label: 'Work', color: '#f00' });
    expect(pasted[0]).toBe(entities[0]);
  });

  it('replaces the target settings on paste rather than merging into them', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: 'calendar.a', label: 'Work' },
      { entity: 'calendar.b', label: 'Home', color: '#00f' },
    ];

    copySettings(entities[0]);

    expect(pasteSettings(entities, 1)[1]).toEqual({ entity: 'calendar.b', label: 'Work' });
  });

  it('leaves the list alone when nothing has been copied', () => {
    const entities: Array<string | Types.EntityConfig> = ['calendar.a'];

    expect(pasteSettings(entities, 0)).toEqual(['calendar.a']);
  });

  /**
   * Per-entity and card-level `split_multiday_events` are the same word for two
   * different scopes. The card-level key is a real column override — `column:
   * { split_multiday_events: false }` skips the split entirely
   * (`viewForcesMultidaySplit` in `events.ts`) —
   * while the per-entity one is ignored in column view, because a column that omitted
   * the later days of an event would be a claim about a day that is not true.
   */
  it('says that a calendar own multi-day setting applies to the list layout', () => {
    expect(ENTITY_VIEW_SCOPE.split_multiday_events.has('list')).toBe(true);
    expect(ENTITY_VIEW_SCOPE.split_multiday_events.has('column')).toBe(false);

    const note = computeSubformHelper(
      'en',
      'column',
      { name: 'split_multiday_events', selector: { text: {} } },
      ['entity'],
      entityScopeFor('split_multiday_events'),
    );

    expect(note).toBeTypeOf('string');
    expect(VIEW_SCOPE.split_multiday_events).toBeUndefined();
  });

  /**
   * A per-calendar helper must not fall back to the card-level one. Four of these are
   * three-way where the card-level option is a switch, so the card-level sentence would
   * describe a control that is not on screen.
   */
  it('never lends a per-calendar field the card-level helper', () => {
    // `split_multiday_events` is the sharpest case: the card-level helper describes a
    // switch that applies to every calendar, and this control is a three-way that
    // applies to one — so borrowing it would describe neither.
    const helper = computeSubformHelper(
      'en',
      'list',
      { name: 'split_multiday_events', selector: { text: {} } },
      ['entity'],
    );

    expect(helper).toBeUndefined();
    expect(EDITOR_STRINGS['split_multiday_events.helper']).toBeTypeOf('string');
  });
});

describe('editor: the exceptions widget', () => {
  /** The eligible exception fields of one panel, for a configuration. */
  function eligibleFor(panelId: string, config: Types.Config = columnConfig()) {
    const panel = PANELS.find((entry) => entry.id === panelId)!;
    const ctx = { view: config.view, config, language: 'en' };
    return eligibleFields(panel.build(ctx), panel.id);
  }

  it('offers an exception only for options the card can resolve per view', () => {
    const offered = PANELS.flatMap((panel) => eligibleFor(panel.id).map((field) => field.name));

    for (const name of offered) {
      expect(COLUMN_OVERRIDE_KEYS as ReadonlyArray<string>, name).toContain(name);
    }
  });

  /**
   * Fetch-time options can never be per-view: switching layout at a viewport boundary
   * must not fire a Home Assistant API call. `weather` is claimed whole by that
   * boundary, sub-keys included.
   */
  it('offers no exception for anything that decides what is fetched', () => {
    const offered = new Set(
      PANELS.flatMap((panel) => eligibleFor(panel.id).map((field) => field.name)),
    );

    // `show_past_events` was in this list until it was traced to the API call and found
    // not to reach it: the fetch window starts at midnight of the reference date whatever
    // its value, so past events are always fetched and it only decides whether they
    // render. It is an exception the editor now offers, asserted just below.
    for (const key of ['entities', 'days_to_show', 'start_date', 'weather']) {
      expect(offered.has(key), key).toBe(false);
    }

    for (const key of ['show_past_events', 'filter_duplicates']) {
      expect(offered.has(key), key).toBe(true);
    }

    // The weather panel is the one whose every option is claimed by the boundary, so
    // it is the one that must offer nothing at all.
    expect(eligibleFor('weather')).toEqual([]);
  });

  it('gives an exception the same control as the option it overrides', () => {
    const events = PANELS.find((panel) => panel.id === 'events')!;
    const ctx = {
      view: 'column' as const,
      config: columnConfig({ show_location: true }),
      language: 'en',
    };
    const schema = events.build(ctx);

    const shared = [...walkSchema(schema)].find((entry) => entry.node.name === 'show_location')!
      .node as { selector: unknown };
    const exception = eligibleFields(schema, events.id).find(
      (field) => field.name === 'show_location',
    )!;

    expect(exception.selector).toEqual(shared.selector);
  });

  it('offers nothing at all in a view whose configuration is the top level', () => {
    const listConfig = buildConfig({ view: 'list' });
    const panel = PANELS.find((entry) => entry.id === 'events')!;

    expect(exceptionSubforms(panel, { view: 'list', config: listConfig, language: 'en' })).toEqual(
      [],
    );
  });

  it('shows an added exception at the value it would otherwise inherit', () => {
    const config = columnConfig({ event_font_size: '18px' });

    const block = exceptionFormBlock(config, ['event_font_size']);

    expect(block.event_font_size).toBe('18px');
  });

  /**
   * `show_empty_days` is the case that makes the projection necessary rather than
   * merely tidy: absent from the block, its effective value in column view is `true`,
   * so a control bound to the raw block would render unchecked and state the opposite
   * of what the card is doing.
   */
  it('shows a divergent column default as the column default, not the shared value', () => {
    const config = columnConfig({ show_empty_days: false });

    expect(exceptionFormBlock(config, ['show_empty_days']).show_empty_days).toBe(true);
  });

  it('stores nothing for an exception left equal to what it inherits', () => {
    const config = columnConfig({ event_font_size: '18px' });
    const block = exceptionFormBlock(config, ['event_font_size']);

    expect(
      toStoredConfig({ ...config, column: block as Types.ColumnOverrides }),
    ).not.toHaveProperty('column');
  });

  it('seeds the exceptions a configuration already sets, and nothing else', () => {
    const declared = declaredKeys(
      columnConfig({
        column: { event_font_size: '22px', min_day_width: 200 } as Types.ColumnOverrides,
      }),
    );

    expect([...declared]).toEqual(['event_font_size']);
  });

  it('reads exceptions out of every view block, not only the one on screen', () => {
    // A card switched to list view keeps its column block, so the exceptions it holds
    // must survive being looked at from the other view.
    const declared = declaredKeys(
      buildConfig({
        view: 'list',
        column: { event_font_size: '22px' } as Types.ColumnOverrides,
      }),
    );

    expect([...declared]).toEqual(['event_font_size']);
  });

  it('removes an exception by deleting the key, not by writing the shared value back', () => {
    const config = columnConfig({
      show_location: true,
      column: { show_location: false, event_font_size: '22px' } as Types.ColumnOverrides,
    });

    const next = removeException(config, 'column', 'show_location');

    expect(next.column).toEqual({ event_font_size: '22px' });
    expect(toStoredConfig(next).column).toEqual({ event_font_size: '22px' });
  });

  /**
   * The whole reason the widget is hand-written. `ha-form-optional_actions` has no
   * removal path at all, and force-promotes any key present in the data on every
   * update — so a field with a value could never be hidden again, and an exception
   * could never be taken away.
   */
  it('leaves no empty block behind when the last exception is removed', () => {
    const config = columnConfig({
      show_location: true,
      column: { show_location: false } as Types.ColumnOverrides,
    });

    const next = removeException(config, 'column', 'show_location');

    expect(next).not.toHaveProperty('column');
    expect(toStoredConfig(next)).not.toHaveProperty('column');
  });

  it('adds and removes through one control, and touches no other panel keys', () => {
    const config = columnConfig({
      column: { show_location: false, day_spacing: '20px' } as Types.ColumnOverrides,
    });

    const eligible = ['show_location', 'show_time'];
    const declared = new Set(['show_location', 'day_spacing']);

    const applied = applySelection(config, 'column', eligible, declared, ['show_time']);

    // Chosen: declared. Dropped: undeclared and deleted.
    expect(applied.declared.has('show_time')).toBe(true);
    expect(applied.declared.has('show_location')).toBe(false);
    expect(applied.config.column).toEqual({ day_spacing: '20px' });

    // Another panel's exception is untouched, because it was not offered here.
    expect(applied.declared.has('day_spacing')).toBe(true);
  });

  it('ignores a selection naming an option this panel does not own', () => {
    const config = columnConfig();
    const applied = applySelection(config, 'column', ['show_time'], new Set(), [
      'show_time',
      'day_spacing',
    ]);

    expect([...applied.declared]).toEqual(['show_time']);
  });

  it('declares every extra key it offers as a real, selectable override', () => {
    const layout = eligibleFor('layout').map((field) => field.name);

    // The two heights are edited through a mode dropdown, which chooses *which* key is
    // set and so cannot be an exception to one of them.
    expect(layout).toContain('height');
    expect(layout).toContain('max_height');

    for (const field of eligibleFor('layout')) {
      expect(COLUMN_OVERRIDE_KEYS as ReadonlyArray<string>, field.name).toContain(field.name);
      expect(field.selector, field.name).toBeTypeOf('object');
    }
  });

  /**
   * Coverage, stated as a set rather than as a number, so that a key leaving the
   * exceptions is a failing test rather than a thing nobody notices.
   *
   * The set is now empty, and getting it there is what E11 was. Three keys are stored as
   * a union no single selector can emit — `null | 'iso' | 'simple'`, `boolean | string`,
   * `string | boolean` — so each is edited through the same mode dropdown its panel uses,
   * pointed at the block rather than at the card. See `overrides.ts`.
   */
  it('offers an exception for every overridable option, unions included', () => {
    const swept = [
      columnConfig(),
      columnConfig({
        ...Object.fromEntries(
          Object.entries(DEFAULT_CONFIG)
            .filter(([, value]) => typeof value === 'boolean')
            .map(([key]) => [key, true]),
        ),
        view: 'column',
        show_week_numbers: 'iso',
      } as Partial<Types.Config>),
    ];

    const offered = new Set<string>();
    for (const config of swept) {
      for (const panel of PANELS) {
        for (const field of eligibleFor(panel.id, config)) offered.add(field.name);
      }
    }

    const missing = (COLUMN_OVERRIDE_KEYS as ReadonlyArray<string>).filter(
      (key) => !offered.has(key),
    );

    expect(missing.sort()).toEqual([]);
  });

  it('offers each option exactly once, in the panel that owns it', () => {
    const seen = new Map<string, string[]>();

    for (const panel of PANELS) {
      for (const field of eligibleFor(panel.id)) {
        seen.set(field.name, [...(seen.get(field.name) ?? []), panel.id]);
      }
    }

    const duplicated = [...seen.entries()].filter(([, panels]) => panels.length > 1);
    expect(duplicated).toEqual([]);
  });
});

describe('editor: the exceptions widget in the chassis', () => {
  async function mountColumn(config: Partial<Types.Config>) {
    const element = document.createElement(CHASSIS_TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig({ view: 'column', ...config } as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    const dispatched: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      dispatched.push((event as CustomEvent).detail.config);
    });

    return { element, dispatched };
  }

  it('adds no chrome to a card that has no exceptions', async () => {
    const { element } = await mountColumn({ entities: ['calendar.a'] });

    // One collapsed group per panel that owns an overridable option, and no fields
    // inside any of them until an exception is added.
    expect(element.shadowRoot!.querySelectorAll('ha-form.exception-form')).toHaveLength(0);
    expect(element.shadowRoot!.querySelectorAll('ha-form.exception-picker').length).toBeGreaterThan(
      0,
    );
  });

  /**
   * The design proposed seeding these two as exception rows, so that "column view has
   * already changed this for you" was visible. The intent is right and the placement
   * was not: it opens every column card with two rows it did not ask for. The statement
   * belongs beside the shared control instead, where it is a sentence rather than a row.
   */
  it('says that a column default has decided an option, without adding a row for it', () => {
    const note = computeHelper('en', 'column', {
      name: 'show_empty_days',
      selector: { boolean: {} },
    });

    expect(note).toBeTypeOf('string');
    expect(
      computeHelper('en', 'list', { name: 'show_empty_days', selector: { boolean: {} } }),
    ).not.toBe(note);

    expect([...declaredKeys(columnConfig())]).toEqual([]);
  });

  it('renders a field once an option is picked, and stores nothing for it yet', async () => {
    const { element, dispatched } = await mountColumn({ entities: ['calendar.a'] });

    const panelIndex = pickerIndexFor(element, 'event_font_size');
    await fire(
      element,
      'ha-form.exception-picker',
      { exceptions: ['event_font_size'] },
      panelIndex,
    );

    expect(element.shadowRoot!.querySelectorAll('ha-form.exception-form').length).toBeGreaterThan(
      0,
    );

    // Declaring an exception configures nothing: it starts out equal to the value it
    // inherits, and an override equal to what it inherits is not an override.
    expect(dispatched).toEqual([]);
  });

  it('stores the exception once its value differs, and only then', async () => {
    const { element, dispatched } = await mountColumn({ entities: ['calendar.a'] });

    const panelIndex = pickerIndexFor(element, 'event_font_size');
    await fire(
      element,
      'ha-form.exception-picker',
      { exceptions: ['event_font_size'] },
      panelIndex,
    );

    const formIndex = exceptionFormIndexFor(element, 'event_font_size');
    await fire(element, 'ha-form.exception-form', { event_font_size: '22px' }, formIndex);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].column).toEqual({ event_font_size: '22px' });
  });

  /**
   * The whole lifecycle, through the echo. Each step is covered in isolation above; what
   * this adds is Home Assistant answering every `config-changed` with a `setConfig`,
   * which is where the two halves of the widget have to agree.
   *
   * Step three is the one that needs it. An exception set back to the value it inherits
   * is stripped from storage — correctly, since it is no longer an exception — and the
   * echo of that write carries a configuration with no trace of it. If the rows were
   * derived from the stored block, the row would vanish under the cursor at the moment
   * the user typed the shared value back. They are derived from what was *declared*,
   * which the echo does not reset.
   */
  it('survives add, differ, revert and remove with Home Assistant echoing each write', async () => {
    const element = document.createElement(CHASSIS_TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig({ entities: ['calendar.a'], view: 'column' } as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    const dispatched: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      const config = (event as CustomEvent).detail.config as Types.Config;
      dispatched.push(config as unknown as Record<string, unknown>);
      element.setConfig(config);
    });

    const rowShown = () =>
      [...element.shadowRoot!.querySelectorAll('ha-form.exception-form')].some((form) =>
        schemaOf(form).some((node) => node.name === 'event_font_size'),
      );

    const pickerIndex = pickerIndexFor(element, 'event_font_size');

    await fire(
      element,
      'ha-form.exception-picker',
      { exceptions: ['event_font_size'] },
      pickerIndex,
    );
    expect(dispatched, 'declaring an exception configures nothing').toEqual([]);
    expect(rowShown()).toBe(true);

    const formIndex = exceptionFormIndexFor(element, 'event_font_size');
    await fire(element, 'ha-form.exception-form', { event_font_size: '22px' }, formIndex);
    expect(dispatched.at(-1)!.column).toEqual({ event_font_size: '22px' });

    // Set back to what it inherits: the key goes, the row stays.
    await fire(
      element,
      'ha-form.exception-form',
      { event_font_size: DEFAULT_CONFIG.event_font_size },
      formIndex,
    );
    expect(dispatched.at(-1)).not.toHaveProperty('column');
    expect(rowShown(), 'the row survives the echo of its own value being stripped').toBe(true);

    const current = (
      element.shadowRoot!.querySelectorAll('ha-form.exception-picker')[pickerIndex] as unknown as {
        data: { exceptions: string[] };
      }
    ).data.exceptions;

    await fire(
      element,
      'ha-form.exception-picker',
      { exceptions: current.filter((key) => key !== 'event_font_size') },
      pickerIndex,
    );
    expect(rowShown()).toBe(false);
  });

  it('deletes the key and the block when the exception is taken away again', async () => {
    const { element, dispatched } = await mountColumn({
      entities: ['calendar.a'],
      column: { event_font_size: '22px' } as Types.ColumnOverrides,
    });

    const panelIndex = pickerIndexFor(element, 'event_font_size');
    const current = (
      element.shadowRoot!.querySelectorAll('ha-form.exception-picker')[panelIndex] as unknown as {
        data: { exceptions: string[] };
      }
    ).data.exceptions;

    expect(current).toContain('event_font_size');

    await fire(
      element,
      'ha-form.exception-picker',
      { exceptions: current.filter((key) => key !== 'event_font_size') },
      panelIndex,
    );

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).not.toHaveProperty('column');
  });
});

/**
 * E11 — the three options whose stored value is a union of shapes.
 *
 * Each is edited through the same mode dropdown its own panel uses, pointed at the block
 * rather than at the card. What these pin is the one thing that genuinely differs
 * between the two scopes: **absent means the opposite**. At card level a missing key
 * takes the default, so *None* is written by removing it; inside an override block a
 * missing key inherits the shared value, so *None* has to be written as an explicit
 * value or the exception the user just asked for would silently disappear.
 */
describe('editor: exceptions for the union-typed options', () => {
  /** The eligible exception fields of one panel, for a configuration. */
  function eligibleFor(panelId: string, config: Types.Config) {
    const panel = PANELS.find((entry) => entry.id === panelId)!;
    const ctx = { view: config.view, config, language: 'en' };
    return eligibleFields(panel.build(ctx), panel.id, 'en');
  }

  /** The rows one declared exception renders, given a block. */
  function rowsFor(
    config: Types.Config,
    keys: string[],
    pending: Record<string, string> = {},
  ): HaFormSchema[] {
    const data = Overrides.overrideFormData(exceptionFormBlock(config, keys), keys, pending);

    return Overrides.expandFields(
      keys.map((name) => ({ name, selector: { text: {} } })),
      'en',
      data,
    );
  }

  /** Applies one change to the block, the way the chassis does. */
  function change(
    config: Types.Config,
    keys: string[],
    patch: Record<string, unknown>,
    pending: Record<string, string> = {},
  ) {
    const previous = Overrides.overrideFormData(exceptionFormBlock(config, keys), keys, pending);
    const stored = (config.column ?? {}) as Record<string, unknown>;

    return Overrides.applyOverrideChange(stored, previous, { ...previous, ...patch }, pending);
  }

  it('offers each of the three under its own name, not its mode field', () => {
    const config = columnConfig();

    for (const [panel, key] of [
      ['day_header', 'show_week_numbers'],
      ['day_header', 'today_indicator'],
      ['events', 'remove_location_country'],
    ] as const) {
      const names = eligibleFor(panel, config).map((field) => field.name);
      expect(names, key).toContain(key);
    }
  });

  it('labels the picker entry, and carries the real options for the search to match', () => {
    const field = eligibleFor('day_header', columnConfig()).find(
      (candidate) => candidate.name === 'show_week_numbers',
    )!;

    expect(computeLabel('en', field, ['column'])).toBe('Week Numbers');

    const options = (field.selector as { select: { options: SelectOption[] } }).select.options;
    expect(options.map((option) => option.label)).toEqual(['None', 'ISO 8601', 'Simple']);
  });

  it('renders the mode dropdown the panel would, not the raw config key', () => {
    const rows = rowsFor(columnConfig(), ['show_week_numbers']).map((node) => node.name);

    expect(rows).toEqual(['week_number_mode']);
  });

  it('shows the inherited shape when the exception is first declared', () => {
    const config = columnConfig({ show_week_numbers: 'iso' });
    const data = Overrides.overrideFormData(exceptionFormBlock(config, ['show_week_numbers']), [
      'show_week_numbers',
    ]);

    expect(data.week_number_mode).toBe('iso');
    // The raw key never reaches the form: it would ride back untouched on the next
    // change and mask whatever the dropdown wrote.
    expect(data).not.toHaveProperty('show_week_numbers');
  });

  /**
   * The correction this item turns on. `week_number_mode` writes `undefined` for *None*,
   * which is right for the card and wrong for a block — so an explicit `null` is written
   * instead, and `stripColumnDefaults` already declines to treat that as absent.
   */
  it('writes an explicit null for week numbers switched off in one view only', () => {
    const config = columnConfig({ show_week_numbers: 'iso' });
    const applied = change(config, ['show_week_numbers'], { week_number_mode: 'none' });

    expect(applied.block).toEqual({ show_week_numbers: null });
    expect(
      toStoredConfig({ ...config, column: applied.block as Types.ColumnOverrides }).column,
    ).toEqual({ show_week_numbers: null });
  });

  it('writes an explicit false for the other two switched off in one view only', () => {
    const indicator = change(columnConfig({ today_indicator: 'dot' }), ['today_indicator'], {
      today_indicator_style: 'none',
    });
    expect(indicator.block).toEqual({ today_indicator: false });

    const country = change(
      columnConfig({ remove_location_country: true }),
      ['remove_location_country'],
      { location_country_mode: 'keep' },
    );
    expect(country.block).toEqual({ remove_location_country: false });
  });

  it('stores nothing while an exception still matches what it inherits', () => {
    const config = columnConfig({ show_week_numbers: 'iso' });
    const applied = change(config, ['show_week_numbers'], { week_number_mode: 'iso' });

    expect(
      toStoredConfig({ ...config, column: applied.block as Types.ColumnOverrides }),
    ).not.toHaveProperty('column');
  });

  it('leaves the block alone until a declared exception is actually edited', () => {
    const config = columnConfig({ today_indicator: 'dot' });
    const applied = change(config, ['today_indicator'], {});

    expect(applied.block).toEqual({});
  });

  it('carries the value control the chosen shape calls for', () => {
    const icon = columnConfig({ column: { today_indicator: 'mdi:star' } as Types.ColumnOverrides });
    expect(rowsFor(icon, ['today_indicator']).map((node) => node.name)).toEqual([
      'today_indicator_style',
      'today_indicator_icon',
    ]);

    const custom = columnConfig({ column: { today_indicator: '⭐' } as Types.ColumnOverrides });
    expect(rowsFor(custom, ['today_indicator']).map((node) => node.name)).toEqual([
      'today_indicator_style',
      'today_indicator_custom',
    ]);

    const pattern = columnConfig({
      column: { remove_location_country: 'Germany' } as Types.ColumnOverrides,
    });
    expect(rowsFor(pattern, ['remove_location_country']).map((node) => node.name)).toEqual([
      'location_country_mode',
      'location_country_pattern',
    ]);
  });

  it('seeds a shape that has no value yet rather than leaving the control empty', () => {
    const config = columnConfig({ today_indicator: 'dot' });
    const applied = change(config, ['today_indicator'], { today_indicator_style: 'icon' });

    expect(String(applied.block.today_indicator)).toMatch(/^mdi:/);
  });

  /**
   * The same hold the card-level control uses, and needed for the same reason: an
   * unrecognised string classifies as a plain dot, so committing `star.pn` on the way to
   * `star.png` would switch the shape, take this very field away and store the fragment.
   */
  it('holds a half-typed value instead of reclassifying the shape under the cursor', () => {
    const config = columnConfig({ column: { today_indicator: '⭐' } as Types.ColumnOverrides });

    let pending: Record<string, string> = {};
    let current = config;

    for (const partial of ['s', 'st', 'star', 'star.pn']) {
      const applied = change(
        current,
        ['today_indicator'],
        { today_indicator_custom: partial },
        pending,
      );
      pending = applied.pending;
      current = { ...current, column: applied.block as Types.ColumnOverrides };

      expect(current.column!.today_indicator, partial).toBe('⭐');
      expect(pending['today_indicator_custom'], partial).toBe(partial);
      expect(
        rowsFor(current, ['today_indicator'], pending).map((node) => node.name),
        partial,
      ).toContain('today_indicator_custom');
    }

    const done = change(
      current,
      ['today_indicator'],
      { today_indicator_custom: 'star.png' },
      pending,
    );
    expect(done.block.today_indicator).toBe('star.png');
    expect(done.pending).not.toHaveProperty('today_indicator_custom');
  });

  /**
   * Held text is keyed under the block it belongs to. Without that, a card-level
   * `today_indicator_custom` mid-edit and a column-view one would be the same entry, and
   * whichever was typed last would appear in both fields.
   */
  it('keeps a block’s held text separate from the card’s', () => {
    const pending = { today_indicator_custom: 'card', 'column.today_indicator_custom': 'block' };

    expect(Overrides.pendingForBlock(pending, 'column')).toEqual({
      today_indicator_custom: 'block',
    });

    expect(
      Overrides.mergeBlockPending(pending, 'column', { today_indicator_custom: 'next' }),
    ).toEqual({
      today_indicator_custom: 'card',
      'column.today_indicator_custom': 'next',
    });
  });

  /**
   * Each panel renders its own exceptions form bound to the same block, so a form only
   * ever knows about its own rows. The raw union keys are stripped from the data it
   * binds, which would be destructive if the write replaced the block — it does not: it
   * diffs against the **stored** block and writes only what moved, which is why another
   * panel's exception survives an edit here rather than being deleted by omission.
   */
  it('leaves another panel’s exception alone when this one is edited', () => {
    const config = columnConfig({
      show_week_numbers: 'iso',
      column: { today_indicator: 'pulse' } as Types.ColumnOverrides,
    });

    const applied = change(config, ['show_week_numbers'], { week_number_mode: 'simple' });

    expect(applied.block).toEqual({ today_indicator: 'pulse', show_week_numbers: 'simple' });
  });

  it('never lets a stand-in field reach the stored configuration', () => {
    const config = columnConfig({ show_week_numbers: 'iso' });
    const applied = change(config, ['show_week_numbers'], { week_number_mode: 'simple' });

    expect(Object.keys(applied.block)).toEqual(['show_week_numbers']);

    // And the write path refuses one that arrived by any other route.
    const stored = toStoredConfig({
      ...config,
      column: { show_week_numbers: 'simple', week_number_mode: 'simple' } as Types.ColumnOverrides,
    });
    expect(stored.column).toEqual({ show_week_numbers: 'simple' });
  });

  it('edits one through the chassis, end to end', async () => {
    const element = document.createElement(CHASSIS_TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig({
      entities: ['calendar.a'],
      view: 'column',
      show_week_numbers: 'iso',
    } as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    const dispatched: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      const config = (event as CustomEvent).detail.config as Types.Config;
      dispatched.push(config as unknown as Record<string, unknown>);
      element.setConfig(config);
    });

    const pickerIndex = pickerIndexFor(element, 'show_week_numbers');
    expect(pickerIndex).toBeGreaterThanOrEqual(0);

    await fire(
      element,
      'ha-form.exception-picker',
      { exceptions: ['show_week_numbers'] },
      pickerIndex,
    );
    expect(dispatched, 'declaring an exception configures nothing').toEqual([]);

    const formIndex = exceptionFormIndexFor(element, 'week_number_mode');
    expect(formIndex).toBeGreaterThanOrEqual(0);

    await fire(element, 'ha-form.exception-form', { week_number_mode: 'none' }, formIndex);

    expect(dispatched.at(-1)!.column).toEqual({ show_week_numbers: null });

    // The row survives the echo, and still shows the shape that was chosen.
    const data = (
      element.shadowRoot!.querySelectorAll('ha-form.exception-form')[formIndex] as unknown as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data.week_number_mode).toBe('none');
  });
});

/**
 * An enumerated option has two independent surfaces: the type union in `types.ts` that
 * defines its vocabulary, and the visual editor's dropdown that offers it. `check:docs`
 * pins the union against the reference table, so a value cannot be added to the type
 * without being documented — but nothing pinned it against the editor. A value could be
 * added to the union, documented, and still be unselectable in the UI, which is how a
 * reader ends up shown an option the editor will not let them choose.
 */
/**
 * Every dropdown the editor builds, across the configurations that surface them all.
 *
 * A panel only offers what the configuration in front of it calls for, so the weather
 * and column dropdowns exist only once those features are configured.
 *
 * Sub-forms are walked too, and their fields are keyed by path — `entity.days_of_week`
 * rather than `days_of_week`. Without the prefix a per-calendar dropdown would overwrite
 * the card-level one of the same name, silently swapping which surface each case below
 * asserts about; `event_type` exists on both, and the per-calendar copy carries an extra
 * `inherit`. Sub-forms went unwalked entirely until a per-calendar-only option needed
 * checking, so `event_type` was passing on its card-level dropdown alone.
 *
 * @returns Each dropdown's field name, path-qualified for sub-forms, mapped to its values
 */
function editorOptions(): Map<string, string[]> {
  const configs = [
    buildConfig({}),
    buildConfig({ view: 'column' }),
    buildConfig({ weather: { entity: 'weather.home' } }),
    buildConfig({ view: 'column', weather: { entity: 'weather.home' } }),
  ] as Types.Config[];

  const found = new Map<string, string[]>();

  const collect = (schema: ReadonlyArray<HaFormSchema>, prefix: string) => {
    for (const { node } of walkSchema(schema)) {
      const options = (node as { selector?: { select?: { options?: unknown[] } } }).selector?.select
        ?.options;
      if (!node.name || !options) continue;

      found.set(
        prefix + node.name,
        options.map((option) =>
          typeof option === 'string' ? option : (option as SelectOption).value,
        ),
      );
    }
  };

  for (const config of configs) {
    const ctx = { view: config.view, config, language: 'en' };

    for (const panel of PANELS) {
      collect(panel.build(ctx), '');

      for (const subform of panel.subforms?.(ctx) ?? []) {
        collect(subform.schema, `${subform.path.join('.')}.`);
      }
    }
  }
  return found;
}

describe('editor: enumerated options offer their whole vocabulary', () => {
  /**
   * Where the editor surfaces each enumerated config key, and any value that exists only
   * in the editor because the union spells it a way a dropdown cannot.
   */
  const EDITOR_FIELD: Record<string, { field: string; editorOnly?: readonly string[] }> = {
    view: { field: 'view' },
    first_day_of_week: { field: 'first_day_of_week' },
    // The union's third member is `null`, which is not a string literal and which the
    // editor spells `none` because a dropdown cannot offer an absent value.
    show_week_numbers: { field: 'week_number_mode', editorOnly: ['none'] },
    position: { field: 'position' },
    min_days_fallback: { field: 'min_days_fallback' },
    // Card-level and per-calendar share the field name. The per-calendar dropdown adds
    // `inherit`, which is the absent key rather than a mode of its own, so the card-level
    // control is the one whose vocabulary must match the union exactly.
    event_type: { field: 'event_type' },
    // Per-calendar only, so the only dropdown of this name is the one carrying `inherit`.
    // Unlike `event_type` there is no card-level control to compare against, and unlike
    // `event_type` the union has no `all`: absent *is* every day, and `inherit` is how a
    // dropdown spells absent — the same accommodation `show_week_numbers` needs for `null`.
    days_of_week: { field: 'entity.days_of_week', editorOnly: ['inherit'] },
  };

  /**
   * Every enumerated config option, read from the types rather than listed, so a new one
   * is discovered instead of quietly going unchecked.
   *
   * @returns Each option's name mapped to the string literals its union allows
   */
  function unionValues(): Map<string, string[]> {
    const source = readFileSync(join(process.cwd(), 'src/config/types.ts'), 'utf-8');
    const literals = (text: string) =>
      (text.match(/'[a-z0-9_-]+'/g) ?? []).map((s) => s.slice(1, -1));

    const aliases = new Map<string, string[]>();
    for (const match of source.matchAll(/^export type ([A-Za-z]+)\s*=\s*([^;]+);/gm)) {
      const values = literals(match[2]);
      if (match[2].includes('|') && values.length > 1) aliases.set(match[1], values);
    }

    const found = new Map<string, string[]>();
    for (const name of ['Config', 'EntityConfig', 'WeatherConfig', 'ColumnOverrides']) {
      const block = source.match(new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
      if (!block) continue;

      for (const line of block[1].split('\n')) {
        const field = line.match(/^ {2}([a-z0-9_]+)\??:\s*(.+?);/);
        if (!field) continue;

        const type = field[2].trim();
        const values = type.includes('|') ? literals(type) : (aliases.get(type) ?? []);
        if (values.length > 1) found.set(field[1], values);
      }
    }
    return found;
  }

  it('maps every enumerated option the types declare', () => {
    // Discovered rather than listed, so adding a sixth enumerated option fails here
    // instead of silently skipping the vocabulary check below.
    expect([...unionValues().keys()].sort()).toEqual(Object.keys(EDITOR_FIELD).sort());
  });

  it.each(Object.entries(EDITOR_FIELD))(
    'offers every value %s accepts',
    (option, { field, editorOnly = [] }) => {
      const expected = [...unionValues().get(option)!, ...editorOnly].sort();
      const offered = editorOptions().get(field);

      expect(offered, `the editor builds no dropdown named ${field}`).toBeDefined();
      expect([...offered!].sort()).toEqual(expected);
    },
  );
});

describe('editor: every enumerated synthetic option is selectable', () => {
  /**
   * A synthetic dropdown has no config key of its own; it derives a mode from whatever the
   * card actually stores, and turns a pick back into that storage. Both halves are
   * hand-written per field, so the vocabulary check above can pass while a value that is
   * offered stores nothing the derive step recognises. The user then picks an option and
   * watches the form snap back to the one they left.
   *
   * @returns Each synthetic dropdown's field name paired with the values it offers
   */
  function syntheticDropdowns(): Array<[string, string[]]> {
    return [...editorOptions()].filter(([name]) => name in SYNTHETIC_FIELDS);
  }

  /**
   * Performs the edit a user makes by choosing one dropdown value.
   *
   * @param config - Configuration the form was rendered from
   * @param pending - Uncommitted text held for synthetic fields
   * @param field - Synthetic dropdown being changed
   * @param value - Value the user picked
   * @returns The configuration and pending text after the edit
   */
  function pick(
    config: Types.Config,
    pending: Record<string, string>,
    field: string,
    value: string,
  ) {
    const before = { ...config, ...deriveSyntheticData(config, pending) } as Record<
      string,
      unknown
    >;

    return applyFormChange(config, before, { ...before, [field]: value }, pending);
  }

  it('pins which dropdowns store through a synthetic field', () => {
    // Discovered rather than listed, so a new synthetic dropdown is covered below the
    // moment it is added instead of being silently skipped.
    expect(
      syntheticDropdowns()
        .map(([name]) => name)
        .sort(),
    ).toEqual([
      'accent_color_mode',
      'height_mode',
      'language_mode',
      'location_country_mode',
      'start_date_mode',
      'time_format',
      'today_indicator_style',
      'week_number_mode',
    ]);
  });

  it.each(syntheticDropdowns())(
    'shows %s back after picking it from any other value',
    (field, values) => {
      for (const from of values) {
        for (const to of values) {
          const entered = pick(DEFAULT_CONFIG as Types.Config, {}, field, from);

          // Without this the loop below would compare every transition against the default
          // state, and would still pass with the whole store half broken.
          expect(
            deriveSyntheticData(entered.config, entered.pending)[field],
            `${field} never reached ${from}`,
          ).toBe(from);

          const moved = pick(entered.config, entered.pending, field, to);

          expect(
            deriveSyntheticData(moved.config, moved.pending)[field],
            `${field}: picking ${to} while on ${from}`,
          ).toBe(to);
        }
      }
    },
  );
});
