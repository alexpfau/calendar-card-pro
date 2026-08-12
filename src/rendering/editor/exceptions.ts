/**
 * Exceptions — giving one option a different value in one view.
 *
 * An override is an exception to a value that lives somewhere specific, so it belongs
 * beside that value rather than in a panel or a tab of its own. Everything here is
 * therefore derived **from the panel's own schema**: the options a panel can hold an
 * exception for are the options it renders, intersected with the ones the card can
 * actually resolve per view. That is the payoff of the editor being schema-driven — a
 * new field in a panel becomes exception-eligible by existing, with no second list to
 * keep in step and no way for the two to disagree.
 *
 * ## Why this is hand-written
 *
 * Home Assistant ships `ha-form-optional_actions`, whose shape is exactly right:
 * nothing is shown until the user asks for it. It cannot be used, and the reason is
 * worth recording so it is not re-evaluated. It is **add-only**. `_handleAddAction`
 * appends to a private `@state` array and there is no removal handler anywhere in the
 * component; worse, its `updated()` promotes any field whose key is present in the data
 * on every single update, so a field that has a value can never be hidden again. An
 * exception list that cannot remove an exception is not an exception list — it is a way
 * to accumulate dead overrides in somebody's YAML.
 *
 * ## The state that cannot live in the configuration
 *
 * An exception the user has just added holds the value it inherits, and an override
 * equal to what it inherits is stripped on write — correctly, because it changes
 * nothing. So *declared* and *stored* are different sets, and the difference has to be
 * held by the editor: deriving the list of exceptions purely from the configuration
 * would delete the row the moment it was created, which is the same failure the pending
 * mechanism exists to prevent for a half-typed value. `declaredKeys` seeds the set from
 * the configuration; the element keeps it from there.
 */

import type { HaFormSchema, SelectorSchema } from './ha-form';
import * as Overrides from './overrides';
import { walkSchema } from './panels';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';

/**
 * Options a panel can hold an exception for despite not rendering them directly.
 *
 * Two reasons for a key to be here, and they are different reasons.
 *
 * Both heights are edited through a mode dropdown that chooses *which* of the two keys
 * is set, which is the right control for a card that has one height and the wrong one
 * for an exception to a single key. Each is a plain string in the block, so each gets a
 * plain control below.
 *
 * The other three are unions no selector can emit, and they are here because the panel
 * renders their *stand-ins* rather than the key itself — so walking the schema finds
 * `week_number_mode` and never `show_week_numbers`. `overrides.ts` gives each the same
 * derivation the panel uses, pointed at the block.
 *
 * A key here must be override-eligible and must have a selector below; both are
 * asserted by the tests rather than left to review.
 */
const EXTRA_KEYS_BY_PANEL: Readonly<Record<string, ReadonlyArray<string>>> = {
  layout: ['height', 'max_height'],
  day_header: ['show_week_numbers', 'today_indicator'],
  events: ['remove_location_country'],
};

/**
 * Selectors for the options a panel does not render directly.
 *
 * Text, because both are CSS lengths and both carry a sentinel the card understands —
 * `auto` and `none` — that no numeric control could express.
 */
const EXTRA_SELECTORS: Readonly<Record<string, SelectorSchema>> = {
  height: { name: 'height', selector: { text: {} } },
  max_height: { name: 'max_height', selector: { text: {} } },
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

/** Every option that can be given a different value in a view that has a block. */
const OVERRIDE_KEYS: ReadonlySet<string> = new Set<string>(ViewConfig.COLUMN_OVERRIDE_KEYS);

/**
 * The fields a panel offers an exception for, in the order the panel renders them.
 *
 * Derived by walking what the panel actually built, so the exception control for an
 * option is the *same selector* as the option itself — a switch stays a switch, a
 * dropdown keeps its options — and cannot drift from it.
 *
 * `COLUMN_ONLY_KEYS` fall out for free: they are configuration that exists only in the
 * block, not exceptions to anything, and they are not in the override list. So do the
 * fetch-time keys, which can never be per-view at all — switching layout at a viewport
 * boundary must not refetch — and every synthetic field, which is not a config key.
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
 * The option names a panel offers an exception for.
 *
 * @param schema - The panel's schema, as built for the current configuration
 * @param panelId - Which panel it belongs to
 * @param language - Effective language code
 * @returns Eligible option names, in render order
 */
export function eligibleKeys(
  schema: ReadonlyArray<HaFormSchema>,
  panelId: string,
  language = 'en',
): ReadonlyArray<string> {
  return eligibleFields(schema, panelId, language).map((field) => field.name);
}

/**
 * The exceptions a configuration already implies, before the user touches anything.
 *
 * Exactly what a view's block actually sets, and nothing else. The design proposed
 * seeding the keys whose *default* differs per view as well, so that "column view has
 * already changed this for you" was visible — the intent is right and the placement was
 * not: seeding them means a card with no exceptions at all opens with two exception
 * rows, which is chrome for a card that has asked for none. That statement belongs
 * beside the shared control it qualifies, where it is one sentence rather than a row —
 * see `divergentDefaultNote`.
 *
 * Every view with a block is read, not the current one. The set is a property of the
 * configuration rather than of what is on screen, and a user switching view mid-session
 * should not find their exceptions gone and back again.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns Option names to show as exceptions
 */
export function declaredKeys(config: Readonly<Types.Config>): ReadonlySet<string> {
  const declared = new Set<string>();

  for (const blockKey of Object.values(ViewConfig.OVERRIDE_BLOCK_BY_VIEW)) {
    const block = config[blockKey];

    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;

    for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
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
 * Deletes the key rather than writing the inherited value into it. Those are not the
 * same act: the second leaves a line that does nothing, which is how a configuration
 * fills up with overrides nobody meant, and it would also survive the next edit as a
 * real override if the shared value later changed.
 *
 * The block is dropped entirely once it holds nothing, so removing the last exception
 * cannot leave `column: {}` behind. The write path prunes an empty block as well —
 * this is not redundant with it but complementary: pruning on write keeps it out of
 * storage, and dropping it here keeps the *editor's own* configuration honest, so the
 * next read of it does not report a block that is not there.
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

  if (!block || typeof block !== 'object' || Array.isArray(block)) {
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
 * The picker reports the whole selection, so both directions are recovered by
 * comparison: what it gained is declared, and what it lost is both undeclared **and**
 * deleted from the block.
 *
 * Only the panel's own eligible options are considered, so one panel's picker can never
 * disturb an exception belonging to another.
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
