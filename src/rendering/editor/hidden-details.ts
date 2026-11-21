/**
 * Calendars whose YAML hides a field that an event's details show since v6: a calendar's
 * `show_location: false` and `show_description: false` keep those fields out of the agenda, and
 * no longer out of the details, which only `private: true` does. The upgrade on opening names each
 * one and offers to make it private. DOM-free.
 */

import { isConfigBlock } from '../../utils/helpers';

/** The fields a calendar can hide that the details now show, in the order they are named. */
export const DETAIL_FIELDS = ['location', 'description'] as const;

export type DetailField = (typeof DETAIL_FIELDS)[number];

/** One calendar entry that hides a field the details show. */
export interface HiddenDetails {
  /** The entry's place in `entities`. */
  readonly entry: number;
  /** What it hides, in {@link DETAIL_FIELDS} order. */
  readonly fields: ReadonlyArray<DetailField>;
}

/**
 * Every calendar entry, in list order, that sets `show_location: false` or
 * `show_description: false` and is not private.
 *
 * @param raw - The configuration as stored
 * @returns The entries
 */
export function hiddenDetails(raw: Readonly<Record<string, unknown>>): HiddenDetails[] {
  const entities = Array.isArray(raw.entities) ? (raw.entities as unknown[]) : [];
  return entities.flatMap((entry, at) => {
    if (!isConfigBlock(entry) || entry.private === true) return [];
    const fields = DETAIL_FIELDS.filter((field) => entry[`show_${field}`] === false);
    return fields.length > 0 ? [{ entry: at, fields }] : [];
  });
}
