/**
 * Entity-list schema and per-calendar form helpers.
 */

import {
  ACCENT_COLOR_MODE,
  ENTITY_TRISTATE_DEFAULT,
  ENTITY_TRISTATE_STORED,
  ENTITY_TRISTATE_VALUES,
  INHERIT,
  LABEL_ICON_SOURCE,
  LABEL_IMAGE_SIZE,
  LABEL_IMAGE_SOURCE,
  LABEL_PARTS,
  LABEL_TYPE,
  SHOW_IN_LEGEND,
  VISIBILITY,
  accentColorModeOf,
  labelIconSourceOf,
  labelImageSourceOf,
} from './schemas/entity';
import { entityIdOf, isSet } from './synthetic';
import { deepEqual } from './value';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import { configuredCalendarName } from '../../utils/calendar-names';
import { ENTITY_COLOR_SENTINEL, isEntityColorSentinel } from '../../utils/entity-colors';
import { ENTITY_ICON_SENTINEL, entityIcon, isEntityIconSentinel } from '../../utils/entity-icons';
import * as Helpers from '../../utils/helpers';
import { firstPersonEntityId, isPersonEntityId, personPicture } from '../../utils/person-pictures';

const NUMERIC_KEYS: ReadonlySet<string> = new Set(['compact_events_to_show', 'text_scale']);

/**
 * One option that belongs to the calendar rather than to one block of it, in the four terms
 * the editor reads and writes it in.
 */
interface CalendarOption {
  /** What the blocks hold for the calendar, the first block that sets it deciding. */
  configured(entities: ReadonlyArray<unknown>, entityId: string): unknown;
  /** The value every panel of the calendar shows for that; `undefined` leaves the field empty. */
  shown(configured: unknown): unknown;
  /** The form's value in the terms of `shown`, given what the panel showed. */
  answered(value: unknown, shown: unknown): unknown;
  /** What a block stores to say a shown value; `undefined` stores nothing. */
  stored(shown: unknown): unknown;
}

/**
 * 🚨 **The options a calendar has once, however many blocks it is listed in**, keyed in the
 * order a block stores them, beside the id. Each panel shows the calendar's value, a change on
 * any panel is written to every block of the calendar ({@link writeEntity}), and Remove leaves
 * the value on the block that remains ({@link removeEntity}). The card reads each across the
 * whole list, the first block that sets it deciding, so two blocks holding two values would
 * show one on screen and the other in a panel.
 *
 * None of them travels through Copy and Paste ({@link NON_TRANSFERABLE_KEYS}), which act on one
 * block: a paste writing one would leave the calendar's other blocks saying something else,
 * and the first of them would still decide.
 */
const CALENDAR_OPTIONS: Readonly<Record<string, CalendarOption>> = {
  name: {
    configured: configuredCalendarName,
    shown: (configured) => configured,
    answered: (value) => nameOf(value),
    stored: (shown) => shown,
  },
  // A switch, so the panel always shows one of its two states, and a value that is not a
  // boolean leaves it as it was rather than turning it on.
  [SHOW_IN_LEGEND]: {
    configured: Config.configuredShowInLegend,
    shown: (configured) => configured !== false,
    answered: (value, shown) => (typeof value === 'boolean' ? value : shown),
    stored: (shown) => (shown === false ? false : undefined),
  },
};

/**
 * Whether a key is one of the {@link CALENDAR_OPTIONS}.
 *
 * @param key - Config key
 * @returns `true` for an option the calendar has once
 */
export function isCalendarOption(key: string): boolean {
  return Helpers.hasOwn(CALENDAR_OPTIONS, key);
}

/**
 * Keys that never travel through Copy and Paste: the id, and every option the calendar has once.
 *
 * `name` is identity as much as `entity` is: it names one calendar, and pasting it onto
 * another would give two calendars one name in the legend. Whether the filter lists a calendar
 * stays with it for the reason {@link CALENDAR_OPTIONS} gives: Paste writes one block, and the
 * setting belongs to all of them. Duplicate is different, and keeps both, because a duplicate is
 * the same calendar.
 */
const NON_TRANSFERABLE_KEYS: ReadonlySet<string> = new Set([
  'entity',
  ...Object.keys(CALENDAR_OPTIONS),
]);

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

/** The name of the calendar entry the clipboard was copied from, for Paste's "From Ben". */
let copiedFromName: string | undefined;

/**
 * Where one calendar sits among the blocks configuring that same calendar.
 */
export interface EntityOccurrence {
  /** This block's place in that run, counting from one. */
  position: number;
  /** How many blocks configure this calendar in total. */
  total: number;
}

