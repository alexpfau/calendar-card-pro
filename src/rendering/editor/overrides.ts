/**
 * Exceptions for the three options whose stored value is a union of shapes.
 *
 * `show_week_numbers` is `null | 'iso' | 'simple'`, `remove_location_country` is
 * `boolean | string` and `today_indicator` is `string | boolean`. No selector can emit
 * any of those, which is why each panel edits its own copy through a mode dropdown that
 * chooses *which shape* is written — and why the exceptions widget, which binds a
 * selector straight to a key, had no control for them.
 *
 * ## The mechanism is the one that already exists
 *
 * The synthetic fields in `synthetic.ts` read and write a `Types.Config`, but nothing in
 * them is *about* the card: `week_number_mode` reads `show_week_numbers` and writes it
 * back, and neither half cares whether the object it was handed is the configuration or
 * a `column:` block that happens to have the same key in it. So an exception needs no
 * second derivation — it needs the same one, pointed at the block. Everything below is
 * plumbing to point it there, and there is deliberately no second copy of any rule about
 * what a mode means.
 *
 * ## The one thing that genuinely differs
 *
 * **Absent means the opposite in the two scopes.** At card level a key that is not there
 * takes its default, so `week_number_mode` writing `undefined` for *None* is how the
 * option returns to the default. Inside an override block, absent means *inherit the
 * shared value* — so the same write would silently delete the exception the user just
 * asked for, and the option would go back to whatever the panel above says. Each union
 * key therefore names the value that spells "off" **explicitly**, and it is written
 * whenever a change would otherwise have removed the key.
 *
 * `value.ts` already documents `column: { show_week_numbers: null }` as meaningful and
 * `stripColumnDefaults` already declines to treat `null` as absent, so the block half of
 * this was in place before there was a control that could produce it.
 *
 * ## Held text
 *
 * The value controls carry the same half-typed-value problem as their card-level
 * counterparts — `star.pn` on the way to `star.png` classifies as a plain dot, which
 * would swap the field away mid-word — so they hold text the same way. The held text is
 * keyed under the block it belongs to, because a card-level `today_indicator_custom` and
 * a column-view one can be mid-edit at the same time and are not the same value.
 *
 * Nothing here imports Lit or touches the DOM.
 */

import type { HaFormSchema, SelectorSchema } from './ha-form';
import { select } from './schemas/common';
import {
  TODAY_INDICATOR_STYLES,
  WEEK_NUMBER_MODES,
  todayIndicatorFields,
  weekNumberFields,
} from './schemas/day-header';
import { LOCATION_COUNTRY_MODES, locationCountryFields } from './schemas/events';
import * as Synthetic from './synthetic';
import { applyFormChange, changedKeys } from './value';
import * as Types from '../../config/types';

/** One override key, and the synthetic fields that stand in for it. */
interface UnionOverride {
  /** Synthetic field names this key is edited through, in render order. */
  readonly fields: ReadonlyArray<string>;
  /** The one of those fields that chooses which shape is written. */
  readonly mode: string;
  /** Every shape the mode can choose, in the order the panel offers them. */
  readonly modes: ReadonlyArray<string>;
  /**
   * The value that means "off" inside an override block.
   *
   * Never `undefined`: an override block resolves by presence, so removing the key would
   * return the option to the shared value rather than switching it off.
   */
  readonly off: unknown;
  /**
   * Builds the rows this key is edited through.
   *
   * @param language - Effective language code
   * @param data - Synthetic values derived from the block
   * @returns The rows, in render order
   */
  build(language: string, data: Readonly<Record<string, unknown>>): HaFormSchema[];
}

/**
 * The three, and everything that is specific to each.
 *
 * Small on purpose. Each entry names the fields it delegates to, the value that spells
 * "off", and the builder it shares with the panel that owns the option — so the shapes
 * themselves are declared once, in the panel, and this table only says where they are
 * reused.
 */
