/**
 * Converts merged form data back into stored configuration.
 * Defaults are stripped on write so opening the editor does not persist values the user never set.
 */

import { applySyntheticChange, isSyntheticKey } from './synthetic';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

const ATOMIC_KEYS = ['tap_action', 'hold_action'] as const;

/** The nested groups of a `weather:` block, each defaulted option by option. */
const WEATHER_GROUPS = ['date', 'event'] as const;

/**
 * Structural comparison, enough for the small plain objects a config holds.
 *
 * @param a - One value
 * @param b - The other
 * @returns `true` when the two are structurally identical
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * Whether two stored configurations are the same configuration.
 *
 * @param a - One configuration
 * @param b - The other
 * @returns `true` when they would produce an identical card
 */
export function equalConfigs(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  return deepEqual(a, b);
}

/**
 * Names the keys that differ between two form-data objects.
 *
 * @param previous - Form data as it was rendered
 * @param next - Form data as returned by the form
 * @returns Keys present in one and not the other, or holding different values
 */
export function changedKeys(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  return [...keys].filter((key) => !deepEqual(previous[key], next[key]));
}

/**
 * The value an override key resolves to when the `column:` block does not supply it.
 *
 * @param config - Merged configuration, defaults already applied
 * @param key - Override key
 * @returns The inherited value
 */
function inheritedColumnValue(
  config: Readonly<Types.Config>,
  key: keyof Types.ColumnOverrides & keyof Types.Config,
): unknown {
  return ViewConfig.COLUMN_DEFAULT_OVERRIDES[key] ?? config[key];
}

function inheritedGridValue(
  config: Readonly<Types.Config>,
  key: keyof Types.GridOverrides & keyof Types.Config,
): unknown {
  return ViewConfig.GRID_DEFAULT_OVERRIDES[key] ?? config[key];
}

/**
 * The value an override key resolves to when a view block does not supply it.
 *
 * @param config - Merged configuration, defaults already applied
 * @param view - View whose block is being edited
 * @param key - Override key
 * @returns The inherited or divergent view default
 */
function inheritedViewValue(
  config: Readonly<Types.Config>,
  view: Types.EffectiveView,
  key: string,
): unknown {
  return view === 'grid'
    ? inheritedGridValue(config, key as keyof Types.GridOverrides & keyof Types.Config)
    : inheritedColumnValue(config, key as keyof Types.ColumnOverrides & keyof Types.Config);
}

/**
 * Strips redundant entries from a `column:` block.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The minimal block, or `undefined` when nothing in it is doing anything
 */