/**
 * The name to show for a calendar, matching what Home Assistant's own picker shows.
 *
 * The picker moved to friendly names some time ago, so a panel headed with an entity id
 * sits a few pixels below a row naming the same calendar something else entirely — and an
 * id need not resemble its name at all, so there was no reading the one off the other.
 *
 * This reads `friendly_name` rather than porting Home Assistant's own resolution.
 * `computeEntityPickerDisplay` reaches through four registries — entities, devices, areas
 * and floors — none of which this card's `hass` carries, and all of which are internal
 * frontend shapes of exactly the kind this editor avoids naming. `friendly_name` is a
 * public state attribute, and for an entity with no device it is the same string the
 * picker arrives at. Where a device does exist the picker strips the device name off the
 * front and shows it on a second line instead; this shows the unstripped name, which is
 * what every other Home Assistant surface calls that entity. Calendars rarely have one.
 *
 * The entity id is the fallback for both ways a name can come up empty — a calendar
 * removed from Home Assistant but still listed in the card, and a state carrying no
 * `friendly_name` — and it is the picker's own last resort too.
 *
 * 🚨 It deliberately ignores the calendar's `name` option, which every surface of the card
 * itself reads. The heading matches the picker row directly above it, and that row is Home
 * Assistant's control, which the card cannot rename; the line under the heading leads with
 * the card's own name instead (`_entitySummary`), and the Name field inside the panel holds it.
 *
 * @param entityId - The calendar's entity id
 * @param hass - Home Assistant state, absent before the editor is handed one
 * @returns The name to show, never blank
 */
export function entityDisplayName(entityId: string, hass?: Types.Hass): string {
  const friendly = hass?.states?.[entityId]?.attributes?.friendly_name;

  return typeof friendly === 'string' && friendly.trim() !== '' ? friendly : entityId;
}

/**
 * Counts the blocks configuring the same calendar, and finds this one among them.
 *
 * Listing a calendar twice gives both panels the same heading, because the heading is the
 * calendar's name and they name the same calendar. That is the cost of showing the name
 * rather than the id, and this is what pays it back.
 *
 * @param entities - The list as stored
 * @param index - Position of the calendar being described
 * @returns Its place among its own duplicates, or zeroes when the index is not in the list
 */
export function occurrenceOf(
  entities: ReadonlyArray<string | Types.EntityConfig>,
  index: number,
): EntityOccurrence {
  if (index < 0 || index >= entities.length) return { position: 0, total: 0 };

  const id = entityIdOf(entities[index]);
  let position = 0;
  let total = 0;

  entities.forEach((entry, at) => {
    if (entityIdOf(entry) !== id) return;

    total += 1;
    if (at === index) position = total;
  });

  return { position, total };
}

/**
 * Adds a second block for one calendar, carrying the first one's settings.
 *
 * Home Assistant's entity picker will not do this: it merges the current value into its
 * own exclusions, and ignores a duplicate added through it. So the only way to reach a
 * pattern the card documents — one calendar with two sets of settings, split by
 * `event_type` — is to write the configuration directly, which the calendar list's
 * Duplicate does (`calendar-list.ts` › `duplicateEntry`).
 *
 * The copy is inserted next to its source rather than appended, so it appears where the
 * user was looking, and because the list keeps a calendar's entries together there is
 * nothing to be gained by separating them.
 *
 * A spread is a complete copy because `EntityConfig` is flat — every option on it is a
 * string, number or boolean. An option holding an array or an object would need a deeper
 * one, or the two blocks would share it and editing either would change both.
 *
 * @param entities - The list as stored
 * @param index - Position of the calendar being duplicated
 * @returns A new list, or the original when the index is not in it
 */
export function duplicateEntity(
  entities: ReadonlyArray<string | Types.EntityConfig>,
  index: number,
): Array<string | Types.EntityConfig> {
  const next = [...entities];

  if (index < 0 || index >= entities.length) return next;

  const source = entities[index];
  next.splice(index + 1, 0, typeof source === 'string' ? source : { ...source });

  return next;
}

/**
 * Drops one calendar block from the list.
 *
 * The picker can take a calendar off the card, but it works one calendar at a time: it
 * lists each one once, so clearing a row removes every block that calendar has. This is
 * the only control that removes a single block, which is what makes it the inverse of
 * Duplicate rather than a shortcut for something the picker already does.
 *
 * A calendar's name, and whether the calendar filter lists it, outlive the block that held them
 * while another block of that calendar remains. Every panel of the calendar shows them, even in
 * hand-written YAML that holds them on one block only, so removing that block moves them onto
 * the first block left rather than silently handing the calendar back to Home Assistant's name
 * or to the filter.
 *
 * @param entities - The list as stored
 * @param index - Position of the block being removed
 * @returns A new list, or the original when the index is not in it
 */
