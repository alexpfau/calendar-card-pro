/**
 * Exception picker schemas and override defaults.
 * The picker is a field list, not a button-driven action widget, so exceptions can be removed as well as added.
 */

import type { HaFormSchema, SelectorSchema } from './ha-form';
import * as Overrides from './overrides';
import { walkSchema } from './panels';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

/**
 * Options a panel does not render as a field of their own, offered anyway.
 *
 * 🚨 Half of this table is vestigial and half is load-bearing, and a mutation sweep reports
 * the two halves identically unless you read which test failed. Six entries; deleting one
 * at a time, measured on the commit that added the value pin below, against a 3224 control:
 *
 * | entry                     | fails | = pin | + behaviour | why                          |
 * | ------------------------- | ----- | ----- | ----------- | ---------------------------- |
 * | `show_week_numbers`       | 1     | 1     | 0           | walk finds it, synthetic     |
 * | `today_indicator`         | 1     | 1     | 0           | walk finds it, synthetic     |
 * | `allday_badge`            | 1     | 1     | 0           | walk finds it, synthetic     |
 * | `remove_location_country` | 2     | 1     | 1           | walk misses it with defaults |
 * | `height` / `max_height`   | 3     | 1     | 2           | no schema field exists       |
 *
 * 🚨 **Read the `+ behaviour` column, not the total.** The value pin contributes exactly 1
 * to every row, so after it landed NOTHING here survives deletion and the sweep alone can
 * no longer tell the halves apart -- which is the whole point of the pin, and also a trap
 * of its own. A reader who deletes `show_week_numbers`, sees a single failure, and reads it
 * as "the pin is out of date" will update the pin to match, and that restores exactly the
 * invisibility the pin was added to remove. If the ONLY failure is the pin, the entry is
 * vestigial and the pin is right; delete the entry from both places or leave both alone.
 *
 * The three with no behavioural coverage are found by the walk anyway, because
 * `eligibleFields` resolves a synthetic name back to its config key.
 *
 * The other three are live for two different reasons, and neither is obvious from here.
 * `height` and `max_height` have no `<ha-form>` field anywhere in the layout panel -- they
 * are drawn from `EXTRA_SELECTORS` just below, so this table is their only route in.
 * `remove_location_country` does have a field, but the location group only builds
 * `location_country_mode` when `show_location` is on, so with locations off the walk never
 * sees it at any name. Its liveness is therefore invisible under default config, which is
 * the case a sweep run on defaults will call dead.
 *
 * All three live entries are pinned behaviourally in `editor-schema.test.ts`, and the table
 * is exported purely so that file can ALSO pin it by value. A test that walks it cannot see
 * an entry leaving, which is the one direction that matters here.
 */
export const EXTRA_KEYS_BY_PANEL: Readonly<Record<string, ReadonlyArray<string>>> = {
  layout: ['height', 'max_height'],
  day_header: ['show_week_numbers', 'today_indicator'],
  events: ['allday_badge', 'remove_location_country'],
};

const EXTRA_SELECTORS: Readonly<Record<string, SelectorSchema>> = {
  height: { name: 'height', selector: { text: { type: 'text' } } },
  max_height: { name: 'max_height', selector: { text: { type: 'text' } } },
};

/**
 * The field offered for an option the panel does not render directly.
 *
 * @param key - Config key
 * @param language - Effective language code
 * @returns The field, or `undefined` when the key has no control
 */
function extraField(key: string, language: string): SelectorSchema | undefined {
  return EXTRA_SELECTORS[key] ?? Overrides.unionPickerField(key, language);
}

/** Synthetic field name -> the config key it stands in for, read out of `UNION_OVERRIDES`. */
const KEY_BY_SYNTHETIC: ReadonlyMap<string, string> = new Map(
  Object.entries(Overrides.UNION_OVERRIDES).map(([key, override]) => [override.mode, key]),
);

/**
 * The fields a panel offers an exception for, in the order the panel renders them.
 *
 * @param schema - The panel's schema, as built for the current configuration
 * @param view - View whose override block is being edited
 * @param panelId - Which panel it belongs to
 * @param language - Effective language code, for the extra fields' option labels
 * @returns One field per eligible option
 */
