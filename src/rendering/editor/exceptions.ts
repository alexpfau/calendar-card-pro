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

const EXTRA_KEYS_BY_PANEL: Readonly<Record<string, ReadonlyArray<string>>> = {
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

const OVERRIDE_KEYS: ReadonlySet<string> = new Set<string>(ViewConfig.COLUMN_OVERRIDE_KEYS);

/**
 * The fields a panel offers an exception for, in the order the panel renders them.
 *
 * @param schema - The panel's schema, as built for the current configuration
 * @param panelId - Which panel it belongs to
 * @param language - Effective language code, for the extra fields' option labels
 * @returns One field per eligible option
 */
export function eligibleFields(
  schema: ReadonlyArray<HaFormSchema>,
  panelId: string,
  language = 'en',
): SelectorSchema[] {
  const seen = new Set<string>();
  const fields: SelectorSchema[] = [];

  for (const { node } of walkSchema(schema)) {
    if (!('selector' in node) || !OVERRIDE_KEYS.has(node.name) || seen.has(node.name)) {
      continue;
    }

    seen.add(node.name);
    fields.push({ name: node.name, selector: node.selector });
  }

  for (const key of EXTRA_KEYS_BY_PANEL[panelId] ?? []) {
    if (seen.has(key) || !OVERRIDE_KEYS.has(key)) continue;

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
 * @returns Option names to show as exceptions
 */
export function declaredKeys(config: Readonly<Types.Config>): ReadonlySet<string> {
  const declared = new Set<string>();

  for (const blockKey of Object.values(ViewConfig.OVERRIDE_BLOCK_BY_VIEW)) {
    const block = config[blockKey];

    if (!Helpers.isConfigBlock(block)) continue;

    for (const [key, value] of Object.entries(block)) {
      if (value !== undefined && OVERRIDE_KEYS.has(key)) declared.add(key);
    }
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
