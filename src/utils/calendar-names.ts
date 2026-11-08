/**
 * A calendar's name, wherever the card itself names one.
 *
 * One resolver for every surface that names a calendar as the card draws it — the legend's
 * chips and its menu, the "Couldn't load" notice, the event popover and the grid's
 * screen-reader names — so a new surface is one call rather than another reader of
 * `friendly_name` that answers a little differently from the rest.
 *
 * 🚨 **The name belongs to the calendar, not to a block.** A calendar listed twice, which is
 * how `event_type` splits one, is still one calendar: one legend chip, one name. So this
 * scans the whole `entities` list, and never `_matchedConfig` or `getEntitySetting`, both of
 * which answer for a single block and would let removing or reordering blocks rename the
 * calendar. The editor keeps every block of a calendar holding the same name; for
 * hand-written YAML that names it twice, the first non-blank name wins.
 *
 * Two surfaces deliberately do not read it. The editor's panel heading keeps Home Assistant's
 * name, matching the calendar picker directly above it, which the card cannot rename. And a
 * person's name, which an image label can draw on, is the person's own and not the calendar's.
 */

import type * as Types from '../config/types';

/**
 * The name the configuration gives a calendar, if any.
 *
 * Reads a configuration the card normalized or one the editor holds as written, so it takes
 * bare ids and malformed entries in its stride and trims what it returns.
 *
 * @param entities - The card's `entities` list, as configured
 * @param entityId - The calendar
 * @returns The first non-blank `name` given to that calendar, trimmed, or `undefined`
 */
export function configuredCalendarName(
  entities: ReadonlyArray<unknown> | undefined,
  entityId: string,
): string | undefined {
  if (!Array.isArray(entities)) return undefined;

  for (const entry of entities) {
    if (entry === null || typeof entry !== 'object') continue;

    const { entity, name } = entry as { entity?: unknown; name?: unknown };
    if (entity !== entityId) continue;
    if (typeof name === 'string' && name.trim() !== '') return name.trim();
  }

  return undefined;
}

/**
 * The name Home Assistant holds for an entity, if it holds a usable one.
 *
 * @param entityId - The entity
 * @param hass - Home Assistant state
 * @returns Its `friendly_name`, or `undefined` where it has none or only a blank one
 */
export function homeAssistantName(
  entityId: string,
  hass: Types.Hass | null | undefined,
): string | undefined {
  const name = hass?.states?.[entityId]?.attributes?.friendly_name;

  return typeof name === 'string' && name.trim() !== '' ? name : undefined;
}

/**
 * A calendar's name as the card shows it: the name the configuration gives it, else Home
 * Assistant's, else its entity id.
 *
 * @param entityId - The calendar
 * @param config - The card's configuration; only its `entities` are read
 * @param hass - Home Assistant state
 * @returns The name, never blank
 */
export function calendarName(
  entityId: string,
  config: Pick<Types.Config, 'entities'> | null | undefined,
  hass: Types.Hass | null | undefined,
): string {
  return (
    configuredCalendarName(config?.entities, entityId) ??
    homeAssistantName(entityId, hass) ??
    entityId
  );
}

/**
 * A calendar's name in the notice listing calendars that could not be loaded.
 *
 * The usual reason a calendar never loads is an entity id Home Assistant does not know — a
 * typo, or a calendar since removed — and the id is then exactly what someone fixing the
 * configuration needs. Without a name of its own such a calendar is already named by its id;
 * with one, the id follows the name, as in "Work (calendar.typo)", so naming a calendar
 * cannot hide which entry is broken. A calendar Home Assistant does know is named as it is
 * everywhere else.
 *
 * @param entityId - The calendar
 * @param config - The card's configuration; only its `entities` are read
 * @param hass - Home Assistant state
 * @returns The name to list, never blank
 */
export function failedCalendarName(
  entityId: string,
  config: Pick<Types.Config, 'entities'> | null | undefined,
  hass: Types.Hass | null | undefined,
): string {
  const configured = configuredCalendarName(config?.entities, entityId);

  if (configured !== undefined && hass?.states?.[entityId] === undefined) {
    return `${configured} (${entityId})`;
  }

  return calendarName(entityId, config, hass);
}