const UNION_OVERRIDES: Readonly<Record<string, UnionOverride>> = {
  show_week_numbers: {
    fields: ['week_number_mode'],
    mode: 'week_number_mode',
    modes: WEEK_NUMBER_MODES,
    // Not `undefined`. The card reads `null` as "no week numbers", and the block reads
    // an absent key as "whatever the panel above says" — so this is the only value that
    // can express an exception that turns them off.
    off: null,
    build: (language) => weekNumberFields(language),
  },

  remove_location_country: {
    fields: ['location_country_mode', 'location_country_pattern'],
    mode: 'location_country_mode',
    modes: LOCATION_COUNTRY_MODES,
    off: false,
    build: (language, data) =>
      locationCountryFields(language, String(data.location_country_mode ?? '')),
  },

  today_indicator: {
    fields: ['today_indicator_style', 'today_indicator_icon', 'today_indicator_custom'],
    mode: 'today_indicator_style',
    modes: TODAY_INDICATOR_STYLES,
    off: false,
    build: (language, data) =>
      todayIndicatorFields(language, String(data.today_indicator_style ?? '')),
  },
};

/** Every override key edited through synthetic fields rather than bound directly. */
export const UNION_OVERRIDE_KEYS: ReadonlyArray<string> = Object.keys(UNION_OVERRIDES);

/**
 * Whether an option is edited through a mode dropdown rather than bound to a selector.
 *
 * @param key - Config key
 * @returns `true` when the key is one of the three
 */
export function isUnionOverride(key: string): boolean {
  return key in UNION_OVERRIDES;
}

/**
 * The field the picker offers for a union-typed option.
 *
 * Never rendered — `expandFields` is what the form draws — but it is what the search
 * matches against, so it carries the real option list. Built under the mode field's name
 * so the option labels resolve, then named for the config key, which is what the picker,
 * the declared set and the block all use.
 *
 * @param key - Config key
 * @param language - Effective language code
 * @returns The field, or `undefined` when the key is not one of the three
 */
export function unionPickerField(key: string, language: string): SelectorSchema | undefined {
  const override = UNION_OVERRIDES[key];
  if (override === undefined) return undefined;

  return { name: key, selector: select(language, override.mode, override.modes).selector };
}

/**
 * Every set of synthetic values a key's rows can be built against.
 *
 * One entry per mode, because a mode's value control only exists while that mode is
 * chosen — so anything that needs to see *all* of a key's rows at once, such as the
 * string-table reconciliation, has to sweep them. A key that is not union-typed has one
 * row and no modes, so it yields a single empty set.
 *
 * @param key - Config key
 * @returns One synthetic-value set per mode
 */
export function everyMode(key: string): Array<Record<string, unknown>> {
  const override = UNION_OVERRIDES[key];
  if (override === undefined) return [{}];

  return override.modes.map((mode) => ({ [override.mode]: mode }));
}

/**
 * Expands the declared exception rows into the fields the form renders.
 *
 * A key bound to a selector is its own row and passes through untouched; a union-typed
 * one is replaced by the rows its panel would use for it. Order is preserved, so the
 * exceptions read in the order the panel offers them either way.
 *
 * @param fields - Declared exception rows, one per config key
 * @param language - Effective language code
 * @param data - Synthetic values derived from the block
 * @returns The schema to render
 */
export function expandFields(
  fields: ReadonlyArray<SelectorSchema>,
  language: string,
  data: Readonly<Record<string, unknown>>,
): HaFormSchema[] {
  return fields.flatMap((field) => {
    const override = UNION_OVERRIDES[field.name];
    return override === undefined ? [field] : override.build(language, data);
  });
}

/**
 * The synthetic half of the exceptions form's data.
 *
 * Derived from the **projected** block, so a freshly declared exception shows the value
 * it inherits rather than an empty control — the same reason `exceptionFormBlock`
 * projects at all. Only the fields belonging to a declared union key are returned: every
 * other synthetic field would be a key the form does not bind and the block has no
 * business carrying.
 *
 * @param block - The block as the form shows it, inherited values already projected
 * @param keys - Options currently declared as exceptions
 * @param pending - Uncommitted text for this block, keyed by synthetic field name
 * @returns Synthetic keys and their values, ready to merge into the form data
 */
export function deriveOverrideData(
  block: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
  pending: Synthetic.PendingValues = {},
): Record<string, unknown> {
  const derived = Synthetic.deriveSyntheticData(block as unknown as Types.Config, pending);
  const data: Record<string, unknown> = {};

  for (const key of keys) {
    for (const field of UNION_OVERRIDES[key]?.fields ?? []) {
      data[field] = derived[field];
    }
  }

  return data;
}