export function removeEntity(
  entities: ReadonlyArray<string | Types.EntityConfig>,
  index: number,
): Array<string | Types.EntityConfig> {
  const next = [...entities];

  if (index < 0 || index >= entities.length) return next;

  const id = entityIdOf(entities[index]);

  next.splice(index, 1);

  const heir = next.findIndex((entry) => entityIdOf(entry) === id);
  if (heir < 0) return next;

  for (const [key, option] of Object.entries(CALENDAR_OPTIONS)) {
    const held = option.configured(entities, id);
    if (held !== undefined && option.configured(next, id) === undefined) {
      next[heir] = withOption(next[heir], key, held);
    }
  }

  return next;
}

/**
 * Deletes options from one block of a calendar, as a Reset does: the block's own lines go, and an
 * option the calendar has once ({@link CALENDAR_OPTIONS}) goes from every block of the calendar,
 * as {@link writeEntity} writes it, so no other block is left deciding it.
 *
 * @param entities - The list as stored
 * @param index - Position of the block being reset
 * @param keys - Configuration keys to delete
 * @returns A new list; a block that held none of the keys is the same object
 */
export function resetEntry(
  entities: ReadonlyArray<string | Types.EntityConfig>,
  index: number,
  keys: ReadonlyArray<string>,
): Array<string | Types.EntityConfig> {
  if (index < 0 || index >= entities.length) return [...entities];

  const id = entityIdOf(entities[index]);
  const shared = keys.filter(isCalendarOption);
  return entities.map((entry, at) => {
    const own = at === index ? keys : id !== '' && entityIdOf(entry) === id ? shared : [];
    if (typeof entry !== 'object' || entry === null || !own.some((key) => key in entry)) {
      return entry;
    }
    const next: Record<string, unknown> = { ...entry };
    for (const key of own) delete next[key];
    return next as unknown as Types.EntityConfig;
  });
}

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
 * Whether one calendar draws a location row at all.
 *
 * The per-calendar switch is tri-state, so an absent value means "follow the card" and the
 * card's own answer is the one that decides. `show_location` is a `COLUMN_OVERRIDE_KEYS`
 * member, so that answer is per view — reading `config.show_location` directly would give
 * the wrong one for a card whose column block turns locations off.
 *
 * This exists so `location_icon` can be hidden where it cannot do anything: the icon
 * replaces the marker on a row that is not being drawn, so offering it there is the editor
 * claiming to control something it does not.
 *
 * 🚨 `undefined` means the shared base, and it is not the same as picking a view. A view
 * name sends {@link ViewConfig.resolveViewOption} into that view's block, so answering the
 * shared workspace with a view would consult a block the workspace cannot write to — and
 * once `list:` existed, passing the built view read `list:` and hid `location_icon` for a
 * card that had turned locations off in list alone, while column and grid still drew them.
 * The shared base's own answer is the top-level value, with no block over it.
 *
 * Residual, and deliberate: a card whose base says no locations but whose `column:` turns
 * them back on hides the control here. That is the shared base answering for itself, and
 * the control is still offered in the workspace that overrode it.
 *
 * @param entry - Entry as stored
 * @param config - Merged configuration
 * @param view - View being edited, or `undefined` for the shared base
 * @returns `true` when this calendar's events can show a location
 */
export function showsLocation(
  entry: string | Types.EntityConfig,
  config: Readonly<Types.Config>,
  view: Types.EffectiveView | undefined,
): boolean {
  const own = asEntityConfig(entry).show_location;
  if (typeof own === 'boolean') return own;

  if (view === undefined) return Boolean(config.show_location);

  return Boolean(ViewConfig.resolveViewOption(config as Types.Config, 'show_location', view));
}

/**
 * The shape one calendar's label holds.
 *
 * @param entry - Entry as stored
 * @returns The label's shape
 */
export function labelTypeOf(entry: string | Types.EntityConfig): string {
  const config = asEntityConfig(entry);
  // A list is several parts whatever they are, until `label_type: none` hides it.
  if (Array.isArray(config.label) && config.label_type !== 'none') return LABEL_PARTS;
  return Helpers.resolveLabelType(config.label, config.label_type);
}

/**
 * Whether a value is one of Label Type's entries: a shape `label_type` stores, or several parts.
 *
 * @param value - The dropdown's value
 * @returns `true` for an entry the dropdown offers
 */
function isLabelTypeChoice(value: unknown): value is string {
  return Helpers.isLabelType(value) || value === LABEL_PARTS;
}

/**
 * The fields whose helper speaks of one value of a calendar's setting, by that setting and value:
 * the helper shows only while the setting holds it, so Label Type's note on image paths never
 * sits under "Text or Emoji". Most speak of their own value; Label's speaks of Label Type's.
 */
