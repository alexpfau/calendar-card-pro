/**
 * What this device chose with the header toolbar, remembered per card: the view the switcher
 * last picked, and the calendars the legend hides.
 *
 * Never written to the configuration: `view` stays the layout the card opens in and every
 * calendar is shown, and the toolbar only moves away from that on the device where someone
 * pressed it. One `localStorage` entry holds every card's choice, keyed by a fingerprint of
 * that card's configuration. A changed configuration has a different fingerprint, which is
 * what resets every device to the configured view, and to every calendar shown, after an edit.
 * The toolbar's reset forgets the choice on the one device where it is pressed.
 *
 * Every tab of the browser shares the one entry, so the legend's half is kept in step across
 * them: a tab hears another's write as a `storage` event ({@link hiddenCalendarsChange}) and
 * reads the entry again when it comes back ({@link readStoredHiddenCalendars}). Without that, a
 * stale tab writes its whole hidden set over a newer one, and brings back calendars a reset in
 * another tab had shown. The switcher's half needs neither: a view is written as a patch of its
 * own half, never as a copy of a set read earlier, so a stale tab cannot restore one.
 *
 * Storage is optional everywhere here. A browser that refuses it — private mode, a full
 * quota, a policy — leaves the choice in memory for as long as the page lives, and nothing
 * else changes.
 */

import { hashString, isConfigBlock } from './helpers';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** The one `localStorage` key, shared by every card on every dashboard of this device. */
export const VIEW_CHOICE_STORAGE_KEY = 'calendar_card_pro_view_choice';

/**
 * Bumped when the stored shape changes; an entry of any other version is ignored.
 *
 * Still 1 with the legend's `hidden` added beside `view`: both are optional, and an entry
 * written before the legend existed is one with a view and no hidden calendars.
 */
const STORAGE_VERSION = 1;

/**
 * Most choices kept. A choice belongs to a configuration, and every edit makes a new one, so
 * without a cap the map would only grow. The oldest choices go first.
 */
export const MAX_VIEW_CHOICES = 50;

const VIEWS: ReadonlyArray<Types.EffectiveView> = ['list', 'column', 'grid'];

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

interface StoredChoice {
  /** The view the switcher picked; absent to follow `view`. */
  view?: Types.EffectiveView;
  /** The calendars the legend hides, by entity id; absent while every calendar is shown. */
  hidden?: string[];
  /** When the choice was last changed, in milliseconds since the epoch; orders pruning. */
  at: number;
}

interface StoredChoices {
  version: number;
  choices: Record<string, StoredChoice>;
}

/** The part of `Storage` this module uses, so a test can hand it any stand-in. */
export type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

//-----------------------------------------------------------------------------
// FINGERPRINT
//-----------------------------------------------------------------------------

/**
 * JSON with every object's keys in sorted order, arrays left in theirs.
 *
 * Key order carries no meaning in a configuration, but `JSON.stringify` keeps it, and the
 * editor and Home Assistant both rebuild objects. Sorting makes two equal configurations
 * one string however they were assembled; array order is kept because it does carry
 * meaning — the order of `entities` is the order calendars are drawn and deduplicated in.
 *
 * @param value - A configuration or any part of one
 * @returns Canonical JSON text
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }

  if (isConfigBlock(value)) {
    const members = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${members.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

/**
 * Identifies a card's configuration, for keying its remembered view.
 *
 * Taken from the configuration exactly as Home Assistant hands it to `setConfig`, before
 * defaults are merged in, so a default changing in a later release does not reset anyone.
 * Everything in it counts, the dashboard's own layout keys included.
 *
 * @param config - Raw configuration
 * @returns A short fingerprint
 */
export function configFingerprint(config: unknown): string {
  const text = canonicalJson(config);
  return `${hashString(text)}${text.length.toString(36)}`;
}

//-----------------------------------------------------------------------------
// STORAGE
//-----------------------------------------------------------------------------

/**
 * This device's `localStorage`, or null when the browser will not provide it.
 *
 * Reading the property itself can throw — Safari does with storage blocked — so the access
 * is inside the guard too.
 *
 * @returns Storage, or null
 */
export function deviceStorage(): ChoiceStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isView(value: unknown): value is Types.EffectiveView {
  return VIEWS.some((view) => view === value);
}

