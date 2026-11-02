/**
 * Converts merged form data back into stored configuration.
 * Defaults are stripped on write so opening the editor does not persist values the user never
 * set, and a value the YAML already holds is kept unless the write changed it.
 */

import { LEGEND_OFF, normalizeRootValue } from './normalize';
import { applySyntheticChange, isSet, isSyntheticKey } from './synthetic';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

/**
 * Options stored as whole objects rather than option by option.
 *
 * Exported so a reconciliation can name them without re-listing them. A second copy is
 * one more thing to forget, and forgetting is the failure mode these tables have.
 */
export const ATOMIC_KEYS = ['tap_action', 'hold_action', 'event_tap_action'] as const;

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
 * Whether a value is one the stored YAML already holds, unchanged, at this key.
 *
 * 🚨 This is the one exception to minimizing on write, and it is what keeps an explicit
 * `show_month: true` from disappearing when someone edits the title. A default-valued line
 * changes nothing today, but it pins the card against a later change of that default, and
 * the person who wrote it may have meant exactly that. The editor cannot tell, so it leaves
 * the line alone until the person edits that option.
 *
 * The baseline is the YAML as the editor last received or wrote it, never the merged
 * configuration, where every default is present. It moves with each write, so an option
 * edited back to its default is minimized as before: the line was changed, and the change
 * is what decides. An unset value — absent, null or empty — is never kept by this; it was
 * not a setting.
 *
 * @param authored - The stored block or configuration this value belongs to, if any
 * @param key - Key within it
 * @param value - The value about to be written
 * @returns `true` when the YAML holds this exact value at this key
 */