export const HELPER_FOR_VALUE: Readonly<Record<string, readonly [field: string, value: string]>> = {
  label_type: ['label_type', 'image'],
  label_icon_source: ['label_icon_source', 'home_assistant'],
  label_image_source: ['label_image_source', 'person'],
  label: [LABEL_TYPE, LABEL_PARTS],
};

/**
 * Whether a calendar's field shows its helper, as {@link HELPER_FOR_VALUE} decides.
 *
 * @param name - The field's option name
 * @param data - The calendar's form data, as {@link toEntityFormData} builds it
 * @returns `true` when the helper shows
 */
export function showsHelper(name: string, data: Readonly<Record<string, unknown>>): boolean {
  const when = HELPER_FOR_VALUE[name];
  return when === undefined || data[when[0]] === when[1];
}

/**
 * The label the card draws for one entry, with what Home Assistant holds substituted for the
 * value that stands in for it: its icon for the `home-assistant` sentinel, a person's picture
 * for a `person.…` id. A label of several parts gives the first part the card draws, which is
 * what a row's one label slot has room for. A mirror of `utils/events.ts` ›
 * `resolveLabelParts`, read from the entry itself rather than from the first entry of its
 * calendar; importing that module would put the card's event pipeline into the editor.
 * `tests/editor-calendar-labels.test.ts` holds the two to the same answers.
 *
 * @param entry - Entry as stored
 * @param hass - Home Assistant, which holds the icon and the picture
 * @returns The label and the shape it is drawn as, or `undefined` where the card draws none
 */
export function resolvedLabel(
  entry: string | Types.EntityConfig,
  hass?: Types.Hass | null,
): { readonly value: string; readonly type: 'text' | 'icon' | 'image' } | undefined {
  const config = asEntityConfig(entry);
  const declared = config.label_type;
  for (const label of Helpers.labelParts(config.label)) {
    const followsIcon = isEntityIconSentinel(label);
    const followsPerson = isPersonEntityId(label);
    const value =
      (!followsIcon && !followsPerson) ||
      (Helpers.isLabelType(declared) && declared !== (followsIcon ? 'icon' : 'image'))
        ? label
        : followsPerson
          ? personPicture(label, hass)
          : entityIcon(config.entity, hass);
    if (!value) continue;
    const type = Helpers.resolveLabelType(value, declared);
    return type === 'none' ? undefined : { value, type };
  }
  return undefined;
}

/**
 * Whether the shape has to be written down, or can be read back off the value.
 *
 * A list reads back as several parts whatever it holds, so any shape stored beside one has to
 * be written: `none` above all, which is how a list kept under None stays hidden.
 *
 * @param type - Shape the dropdown names
 * @param label - Label value as it will be stored
 * @returns `true` when the shape must be stored alongside the value
 */