/**
 * The entity ids in a stored `hidden`, or undefined when it holds none worth keeping.
 *
 * @param value - The stored value
 * @returns Its strings, in order and without repeats
 */
function hiddenIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [...new Set(value.filter((id): id is string => typeof id === 'string' && id !== ''))];
  return ids.length > 0 ? ids : undefined;
}

/**
 * The stored entry's text, or undefined when the storage cannot be read at all.
 *
 * @param storage - Where choices are kept
 * @returns The text, null when there is no entry, undefined when reading fails
 */
function readText(storage: ChoiceStorage | null): string | null | undefined {
  if (!storage) return undefined;

  try {
    return storage.getItem(VIEW_CHOICE_STORAGE_KEY);
  } catch {
    return undefined;
  }
}

/**
 * Every choice in an entry's text, with anything malformed dropped.
 *
 * A choice keeps whichever of its halves is valid. One with neither is dropped.
 *
 * @param text - The entry as stored, or null for none
 * @returns Valid choices by fingerprint; empty when there are none
 */
function parseAll(text: string | null | undefined): Record<string, StoredChoice> {
  if (text === null || text === undefined) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }

  if (!isConfigBlock(parsed) || parsed.version !== STORAGE_VERSION) return {};
  if (!isConfigBlock(parsed.choices)) return {};

  const valid: Record<string, StoredChoice> = {};
  for (const [fingerprint, entry] of Object.entries(parsed.choices)) {
    if (!isConfigBlock(entry) || typeof entry.at !== 'number') continue;
    const view = isView(entry.view) ? entry.view : undefined;
    const hidden = hiddenIds(entry.hidden);
    if (view === undefined && hidden === undefined) continue;
    valid[fingerprint] = {
      ...(view !== undefined ? { view } : {}),
      ...(hidden !== undefined ? { hidden } : {}),
      at: entry.at,
    };
  }

  return valid;
}

/**
 * Every stored choice, with anything malformed dropped.
 *
 * @param storage - Where choices are kept
 * @returns Valid choices by fingerprint; empty when there are none or storage fails
 */
function readAll(storage: ChoiceStorage | null): Record<string, StoredChoice> {
  return parseAll(readText(storage));
}

/**
 * Writes the choices back, keeping only the newest {@link MAX_VIEW_CHOICES}.
 *
 * @param storage - Where choices are kept
 * @param choices - Every choice to keep
 * @returns Whether the storage now holds them
 */
function writeAll(storage: ChoiceStorage | null, choices: Record<string, StoredChoice>): boolean {
  if (!storage) return false;

  const kept = Object.entries(choices)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_VIEW_CHOICES);

  try {
    if (kept.length === 0) {
      storage.removeItem(VIEW_CHOICE_STORAGE_KEY);
      return true;
    }
    const payload: StoredChoices = { version: STORAGE_VERSION, choices: Object.fromEntries(kept) };
    storage.setItem(VIEW_CHOICE_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // A full or refused storage keeps the choice for this page only; see the module note.
    return false;
  }
}

/**
 * Changes one half of a configuration's choice and keeps the other, removing the choice once
 * neither half is left.
 *
 * @param fingerprint - From {@link configFingerprint}
 * @param patch - The half to change; undefined clears it
 * @param storage - Where choices are kept
 * @param now - The time the change is made
 * @returns Whether the storage now holds the change
 */
function updateChoice(
  fingerprint: string,
  patch: Pick<StoredChoice, 'view'> | Pick<StoredChoice, 'hidden'>,
  storage: ChoiceStorage | null,
  now: number,
): boolean {
  const choices = readAll(storage);
  const previous = choices[fingerprint];
  const next: StoredChoice = { ...previous, ...patch, at: now };
  if (next.view === undefined) delete next.view;
  if (next.hidden === undefined || next.hidden.length === 0) delete next.hidden;

  if (next.view === undefined && next.hidden === undefined) {
    if (!previous) return storage !== null;
    delete choices[fingerprint];
  } else {
    choices[fingerprint] = next;
  }

  return writeAll(storage, choices);
}

/**
 * The view this device last chose for a configuration.
 *
 * @param fingerprint - From {@link configFingerprint}
 * @param storage - Where choices are kept
 * @returns The remembered view, or undefined when there is none
 */
export function readViewChoice(
  fingerprint: string,
  storage: ChoiceStorage | null = deviceStorage(),
): Types.EffectiveView | undefined {
  return readAll(storage)[fingerprint]?.view;
}

