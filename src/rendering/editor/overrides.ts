/**
 * Synthetic override fields for calendar and exception blocks.
 */

import type { HaFormSchema, SelectorSchema } from './ha-form';
import { select } from './schemas/common';
import {
  TODAY_INDICATOR_STYLES,
  WEEK_NUMBER_MODES,
  todayIndicatorFields,
  weekNumberFields,
} from './schemas/day-header';
import {
  ALLDAY_BADGE_POSITION_OPTIONS,
  LOCATION_COUNTRY_MODES,
  locationCountryFields,
} from './schemas/events';
import * as Synthetic from './synthetic';
import { applyFormChange, changedKeys } from './value';
import * as Types from '../../config/types';

interface UnionOverride {
  readonly fields: ReadonlyArray<string>;
  readonly mode: string;
  readonly modes: ReadonlyArray<string>;
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
 * Options whose stored value is a union of shapes, each projected through a synthetic field.
 *
 * 🚨 Every `mode` here MUST name a key in `SYNTHETIC_FIELDS`. Naming one that does not exist
 * does not throw -- it silently blanks the control, because the derive path refills from that
 * table and simply finds nothing. Exported solely so a test can reconcile the two; nothing
 * outside this module should read it.
 */
export const UNION_OVERRIDES: Readonly<Record<string, UnionOverride>> = {
  show_week_numbers: {
    fields: ['week_number_mode'],
    mode: 'week_number_mode',
    modes: WEEK_NUMBER_MODES,
    off: null,
    build: (language) => weekNumberFields(language),
  },

  allday_badge: {
    fields: ['allday_badge_position'],
    mode: 'allday_badge_position',
    modes: ALLDAY_BADGE_POSITION_OPTIONS,
    off: 'off',
    build: (language) => [select(language, 'allday_badge_position', ALLDAY_BADGE_POSITION_OPTIONS)],
  },

  /* `allday_badge_style` is deliberately NOT here, and it was, briefly.
     This table is for options whose STORED value is a union of shapes -- `false` or a string,
     a boolean or a pattern -- which no selector can emit, so each projects through a
     synthetic field named by `mode`. The treatment is a plain closed-set string with no
     second shape and therefore no synthetic, and registering it here named a synthetic that
     does not exist: `overrideFormData` deletes every key in this table from the data and
     `deriveOverrideData` refills it from `SYNTHETIC_FIELDS`, which had never heard of it. The
     control rendered BLANK, showing neither its stored value nor the card-level one it
     inherits -- which is the whole job of that widget. Stored 'outline' derived to undefined.
     Removing the entry costs nothing: the exception picker offers a plain key directly, and
     `unionPickerField` was building the same `select` the panel already has. */

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

const UNION_OVERRIDE_KEYS: ReadonlyArray<string> = Object.keys(UNION_OVERRIDES);

/**
 * The field the picker offers for a union-typed option.
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
 * @param block - The block as the form shows it, inherited values already projected
 * @param keys - Options currently declared as exceptions
 * @param pending - Uncommitted text for this block, keyed by synthetic field name
 * @returns Synthetic keys and their values, ready to merge into the form data
 */
function deriveOverrideData(
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

interface BlockApplication {
  block: Record<string, unknown>;
  pending: Record<string, string>;
}

/**
 * Folds one `value-changed` from the exceptions form into the block.
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
