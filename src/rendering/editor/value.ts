/**
 * Value plumbing between `<ha-form>` and the stored configuration.
 *
 * `ha-form` hands back the **whole merged data object** on every keystroke, so writing
 * what it gives you straight through persists all ninety-odd defaults into the user's
 * YAML. This is not a hypothetical: our nearest competitor shipped that bug twice, the
 * second time introduced by its own migration to `ha-form`. Everything here exists to
 * make the write path narrower than the read path.
 *
 * Four rules govern what is written, and two of them point in opposite directions:
 *
 * - **Defaults are stripped**, top level and inside `column:` alike, and an override
 *   equal to what it would inherit is stripped too.
 * - **An emptied `column:` block is removed**, so a user cannot accumulate `column: {}`
 *   by adding an override and taking it away again.
 * - **Dead keys are pruned.** The five names in `DEPRECATED_CONFIG_MAP` were removed
 *   from the runtime in v3.0.0 and do nothing at all; the card already reports them on
 *   the console, and the editor now finishes the job.
 * - **Dormant keys are kept.** An option that drops out of the schema because the card
 *   switched view is *not* dead — a column card renders as a list on a narrow screen,
 *   so its list-only settings are still live. Switching a card to `view: list` must
 *   also not destroy the `column:` block it would get back by switching again.
 *
 * The distinction between the last two is the whole point: dead-forever is pruned,
 * dormant is preserved. Nothing here decides that by asking what the schema currently
 * renders, because the schema is a function of the view and the config is not.
 */

import { applySyntheticChange, isSyntheticKey } from './synthetic';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

/**
 * Config keys holding a structure that is kept or dropped whole.
 *
 * Two problems, one treatment.
 *
 * `tap_action` / `hold_action` have the object default `{ action: 'none' }`, and
 * `filterDefaultValues` recurses into any key whose default is an object. For
 * `{ action: 'none', navigation_path: '/x' }` that recursion strips `action` as a
 * default and keeps `navigation_path`, producing an action config with no action in
 * it. Home Assistant's `ui_action` selector emits the whole object at once, so keeping
 * or dropping it whole is the only treatment that matches how it is edited.
 *
 * `weather` is worse, and it is why this list is checked rather than trusted. Its
 * special case in `filterDefaultValues` passes the block through **unconditionally** —
 * the comment says "preserve entire structure once defined", but a *merged*
 * configuration always has it defined, because `DEFAULT_CONFIG` supplies it. Handing
 * that function a merged config therefore writes all twenty default weather keys into
 * the user's YAML on the very first edit. The old editor is spared only because it
 * writes a config it has been mutating in place; a form that hands back everything is
 * not. Comparing against the default first is what keeps that off disk, and the
 * "preserve whole" intent survives — a weather block the user has touched is still
 * written entire, never partially stripped.
 */
const ATOMIC_KEYS = ['tap_action', 'hold_action', 'weather'] as const;