/**
 * Remembers a view for a configuration, or forgets it when there is no view to keep. The
 * calendars the legend hides for it are kept either way.
 *
 * @param fingerprint - From {@link configFingerprint}
 * @param view - The chosen view, or undefined to forget the choice
 * @param storage - Where choices are kept
 * @param now - The time the choice is made
 */
export function writeViewChoice(
  fingerprint: string,
  view: Types.EffectiveView | undefined,
  storage: ChoiceStorage | null = deviceStorage(),
  now: number = Date.now(),
): void {
  updateChoice(fingerprint, { view }, storage, now);
}

/**
 * The calendars the legend hides on this device for a configuration.
 *
 * @param fingerprint - From {@link configFingerprint}
 * @param storage - Where choices are kept
 * @returns Entity ids, or an empty list when every calendar is shown
 */
export function readHiddenCalendars(
  fingerprint: string,
  storage: ChoiceStorage | null = deviceStorage(),
): string[] {
  return readAll(storage)[fingerprint]?.hidden ?? [];
}

/**
 * The calendars the legend hides for a configuration, as the storage holds them now, or
 * undefined when it cannot be read.
 *
 * {@link readHiddenCalendars} answers an empty list for both, which is right for a card
 * starting up and wrong for one catching up: there, an unreadable storage says nothing, and
 * must not show every calendar again.
 *
 * @param fingerprint - From {@link configFingerprint}
 * @param storage - Where choices are kept
 * @returns Entity ids, an empty list when every calendar is shown, or undefined
 */
export function readStoredHiddenCalendars(
  fingerprint: string,
  storage: ChoiceStorage | null = deviceStorage(),
): string[] | undefined {
  const text = readText(storage);
  if (text === undefined) return undefined;
  return parseAll(text)[fingerprint]?.hidden ?? [];
}

/**
 * Remembers which calendars the legend hides for a configuration; an empty list forgets it.
 * The view chosen for it is kept either way.
 *
 * @param fingerprint - From {@link configFingerprint}
 * @param hidden - Entity ids of the hidden calendars
 * @param storage - Where choices are kept
 * @param now - The time the choice is made
 * @returns Whether the storage now holds them
 */
export function writeHiddenCalendars(
  fingerprint: string,
  hidden: ReadonlyArray<string>,
  storage: ChoiceStorage | null = deviceStorage(),
  now: number = Date.now(),
): boolean {
  return updateChoice(fingerprint, { hidden: hiddenIds(hidden) }, storage, now);
}

/**
 * Forgets everything this device chose for a configuration, the view and the hidden calendars
 * together, in one write. What the toolbar's reset does to storage.
 *
 * @param fingerprint - From {@link configFingerprint}
 * @param storage - Where choices are kept
 * @returns Whether the storage now holds no choice for it
 */
export function forgetChoice(
  fingerprint: string,
  storage: ChoiceStorage | null = deviceStorage(),
): boolean {
  const choices = readAll(storage);
  if (!Object.prototype.hasOwnProperty.call(choices, fingerprint)) return storage !== null;
  delete choices[fingerprint];
  return writeAll(storage, choices);
}

/** The parts of a `storage` event this module reads, so a test can hand it a plain object. */
export type ChoiceStorageChange = Pick<StorageEvent, 'key' | 'oldValue' | 'newValue'>;

/**
 * The calendars now hidden for a configuration, when another tab's write changed them.
 *
 * Read from the event's own before and after, not from the storage, so a write that changed
 * only another configuration's choice, or only this one's view, is no change here. A cleared
 * storage (`key` null) carries neither, and leaves every calendar shown.
 *
 * @param change - A `storage` event from `window`
 * @param fingerprint - From {@link configFingerprint}
 * @returns The hidden entity ids now stored, or undefined when this choice's set is unchanged
 */
export function hiddenCalendarsChange(
  change: ChoiceStorageChange,
  fingerprint: string,
): string[] | undefined {
  if (change.key === null) return [];
  if (change.key !== VIEW_CHOICE_STORAGE_KEY) return undefined;

  const before = parseAll(change.oldValue)[fingerprint]?.hidden ?? [];
  const after = parseAll(change.newValue)[fingerprint]?.hidden ?? [];
  const same = before.length === after.length && before.every((id) => after.includes(id));
  return same ? undefined : after;
}
