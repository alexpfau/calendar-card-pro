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

import { ENTITY_TRISTATE_STORED, ENTITY_TRISTATE_VALUES, INHERIT } from './schemas/entity';
import { entityIdOf } from './synthetic';
import * as Types from '../../config/types';

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
 * Projects one calendar's stored settings into the shape its form binds.
 *
 * The only transformation is the three inheritable switches: stored as `true`, `false`
 * or absent, offered as one of three named options. Everything else binds directly.
 *
 * @param entry - Entry as stored
 * @returns Form data for that calendar
 */
export function toEntityFormData(entry: string | Types.EntityConfig): Record<string, unknown> {
  const config = asEntityConfig(entry) as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = { ...config };

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
 * @param entityId - The calendar this configures
 * @param data - Form data as the form returned it
 * @returns The entry to store, as a bare id when it carries no settings
 */
export function fromEntityFormData(
  entityId: string,
  data: Readonly<Record<string, unknown>>,
): string | Types.EntityConfig {
  const entry: Record<string, unknown> = { entity: entityId };

  for (const [key, value] of Object.entries(data)) {
    if (key === 'entity') continue;

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
  next[index] = fromEntityFormData(entityId, data);

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
