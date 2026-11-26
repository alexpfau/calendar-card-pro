/**
 * Calendar lanes: which lane each entry under `entities` belongs to, in what order the lanes
 * come, and which of them a layout draws.
 *
 * A lane is one calendar by default, keyed by its entity id. An entry's `lane` names a lane of
 * its own instead, so several calendars can share one person's lane (`lane: Anna` on Anna's
 * calendar and on her work calendar), and two entries of one calendar, each with its own filter,
 * can take a lane each.
 *
 * 🚨 Identity only, and it has to stay that way. The editor imports this through
 * `config/view.ts`, which sizes a layout from the number of lanes, and anything that reaches the
 * card's label or date formatting from here drags Day.js and every locale into `editor.js`,
 * which `check:bundle` refuses. What a lane looks like (its name, its picture, its color) is
 * `rendering/lanes.ts`, which only the card imports.
 */

import type * as Types from '../config/types';

/** One lane, with the entries that draw into it. */
export interface Lane {
  /** The entry's `lane`, trimmed, or the calendar's entity id where it has none. */
  readonly key: string;

  /** The entries in the lane, in the order {@link canonicalEntries} gives. */
  readonly entries: ReadonlyArray<Types.EntityConfig>;

  /** The calendars in the lane, each once, in that order. */
  readonly entityIds: ReadonlyArray<string>;
}

/**
 * The layouts that can draw lanes. Grid draws a slice of each day per lane.
 *
 * Month never does: its days are a few lines tall, with no room to divide.
 */
export const LANE_VIEWS: ReadonlySet<Types.EffectiveView> = new Set<Types.EffectiveView>(['grid']);

/**
 * The lane an entry draws into.
 *
 * @param entry - An entry under `entities`, normalized or as written
 * @returns Its `lane`, trimmed, else its calendar's entity id
 */
export function laneKey(entry: string | Types.EntityConfig): string {
  if (typeof entry === 'string') return entry;
  const lane = typeof entry.lane === 'string' ? entry.lane.trim() : '';
  return lane !== '' ? lane : entry.entity;
}

/**
 * The lane an event draws into: its entry's, from the entry that admitted it.
 *
 * @param event - An event as `processEvents` stamped it
 * @returns The lane's key, or `''` for an event no entry admitted
 */
export function eventLaneKey(event: {
  _entityId?: string;
  _matchedConfig?: Pick<Types.EntityConfig, 'entity' | 'lane'>;
}): string {
  return event._matchedConfig ? laneKey(event._matchedConfig) : (event._entityId ?? '');
}

/**
 * The entries in the order the visual editor writes them: each calendar's entries together,
 * the calendars in the order each first appears, and one calendar's entries in their own order.
 *
 * Lanes take their order from this rather than from where each entry is written. The editor
 * groups a calendar's entries whenever it edits the list, so an order read off the YAML as
 * written would move a lane the first time anyone added an unrelated calendar.
 *
 * @param entities - The card's entries, normalized or as written; malformed ones are skipped
 * @returns The entries, normalized to objects, regrouped
 */
export function canonicalEntries(
  entities: ReadonlyArray<string | Types.EntityConfig> | undefined,
): Types.EntityConfig[] {
  const byCalendar = new Map<string, Types.EntityConfig[]>();

  for (const entry of entities ?? []) {
    const object = typeof entry === 'string' ? { entity: entry } : entry;
    if (!object || typeof object !== 'object' || typeof object.entity !== 'string') continue;

    const listed = byCalendar.get(object.entity);
    if (listed) listed.push(object);
    else byCalendar.set(object.entity, [object]);
  }

  return [...byCalendar.values()].flat();
}

/**
 * Builds the lanes of a list of entries, in canonical order.
 *
 * @param entities - The card's entries, normalized or as written
 * @param include - Which entries take part; every entry by default
 * @returns The lanes, each with at least one entry
 */
export function buildLanes(
  entities: ReadonlyArray<string | Types.EntityConfig> | undefined,
  include: (entry: Types.EntityConfig) => boolean = () => true,
): Lane[] {
  const lanes = new Map<string, { entries: Types.EntityConfig[]; entityIds: string[] }>();

  for (const entry of canonicalEntries(entities)) {
    if (!include(entry)) continue;

    const key = laneKey(entry);
    const lane = lanes.get(key) ?? { entries: [], entityIds: [] };
    lane.entries.push(entry);
    if (!lane.entityIds.includes(entry.entity)) lane.entityIds.push(entry.entity);
    lanes.set(key, lane);
  }

  return [...lanes].map(([key, lane]) => ({ key, ...lane }));
}

/**
 * Whether a layout draws lanes: one that can, with `lanes` on for it.
 *
 * @param config - Configuration resolved for the layout (`resolveEffectiveConfig`)
 * @param view - The layout drawn
 * @returns True where the layout arranges its events by lane
 */
export function lanesOn(config: Pick<Types.Config, 'lanes'>, view: Types.EffectiveView): boolean {
  return LANE_VIEWS.has(view) && config.lanes === true;
}

/**
 * Whether an entry can put events in a layout's lanes. Every entry can, except, in Grid, one that
 * keeps only all-day events: those are drawn in the all-day band every lane shares, so a slice of
 * its own would stay empty on every day.
 *
 * @param entry - An entry under `entities`
 * @param config - Configuration resolved for the layout
 * @param view - The layout drawn
 * @returns True where the entry has a place among the lanes
 */
export function entryTakesLane(
  entry: Types.EntityConfig,
  config: Pick<Types.Config, 'event_type'>,
  view: Types.EffectiveView,
): boolean {
  return view !== 'grid' || (entry.event_type ?? config.event_type) !== 'all_day';
}

/**
 * The lanes a layout lays out for the entries it is given, before the calendar filter hides any:
 * what the layout's width is measured against, so pressing a chip never refits the card.
 *
 * @param config - Configuration resolved for the layout, its entries already those shown to the
 *   viewer (visibility conditions applied)
 * @param view - The layout drawn
 * @returns The lanes, or none where the layout draws none
 */
export function laneUniverse(
  config: Pick<Types.Config, 'lanes' | 'entities' | 'event_type'>,
  view: Types.EffectiveView,
): Lane[] {
  if (!lanesOn(config, view)) return [];
  return buildLanes(config.entities, (entry) => entryTakesLane(entry, config, view));
}

/**
 * The lanes a layout draws: the universe less the lanes whose every calendar the calendar filter
 * hides. A lane keeps its place while any of its calendars shows.
 *
 * @param universe - The layout's lanes ({@link laneUniverse})
 * @param hiddenCalendars - The calendars the calendar filter hides now
 * @returns The lanes drawn, in order
 */
export function shownLanes(
  universe: ReadonlyArray<Lane>,
  hiddenCalendars: ReadonlySet<string>,
): Lane[] {
  if (hiddenCalendars.size === 0) return [...universe];
  return universe.filter((lane) => lane.entityIds.some((id) => !hiddenCalendars.has(id)));
}