export function stripColumnDefaults(
  config: Readonly<Types.Config>,
): Record<string, unknown> | undefined {
  const block = config.column;

  if (!Helpers.isConfigBlock(block)) {
    return undefined;
  }

  const overrideKeys = new Set<string>(ViewConfig.COLUMN_OVERRIDE_KEYS);
  const columnDefaults = ViewConfig.COLUMN_DEFAULTS as Readonly<Record<string, unknown>>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    if (value === undefined) continue;

    if (isSyntheticKey(key)) continue;

    if (key === 'min_days_to_show') {
      if (resolvesTheSameWithout(config, key)) continue;
      result[key] = value;
      continue;
    }

    if (key in columnDefaults) {
      // Compare what the key will actually resolve to, not what was typed: the render path
      // coerces before use, so `"140"` and `140` are the same setting and neither is worth
      // storing when it matches the default.
      const resolved = ViewConfig.normalizeColumnValue(
        key as keyof typeof ViewConfig.COLUMN_DEFAULTS,
        value,
      );
      if (deepEqual(columnDefaults[key], resolved)) continue;
      result[key] = value;
      continue;
    }

    if (overrideKeys.has(key)) {
      const inherited = inheritedColumnValue(
        config,
        key as keyof Types.ColumnOverrides & keyof Types.Config,
      );
      if (deepEqual(inherited, value)) continue;
      result[key] = value;
      continue;
    }

    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Whether removing an override leaves the resolved column floor unchanged.
 *
 * @param config - Merged configuration, defaults already applied
 * @param key - Override key to test
 * @returns `true` when the line is doing nothing
 */
function resolvesTheSameWithout(config: Readonly<Types.Config>, key: string): boolean {
  const without = { ...(config.column as Record<string, unknown>) };
  delete without[key];

  return (
    ViewConfig.resolveMinDaysToShow(config) ===
    ViewConfig.resolveMinDaysToShow({
      ...config,
      column: without as Types.ColumnOverrides,
    })
  );
}

export function stripGridDefaults(
  config: Readonly<Types.Config>,
): Record<string, unknown> | undefined {
  const block = config.grid;

  if (!Helpers.isConfigBlock(block)) {
    return undefined;
  }

  const overrideKeys = new Set<string>(ViewConfig.GRID_OVERRIDE_KEYS);
  const gridDefaults = ViewConfig.GRID_DEFAULTS as Readonly<Record<string, unknown>>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (isSyntheticKey(key)) continue;

    if (key in gridDefaults) {
      const resolved = ViewConfig.normalizeGridValue(
        key as keyof typeof ViewConfig.GRID_DEFAULTS,
        value,
      );
      if (deepEqual(gridDefaults[key], resolved)) continue;
      result[key] = resolved;
      continue;
    }

    if (overrideKeys.has(key)) {
      const inherited = inheritedGridValue(
        config,
        key as keyof Types.GridOverrides & keyof Types.Config,
      );
      if (deepEqual(inherited, value)) continue;
      result[key] = value;
      continue;
    }

    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Removes the config keys that v3.0.0 deleted from the runtime.
 *
 * @param draft - Config being prepared for writing, mutated in place
 */
function pruneDeprecatedKeys(draft: Record<string, unknown>): void {
  for (const key of Object.keys(Config.DEPRECATED_CONFIG_MAP)) {
    delete draft[key];
  }

  if (!Array.isArray(draft.entities)) return;

  draft.entities = draft.entities.map((entity) => {
    if (typeof entity !== 'object' || entity === null) return entity;

    const entry = { ...(entity as Record<string, unknown>) };
    for (const key of Object.keys(Config.DEPRECATED_ENTITY_CONFIG_MAP)) {
      delete entry[key];
    }
    return entry;
  });
}

/**
 * Reduces a merged configuration to the smallest one that renders identically.
 *
 * @param config - Merged configuration as the form sees it
 * @returns The configuration to store
 */
export function toStoredConfig(config: Readonly<Types.Config>): Record<string, unknown> {
  const draft = { ...(config as unknown as Record<string, unknown>) };

  for (const key of Object.keys(draft)) {
    if (isSyntheticKey(key)) delete draft[key];
  }

  pruneDeprecatedKeys(draft);

  const atomic = ATOMIC_KEYS.map((key) => [key, draft[key]] as const);
  for (const [key] of atomic) delete draft[key];

  const column = stripColumnDefaults(config);
  delete draft.column;

  const grid = stripGridDefaults(config);
  delete draft.grid;

  const weather = stripWeatherDefaults(config);
  delete draft.weather;

  const stored = Helpers.filterDefaultValues(
    draft,
    Config.DEFAULT_CONFIG as unknown as Record<string, unknown>,
  );

  for (const [key, value] of atomic) {
    if (value !== undefined && !deepEqual(value, Config.DEFAULT_CONFIG[key])) {
      stored[key] = value;
    }
  }

  if (column !== undefined) {
    stored.column = column;
  }

  if (grid !== undefined) {
    stored.grid = grid;
  }

  if (weather !== undefined) {
    stored.weather = weather;
  }

  return stored;
}

interface FormApplication {
  config: Types.Config;
  pending: Record<string, string>;
}

/**
 * Folds one `value-changed` from the form into the configuration.
 *
 * @param config - Merged configuration before the edit
 * @param previousData - Form data as it was rendered
 * @param nextData - Form data as returned by the form
 * @param pending - Uncommitted text held for synthetic fields
 * @returns The configuration and pending text after the edit
 */
export function applyFormChange(
  config: Readonly<Types.Config>,
  previousData: Readonly<Record<string, unknown>>,
  nextData: Readonly<Record<string, unknown>>,
  pending: Readonly<Record<string, string>>,
): FormApplication {
  const next = { ...(config as unknown as Record<string, unknown>) };
  const nextPending: Record<string, string> = { ...pending };

  const write = (key: string, value: unknown): void => {
    if (value === undefined) {
      delete next[key];
      return;
    }
    next[key] = value;
  };

  for (const key of changedKeys(previousData, nextData)) {
    if (!isSyntheticKey(key)) {
      write(key, nextData[key]);
      continue;
    }

    const result = applySyntheticChange(key, nextData[key], next as unknown as Types.Config);

    for (const [changedKey, value] of Object.entries(result.changes)) {
      write(changedKey, value);
    }

    for (const [pendingKey, text] of Object.entries(result.pending ?? {})) {
      if (text === null) {
        delete nextPending[pendingKey];
      } else {
        nextPending[pendingKey] = text;
      }
    }
  }

  return { config: next as unknown as Types.Config, pending: nextPending };
}

/**
 * Builds the `column:` block as the form should show it.
 *
 * Two layers, and the order matters. The projection resolves every column-only key to
 * what the card would actually use, so an option the user never set shows its effective
 * value rather than blank. The stored block then goes back on top.
 *
 * 🚨 That second spread is load-bearing and was missing for a while. `COLUMN_DEFAULTS`
 * holds only the column-*only* keys; the sixty-odd members of `COLUMN_OVERRIDE_KEYS` are
 * a disjoint set, so a projection over `COLUMN_DEFAULTS` alone cannot see an override the
 * user stored. The panel binds this whole object as one expandable `ha-form` field and
 * writes it back wholesale on any change, so a key absent here is a key deleted from
 * their YAML the moment they touch an unrelated slider. It is silent, it hits column as
 * well as grid, and no test caught it because every fixture stored a `COLUMN_DEFAULTS`
 * key, which the projection reproduces by accident.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The block, with every unset option at its effective value
 */
export function columnFormBlock(config: Readonly<Types.Config>): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      Object.keys(ViewConfig.COLUMN_DEFAULTS).map((key) => [
        key,
        ViewConfig.resolveColumnOption(
          config as Types.Config,
          key as keyof typeof ViewConfig.COLUMN_DEFAULTS,
        ),
      ]),
    ),
    min_days_to_show: ViewConfig.resolveMinDaysToShow(config),
    ...(config.column ?? {}),
  };
}

