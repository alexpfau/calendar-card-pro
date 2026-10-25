/**
 * The view the header toolbar's switcher last chose, remembered on this device.
 *
 * Never written to the configuration: `view` stays the layout the card opens in, and the
 * switcher only moves away from it on the device where someone pressed it. One
 * `localStorage` entry holds every card's choice, keyed by a fingerprint of that card's
 * configuration. A changed configuration has a different fingerprint, which is what resets
 * every device to the configured view after an edit.
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

/** Bumped when the stored shape changes; an entry of any other version is ignored. */
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
  view: Types.EffectiveView;
  /** When the choice was made, in milliseconds since the epoch; orders pruning. */
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
 * Every stored choice, with anything malformed dropped.
 *
 * @param storage - Where choices are kept
 * @returns Valid choices by fingerprint; empty when there are none or storage fails
 */
function readAll(storage: ChoiceStorage | null): Record<string, StoredChoice> {
  if (!storage) return {};

  let parsed: unknown;
  try {
    const text = storage.getItem(VIEW_CHOICE_STORAGE_KEY);
    if (text === null) return {};
    parsed = JSON.parse(text);
  } catch {
    return {};
  }

  if (!isConfigBlock(parsed) || parsed.version !== STORAGE_VERSION) return {};
  if (!isConfigBlock(parsed.choices)) return {};

  const valid: Record<string, StoredChoice> = {};
  for (const [fingerprint, entry] of Object.entries(parsed.choices)) {
    if (isConfigBlock(entry) && isView(entry.view) && typeof entry.at === 'number') {
      valid[fingerprint] = { view: entry.view, at: entry.at };
    }
  }

  return valid;
}

/**
 * Writes the choices back, keeping only the newest {@link MAX_VIEW_CHOICES}.
 *
 * @param storage - Where choices are kept
 * @param choices - Every choice to keep
 */
function writeAll(storage: ChoiceStorage | null, choices: Record<string, StoredChoice>): void {
  if (!storage) return;

  const kept = Object.entries(choices)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_VIEW_CHOICES);

  try {
    if (kept.length === 0) {
      storage.removeItem(VIEW_CHOICE_STORAGE_KEY);
      return;
    }
    const payload: StoredChoices = { version: STORAGE_VERSION, choices: Object.fromEntries(kept) };
    storage.setItem(VIEW_CHOICE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // A full or refused storage keeps the choice for this page only; see the module note.
  }
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
 * Remembers a choice for a configuration, or forgets it when there is no view to keep.
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
  const choices = readAll(storage);
  if (view === undefined) {
    if (!(fingerprint in choices)) return;
    delete choices[fingerprint];
  } else {
    choices[fingerprint] = { view, at: now };
  }

  writeAll(storage, choices);
}