/** Structural comparison, enough for the small plain objects a config holds. */
function deepEqual(a: unknown, b: unknown): boolean {
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
 * `ha-form` reports *that* the form changed, never *which field* changed, so the key
 * has to be recovered by comparison. Synthetic fields need it — committing text only
 * when it parses is meaningless if you cannot tell that it was the text that moved.
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
 * This is `resolveViewOption` with the override removed — the value the user would get
 * by deleting the line. An override equal to it is doing nothing and is stripped.
 *
 * Note the `COLUMN_DEFAULT_OVERRIDES` term. Two keys already default *differently* in
 * column view, so `column: { show_empty_days: true }` against a top-level `false` is
 * redundant even though the two values differ. Comparing against the top-level value
 * alone would keep it and quietly teach users that the block needs lines it does not.
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

/**
 * Strips redundant entries from a `column:` block.
 *
 * Two kinds of redundancy, and they need different reference values. A column-only key
 * such as `min_day_width` is compared against `COLUMN_DEFAULTS`, which is where its
 * default lives. An override key is compared against what it would inherit.
 * `min_days_to_show` belongs to neither group — its default is `days_to_show`, which is
 * why it has no `COLUMN_DEFAULTS` entry — so it is handled on its own terms.
 *
 * `null` is never treated as absent here, unlike in the top-level pass. Resolution
 * inside the block is presence-based, so `show_week_numbers: null` against a top-level
 * `'iso'` is a real instruction to suppress week numbers in column layout, and
 * dropping it would change what the card renders.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The minimal block, or `undefined` when nothing in it is doing anything
 */
export function stripColumnDefaults(
  config: Readonly<Types.Config>,
): Record<string, unknown> | undefined {
  const block = config.column;

  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return undefined;
  }

  const overrideKeys = new Set<string>(ViewConfig.COLUMN_OVERRIDE_KEYS);
  const columnDefaults = ViewConfig.COLUMN_DEFAULTS as Readonly<Record<string, unknown>>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    // An own property set to `undefined` reads as absent to `hasOverride`, so it can
    // never affect the render and has no business being written out.
    if (value === undefined) continue;

    if (key === 'min_days_to_show') {
      // Decided by asking the resolver, not by re-deriving its arithmetic. Its default
      // is dynamic — `days_to_show` — and it parses, floors and clamps on the way
      // through, so a value like `"2junk"` resolves to a floor of 2 while a
      // re-implementation using `Number()` would read it as `NaN` and delete a line
      // that is changing what the card renders.
      if (resolvesTheSameWithout(config, key)) continue;
      result[key] = value;
      continue;
    }

    if (key in columnDefaults) {
      if (deepEqual(columnDefaults[key], value)) continue;
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

    // Not a key the card understands. Kept rather than dropped: the editor is not the
    // authority on what a hand-written config may contain, and silently deleting an
    // unrecognised line is how a typo becomes an unexplained loss of settings.
    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Whether removing an override leaves the resolved column floor unchanged.
 *
 * The honest test of redundancy for a key whose default is computed rather than
 * tabulated: resolve it with the line, resolve it without, and compare.
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
 * Removes the config keys that v3.0.0 deleted from the runtime.
 *
 * These are inert — the card has not read them in three major versions — so this is
 * not a behaviour change, it is deleting text that has been lying to whoever reads the
 * YAML. `DEPRECATED_CONFIG_MAP` is the single source of truth the console warning
 * already uses, so a key can never be pruned here and unknown there.
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
 * The single write path out of the editor. Everything the card persists goes through
 * here, so the rules at the top of this file hold no matter which panel made the edit.
 *
 * @param config - Merged configuration as the form sees it
 * @returns The configuration to store
 */
export function toStoredConfig(config: Readonly<Types.Config>): Record<string, unknown> {
  const draft = { ...(config as unknown as Record<string, unknown>) };

  // Synthetic fields are UI state. The value handler already keeps them out, so this
  // is a backstop against a future panel building form data by a different route.
  for (const key of Object.keys(draft)) {
    if (isSyntheticKey(key)) delete draft[key];
  }

  pruneDeprecatedKeys(draft);

  // Held out of the recursive pass and reattached whole; see ATOMIC_KEYS.
  const atomic = ATOMIC_KEYS.map((key) => [key, draft[key]] as const);
  for (const [key] of atomic) delete draft[key];

  const column = stripColumnDefaults(config);
  delete draft.column;

  const stored = Helpers.filterDefaultValues(
    draft,
    Config.DEFAULT_CONFIG as unknown as Record<string, unknown>,
  );

  for (const [key, value] of atomic) {
    if (value !== undefined && !deepEqual(value, Config.DEFAULT_CONFIG[key])) {
      stored[key] = value;
    }
  }

  // Reattached only when it holds something. An empty block is not equivalent to no
  // block for a reader, and it is what a user is left with after adding an override
  // and removing it again.
  if (column !== undefined) {
    stored.column = column;
  }

  return stored;
}

/**
 * A configuration and the uncommitted text that goes with it.
 */
export interface FormApplication {
  /** Merged configuration after the edit. */
  config: Types.Config;
  /** Uncommitted text, keyed by synthetic field name. */
  pending: Record<string, string>;
}

/**
 * Folds one `value-changed` from the form into the configuration.
 *
 * The form reports its entire data object, so the edit has to be recovered by
 * comparison — see `changedKeys`. Recovering it is what makes the synthetic fields
 * possible, and the reason this is a diff rather than a merge: merging the form data
 * wholesale would write every synthetic key into the config and, worse, would commit
 * a half-typed `start_date_offset` on the keystroke it was typed.
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
 * A form binds values, so a control for an option the user has not set must still
 * display the value the card is actually using. Top-level options get that for free —
 * `setConfig` merges `DEFAULT_CONFIG` in — but the column block has no such merge:
 * `DEFAULT_CONFIG.column` is `undefined`, deliberately, so that an empty block is
 * indistinguishable from no block. Without this projection every density control
 * renders blank while the card is quietly using 140 px, an 8 px header gap and a list
 * fallback.
 *
 * Projecting defaults into the form is only safe because the write path strips them
 * again: a value the user never touched arrives back equal to its default and is
 * removed by `stripColumnDefaults`, so nothing is persisted by being displayed.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns The block, with every unset option at its effective value
 */
export function columnFormBlock(config: Readonly<Types.Config>): Record<string, unknown> {
  return {
    ...ViewConfig.COLUMN_DEFAULTS,
    // Not in `COLUMN_DEFAULTS`, because its default is `days_to_show` rather than a
    // constant. `resolveMinDaysToShow` owns that, so it is asked rather than guessed.
    min_days_to_show: ViewConfig.resolveMinDaysToShow(config),
    ...(config.column ?? {}),
  };
}
