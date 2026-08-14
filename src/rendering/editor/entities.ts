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
import { entityIdOf, isSet } from './synthetic';
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
 * Asked of the shared resolver rather than answered here, so the control the editor
 * offers and the thing the card draws can never disagree about what a value is. Where
 * the entry names its shape that naming wins; otherwise the value is read, which is
 * what every configuration written before `label_type` existed relies on.
 *
 * @param entry - Entry as stored
 * @returns The label's shape
 */
export function labelTypeOf(entry: string | Types.EntityConfig): string {
  const config = asEntityConfig(entry);
  return Helpers.resolveLabelType(config.label, config.label_type);
}

/**
 * Whether the shape has to be written down, or can be read back off the value.
 *
 * The rule that keeps `label_type` out of almost every configuration: it is stored
 * **exactly when reading the value would give a different answer**. So the ordinary
 * cases — an emoji that reads as text, an `mdi:` name that reads as an icon — store
 * nothing new and the YAML is byte-for-byte what it was before this key existed. It
 * appears only in the two cases inference cannot express: a shape chosen but not yet
 * filled in, and a text label that happens to look like an icon or an image.
 *
 * @param type - Shape the dropdown names
 * @param label - Label value as it will be stored
 * @returns `true` when the shape must be stored alongside the value
 */
function needsExplicitType(type: string, label: unknown): boolean {
  return Helpers.isLabelType(type) && type !== 'none' && Helpers.getLabelType(label) !== type;
}

/**
 * Whether a value is something the given shape could actually render.
 *
 * Asymmetric, and deliberately: **any** non-empty string renders as text, which is what
 * makes *Text or Emoji* a shape nothing is ever lost moving to. An icon and an image are
 * narrower — `Work` is not an icon name and not a path — so they answer to the reader.
 *
 * @param type - Shape being moved to
 * @param value - Label value as it stands
 * @returns `true` when that shape can draw that value
 */
function fitsShape(type: string, value: unknown): boolean {
  if (typeof value !== 'string' || value === '') return false;

  return type === 'text' || Helpers.getLabelType(value) === type;
}

/**
 * Projects one calendar's stored settings into the shape its form binds.
 *
 * Two transformations. The three inheritable switches are stored as `true`, `false` or
 * absent and offered as one of three named options. The label's *shape* is **resolved**
 * — the stored `label_type` where there is one, the value's own reading where there is
 * not — so the dropdown shows one answer whichever way the calendar was configured.
 *
 * The form field and the config key share a name, so the spread puts the stored shape
 * in and this overwrites it with the resolved one. That is the intent: a calendar that
 * stores no shape still binds the dropdown to something.
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
 * **The shape dropdown is authoritative.** It used to be a reading of the value, which
 * meant the write path had to guess whether a change was the user moving the dropdown
 * or typing something that happened to read differently — and it guessed by comparing
 * against the stored shape, which cannot tell *cleared the box* from *never had a
 * label*. That is the bug this replaced: clearing the text removed the key, the shape
 * read back as *None*, and the field the user was typing into disappeared.
 *
 * Now the dropdown says what the shape is and the value is stored as typed. The shape
 * is written down only when reading the value back would disagree with it
 * (`needsExplicitType`), so an ordinary label stores exactly what it always did.
 *
 * Two consequences worth stating, because both are deliberate:
 *
 * - **Nothing is seeded.** A shape used to arrive pre-filled — `📅`, `mdi:calendar` —
 *   purely so that reading the value back would not answer *None* and collapse the
 *   control. With the shape stored that prop is unnecessary, and it was actively in the
 *   way: the emoji had to be deleted before a name could be typed, and deleting it was
 *   the very act that broke the field.
 * - **Typing `mdi:home` into the text box keeps it text.** It is stored verbatim with
 *   `label_type: text` and renders as those nine characters. Swapping the box for an
 *   icon picker mid-word is the same class of defect as the one above — the control
 *   moving under the cursor — and the picker is one dropdown away.
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

  // The form always carries the dropdown; `previous` answers for a caller that builds
  // form data by another route, such as pasting one calendar's settings into another.
  const chosenType = Helpers.isLabelType(data[LABEL_TYPE])
    ? data[LABEL_TYPE]
    : labelTypeOf(previous);

  // Whether this edit *moved* the dropdown, as opposed to changing something else. Two
  // things are allowed to discard data, and only on a move: a value the new shape cannot
  // draw, and the icon colour. Doing either on every edit would mean changing `show_time`
  // silently deleted a setting the user could not see.
  const moved = chosenType !== labelTypeOf(previous);

  for (const [key, value] of Object.entries(data)) {
    // `LABEL_TYPE` names both the form field and the config key, so skipping it here
    // covers the stored value too — the shape is rewritten below from `chosenType`
    // rather than copied through.
    if (key === 'entity' || key === LABEL_TYPE) continue;

    if (key === 'label') {
      // *None* means no label, so the value does not survive it.
      if (chosenType === 'none') continue;

      // Moved to a shape that cannot draw what is there: dropped rather than replaced,
      // so the control arrives empty instead of holding something to delete first.
      if (moved && !fitsShape(chosenType, value)) continue;
    }

    // The colour applies to an icon and to nothing else, so it does not follow the label
    // to a shape that cannot use it. Only on the move, though — left alone it would sit
    // in the configuration doing nothing, and there is no control to remove it with.
    if (key === 'label_icon_color' && moved && chosenType !== 'icon') continue;

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

  if (needsExplicitType(chosenType, entry.label)) {
    entry.label_type = chosenType;
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