function needsExplicitType(type: string, label: unknown): boolean {
  return (
    Helpers.isLabelType(type) && (Array.isArray(label) || Helpers.getLabelType(label) !== type)
  );
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
 * Given the whole list, the Name field and the filter switch show the calendar's own values
 * rather than this block's: both belong to the calendar ({@link CALENDAR_OPTIONS}), so a second
 * block must not show an empty name, or the switch on, while the first one says otherwise.
 * {@link writeEntity} expects data built this way.
 *
 * @param entry - Entry as stored
 * @param entities - The list as stored, for the calendar's own values; without it the fields
 *   show this block's own
 * @returns Form data for that calendar
 */
export function toEntityFormData(
  entry: string | Types.EntityConfig,
  entities?: ReadonlyArray<string | Types.EntityConfig>,
): Record<string, unknown> {
  const config = asEntityConfig(entry) as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = {
    ...config,
    [LABEL_TYPE]: labelTypeOf(entry),
    [ACCENT_COLOR_MODE]: accentColorModeOf(config.accent_color),
    [LABEL_ICON_SOURCE]: labelIconSourceOf(config.label),
    [LABEL_IMAGE_SOURCE]: labelImageSourceOf(config.label),
  };

  for (const [key, option] of Object.entries(CALENDAR_OPTIONS)) {
    // Without the list, the name stays exactly as this block holds it.
    if (entities === undefined && key === 'name') continue;

    const shown = option.shown(option.configured(entities ?? [config], entityIdOf(entry)));
    if (shown === undefined) delete data[key];
    else data[key] = shown;
  }

  for (const name of Object.keys(ENTITY_TRISTATE_VALUES)) {
    data[name] = tristateShown(name, config[name]);
  }

  return data;
}

/**
 * The entry one of a calendar's dropdowns shows for what the calendar stores.
 *
 * @param name - Per-calendar option with a dropdown
 * @param stored - What the calendar stores for it, if anything
 * @returns The dropdown's value
 */
function tristateShown(name: string, stored: unknown): string {
  const match = ENTITY_TRISTATE_VALUES[name].find(
    (value) => ENTITY_TRISTATE_STORED[name][value] === stored,
  );
  // Falls back to the option's own default rather than to `inherit`, which is not a
  // value every one of these dropdowns offers. See `ENTITY_TRISTATE_DEFAULT`.
  return match ?? ENTITY_TRISTATE_DEFAULT[name] ?? INHERIT;
}

/**
 * Narrows a calendar's form data back to what should be stored.
 *
 * @param entityId - The calendar this configures
 * @param data - Form data as the form returned it
 * @param previous - The entry as stored before this edit
 * @param inheritedAccent - The card-wide `accent_color`, which this calendar shows until
 *   it names one of its own
 * @param hass - Home Assistant state, read only to seed a custom icon from the inherited one
 * @returns The entry to store, as a bare id when it carries no settings
 */
export function fromEntityFormData(
  entityId: string,
  data: Readonly<Record<string, unknown>>,
  previous: string | Types.EntityConfig = entityId,
  inheritedAccent?: unknown,
  hass?: Types.Hass,
): string | Types.EntityConfig {
  const entry: Record<string, unknown> = { entity: entityId };

  const chosenType = isLabelTypeChoice(data[LABEL_TYPE]) ? data[LABEL_TYPE] : labelTypeOf(previous);

  const moved = chosenType !== labelTypeOf(previous);

  // The accent mode is a form field, never a stored one: it is read back off the value's
  // shape. Writing it would put a key in the user's YAML that the card never reads.
  const accentMode = String(
    data[ACCENT_COLOR_MODE] ?? accentColorModeOf(asEntityConfig(previous).accent_color),
  );

  // Same contract for the icon source, one field over: it is derived from whether `label`
  // holds the sentinel, so it is read, never written.
  const iconSource = String(
    data[LABEL_ICON_SOURCE] ?? labelIconSourceOf(asEntityConfig(previous).label),
  );

  // Same contract again, one field over: derived from whether `label` holds a person's
  // entity id, so it too is read and never written.
  const imageSource = String(
    data[LABEL_IMAGE_SOURCE] ?? labelImageSourceOf(asEntityConfig(previous).label),
  );

  const followsHomeAssistant = chosenType === 'icon' && iconSource === 'home_assistant';

  const namesPerson = chosenType === 'image' && imageSource === 'person';

  // Written first, beside the id they belong to. The name is trimmed here rather than left to
  // the card: `isSet` counts "   " as set, so a name of spaces would otherwise reach the YAML
  // and name the calendar nothing at all. The filter switch stores only `false`, its one state
  // that is not the default.
  for (const [key, option] of Object.entries(CALENDAR_OPTIONS)) {
    const shown = option.shown(option.configured([asEntityConfig(previous)], entityId));
    const stored = option.stored(option.answered(data[key], shown));
    if (stored !== undefined) entry[key] = stored;
  }

  for (const [key, value] of Object.entries(data)) {
    if (key === 'entity' || isCalendarOption(key)) continue;

    if (key === LABEL_TYPE || key === ACCENT_COLOR_MODE) continue;

    if (key === LABEL_ICON_SOURCE || key === LABEL_IMAGE_SOURCE) continue;

    if (key === 'label' && chosenType === LABEL_PARTS) {
      // Choosing it starts from the label as it stood, as its first part; a list stays as the
      // lines hold it, an emptied line included, which is the line the user is about to fill.
      entry.label =
        moved || !Array.isArray(value)
          ? Helpers.labelParts(value)
          : value.filter((part): part is string => typeof part === 'string');
      continue;
    }

    if (key === 'label') {
      if (chosenType === 'none') continue;

      // Written below instead, as the sentinel. Carrying the form's value through would
      // store whatever icon the picker last held under a mode that does not use it.
      if (followsHomeAssistant) continue;

      // Leaving several parts keeps the first part of the shape chosen, which is also the part
      // the sources read their mode from (`labelIconSourceOf`, `labelImageSourceOf`).
      if (Array.isArray(value)) {
        const part = Helpers.labelParts(value).find(
          (candidate) => Helpers.getLabelType(candidate) === chosenType,
        );
        if (
          part === undefined ||
          (chosenType === 'image' && isPersonEntityId(part) !== namesPerson)
        ) {
          continue;
        }
        entry.label = part;
        continue;
      }

      if (moved && !fitsShape(chosenType, value)) continue;

      // The sentinel is not an icon and cannot be carried into the custom mode — and it
      // arrives here, because a calendar leaving `home_assistant` hands back its stored
      // value, which *is* the sentinel. Stored again, the next derivation would read it as
      // `home_assistant` and the dropdown would snap straight back. This is the same trap
      // `accentColorFor` documents, one field over.
      // `label_type: text` is the way to mean the word literally, so a text label that stays text
      // keeps it.
      if (isEntityIconSentinel(value) && (chosenType !== 'text' || moved)) continue;

      // The image source's own version of the line above, and it has to run in *both*
      // directions where the sentinel only needs one. A person's picture is stored as the
      // person's id under `label`, so both modes hold a real value and either can arrive
      // under the other's mode: moving to the picker hands back the path that was typed,
      // moving away from it hands back the person. Stored, either would derive the dropdown
      // straight back to where it came from and the change would appear not to take.
      if (chosenType === 'image' && isPersonEntityId(value) !== namesPerson) continue;
    }

    if (
      key === 'label_icon_color' &&
      moved &&
      chosenType !== 'icon' &&
      chosenType !== LABEL_PARTS
    ) {
      continue;
    }

    if (key === LABEL_IMAGE_SIZE && moved && chosenType !== 'image' && chosenType !== LABEL_PARTS) {
      continue;
    }

    if (key === 'accent_color') {
      // Only the custom mode has a color to store. The other two are the sentinel and
      // nothing at all, both written below rather than carried through from the form.
      continue;
    }

    if (key in ENTITY_TRISTATE_VALUES) {
      const stored = ENTITY_TRISTATE_STORED[key][String(value)];
      if (stored !== undefined) {
        entry[key] = stored;
        continue;
      }
      // An entry that stores nothing still keeps a line the calendar holds while the panel shows
      // that line as this entry, as `value.ts` › `toStoredConfig` keeps an unchanged line card-wide:
      // `show_weather: true` shows as Follow the card and `filter_field: title` as Title, and
      // dropping either would delete a line the user wrote on an edit to some other field.
      // Choosing the entry after another one still stores nothing, since the line moved first.
      const held = (asEntityConfig(previous) as unknown as Record<string, unknown>)[key];
      if (isSet(held) && tristateShown(key, held) === value) entry[key] = held;
      continue;
    }

    if (!isSet(value)) continue;

    // A cleared code editor hands back an empty list or an empty object, and an empty object
    // would be read as one condition the card cannot judge, hiding the calendar. One the YAML
    // already holds, unchanged by this write, is the user's and stays, the calendar hidden.
    if (
      key === VISIBILITY &&
      isEmptyVisibility(value) &&
      !deepEqual(value, (asEntityConfig(previous) as unknown as Record<string, unknown>)[key])
    ) {
      continue;
    }

    if (NUMERIC_KEYS.has(key)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) entry[key] = numeric;
      continue;
    }

    entry[key] = value;
  }

  const accentColor = accentColorFor(accentMode, data.accent_color, inheritedAccent);
  if (accentColor !== undefined) {
    entry.accent_color = accentColor;
  }

  if (followsHomeAssistant) {
    entry.label = ENTITY_ICON_SENTINEL;
  } else if (
    chosenType === 'icon' &&
    entry.label === undefined &&
    isEntityIconSentinel(asEntityConfig(previous).label)
  ) {
    // Leaving `home_assistant` for `custom`, start from the icon that was on screen, so
    // choosing "Custom icon" changes nothing until the user picks something else. Exactly
    // `accentColorFor`'s "start from the color on screen", and unlike that one it is
    // polish rather than a fix: the icon source derives from two states, not three, so an
    // empty value still reads back as `custom` and nothing snaps back without it.
    //
    // Home Assistant holding no icon leaves the picker empty, which is the same place
    // choosing "An Icon" from scratch starts.
    const inherited = entityIcon(entityId, hass);
    if (inherited !== undefined) entry.label = inherited;
  }

  // The image side's seed, and the reason it exists is the one `accentColorFor` documents
  // below: the person mode is derived from `label` and has nothing of its own to be derived
  // *from* until somebody is picked, so storing nothing re-reads as `custom` and the dropdown
  // snaps back before the picker is ever shown. `tests/entity-colors.test.ts` walks every
  // ordered transition of every per-calendar dropdown and is what caught it.
  //
  // An instance with no people at all seeds nothing and the mode stays unreachable — which is
  // the honest outcome rather than a gap, since there would be nobody to pick.
  if (namesPerson && entry.label === undefined) {
    const someone = firstPersonEntityId(hass);
    if (someone !== undefined) entry.label = someone;
  }

  // A label kept under `label_type: none` is one the write did not touch: it stays, unshown, so
  // choosing a type again shows it.
  if (chosenType === 'none' && !moved) {
    const kept = asEntityConfig(previous).label;
    if (isSet(kept)) entry.label = kept;
  }

  if (chosenType === LABEL_PARTS && entry.label === undefined) {
    // Chosen with no label to start from: an empty list, which is what reads back as this entry
    // and leaves the lines to add.
    entry.label = [];
  }

  if (needsExplicitType(chosenType, entry.label)) {
    entry.label_type = chosenType;
  } else if (chosenType === LABEL_PARTS && !moved) {
    // A shape a list was given in YAML applies to every part, and an edit to another field keeps it.
    const held = asEntityConfig(previous).label_type;
    if (held !== undefined) entry.label_type = held;
  }

  return Object.keys(entry).length === 1 ? entityId : (entry as unknown as Types.EntityConfig);
}

