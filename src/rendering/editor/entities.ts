/**
 * Value plumbing for the per-calendar list.
 *
 * The counterpart to `value.ts`, for the one part of the configuration that is a list.
 * Everything here is a pure function over the `entities` array, so the whole per-entity
 * write path is testable without a DOM — which matters more here than elsewhere,
 * because this is the only place in the editor where an edit can destroy configuration
 * belonging to something the user is not looking at.
 *
 * Three rules govern it:
 *
 * - **The narrowest shape wins.** `entities` accepts `'calendar.x'` or
 *   `{ entity: 'calendar.x', … }`. An entry with no settings is written back as a bare
 *   string, so clearing the last per-calendar option leaves the configuration exactly
 *   as it was before the first one was set.
 * - **Empty is absent.** An emptied text box removes its key rather than storing `''`,
 *   and *inherit* removes its key rather than storing `undefined`. The card reads these
 *   presence-first (`getEntitySetting(…) ?? config.show_time`), so a key that is
 *   present and empty is not the same as no key, and only one of the two means "follow
 *   the card".
 * - **Order is preserved.** `filter_duplicates` keeps the copy from whichever calendar
 *   is listed first, so the array's order is configuration in its own right and nothing
 *   here may reorder it as a side effect.
 */

import {
  ENTITY_TRISTATE_STORED,
  ENTITY_TRISTATE_VALUES,
  INHERIT,
  LABEL_TYPE,
} from './schemas/entity';
import { entityIdOf } from './synthetic';
import * as Types from '../../config/types';
import * as Helpers from '../../utils/helpers';

/** Per-calendar options stored as a number rather than a string. */
const NUMERIC_KEYS: ReadonlySet<string> = new Set(['compact_events_to_show']);

/**
 * The one key a calendar's settings cannot be shared with another calendar.
 *
 * Everything else — label, colours, filters, the inheritable switches — describes how
 * that calendar's events are *presented*, and is exactly what somebody copying settings
 * between calendars wants. The entity id is what identifies the calendar, so carrying
 * it across would replace the target rather than configure it.
 */
const NON_TRANSFERABLE_KEYS: ReadonlySet<string> = new Set(['entity']);

/**
 * Settings copied from one calendar, held for pasting into another.
 *
 * Module-level rather than element state, and deliberately: a Home Assistant card
 * editor is constructed fresh every time the dialog opens, so element state would lose
 * the clipboard the moment the user closed one card to look at another. The whole point
 * of the feature — configure one calendar, paste into the other five — needs it to
 * outlive the dialog.
 *
 * Ours, and namespaced by being ours. Home Assistant's own `dashboardCardClipboard` is
 * read by the card picker, so writing a per-calendar object into it would offer the
 * user a nonsense card to add.
 */
let clipboard: Types.EntityConfig | undefined;

/** Whether a value counts as configured. */
function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Reads one entry of the `entities` array as an object.
 *
 * Tolerates a malformed entry, and does so deliberately rather than defensively. A
 * `null` reaches this from a real configuration — a YAML list item left blank is
 * `null`, not absent — and the editor is the one place that must survive reading a
 * configuration it did not write. Crashing here would take the whole editor down and
 * leave the user with no way to fix the list that caused it.
 *
 * @param entry - Entry as stored, either a bare id or a settings object
 * @returns The entry in object form, without copying when it already is one
 */
export function asEntityConfig(entry: string | Types.EntityConfig): Types.EntityConfig {
  if (typeof entry === 'string') return { entity: entry };
  if (entry === null || typeof entry !== 'object') return { entity: '' };

  return entry;
}

/**
 * The shape one calendar's label holds.
 *
 * Asked of the renderer's own classifier rather than answered here, so the control the
 * editor offers and the thing the card draws can never disagree about what a value is.
 *
 * @param entry - Entry as stored
 * @returns The label's shape
 */
export function labelTypeOf(entry: string | Types.EntityConfig): string {
  return Helpers.getLabelType(asEntityConfig(entry).label);
}

/** What a shape is seeded with when it is chosen and the current value cannot serve. */
const LABEL_SEEDS: Readonly<Record<string, string>> = {
  text: '📅',
  icon: 'mdi:calendar',
  image: '/local/calendar.jpg',
};

/**
 * The label value after the shape dropdown has been moved.
 *
 * Carried over when the value already has the shape that was chosen — switching away
 * and back must not lose an icon — and seeded otherwise, because a shape with no value
 * has no control to show and would derive straight back to *None*.
 *
 * @param type - Shape the user chose
 * @param current - Label value as stored
 * @returns The value to store, or `undefined` to remove the label
 */
function reshapedLabel(type: string, current: unknown): string | undefined {
  if (type === 'none') return undefined;
  if (Helpers.getLabelType(current) === type) return String(current);

  return LABEL_SEEDS[type];
}

/**
 * Projects one calendar's stored settings into the shape its form binds.
 *
 * Two transformations. The three inheritable switches are stored as `true`, `false` or
 * absent and offered as one of three named options. The label's *shape* is derived from
 * its value, because that is where the shape lives — there is no `label_type` key and
 * there must not be one.
 *
 * @param entry - Entry as stored
 * @returns Form data for that calendar
 */
export function toEntityFormData(entry: string | Types.EntityConfig): Record<string, unknown> {
  const config = asEntityConfig(entry) as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = { ...config, [LABEL_TYPE]: labelTypeOf(entry) };

  for (const [name, values] of Object.entries(ENTITY_TRISTATE_VALUES)) {
    const stored = config[name];
    // Read by value rather than by presence, so a hand-written `show_time: null`
    // resolves to *inherit* — which is what the card does with it — instead of
    // selecting nothing and leaving the control blank.
    const match = values.find((value) => ENTITY_TRISTATE_STORED[value] === stored);
    data[name] = match ?? INHERIT;
  }

  return data;
}

