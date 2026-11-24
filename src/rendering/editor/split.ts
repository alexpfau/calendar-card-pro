/**
 * Split This Calendar as data: when a calendar entry can be split in two and when it cannot, and
 * the two entries a split writes in its place.
 *
 * DOM-free. What it promises is tested where it can fail, through the card's own `processEvents`
 * and `groupEventsByDay` (`tests/split-membership.dst.test.ts`): every event the entry shows now
 * lands in exactly one of the two parts, none twice and none missing. Each refusal names a case
 * where two entries could not keep that promise.
 */

import { type ListState, duplicateEntry } from './calendar-list';
import { asEntityConfig } from './entities';
import { deepEqual } from './value';
import { compiles, orPatterns, toPattern } from './word-lists';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import { labelParts } from '../../utils/helpers';

/** How to split: by event type, or by words in one field. */
export type SplitHow =
  { kind: 'type' } | { kind: 'words'; terms: ReadonlyArray<string>; field: Types.FilterField };

/** What one part is given besides its rule. */
export interface SplitPart {
  /** Its label, one value or a list of parts as `label` takes; absent keeps the entry's own, and
   * empty keeps none. */
  readonly label?: Types.EntityConfig['label'];
  /** Its accent color as stored; absent follows the card. */
  readonly color?: string;
}

/** Why a method cannot be used, by string key, and the field Match Against is held to. */
export interface SplitRefusals {
  /** An effective all-day or timed event type, the entry's own or the card's: by type only. */
  readonly type?: string;
  /** Its own allowlist: by words only. */
  readonly words?: string;
  /** A blocklist or allowlist the card cannot read: by words only. */
  readonly pattern?: string;
  /** Its own Compact Events to Show: both methods. */
  readonly budget?: string;
  /** Match Against held to the field the entry's own blocklist looks in. */
  readonly field?: Types.FilterField;
}

/**
 * The field a word list is matched against, read as the card reads it (`filterSubject`): the
 * title unless `filter_field` names the location or the description.
 *
 * @param value - The stored `filter_field`
 * @returns The field
 */
export function filterFieldOf(value: unknown): Types.FilterField {
  return value === 'location' || value === 'description' ? value : 'title';
}

/**
 * The event type an entry keeps, as the card resolves it (`events.ts` › `resolveEventType`): its
 * own, else the card's, and anything but `timed` or `all_day` keeps every event.
 *
 * @param entry - The entry
 * @param card - The card's configuration
 * @returns The type
 */
export function effectiveEventType(
  entry: Types.EntityConfig,
  card: Readonly<Types.Config>,
): Types.EventType {
  const configured = entry.event_type ?? card.event_type;
  return configured === 'timed' || configured === 'all_day' ? configured : 'all';
}

/**
 * When a split cannot keep what the entry shows, and why, as string keys.
 *
 * @param entry - The entry as stored
 * @param card - The card's configuration
 * @returns The refusals that apply, and the field Match Against is held to
 */
export function refusals(
  entry: string | Types.EntityConfig,
  card: Readonly<Types.Config>,
): SplitRefusals {
  const own = asEntityConfig(entry);
  const result: { -readonly [K in keyof SplitRefusals]: SplitRefusals[K] } = {};
  const type = effectiveEventType(own, card);
  if (type !== 'all') {
    result.type = `split.refused.${type}${own.event_type == null ? '_card' : ''}`;
  }
  // Truthiness, as the card tests a list before building it (`filterEventsForEntity`).
  const blocklist = own.blocklist ? String(own.blocklist) : '';
  const allowlist = own.allowlist ? String(own.allowlist) : '';
  if (blocklist && !compiles(blocklist)) result.pattern = 'split.refused.blocklist';
  else if (allowlist && !compiles(allowlist)) result.pattern = 'split.refused.allowlist';
  if (allowlist) result.words = 'split.refused.words';
  if (Config.toValidNumber(own.compact_events_to_show, 0) !== undefined) {
    result.budget = 'split.refused.budget';
  }
  if (blocklist && result.pattern === undefined) result.field = filterFieldOf(own.filter_field);
  return result;
}

/**
 * The two entries a split writes: each a copy of the entry with every option it has, then its
 * rule, its label and its accent color. All-day, or the worded part, first. A label other than
 * the entry's own drops its `label_type`, so the card reads it as written.
 *
 * By words, part 1 keeps the words as its allowlist, beside a blocklist it already has; part 2
 * takes them as its blocklist, joined to one it already has. `filter_field` is written on both
 * unless the words are matched against the title.
 *
 * @param entry - The entry as stored
 * @param how - How to split it
 * @param parts - Each part's label and color
 * @returns The two entries
 */
export function splitEntry(
  entry: string | Types.EntityConfig,
  how: SplitHow,
  parts: readonly [SplitPart, SplitPart],
): readonly [Types.EntityConfig, Types.EntityConfig] {
  const base = asEntityConfig(entry);
  let first: Types.EntityConfig;
  let second: Types.EntityConfig;
  if (how.kind === 'type') {
    first = { ...structuredClone(base), event_type: 'all_day' };
    second = { ...structuredClone(base), event_type: 'timed' };
  } else {
    const words = toPattern(how.terms);
    first = { ...structuredClone(base), allowlist: words };
    second = {
      ...structuredClone(base),
      blocklist: base.blocklist ? orPatterns(String(base.blocklist), words) : words,
    };
    for (const part of [first, second]) {
      if (how.field === 'title') delete part.filter_field;
      else part.filter_field = how.field;
    }
  }
  const finish = (part: Types.EntityConfig, given: SplitPart): Types.EntityConfig => {
    const result = { ...part };
    if (given.label === undefined) {
      // Kept as the entry has it.
    } else if (labelParts(given.label).length === 0) delete result.label;
    else {
      result.label = given.label;
      // A label typed here is read as written: the entry's type was for its own label, and
      // `none` or `image` would draw a typed word as nothing or as a broken picture.
      if (!deepEqual(given.label, base.label)) delete result.label_type;
    }
    if (given.color === undefined || given.color === '') delete result.accent_color;
    else result.accent_color = given.color;
    return result;
  };
  return [finish(first, parts[0]), finish(second, parts[1])];
}

/**
 * The list with an entry split in two: part 1 in its place under its key, part 2 right after it
 * under a new key, every other entry and key as it was.
 *
 * @param state - The list
 * @param index - The entry's position
 * @param pair - What `splitEntry` wrote
 * @param newKey - Part 2's key
 * @returns The list
 */
export function splitInList(
  state: ListState,
  index: number,
  pair: readonly [Types.EntityConfig, Types.EntityConfig],
  newKey: number,
): ListState {
  const next = duplicateEntry(state, index, newKey);
  const entities = [...next.entities];
  entities[next.keys.indexOf(state.keys[index])] = pair[0];
  entities[next.keys.indexOf(newKey)] = pair[1];
  return { entities, keys: next.keys };
}