export function eligibleFields(
  schema: ReadonlyArray<HaFormSchema>,
  view: Types.EffectiveView,
  panelId: string,
  language = 'en',
): SelectorSchema[] {
  const overrideKeys = new Set(ViewConfig.viewBlockFor(view)?.overrideKeys ?? []);
  const seen = new Set<string>();
  const fields: SelectorSchema[] = [];

  for (const { node } of walkSchema(schema)) {
    if (!('selector' in node)) continue;

    // A union-typed option renders under its SYNTHETIC name, which is not a
    // COLUMN_OVERRIDE_KEYS member -- so the walk missed it and it arrived later from
    // EXTRA_KEYS_BY_PANEL, at the end of the list. That put `allday_badge_style`, a real key
    // found in place, SEVENTEEN entries ahead of the `allday_badge` it depends on, with
    // nothing to say the style does nothing while the position is off. Measured before and
    // after: style@5/badge@22 became badge@5/style@6.
    //
    // Resolving the synthetic back to the key it stands for puts the option where its panel
    // actually renders it, which is what this function's docblock has always claimed. The
    // mapping is `UNION_OVERRIDES` read backwards rather than a second list, so it covers
    // `remove_location_country` -- which had the same fault -- and anything added later.
    const key = KEY_BY_SYNTHETIC.get(node.name) ?? node.name;
    if (!overrideKeys.has(key) || seen.has(key)) continue;

    const field =
      key === node.name ? { name: key, selector: node.selector } : extraField(key, language);
    if (field === undefined) continue;

    seen.add(key);
    fields.push(field);
  }

  for (const key of EXTRA_KEYS_BY_PANEL[panelId] ?? []) {
    if (seen.has(key) || !overrideKeys.has(key)) continue;

    const field = extraField(key, language);
    if (field === undefined) continue;

    seen.add(key);
    fields.push(field);
  }

  return fields;
}

/**
 * The exceptions a configuration already implies, before the user touches anything.
 *
 * @param config - Merged configuration, defaults already applied
 * @param view - View whose override block is being edited
 * @returns Option names to show as exceptions
 */
export function declaredKeys(
  config: Readonly<Types.Config>,
  view: Types.EffectiveView,
): ReadonlySet<string> {
  const viewBlock = ViewConfig.viewBlockFor(view);
  const declared = new Set<string>();

  if (viewBlock === undefined) return declared;

  const overrideKeys = new Set(viewBlock.overrideKeys);
  const block = config[viewBlock.blockKey];

  if (!Helpers.isConfigBlock(block)) return declared;

  for (const [key, value] of Object.entries(block)) {
    if (value !== undefined && overrideKeys.has(key)) declared.add(key);
  }

  return declared;
}

/**
 * The fields to render for a panel, given what has been declared.
 *
 * @param fields - The panel's eligible fields
 * @param declared - Every option declared as an exception, across all panels
 * @returns The subset this panel should render, in its own order
 */
export function activeFields(
  fields: ReadonlyArray<SelectorSchema>,
  declared: ReadonlySet<string>,
): SelectorSchema[] {
  return fields.filter((field) => declared.has(field.name));
}

/**
 * Removes an exception from a view's override block.
 *
 * @param config - Merged configuration, defaults already applied
 * @param blockKey - Config key holding the view's override block
 * @param key - Option to stop overriding
 * @returns A new configuration, or the original when the key was not overridden
 */
export function removeException(
  config: Readonly<Types.Config>,
  blockKey: keyof Types.Config,
  key: string,
): Types.Config {
  const block = config[blockKey];

  if (!Helpers.isConfigBlock(block)) {
    return config as Types.Config;
  }

  if (!Object.prototype.hasOwnProperty.call(block, key)) {
    return config as Types.Config;
  }

  const next = { ...(block as Record<string, unknown>) };
  delete next[key];

  const draft = { ...(config as unknown as Record<string, unknown>) };

  if (Object.keys(next).length === 0) {
    delete draft[blockKey];
  } else {
    draft[blockKey] = next;
  }

  return draft as unknown as Types.Config;
}

/**
 * Applies a change to the set of declared exceptions for one panel.
 *
 * @param config - Merged configuration, defaults already applied
 * @param blockKey - Config key holding the view's override block
 * @param eligible - The panel's eligible option names
 * @param declared - Every option declared as an exception, across all panels
 * @param selection - Option names the picker now reports
 * @returns The configuration and the declared set after the change
 */
export function applySelection(
  config: Readonly<Types.Config>,
  blockKey: keyof Types.Config,
  eligible: ReadonlyArray<string>,
  declared: ReadonlySet<string>,
  selection: ReadonlyArray<string>,
): { config: Types.Config; declared: ReadonlySet<string> } {
  const chosen = new Set(selection.filter((key) => eligible.includes(key)));
  const nextDeclared = new Set(declared);
  let nextConfig = config as Types.Config;

  for (const key of eligible) {
    if (chosen.has(key)) {
      nextDeclared.add(key);
      continue;
    }

    nextDeclared.delete(key);
    nextConfig = removeException(nextConfig, blockKey, key);
  }

  return { config: nextConfig, declared: nextDeclared };
}
