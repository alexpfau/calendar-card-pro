/**
 * Options v3.0.0 removed that a card's YAML still holds, for the notices page (section 5.10):
 * each with its replacement, and a move to it while the replacement is free. DOM-free.
 *
 * The card ignores them, and the editor's next write removes them (`value.ts` ›
 * `pruneDeprecatedKeys`), so a value worth keeping has to move before then.
 */

import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import { isConfigBlock } from '../../utils/helpers';

/** One removed option, as the YAML holds it. */
export interface OldOption {
  /** Where it is written: `row_spacing`, `entities[2].max_events_to_show`. */
  readonly path: string;
  readonly key: string;
  /** The option that replaced it. */
  readonly to: string;
  /** The entry's place in `entities`, for a calendar's option. */
  readonly entry?: number;
}

/**
 * Every removed option the YAML holds: the card's, then each calendar's, in list order.
 *
 * @param raw - The configuration as stored
 * @returns The options
 */
export function oldOptions(raw: Readonly<Record<string, unknown>>): OldOption[] {
  const found: OldOption[] = Object.entries(Config.DEPRECATED_CONFIG_MAP)
    .filter(([key]) => key in raw)
    .map(([key, to]) => ({ path: key, key, to }));
  const entities = Array.isArray(raw.entities) ? raw.entities : [];
  entities.forEach((entry: unknown, at) => {
    if (!isConfigBlock(entry)) return;
    for (const [key, to] of Object.entries(Config.DEPRECATED_ENTITY_CONFIG_MAP)) {
      if (key in entry) found.push({ path: `entities[${at}].${key}`, key, to, entry: at });
    }
  });
  return found;
}

/**
 * Where an old option lives: the configuration itself, or its calendar entry.
 *
 * @param raw - The configuration as stored
 * @param old - The option
 * @returns The object holding it, or `undefined` where it has gone
 */
function holder(
  raw: Readonly<Record<string, unknown>>,
  old: OldOption,
): Readonly<Record<string, unknown>> | undefined {
  const held = old.entry === undefined ? raw : (raw.entities as unknown[] | undefined)?.[old.entry];
  return isConfigBlock(held) && old.key in held ? held : undefined;
}

/**
 * Whether an old option can move: it is still there, and its replacement holds nothing yet.
 *
 * @param raw - The configuration as stored
 * @param old - The option
 * @returns `true` when Move is offered
 */
export function canMove(raw: Readonly<Record<string, unknown>>, old: OldOption): boolean {
  const held = holder(raw, old);
  return held !== undefined && (held[old.to] === undefined || held[old.to] === null);
}

/**
 * Moves an old option's value to its replacement, in the old option's place among its
 * neighbors, so the YAML reads as though it had been written with the new name. Where the old
 * option has already gone, as a pre-v5 card's first write removes it while migrating, the value
 * it held is written to the replacement instead.
 *
 * @param raw - The configuration as stored; not changed
 * @param old - The option
 * @param held - The value it held, for where it has already gone
 * @returns The configuration after the move, or `undefined` where it cannot move
 */
export function moveOld(
  raw: Readonly<Record<string, unknown>>,
  old: OldOption,
  held?: unknown,
): Record<string, unknown> | undefined {
  const at = old.entry === undefined ? raw : (raw.entities as unknown[] | undefined)?.[old.entry];
  if (!isConfigBlock(at) || (at[old.to] !== undefined && at[old.to] !== null)) return undefined;
  if (!(old.key in at) && held === undefined) return undefined;
  const renamed = (from: Readonly<Record<string, unknown>>): Record<string, unknown> =>
    old.key in from
      ? Object.fromEntries(
          Object.entries(from)
            .filter(([key]) => key !== old.to)
            .map(([key, value]) => [key === old.key ? old.to : key, value]),
        )
      : { ...from, [old.to]: held };
  if (old.entry === undefined) return renamed(raw);
  const entities = [...(raw.entities as Array<string | Types.EntityConfig>)];
  entities[old.entry] = renamed(
    entities[old.entry] as unknown as Record<string, unknown>,
  ) as unknown as Types.EntityConfig;
  return { ...raw, entities };
}