/**
 * The exceptions form's data: the block, plus the fields standing in for its union keys.
 *
 * The raw union keys are removed rather than left alongside their stand-ins. A form
 * hands its whole data object back, so a key it never bound would ride along unchanged
 * and mask the value the stand-in wrote.
 *
 * @param block - The block as the form shows it, inherited values already projected
 * @param keys - Options currently declared as exceptions
 * @param pending - Uncommitted text for this block, keyed by synthetic field name
 * @returns The data to bind
 */
export function overrideFormData(
  block: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
  pending: Synthetic.PendingValues = {},
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...block };

  for (const key of UNION_OVERRIDE_KEYS) delete data[key];

  return { ...data, ...deriveOverrideData(block, keys, pending) };
}

/** A block and the uncommitted text that goes with it. */
export interface BlockApplication {
  /** The block after the edit, with no synthetic key in it. */
  block: Record<string, unknown>;
  /** Uncommitted text for this block, keyed by synthetic field name. */
  pending: Record<string, string>;
}

/**
 * Folds one `value-changed` from the exceptions form into the block.
 *
 * The same diff `applyFormChange` performs for the card, pointed at the block — which is
 * the whole point of this module. Two things are added around it, and only two:
 *
 * - **Synthetic keys are stripped.** They are UI state, and a block is configuration
 *   that gets written to somebody's YAML.
 * - **A touched union key that came back absent is written as its explicit "off".**
 *   Absent means *inherit* here, so leaving it out would delete the exception rather
 *   than switch the option off. Only a key this edit actually touched is considered, so
 *   declaring an exception still writes nothing until its value is changed.
 *
 * @param stored - The block as stored, before the edit
 * @param previousData - Form data as it was rendered
 * @param nextData - Form data as the form returned it
 * @param pending - Uncommitted text for this block, keyed by synthetic field name
 * @returns The block and the held text after the edit
 */
export function applyOverrideChange(
  stored: Readonly<Record<string, unknown>>,
  previousData: Readonly<Record<string, unknown>>,
  nextData: Readonly<Record<string, unknown>>,
  pending: Readonly<Record<string, string>> = {},
): BlockApplication {
  const changed = changedKeys(previousData, nextData);

  const applied = applyFormChange(
    stored as unknown as Types.Config,
    previousData,
    nextData,
    pending,
  );

  const block = { ...(applied.config as unknown as Record<string, unknown>) };
  for (const key of Object.keys(block)) {
    if (Synthetic.isSyntheticKey(key)) delete block[key];
  }

  for (const [key, override] of Object.entries(UNION_OVERRIDES)) {
    const touched = changed.some((name) => override.fields.includes(name));
    if (touched && block[key] === undefined) {
      block[key] = override.off;
    }
  }

  return { block, pending: applied.pending };
}

/**
 * The held text belonging to one block, with its prefix removed.
 *
 * @param pending - Every uncommitted value the editor is holding
 * @param blockKey - Config key holding the view's override block
 * @returns The subset for this block, keyed by bare synthetic field name
 */
export function pendingForBlock(
  pending: Readonly<Record<string, string>>,
  blockKey: string,
): Record<string, string> {
  const prefix = `${blockKey}.`;

  return Object.fromEntries(
    Object.entries(pending)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  );
}

/**
 * Merges a block's held text back into the editor's own map.
 *
 * Prefixed on the way in, so that the card-level `today_indicator_custom` and the
 * column-view one can both be mid-edit without either standing in for the other.
 *
 * @param pending - Every uncommitted value the editor is holding
 * @param blockKey - Config key holding the view's override block
 * @param next - The block's held text after the edit, keyed by bare field name
 * @returns The editor's map, with this block's entries replaced
 */
export function mergeBlockPending(
  pending: Readonly<Record<string, string>>,
  blockKey: string,
  next: Readonly<Record<string, string>>,
): Record<string, string> {
  const prefix = `${blockKey}.`;

  const others = Object.fromEntries(
    Object.entries(pending).filter(([key]) => !key.startsWith(prefix)),
  );

  return {
    ...others,
    ...Object.fromEntries(Object.entries(next).map(([key, value]) => [prefix + key, value])),
  };
}
