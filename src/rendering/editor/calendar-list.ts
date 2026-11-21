/**
 * The calendar list as data: the entries of `entities` grouped by calendar, and every change
 * the list's rows can make to them.
 *
 * DOM-free, so the operations are tested on their own and against the card's own pipeline.
 *
 * 🚨 **Every operation returns the list grouped**: each calendar's entries together, the
 * calendars in the order they first appear, and the entries of one calendar in their relative
 * order. Moving a calendar across others changes nothing the card draws: `deduplicateEvents`,
 * `fetchEvents` and `getPrimaryEntityId` read each calendar's first occurrence only. The order
 * inside one calendar is not like that. When two of its entries keep the same event,
 * `processEvents` stamps one copy per entry, and with `filter_duplicates` on the first entry's
 * copy is the one drawn, its color and label included. So nothing here reorders the entries of
 * one calendar, and moves act on a whole calendar.
 *
 * Keys travel with their entries. `keys` parallels `entities`, so an open entry page, which
 * holds a key rather than a position, still finds its entry after a move or a removal.
 */

import { duplicateEntity, entityDisplayName, removeEntity } from './entities';
import { lookup } from './localize';
import { interpolate } from './strings';
import { entityIdOf } from './synthetic';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import { configuredCalendarName } from '../../utils/calendar-names';
import { readStartWindow } from '../../utils/start-window';

type Entry = string | Types.EntityConfig;

/** One entry of a calendar, as the list draws it. */
export interface EntryRow {
  /** Its position in `entities`. */
  readonly index: number;
  /** Its key, from the parallel `keys`. */
  readonly key: number;
  /** Its place among its calendar's entries, counting from one. */
  readonly position: number;
  /** How many entries its calendar has. */
  readonly total: number;
}

/** One calendar and its entries, in list order. */
export interface CalendarGroup {
  readonly entityId: string;
  readonly rows: ReadonlyArray<EntryRow>;
}

/** The list: `entities` as stored, and a key per entry. */
export interface ListState {
  readonly entities: ReadonlyArray<Entry>;
  readonly keys: ReadonlyArray<number>;
}

/**
 * The positions of each calendar's entries, the calendars in first-occurrence order.
 *
 * @param entities - The list as stored
 * @returns Entity id to the indices of its entries, in insertion order
 */
function indicesByCalendar(entities: ReadonlyArray<Entry>): Map<string, number[]> {
  const byCalendar = new Map<string, number[]>();

  entities.forEach((entry, index) => {
    const id = entityIdOf(entry);
    const indices = byCalendar.get(id);
    if (indices) indices.push(index);
    else byCalendar.set(id, [index]);
  });

  return byCalendar;
}

/**
 * Takes the entries, with their keys, in the order of the given indices.
 *
 * @param state - The list
 * @param order - Indices into it
 * @returns The list in that order
 */
function pick(state: ListState, order: ReadonlyArray<number>): ListState {
  return {
    entities: order.map((index) => state.entities[index]),
    keys: order.map((index) => state.keys[index]),
  };
}

/**
 * The list grouped by calendar, in first-occurrence order, each calendar's entries kept in
 * their relative order.
 *
 * @param state - The list
 * @returns The same entries and keys, grouped
 */
function regroup(state: ListState): ListState {
  return pick(state, [...indicesByCalendar(state.entities).values()].flat());
}

/**
 * The calendars on the card and their entries, in first-occurrence order.
 *
 * Indices point into `state.entities` as given, so a list that is not grouped yet still finds
 * each entry where it is stored.
 *
 * @param state - The list
 * @returns One group per calendar
 */
export function groups(state: ListState): ReadonlyArray<CalendarGroup> {
  return [...indicesByCalendar(state.entities)].map(([entityId, indices]) => ({
    entityId,
    rows: indices.map((index, at) => ({
      index,
      key: state.keys[index],
      position: at + 1,
      total: indices.length,
    })),
  }));
}

/**
 * Moves a calendar, with every entry it has, to a place among the calendars.
 *
 * Move Up, Move Down and Move to Top are this with the calendar's place minus one, plus one
 * and zero.
 *
 * @param state - The list
 * @param entityId - The calendar to move
 * @param to - Its new place among the calendars, counting from zero; clamped to the list
 * @returns The list, grouped, with the calendar at its new place
 */
export function moveCalendar(state: ListState, entityId: string, to: number): ListState {
  const byCalendar = indicesByCalendar(state.entities);
  const moving = byCalendar.get(entityId);
  if (!moving) return regroup(state);

  const order = [...byCalendar.keys()].filter((id) => id !== entityId);
  const place = Math.min(Math.max(0, Math.trunc(to) || 0), order.length);
  order.splice(place, 0, entityId);

  return pick(
    state,
    order.flatMap((id) => byCalendar.get(id)!),
  );
}

/**
 * Removes one entry. The calendar's name and calendar filter setting stay with its other
 * entries (`entities.ts` › `removeEntity`).
 *
 * @param state - The list
 * @param index - Position of the entry in `entities`
 * @returns The list, grouped, without it
 */