/**
 * The `accent_color` one calendar should store for the mode it is in.
 *
 * 🚨 Custom has to be seeded rather than left empty. It is the one mode with no value of
 * its own to be derived from — `inherit` is the absent key and `home_assistant` is the
 * sentinel, but a custom color nobody has typed yet is indistinguishable from no color
 * at all. Storing nothing re-derived as `inherit` on the next render, so the dropdown
 * snapped straight back and custom could never be selected. The card-wide control never
 * had this because its `apply` always writes a concrete color; this is the same
 * carry-or-seed, one level down.
 *
 * Seeding does write a color into the user's configuration as soon as the dropdown moves.
 * That is deliberate here and not the defaulting mistake it resembles: choosing "Custom
 * color" is an affirmative act meaning "I am about to name a color", where the failure
 * this project has seen before was a value appearing that nobody asked for.
 *
 * @param mode - Mode the dropdown names
 * @param value - Color as the form holds it
 * @param inherited - The card-wide color this calendar is currently showing
 * @returns The value to store, or `undefined` to store nothing
 */
/**
 * Whether a `visibility` value says nothing: an empty list, or an empty object.
 *
 * @param value - The value as the code editor handed it back
 * @returns True to store nothing
 */
function isEmptyVisibility(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
}

function accentColorFor(mode: string, value: unknown, inherited: unknown): string | undefined {
  if (mode === 'home_assistant') return ENTITY_COLOR_SENTINEL;
  if (mode !== 'custom') return undefined;

  // The sentinel is not a color and cannot be carried — and it arrives here, because a
  // calendar leaving `home_assistant` hands back its stored value, which *is* the
  // sentinel. Carrying it stored the sentinel again, the next derivation read that as
  // `home_assistant`, and the dropdown snapped back: custom was reachable from `inherit`,
  // where the value is genuinely unset, and from nowhere else.
  if (isSet(value) && !isEntityColorSentinel(value)) return String(value);

  // Start from the color on screen, so picking custom changes nothing until the user
  // says so. The sentinel is rejected on this side for the same reason: which color it
  // resolves to is per-calendar and lives in the render path's registry map, not here.
  return isSet(inherited) && !isEntityColorSentinel(inherited)
    ? String(inherited)
    : Config.DEFAULT_CONFIG.accent_color;
}