function unchangedFromAuthored(authored: unknown, key: string, value: unknown): boolean {
  return (
    Helpers.isConfigBlock(authored) &&
    Object.prototype.hasOwnProperty.call(authored, key) &&
    isSet(value) &&
    deepEqual(authored[key], value)
  );
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

function inheritedTimeGridValue(
  config: Readonly<Types.Config>,
  key: keyof Types.TimeGridOverrides & keyof Types.Config,
): unknown {
  return ViewConfig.TIME_GRID_DEFAULT_OVERRIDES[key] ?? config[key];
}

/**
 * Strips redundant entries from a `column:` block.
 *
 * @param config - Merged configuration, defaults already applied
 * @param authored - The `column:` block as the YAML holds it; an entry it holds unchanged is
 *   kept even where it equals what it would resolve to without it
 * @returns The minimal block, or `undefined` when nothing in it is doing anything
 */
export function stripColumnDefaults(
  config: Readonly<Types.Config>,
  authored?: unknown,
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
    if (key === 'past_event_opacity' && Config.toValidPercentage(value) === undefined) continue;

    if (isSyntheticKey(key)) continue;

    const kept = unchangedFromAuthored(authored, key, value);

    if (key === 'min_days_to_show') {
      if (!kept && resolvesTheSameWithout(config, key)) continue;
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
      if (!kept && deepEqual(columnDefaults[key], resolved)) continue;
      result[key] = value;
      continue;
    }

    if (overrideKeys.has(key)) {
      const inherited = inheritedColumnValue(
        config,
        key as keyof Types.ColumnOverrides & keyof Types.Config,
      );
      if (!kept && deepEqual(normalizeRootValue(key, inherited), normalizeRootValue(key, value)))
        continue;
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

/**
 * Strips redundant entries from a `time_grid:` block.
 *
 * @param config - Merged configuration, defaults already applied
 * @param authored - The `time_grid:` block as the YAML holds it; an entry it holds unchanged
 *   is kept, as written, even where it equals the default or the inherited value
 * @returns The minimal block, or `undefined` when nothing in it is doing anything
 */
export function stripTimeGridDefaults(
  config: Readonly<Types.Config>,
  authored?: unknown,
): Record<string, unknown> | undefined {
  const block = config.time_grid;

  if (!Helpers.isConfigBlock(block)) {
    return undefined;
  }

  const overrideKeys = new Set<string>(ViewConfig.TIME_GRID_OVERRIDE_KEYS);
  const gridDefaults = ViewConfig.TIME_GRID_DEFAULTS as Readonly<Record<string, unknown>>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (key === 'past_event_opacity' && Config.toValidPercentage(value) === undefined) continue;
    if (isSyntheticKey(key)) continue;

    const kept = unchangedFromAuthored(authored, key, value);

    if (key in gridDefaults) {
      const resolved = ViewConfig.normalizeTimeGridValue(
        key as keyof typeof ViewConfig.TIME_GRID_DEFAULTS,
        value,
      );
      if (deepEqual(gridDefaults[key], resolved)) {
        if (kept) result[key] = value;
        continue;
      }
      result[key] = resolved;
      continue;
    }

    if (overrideKeys.has(key)) {
      const inherited = inheritedTimeGridValue(
        config,
        key as keyof Types.TimeGridOverrides & keyof Types.Config,
      );
      if (Object.prototype.hasOwnProperty.call(ViewConfig.TIME_GRID_DEFAULT_OVERRIDES, key)) {
        result[key] = value;
        continue;
      }
      if (!kept && deepEqual(normalizeRootValue(key, inherited), normalizeRootValue(key, value)))
        continue;
      result[key] = value;
      continue;
    }

    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Strips a `list:` block to what the user actually authored.
 *
 * 🚨 Presence *is* authorship here, so unlike `stripColumnDefaults` this keeps a value
 * that equals what the key would inherit. That is deliberate and it is the one line that
 * makes `list:` worth having beyond symmetry.
 *
 * A block entry records authorship without needing a separate set of root keys.
 * `retainAuthoredSharedValues` preserves divergent shared choices through save/reopen;
 * List keeps explicit values for every supported override, not just the divergent keys.
 *
 * The cost is that a `list:` block can hold a line that changes nothing today. That is the
 * point — it changes something the moment the shared root value beside it moves.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The authored block, or `undefined` when it holds nothing
 */
export function stripListDefaults(
  config: Readonly<Types.Config>,
): Record<string, unknown> | undefined {
  const block = config.list;

  if (!Helpers.isConfigBlock(block)) {
    return undefined;
  }

  const overrideKeys = new Set<string>(ViewConfig.LIST_OVERRIDE_KEYS);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (key === 'past_event_opacity' && Config.toValidPercentage(value) === undefined) continue;
    if (isSyntheticKey(key)) continue;
    if (!overrideKeys.has(key)) continue;

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

const TARGET_BLOCK = ViewConfig.VIEW_BLOCKS.list;

/**
 * Keys a v5 save moves out of the top level and into `list:`.
 *
 * Derived, never written out. Two groups, for two different reasons:
 *
 * 1. **List-only keys.** `VIEW_SCOPE` says no other view reads them, so the top level is
 *    making a claim ("this is shared") that the card itself contradicts. Relocating them
 *    corrects a factual error in the format and cannot change any view's rendering.
 * 2. **Divergent-default keys.** Every view that disagrees with the shipped card-level
 *    value does so because that value was written for list, back when list was the only
 *    view. Recording them as list's is what lets a later change treat a *root* value as
 *    genuinely shared instead of guessing whether it was meant for list.
 *
 * Group 2 narrows a key's scope, so it moves only after the user explicitly chooses
 * {@link ListMigrationMode} `keep-list`.
 *
 * @returns The two relocation groups
 */
export function listRelocationKeys(): {
  readonly listOnly: string[];
  readonly divergent: string[];
} {
  const listOnly: string[] = [];
  const divergent = new Set<string>();

  for (const key of ViewConfig.LIST_OVERRIDE_KEYS) {
    const scope = ViewConfig.VIEW_SCOPE[key];
    if (scope && scope.size === 1 && scope.has('list')) listOnly.push(key);
  }

  for (const view of ViewConfig.VIEWS) {
    const block = ViewConfig.viewBlockFor(view);
    // Identity against the registry entry, never a comparison on the view's name. The
    // target is *the block the migration writes into*, so a fourth view needs no edit
    // here — and `tests/editor-schema.test.ts` forbids naming a view in this directory.
    if (!block || block === TARGET_BLOCK) continue;
    for (const key of Object.keys(block.defaultOverrides)) divergent.add(key);
  }

  return { listOnly, divergent: [...divergent].sort() };
}

/**
 * Authored divergent root keys whose pre-v5 meaning is ambiguous.
 *
 * @param authored - Raw configuration before defaults are merged
 * @returns Present root keys that another view gives a divergent default
 */
export function ambiguousRootKeys(authored: Readonly<Record<string, unknown>>): string[] {
  const { divergent } = listRelocationKeys();
  return divergent.filter((key) => Object.prototype.hasOwnProperty.call(authored, key));
}

export type ListMigrationMode = 'keep-list' | 'shared-root';

export interface ListMigrationResult {
  readonly config: Record<string, unknown>;
  readonly movedRootKeys: ReadonlyArray<string>;
}

function retainAuthoredSharedValues(
  stored: Record<string, unknown>,
  authored: Readonly<Record<string, unknown>>,
  authoredRootKeys: ReadonlySet<string>,
): void {
  // These roots can differ from a view's defaults. Their presence preserves the user's
  // choice on a later editor view switch, even when the value equals DEFAULT_CONFIG.
  for (const key of listRelocationKeys().divergent) {
    const value = authored[key];
    if (authoredRootKeys.has(key) && value !== undefined && value !== null) stored[key] = value;
  }
}

/**
 * Moves authored legacy root values into the `list:` block and stamps the v5 format.
 *
 * The authored shape is separate from the minimized stored shape so a root value equal to
 * `DEFAULT_CONFIG` remains visible to migration after normal serialization strips it.
 *
 * @param stored - Minimized configuration prepared for writing
 * @param authored - Raw configuration whose root presence records authorship
 * @param mode - Whether ambiguous divergent roots belong to List or remain shared
 * @returns A new stamped configuration and the root keys removed from it
 */
export function migrateListConfig(
  stored: Readonly<Record<string, unknown>>,
  authored: Readonly<Record<string, unknown>>,
  mode: ListMigrationMode,
): ListMigrationResult {
  const { listOnly, divergent } = listRelocationKeys();
  const moving = mode === 'keep-list' ? [...listOnly, ...divergent] : listOnly;
  const migrated = { ...stored };
  retainAuthoredSharedValues(migrated, authored, new Set(Object.keys(authored)));

  const block: Record<string, unknown> = Helpers.isConfigBlock(migrated.list)
    ? { ...(migrated.list as Record<string, unknown>) }
    : {};

  const movedRootKeys: string[] = [];
  for (const key of moving) {
    if (!Object.prototype.hasOwnProperty.call(authored, key)) continue;
    // An existing block entry is the user's newer answer; the root value is the older one.
    if (!Object.prototype.hasOwnProperty.call(block, key)) block[key] = authored[key];
    delete migrated[key];
    movedRootKeys.push(key);
  }

  if (Object.keys(block).length > 0) migrated.list = block;
  else delete migrated.list;
  migrated.config_version = Config.CURRENT_CONFIG_VERSION;

  return { config: migrated, movedRootKeys };
}

/**
 * Removes unused defaults while preserving explicitly authored shared view choices.
 *
 * Two things survive minimizing. An authored divergent root is kept whatever its value,
 * because a view with a different default would otherwise stop following it
 * ({@link retainAuthoredSharedValues}). And any value the stored YAML already holds,
 * unchanged, is kept where it equals a default, so an edit rewrites only what it changed
 * ({@link unchangedFromAuthored}).
 *
 * @param config - Merged configuration as the form sees it
 * @param authoredRootKeys - Raw root presence plus later root edits; never merged defaults
 * @param authored - The configuration as the YAML holds it, before defaults are merged;
 *   omitted, every default-valued line is minimized
 * @returns The configuration to store
 */
export function toStoredConfig(
  config: Readonly<Types.Config>,
  authoredRootKeys: ReadonlySet<string> = new Set(),
  authored?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const draft = { ...(config as unknown as Record<string, unknown>) };
  if (Config.toValidPercentage(draft.past_event_opacity) === undefined) {
    delete draft.past_event_opacity;
  }

  for (const key of Object.keys(draft)) {
    if (isSyntheticKey(key)) delete draft[key];
  }

  pruneDeprecatedKeys(draft);

  const atomic = ATOMIC_KEYS.map((key) => [key, draft[key]] as const);
  for (const [key] of atomic) delete draft[key];

  const list = stripListDefaults(config);
  delete draft.list;

  const column = stripColumnDefaults(config, authored?.column);
  delete draft.column;

  const grid = stripTimeGridDefaults(config, authored?.time_grid);
  delete draft.time_grid;

  const weather = stripWeatherDefaults(config, authored?.weather);
  delete draft.weather;

  const toolbar = stripToolbarDefaults(config, authored?.toolbar);
  delete draft.toolbar;

  const minimized = Helpers.filterDefaultValues(
    draft,
    Config.DEFAULT_CONFIG as unknown as Record<string, unknown>,
  );
  // Rebuilt in the draft's order, so a kept line lands where it always would have.
  const stored: Record<string, unknown> = {};
  for (const key of Object.keys(draft)) {
    if (Object.prototype.hasOwnProperty.call(minimized, key)) stored[key] = minimized[key];
    else if (unchangedFromAuthored(authored, key, draft[key])) stored[key] = draft[key];
  }
  retainAuthoredSharedValues(stored, draft, authoredRootKeys);

  for (const [key, value] of atomic) {
    if (
      value !== undefined &&
      (!deepEqual(value, Config.DEFAULT_CONFIG[key]) || unchangedFromAuthored(authored, key, value))
    ) {
      stored[key] = value;
    }
  }

  if (list !== undefined) {
    stored.list = list;
  }

  if (column !== undefined) {
    stored.column = column;
  }

  if (grid !== undefined) {
    stored.time_grid = grid;
  }

  if (weather !== undefined) {
    stored.weather = weather;
  }

  if (toolbar !== undefined) {
    stored.toolbar = toolbar;
  }

  return stored;
}

/** The storage key of every view block, from the registry rather than named here. */
const VIEW_BLOCK_KEYS: ReadonlyArray<string> = Object.values(ViewConfig.VIEW_BLOCKS).map(
  (block) => block.blockKey as string,
);

/**
 * The view blocks as the editor stores them, for labeling a view's controls and offering
 * their resets.
 *
 * 🚨 Read through the same rule a write applies, or a kept line is mislabeled. A write keeps
 * an override equal to what it would inherit when the YAML already holds it. Asked of the
 * minimizing serializer instead, that line would read as inherited and offer no reset, while
 * it would stop following the shared value the moment that value moved.
 *
 * Between edits the merged configuration's view blocks are the stored ones: `DEFAULT_CONFIG`
 * holds none, and the editor rebuilds its configuration from what it stored after every
 * write. So each block is its own authored baseline here. Only the blocks are returned,
 * because only they can be: the merged root holds every default, so it says nothing about
 * which root lines the YAML holds.
 *
 * @param config - Merged configuration, between edits
 * @returns Each view block that stores anything, by its key
 */
export function storedViewBlocks(
  config: Readonly<Types.Config>,
): Readonly<Record<string, Record<string, unknown>>> {
  const record = config as unknown as Record<string, unknown>;
  const authored = Object.fromEntries(VIEW_BLOCK_KEYS.map((key) => [key, record[key]]));
  const stored = toStoredConfig(config, new Set(), authored);

  return Object.fromEntries(
    VIEW_BLOCK_KEYS.flatMap((key) =>
      Helpers.isConfigBlock(stored[key]) ? [[key, stored[key] as Record<string, unknown>]] : [],
    ),
  );
}

function gridReconciliations(
  config: Readonly<Types.Config>,
  authoredRootKeys: ReadonlySet<string>,
  resetKeys: ReadonlySet<string>,
): Array<{ key: string; value: unknown; reconciled: boolean }> {
  const block = Helpers.isConfigBlock(config.time_grid) ? config.time_grid : {};
  return Object.entries(ViewConfig.TIME_GRID_DEFAULT_OVERRIDES).flatMap(([key, gridDefault]) => {
    if (resetKeys.has(key) || Object.prototype.hasOwnProperty.call(block, key)) return [];
    const root = config[key as keyof Types.Config];
    if (!authoredRootKeys.has(key) || root === undefined || root === null) return [];
    const value = normalizeRootValue(key, root);
    return [
      {
        key,
        value,
        reconciled: !deepEqual(value, normalizeRootValue(key, gridDefault)),
      },
    ];
  });
}

/**
 * Names authored root values the editor will preserve instead of substituting Grid defaults.
 *
 * An existing Grid value wins without reconciliation. Missing and null root values
 * are unset; false and zero are authored values. Both comparison sides use the same coercion.
 *
 * @param config - Configuration before the editor switches the displayed view
 * @param authoredRootKeys - Root keys captured before defaults were merged, plus later root edits
 * @param resetKeys - Grid options reset in this editor session, unless reauthored in Shared
 * @returns The conflicting options to name in one editor notice
 */
export function gridReconciliationKeys(
  config: Readonly<Types.Config>,
  authoredRootKeys: ReadonlySet<string>,
  resetKeys: ReadonlySet<string> = new Set(),
): ReadonlyArray<string> {
  return gridReconciliations(config, authoredRootKeys, resetKeys)
    .filter(({ reconciled }) => reconciled)
    .map(({ key }) => key);
}

/**
 * Copies authored root choices on a Grid transition, without materializing view defaults.
 *
 * This is continuity across an explicit view change, not a renderer precedence rule.
 * Loading an already-Grid YAML card does not call it. The authored key set is editor-only:
 * merging DEFAULT_CONFIG first would make every default look like a user choice.
 * Existing block values are never pruned, even when they equal a Grid default.
 *
 * @param config - Configuration after the view changed
 * @param resetKeys - Grid options reset in this editor session, unless reauthored in Shared
 * @param authoredRootKeys - Authored root keys, never inferred from the merged configuration
 * @returns The reconciled configuration, or the original when no authored value needs copying
 */
export function reconcileTimeGridValues(
  config: Readonly<Types.Config>,
  resetKeys: ReadonlySet<string> = new Set(),
  authoredRootKeys: ReadonlySet<string> = new Set(),
): Types.Config {
  const changes = gridReconciliations(config, authoredRootKeys, resetKeys);
  if (changes.length === 0) return config as Types.Config;
  const block = Helpers.isConfigBlock(config.time_grid) ? config.time_grid : {};

  return {
    ...config,
    time_grid: {
      ...block,
      ...Object.fromEntries(changes.map(({ key, value }) => [key, value])),
    },
  };
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
      if (key === 'past_event_opacity') {
        Config.validatePastEventOpacity(nextData[key]);
        write(key, normalizeRootValue(key, nextData[key]));
      } else {
        write(key, nextData[key]);
      }
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
 * Builds the `time_grid:` block as the form should show it.
 *
 * Same two layers as {@link columnFormBlock}, and the same reason the stored spread has
 * to come last.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The block, with every unset option at its effective value
 */
export function timeGridFormBlock(config: Readonly<Types.Config>): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      Object.keys(ViewConfig.TIME_GRID_DEFAULTS).map((key) => [
        key,
        ViewConfig.resolveTimeGridOption(
          config as Types.Config,
          key as keyof typeof ViewConfig.TIME_GRID_DEFAULTS,
        ),
      ]),
    ),
    min_days_to_show: ViewConfig.resolveMinDaysToShow(config, 'grid'),
    ...(config.time_grid ?? {}),
  };
}

/**
 * Builds the `list:` block as the form should show it.
 *
 * List has no block-only keys or divergent defaults to fill in. The workspace projection
 * resolves inherited field values separately; this block contains only stored overrides.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The stored block, unprojected
 */
export function listFormBlock(config: Readonly<Types.Config>): Record<string, unknown> {
  return { ...((config.list ?? {}) as Record<string, unknown>) };
}

/**
 * The form block builder for each view that owns one.
 *
 * A record rather than a conditional, because the conditional it replaces read
 * `view === 'grid' ? grid : column` — correct while two views were registered and silently
 * wrong the moment a third arrived, handing list the column projection and with it every
 * `COLUMN_DEFAULTS` value. `tests/editor-value-round-trip.test.ts` reconciles this against
 * `VIEW_BLOCKS`, so a view registered without a builder fails rather than inheriting one.
 */
export const VIEW_FORM_BLOCKS: Readonly<
  Partial<Record<Types.EffectiveView, (config: Readonly<Types.Config>) => Record<string, unknown>>>
> = {
  list: listFormBlock,
  column: columnFormBlock,
  grid: timeGridFormBlock,
};

/**
 * Builds the `toolbar:` block as the form should show it.
 *
 * Most controls default on inside a shown toolbar, so binding the block raw would show them
 * unticked under a freshly switched-on toolbar while the card draws them. Read through
 * `resolveToolbar`, so a malformed value shows as the default the card reads it as.
 * {@link stripToolbarDefaults} takes the defaults back out on write. The legend's `false` shows
 * as `off`, since a dropdown's values are strings (`LEGEND_OFF`).
 *
 * Every key of the shipped block, walked rather than listed: a key missing here reaches the
 * form as `undefined`, which a switch draws as off whatever the configuration says, so a
 * list kept by hand drew `refresh` and `legend` off until one was added to it.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The block, with every option at its effective value
 */
export function toolbarFormBlock(config: Readonly<Types.Config>): Record<string, unknown> {
  const toolbar = Config.resolveToolbar(config) as unknown as Record<string, unknown>;
  const resolvedName = (key: string): string =>
    key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

  return Object.fromEntries(
    Object.keys(Config.DEFAULT_CONFIG.toolbar ?? {}).map((key) => {
      const value = toolbar[resolvedName(key)];
      return [key, key === 'legend' && value === false ? LEGEND_OFF : value];
    }),
  );
}

/**
 * Strips redundant entries from a `toolbar:` block.
 *
 * The counterpart to {@link toolbarFormBlock}. A control switched off is kept while the
 * toolbar itself is off: `show: false` hides the bar and keeps the choices made for it.
 *
 * @param config - Merged configuration, defaults already applied
 * @param authored - The `toolbar:` block as the YAML holds it; an entry it holds unchanged
 *   is kept even where it equals the default
 * @returns The minimal block, or `undefined` when nothing in it is doing anything
 */
export function stripToolbarDefaults(
  config: Readonly<Types.Config>,
  authored?: unknown,
): Record<string, unknown> | undefined {
  const block = config.toolbar;

  if (!Helpers.isConfigBlock(block)) {
    return undefined;
  }

  const defaults = (Config.DEFAULT_CONFIG.toolbar ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (deepEqual(defaults[key], value) && !unchangedFromAuthored(authored, key, value)) continue;
    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
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
 * @param authored - The `weather:` block as the YAML holds it; an option it holds unchanged
 *   is kept even where it equals the default
 * @returns The minimal block, or `undefined` when nothing in it is doing anything
 */
export function stripWeatherDefaults(
  config: Readonly<Types.Config>,
  authored?: unknown,
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
      const authoredGroup = Helpers.isConfigBlock(authored) ? authored[key] : undefined;
      const group: Record<string, unknown> = {};

      for (const [option, setting] of Object.entries(value)) {
        if (setting === undefined) continue;
        if (
          deepEqual(groupDefaults[option], setting) &&
          !unchangedFromAuthored(authoredGroup, option, setting)
        )
          continue;
        group[option] = setting;
      }

      if (Object.keys(group).length > 0) result[key] = group;
      continue;
    }

    if (deepEqual(defaults[key], value) && !unchangedFromAuthored(authored, key, value)) continue;
    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
