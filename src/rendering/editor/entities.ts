/**
 * Entity-list schema and per-calendar form helpers.
 */

import {
  ACCENT_COLOR_MODE,
  ENTITY_TRISTATE_STORED,
  ENTITY_TRISTATE_VALUES,
  INHERIT,
  LABEL_TYPE,
  accentColorModeOf,
} from './schemas/entity';
import { entityIdOf, isSet } from './synthetic';
import * as Types from '../../config/types';
import { ENTITY_COLOR_SENTINEL } from '../../utils/entity-colors';
import * as Helpers from '../../utils/helpers';

const NUMERIC_KEYS: ReadonlySet<string> = new Set(['compact_events_to_show']);

const NON_TRANSFERABLE_KEYS: ReadonlySet<string> = new Set(['entity']);

/**
 * Settings copied from one calendar, awaiting a paste.
 *
 * Deliberately module-scoped rather than editor-instance state: the clipboard outlives a
 * single editor dialog, so settings copied while editing one card can be pasted into
 * another. That is the useful case — several cards usually list the same calendars — and
 * it matches how a clipboard is expected to behave. It is page-scoped, not persisted, and
 * a paste is always an explicit click, so nothing is written without the user asking.
 *
 * `clearCopiedSettings()` exists for tests, which would otherwise leak this between cases.
 */
let clipboard: Types.EntityConfig | undefined;

/**
 * Reads one entry of the `entities` array as an object.
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
 * @param entry - Entry as stored
 * @returns Form data for that calendar
 */
export function toEntityFormData(entry: string | Types.EntityConfig): Record<string, unknown> {
  const config = asEntityConfig(entry) as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = {
    ...config,
    [LABEL_TYPE]: labelTypeOf(entry),
    [ACCENT_COLOR_MODE]: accentColorModeOf(config.accent_color),
  };

  for (const [name, values] of Object.entries(ENTITY_TRISTATE_VALUES)) {
    const stored = config[name];
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
 * @param previous - The entry as stored before this edit
 * @returns The entry to store, as a bare id when it carries no settings
 */
export function fromEntityFormData(
  entityId: string,
  data: Readonly<Record<string, unknown>>,
  previous: string | Types.EntityConfig = entityId,
): string | Types.EntityConfig {
  const entry: Record<string, unknown> = { entity: entityId };

  const chosenType = Helpers.isLabelType(data[LABEL_TYPE])
    ? data[LABEL_TYPE]
    : labelTypeOf(previous);

  const moved = chosenType !== labelTypeOf(previous);

  // The accent mode is a form field, never a stored one: it is read back off the value's
  // shape. Writing it would put a key in the user's YAML that the card never reads.
  const accentMode = String(
    data[ACCENT_COLOR_MODE] ?? accentColorModeOf(asEntityConfig(previous).accent_color),
  );

  for (const [key, value] of Object.entries(data)) {
    if (key === 'entity' || key === LABEL_TYPE || key === ACCENT_COLOR_MODE) continue;

    if (key === 'label') {
      if (chosenType === 'none') continue;

      if (moved && !fitsShape(chosenType, value)) continue;
    }

    if (key === 'label_icon_color' && moved && chosenType !== 'icon') continue;

    if (key === 'accent_color') {
      // Only the custom mode has a colour to store. The other two are the sentinel and
      // nothing at all, both written below rather than carried through from the form.
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
      if (Number.isFinite(numeric)) entry[key] = numeric;
      continue;
    }

    entry[key] = value;
  }

  const accentColor = accentColorFor(accentMode, data.accent_color);
  if (accentColor !== undefined) {
    entry.accent_color = accentColor;
  }

  if (needsExplicitType(chosenType, entry.label)) {
    entry.label_type = chosenType;
  }

  return Object.keys(entry).length === 1 ? entityId : (entry as unknown as Types.EntityConfig);
}

/**
 * The `accent_color` one calendar should store for the mode it is in.
 *
 * @param mode - Mode the dropdown names
 * @param value - Colour as the form holds it
 * @returns The value to store, or `undefined` to store nothing
 */
function accentColorFor(mode: string, value: unknown): string | undefined {
  if (mode === 'home_assistant') return ENTITY_COLOR_SENTINEL;
  if (mode !== 'custom') return undefined;

  return isSet(value) ? String(value) : undefined;
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
function transferableSettings(entry: string | Types.EntityConfig): Types.EntityConfig {
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

/**
 * Forgets whatever has been copied.
 */
export function clearCopiedSettings(): void {
  clipboard = undefined;
}

/**
 * Applies the copied settings to one calendar.
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