/**
 * A name as the form holds it, in the form it is stored.
 *
 * @param value - The Name field's value
 * @returns The name trimmed, or `undefined` for a blank one or anything that is not text
 */
function nameOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * One entry holding the given value for one of the {@link CALENDAR_OPTIONS}, or none, and
 * otherwise as it was.
 *
 * The calendar's options go beside the id they belong to, in the table's order, where
 * {@link fromEntityFormData} writes them, and an entry left holding nothing but its id goes
 * back to a bare id, as that function returns it.
 *
 * @param entry - Entry as stored
 * @param key - Which of the calendar's options
 * @param value - The value to hold, or `undefined` for none
 * @returns The entry, the same one when it already holds that value
 */
function withOption(
  entry: string | Types.EntityConfig,
  key: string,
  value: unknown,
): string | Types.EntityConfig {
  const config = asEntityConfig(entry) as unknown as Record<string, unknown>;
  if (config[key] === value) return entry;

  const next: Record<string, unknown> = { entity: config.entity };
  for (const option of Object.keys(CALENDAR_OPTIONS)) {
    const held = option === key ? value : config[option];
    if (held !== undefined) next[option] = held;
  }
  for (const [other, held] of Object.entries(config)) {
    if (other !== 'entity' && !isCalendarOption(other)) next[other] = held;
  }

  return Object.keys(next).length === 1
    ? String(config.entity)
    : (next as unknown as Types.EntityConfig);
}