/**
 * Narrows a calendar's form data back to what should be stored.
 *
 * The label needs the previous entry, and it is the one field that does. `ha-form` says
 * only that the form changed, so *the user moved the shape dropdown* and *the user typed
 * something that happens to have a different shape* arrive identically — and they must
 * not be treated the same way. Comparing the chosen shape against the **stored** one
 * separates them: a shape that differs from what is stored is a dropdown move and seeds
 * a value; a shape that matches is a value edit and is stored as typed.
 *
 * Typing `mdi:` into the text box therefore stores exactly that and re-derives the shape
 * as an icon on the next render, which swaps the box for the picker. That is deliberate,
 * and it is why there is no held-text mechanism here: the value the user is typing *is*
 * the value the card would render, at every keystroke, so there is nothing to hold it
 * back from.
 *
 * @param entityId - The calendar this configures
 * @param data - Form data as the form returned it
 * @param previous - The entry as stored before this edit
 * @returns The entry to store, as a bare id when it carries no settings
 */
export function fromEntityFormData(
  entityId: string,
  data: Readonly<Record<string, unknown>>,
  previous: string | Types.EntityConfig = entityId,
): string | Types.EntityConfig {
  const entry: Record<string, unknown> = { entity: entityId };

  const chosenType = String(data[LABEL_TYPE] ?? '');
  const reshaped = chosenType !== '' && chosenType !== labelTypeOf(previous);

  for (const [key, value] of Object.entries(data)) {
    if (key === 'entity' || key === LABEL_TYPE) continue;

    if (key === 'label' && reshaped) {
      const next = reshapedLabel(chosenType, value);
      if (next !== undefined) entry.label = next;
      continue;
    }

    if (key in ENTITY_TRISTATE_VALUES) {
      const stored = ENTITY_TRISTATE_STORED[String(value)];
      if (stored !== undefined) entry[key] = stored;
      continue;
    }

    if (!isSet(value)) continue;

    if (NUMERIC_KEYS.has(key)) {
      const numeric = Number(value);
      // A box mid-edit can hand back something that is not a number at all. Storing
      // `NaN` would serialise as `null` and read back as a configured limit of none.
      if (Number.isFinite(numeric)) entry[key] = numeric;
      continue;
    }

    entry[key] = value;
  }

  // A shape chosen while the form was showing none has no `label` field to carry it, so
  // the seed is written here instead of being lost.
  if (reshaped && entry.label === undefined) {
    const seeded = reshapedLabel(chosenType, asEntityConfig(previous).label);
    if (seeded !== undefined) entry.label = seeded;
  }

  return Object.keys(entry).length === 1 ? entityId : (entry as unknown as Types.EntityConfig);
}

/**
 * Replaces one calendar's settings within the list.
 *
 * @param entities - The list as stored
 * @param index - Position of the calendar being edited
 * @param data - Form data as the form returned it
 * @returns A new list, or the original when the index is not in it
 */
export function writeEntity(
  entities: ReadonlyArray<string | Types.EntityConfig>,
  index: number,
  data: Readonly<Record<string, unknown>>,
): Array<string | Types.EntityConfig> {
  if (index < 0 || index >= entities.length) {
    return [...entities];
  }

  const entityId = entityIdOf(entities[index]);
  const next = [...entities];
  next[index] = fromEntityFormData(entityId, data, entities[index]);

  return next;
}

/**
 * Strips the keys that identify a calendar, leaving the ones that describe it.
 *
 * @param entry - Entry as stored
 * @returns The transferable settings
 */
export function transferableSettings(entry: string | Types.EntityConfig): Types.EntityConfig {
  const config = asEntityConfig(entry) as unknown as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !NON_TRANSFERABLE_KEYS.has(key)),
  ) as unknown as Types.EntityConfig;
}

/**
 * Copies one calendar's settings to the clipboard.
 *
 * @param entry - Entry as stored
 */
export function copySettings(entry: string | Types.EntityConfig): void {
  clipboard = transferableSettings(entry);
}

/**
 * The settings currently held, if any.
 *
 * @returns The clipboard contents, or `undefined` when nothing has been copied
 */
export function copiedSettings(): Types.EntityConfig | undefined {
  return clipboard;
}

/** Forgets whatever has been copied. Exists for the tests, which must not leak state. */
export function clearCopiedSettings(): void {
  clipboard = undefined;
}

/**
 * Applies the copied settings to one calendar.
 *
 * A **replacement**, not a merge. "Paste settings" means the target ends up configured
 * like the source, and a merge could not express clearing a colour the target has and
 * the source does not — it would leave the two looking different after an operation
 * whose whole purpose is making them look the same.
 *
 * @param entities - The list as stored
 * @param index - Position of the calendar being pasted into
 * @returns A new list, or the original when nothing has been copied
 */
export function pasteSettings(
  entities: ReadonlyArray<string | Types.EntityConfig>,
  index: number,
): Array<string | Types.EntityConfig> {
  const next = [...entities];

  if (clipboard === undefined || index < 0 || index >= entities.length) {
    return next;
  }

  const entityId = entityIdOf(entities[index]);
  const pasted = { ...clipboard, entity: entityId };

  next[index] = Object.keys(pasted).length === 1 ? entityId : pasted;

  return next;
}

/**
 * Whether a calendar carries any settings of its own.
 *
 * @param entry - Entry as stored
 * @returns `true` when anything beyond the entity id is configured
 */
export function hasSettings(entry: string | Types.EntityConfig): boolean {
  return Object.keys(asEntityConfig(entry)).some((key) => key !== 'entity');
}