export function removeEntry(state: ListState, index: number): ListState {
  if (index < 0 || index >= state.entities.length) return regroup(state);

  return regroup({
    entities: removeEntity(state.entities, index),
    keys: state.keys.filter((_, at) => at !== index),
  });
}

/**
 * Removes a calendar: every entry it has.
 *
 * @param state - The list
 * @param entityId - The calendar to remove
 * @returns The list, grouped, without it
 */
export function removeCalendar(state: ListState, entityId: string): ListState {
  const kept = state.entities.flatMap((entry, index) =>
    entityIdOf(entry) === entityId ? [] : [index],
  );

  return regroup(pick(state, kept));
}

/**
 * Copies an entry, the copy landing right after the original inside its calendar.
 *
 * @param state - The list
 * @param index - Position of the entry in `entities`
 * @param newKey - The copy's key
 * @returns The list, grouped, with the copy after the original
 */
export function duplicateEntry(state: ListState, index: number, newKey: number): ListState {
  if (index < 0 || index >= state.entities.length) return regroup(state);

  const keys = [...state.keys];
  keys.splice(index + 1, 0, newKey);

  return regroup({ entities: duplicateEntity(state.entities, index), keys });
}

/**
 * Adds a calendar as one entry holding only its id, at the end of the list, or at the end of
 * its own entries when the card already shows it.
 *
 * @param state - The list
 * @param entityId - The calendar to add
 * @param newKey - The new entry's key
 * @returns The list, grouped, with the new entry
 */
export function addCalendar(state: ListState, entityId: string, newKey: number): ListState {
  return regroup({
    entities: [...state.entities, entityId],
    keys: [...state.keys, newKey],
  });
}

/**
 * Points an entry at another calendar.
 *
 * The entry keeps its own settings and joins the end of the target calendar's entries, so the
 * target's own entries keep their priority under Filter Duplicates. When the target already has
 * entries, the entry takes the target's name and calendar filter setting, which belong to the
 * calendar rather than to one entry (`entities.ts` › `CALENDAR_OPTIONS`), and `adopted` says so.
 * The calendar it leaves keeps its name and setting on the entries it has left, as Remove leaves
 * them.
 *
 * @param state - The list
 * @param index - Position of the entry in `entities`
 * @param entityId - The calendar it reads from now on
 * @returns The list, grouped, and whether the entry took the target's shared settings
 */
export function repointEntry(
  state: ListState,
  index: number,
  entityId: string,
): { state: ListState; adopted: boolean } {
  if (
    index < 0 ||
    index >= state.entities.length ||
    entityIdOf(state.entities[index]) === entityId
  ) {
    return { state: regroup(state), adopted: false };
  }

  const entry = state.entities[index];
  const key = state.keys[index];
  const rest = removeEntry(state, index);
  const adopted = rest.entities.some((other) => entityIdOf(other) === entityId);

  let moved: Entry;
  if (typeof entry === 'string' || entry === null || typeof entry !== 'object') {
    moved = entityId;
  } else {
    moved = { ...entry, entity: entityId };
  }

  if (adopted) {
    const name = configuredCalendarName(rest.entities, entityId);
    const shown = Config.configuredShowInLegend(rest.entities, entityId);
    const settings: Types.EntityConfig = {
      ...(typeof moved === 'string' ? { entity: moved } : moved),
    };

    delete settings.name;
    delete settings.show_in_legend;
    if (name !== undefined) settings.name = name;
    if (shown === false) settings.show_in_legend = false;

    moved = typeof moved === 'string' && Object.keys(settings).length === 1 ? moved : settings;
  }

  return {
    state: regroup({ entities: [...rest.entities, moved], keys: [...rest.keys, key] }),
    adopted,
  };
}

/**
 * The entry's words, folded as the list shows them: "School, PTA".
 *
 * @param value - A word list as stored, alternatives separated by `|`
 * @returns The words, comma-separated
 */
