import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG, DEPRECATED_CONFIG_MAP } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  COLUMN_DEFAULTS,
  COLUMN_DEFAULT_OVERRIDES,
  VIEWS,
  VIEW_SCOPE,
  appliesToView,
  describeColumnLayoutBands,
  resolveColumnFit,
} from '../src/config/view';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema, SelectOption } from '../src/rendering/editor/ha-form';
import { applicabilityNote, computeHelper, computeLabel } from '../src/rendering/editor/localize';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { buildDayHeaderSchema } from '../src/rendering/editor/schemas/day-header';
import { buildLayoutSchema, widthTableRows } from '../src/rendering/editor/schemas/layout';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import {
  deriveSyntheticData,
  isCommittableOffset,
  isSyntheticKey,
} from '../src/rendering/editor/synthetic';
import {
  applyFormChange,
  changedKeys,
  columnFormBlock,
  stripColumnDefaults,
  toStoredConfig,
} from '../src/rendering/editor/value';
import { memoizeLast } from '../src/utils/helpers';

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
   * defined, because `DEFAULT_CONFIG` supplies it. Left alone, the first edit of any
   * kind would write twenty default weather keys into the user's YAML.
   */
  it('does not write the default weather block into an untouched config', () => {
    expect(toStoredConfig(buildConfig())).not.toHaveProperty('weather');
  });

  it('writes a configured weather block whole rather than stripping its defaults', () => {
    const weather = {
      ...DEFAULT_CONFIG.weather,
      entity: 'weather.home',
    } as Types.WeatherConfig;

    const stored = toStoredConfig(buildConfig({ weather }));

    expect(stored.weather).toEqual(weather);
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

  it('prunes the per-entity key the same cleanup removed', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.personal', max_events_to_show: 3 } as Types.EntityConfig],
    });

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
      const target = element.shadowRoot!.querySelectorAll('ha-form')[panelIndex];
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

    const form = element.shadowRoot!.querySelector('ha-form')!;
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

    expect(element.shadowRoot!.querySelectorAll('ha-form')).toHaveLength(PANELS.length);
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
    const contentForm = () => element.shadowRoot!.querySelectorAll('ha-form')[panelIndex];
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

    // `weather` and `column` are containers whose members are offered individually,
    // and `view` is offered by the Layout panel under its own name.
    const containers = new Set(['weather', 'column']);

    const missing = Object.keys(DEFAULT_CONFIG).filter((key) => {
      if (containers.has(key)) return false;
      return !offered.has(key) && !offered.has(standIns[key] ?? key);
    });

    expect(missing).toEqual([]);
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

      expect(computeHelper('en', 'column', node, path), titleKey).toBe(expected);
    }
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