/**
 * Builds the `grid:` block as the form should show it.
 *
 * Same two layers as {@link columnFormBlock}, and the same reason the stored spread has
 * to come last.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The block, with every unset option at its effective value
 */
export function gridFormBlock(config: Readonly<Types.Config>): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      Object.keys(ViewConfig.GRID_DEFAULTS).map((key) => [
        key,
        ViewConfig.resolveGridOption(
          config as Types.Config,
          key as keyof typeof ViewConfig.GRID_DEFAULTS,
        ),
      ]),
    ),
    min_days_to_show: ViewConfig.resolveMinDaysToShow(config, 'grid'),
    ...(config.grid ?? {}),
  };
}

/**
 * Builds the `weather:` block as the form should show it.
 *
 * The card reads every nested weather option as `!== false`, so an omitted one
 * renders as its default. Binding the block raw would therefore show the five
 * default-on toggles unchecked while the card draws them enabled. Merging the
 * defaults in mirrors {@link columnFormBlock}; {@link stripWeatherDefaults}
 * takes them back out on write, so the stored block stays minimal.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The block, with every unset option at its effective value
 */
export function weatherFormBlock(config: Readonly<Types.Config>): Record<string, unknown> {
  const defaults = Config.DEFAULT_CONFIG.weather ?? {};
  const stored = (config.weather ?? {}) as Record<string, unknown>;
  const block: Record<string, unknown> = { ...defaults, ...stored };

  for (const group of WEATHER_GROUPS) {
    const nested = stored[group];
    block[group] = {
      ...(defaults[group] ?? {}),
      ...(Helpers.isConfigBlock(nested) ? nested : {}),
    };
  }

  return block;
}

/**
 * Strips redundant entries from a `weather:` block.
 *
 * The counterpart to {@link weatherFormBlock}: the form binds every defaulted
 * option, so without this every edit would persist the whole block.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The minimal block, or `undefined` when nothing in it is doing anything
 */
export function stripWeatherDefaults(
  config: Readonly<Types.Config>,
): Record<string, unknown> | undefined {
  const block = config.weather;

  if (!Helpers.isConfigBlock(block)) {
    return undefined;
  }

  const defaults = (Config.DEFAULT_CONFIG.weather ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    if (value === undefined) continue;

    if ((WEATHER_GROUPS as readonly string[]).includes(key)) {
      if (!Helpers.isConfigBlock(value)) continue;

      const groupDefaults = (defaults[key] ?? {}) as Record<string, unknown>;
      const group: Record<string, unknown> = {};

      for (const [option, setting] of Object.entries(value)) {
        if (setting === undefined) continue;
        if (deepEqual(groupDefaults[option], setting)) continue;
        group[option] = setting;
      }

      if (Object.keys(group).length > 0) result[key] = group;
      continue;
    }

    if (deepEqual(defaults[key], value)) continue;
    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Builds the block as the exceptions widget should show it.
 *
 * @param config - Merged configuration, defaults already applied
 * @param keys - Options currently declared as exceptions
 * @returns The block, with every declared exception at its effective value
 */
export function exceptionFormBlock(
  config: Readonly<Types.Config>,
  view: Types.EffectiveView,
  keys: ReadonlyArray<string>,
): Record<string, unknown> {
  const block = view === 'grid' ? gridFormBlock(config) : columnFormBlock(config);
  const blockKey = ViewConfig.OVERRIDE_BLOCK_BY_VIEW[view];
  const stored =
    blockKey !== undefined && Helpers.isConfigBlock(config[blockKey])
      ? (config[blockKey] as Record<string, unknown>)
      : {};

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(stored, key) && stored[key] !== undefined) {
      block[key] = stored[key];
      continue;
    }

    block[key] = inheritedViewValue(config, view, key);
  }

  return block;
}