function words(value: string): string {
  return value
    .split('|')
    .map((word) => word.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * The hours an entry's timed events have to start in, as the card reads them: "Starts from
 * 16:00", "Starts before 12:00" or "Starts 22:00–06:00", in the times as written. Nothing where
 * the entry keeps every timed event, an unreadable value or two equal times among them, so the
 * list never names hours the card does not apply.
 *
 * @param settings - The entry's settings
 * @param language - Editor language code
 * @returns The part, or `undefined`
 */
function startHours(settings: Partial<Types.EntityConfig>, language: string): string | undefined {
  const window = readStartWindow(settings.starts_after, settings.starts_before).window;
  if (!window) return undefined;

  const after = String(settings.starts_after ?? '').trim();
  const before = String(settings.starts_before ?? '').trim();
  if (window.until === 86400)
    return interpolate(lookup(language, 'row.starts_after')!, { time: after });
  if (window.from === 0)
    return interpolate(lookup(language, 'row.starts_before')!, { time: before });
  return interpolate(lookup(language, 'row.starts_between')!, { from: after, until: before });
}

/**
 * What an entry does, in at most two parts: what tells it apart from its calendar's other
 * entries on the list.
 *
 * In order of preference: the event type it keeps, the hours its timed events start in, its
 * allowlist, its blocklist, its days of the week, when its all-day events expire, and whether it
 * is shown under conditions. An entry that sets none of them shows all events.
 *
 * @param entry - The entry as stored
 * @param language - Editor language code
 * @returns One or two parts, never none
 */
export function rowParts(entry: Entry, language: string): ReadonlyArray<string> {
  const settings: Partial<Types.EntityConfig> =
    entry !== null && typeof entry === 'object' ? entry : {};
  const parts: string[] = [];

  if (settings.event_type === 'all_day') parts.push(lookup(language, 'row.all_day')!);
  else if (settings.event_type === 'timed') parts.push(lookup(language, 'row.timed')!);

  // Right after the event type, ahead of the word lists: only two parts are shown, and the hours
  // are what tells a calendar's morning entry from its afternoon one.
  const hours = startHours(settings, language);
  if (hours) parts.push(hours);

  const only = typeof settings.allowlist === 'string' ? words(settings.allowlist) : '';
  if (only) parts.push(interpolate(lookup(language, 'row.only')!, { words: only }));

  const without = typeof settings.blocklist === 'string' ? words(settings.blocklist) : '';
  if (without) parts.push(interpolate(lookup(language, 'row.without')!, { words: without }));

  if (settings.days_of_week === 'weekdays') parts.push(lookup(language, 'row.weekdays')!);
  else if (settings.days_of_week === 'weekends') parts.push(lookup(language, 'row.weekends')!);

  const expires = settings.allday_expires_at;
  if (typeof expires === 'string' && expires.trim() !== '') {
    parts.push(interpolate(lookup(language, 'row.expires')!, { time: expires.trim() }));
  }

  if (Array.isArray(settings.visibility) && settings.visibility.length > 0) {
    parts.push(lookup(language, 'row.conditions')!);
  }

  if (parts.length === 0) parts.push(lookup(language, 'entity.event_type.option.all.label')!);

  return parts.slice(0, 2);
}

/**
 * What one entry is called in the names of its row's controls: its calendar's name, and inside
 * a calendar with several entries its number and first part as well ("Family, entry 2, All-day
 * events"), so two entries that keep the same events still have names of their own.
 *
 * The calendar's name is the one this card gives it, else Home Assistant's, else its id.
 *
 * @param state - The list
 * @param index - Position of the entry in `entities`
 * @param language - Editor language code
 * @param hass - Home Assistant, for the calendar's own name where the card gives it none
 * @returns The name, never blank; empty only for an index outside the list
 */
export function rowName(
  state: ListState,
  index: number,
  language: string,
  hass?: Types.Hass,
): string {
  if (index < 0 || index >= state.entities.length) return '';

  const entry = state.entities[index];
  const id = entityIdOf(entry);
  // An entry naming no calendar would read as nothing: "Actions for , entry 1".
  if (typeof id !== 'string' || id.trim() === '') {
    return interpolate(lookup(language, 'row.invalid')!, { position: String(index + 1) });
  }
  const name = configuredCalendarName(state.entities, id) ?? entityDisplayName(id, hass);
  const total = state.entities.filter((other) => entityIdOf(other) === id).length;
  if (total < 2) return name;

  const position = entities(state, id).indexOf(index) + 1;
  return interpolate(lookup(language, 'row.name')!, {
    name,
    position: String(position),
    part: rowParts(entry, language)[0],
  });
}

/**
 * The positions of one calendar's entries in `entities`.
 *
 * @param state - The list
 * @param entityId - The calendar
 * @returns Its entries' indices, in list order
 */
function entities(state: ListState, entityId: string): number[] {
  return state.entities.flatMap((entry, index) => (entityIdOf(entry) === entityId ? [index] : []));
}

/** The options that decide which of a calendar's events an entry keeps. */
const WHICH_EVENTS: ReadonlyArray<keyof Types.EntityConfig> = [
  'event_type',
  'allowlist',
  'blocklist',
  'filter_field',
  'days_of_week',
  'starts_after',
  'starts_before',
  'allday_expires_at',
  'visibility',
  'compact_events_to_show',
];

/**
 * The earlier entry of the same calendar that keeps exactly the events this one keeps, so each
 * of them is listed twice: the two differ in no option that decides which events an entry keeps.
 *
 * @param state - The list
 * @param index - Position of the entry in `entities`
 * @returns The earlier entry's place among its calendar's entries, counting from one; or
 *   `undefined` where no earlier entry keeps the same events
 */
export function sameEventsAs(state: ListState, index: number): number | undefined {
  if (index < 0 || index >= state.entities.length) return undefined;
  const settings = (entry: Entry): Partial<Types.EntityConfig> =>
    entry !== null && typeof entry === 'object' ? entry : {};
  const own = settings(state.entities[index]);
  const siblings = entities(state, entityIdOf(state.entities[index]));
  const at = siblings
    .slice(0, siblings.indexOf(index))
    .findIndex((other) =>
      WHICH_EVENTS.every(
        (key) => JSON.stringify(settings(state.entities[other])[key]) === JSON.stringify(own[key]),
      ),
    );
  return at < 0 ? undefined : at + 1;
}