/**
 * Replaces one calendar's settings within the list.
 *
 * 🚨 **The name is the calendar's, not this block's, and so is whether the calendar filter
 * lists it** ({@link CALENDAR_OPTIONS}), so they are the options written past `index`: a
 * change to either is written to every block of the calendar, and a cleared name, or the
 * switch turned back on, is cleared from all of them. That keeps a calendar listed twice from
 * holding two values, one of which would silently lose (the card takes the first).
 *
 * "Changed" is measured against what the form showed, which {@link toEntityFormData} makes
 * the calendar's own value when handed the list — so `data` must be built that way. An edit to
 * anything else hands that value back unchanged, and then every block keeps exactly the value
 * it holds, this one included. The alternative, writing the shown value into each block a
 * write passes through, would put a key into the YAML of a block the user never set it on,
 * and would quietly rewrite hand-written YAML that sets one calendar two ways; a change to the
 * option itself is the user's own answer, and only that settles it everywhere.
 *
 * @param entities - The list as stored
 * @param index - Position of the calendar being edited
 * @param data - Form data as the form returned it, built by `toEntityFormData(entry, entities)`
 * @param inheritedAccent - The card-wide `accent_color`, so a calendar moving to a custom
 *   color starts from the one it was already showing
 * @param hass - Home Assistant state, so a calendar moving off its icon starts from the one
 *   it was already showing
 * @returns A new list, or the original when the index is not in it
 */
export function writeEntity(
  entities: ReadonlyArray<string | Types.EntityConfig>,
  index: number,
  data: Readonly<Record<string, unknown>>,
  inheritedAccent?: unknown,
  hass?: Types.Hass,
): Array<string | Types.EntityConfig> {
  if (index < 0 || index >= entities.length) {
    return [...entities];
  }

  const entityId = entityIdOf(entities[index]);
  const next = [...entities];
  let written = fromEntityFormData(entityId, data, entities[index], inheritedAccent, hass);
  const own = asEntityConfig(entities[index]) as unknown as Record<string, unknown>;
  const changes: Array<[string, unknown]> = [];

  for (const [key, option] of Object.entries(CALENDAR_OPTIONS)) {
    const shown = option.shown(option.configured(entities, entityId));
    const answered = option.answered(data[key], shown);

    if (answered === shown || entityId === '') {
      written = withOption(written, key, own[key]);
    } else {
      changes.push([key, option.stored(answered)]);
    }
  }

  next[index] = written;
  if (changes.length === 0) return next;

  return next.map((entry, at) =>
    at !== index && entityIdOf(entry) === entityId
      ? changes.reduce((held, [key, value]) => withOption(held, key, value), entry)
      : entry,
  );
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
 * A calendar with nothing to transfer — none of its own settings, or only the options it has once
 * ({@link CALENDAR_OPTIONS}), such as its name — leaves
 * the clipboard as it was: an empty copy would arm every Paste button with a paste that
 * clears the calendar it lands on.
 *
 * @param entry - Entry as stored
 * @param from - What the entry is called, for Paste to say where its settings came from
 */
export function copySettings(entry: string | Types.EntityConfig, from?: string): void {
  if (!hasTransferableSettings(entry)) return;

  clipboard = transferableSettings(entry);
  copiedFromName = from;
}

/**
 * What the entry the clipboard holds was called when it was copied.
 *
 * @returns Its name, or `undefined` when nothing has been copied or it was copied unnamed
 */
export function copiedFrom(): string | undefined {
  return clipboard === undefined ? undefined : copiedFromName;
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
  copiedFromName = undefined;
}

/**
 * Applies the copied settings to one calendar.
 *
 * The target keeps the options the calendar has once ({@link CALENDAR_OPTIONS}): its name, which
 * says which calendar it is rather than how it is shown, and whether the filter lists it, which
 * every block of the calendar shares. Everything else is replaced by what was copied.
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
  const target = asEntityConfig(entities[index]) as unknown as Record<string, unknown>;
  const own = Object.fromEntries(
    Object.keys(CALENDAR_OPTIONS)
      .filter((key) => target[key] !== undefined)
      .map((key) => [key, target[key]]),
  );
  const pasted = { ...clipboard, entity: entityId, ...own };

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

/**
 * Whether a calendar carries any settings Copy would take, which is what offers Copy.
 *
 * Narrower than {@link hasSettings}: a calendar holding only its name, or only whether the
 * filter lists it, has settings of its own and nothing to copy, because both stay with the
 * calendar ({@link NON_TRANSFERABLE_KEYS}).
 *
 * @param entry - Entry as stored
 * @returns `true` when anything other than the calendar's identity is configured
 */
export function hasTransferableSettings(entry: string | Types.EntityConfig): boolean {
  return Object.keys(asEntityConfig(entry)).some((key) => !NON_TRANSFERABLE_KEYS.has(key));
}
