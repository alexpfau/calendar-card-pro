/**
 * Which `hass` updates can change what the card draws.
 *
 * Home Assistant hands every card a new `hass` object on every state change in the house, a
 * few a second on a busy dashboard. The card draws from a small part of it: the state objects
 * of the entities its configuration names (its calendars, a label's person or entity, the
 * weather entity), and the parts of `hass` that are not states at all (locale, core config,
 * registry, translations, theme, the connection). An update that leaves all of those as they
 * were changes nothing on screen, and the card skips its render for it (`shouldUpdate`).
 *
 * Deny by default: any key of `hass` other than `states` that changes counts, whatever it is,
 * so a later reader of a new part of `hass` needs nothing here. Only `states` is narrowed, and
 * to every entity id the configuration names anywhere rather than to a list of options, so a
 * new option naming an entity is covered too. A `location` visibility condition is the one reader
 * of states no configuration names (the viewer's person, the zones), which `watchedEntityIds` adds
 * where one is configured. `tests/hass-relevance.test.ts` reconciles this against what render
 * actually reads.
 */
import * as Visibility from './visibility';
import type * as Types from '../config/types';

/** An entity id: a domain, a dot, an object id. Loose on purpose, as a miss costs a stale render. */
const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** Entity ids per configuration object; a new configuration is a new object. */
const entityIdsByConfig = new WeakMap<object, ReadonlySet<string>>();

/**
 * Every entity id a configuration names, at any depth.
 *
 * A string that merely looks like one (`0.5`) is harmless: it names no state, so it never
 * differs between two `hass` objects.
 *
 * @param config - Card configuration
 * @returns The entity ids
 */
export function configEntityIds(config: Types.Config): ReadonlySet<string> {
  const cached = entityIdsByConfig.get(config);
  if (cached) return cached;

  const ids = new Set<string>();
  const seen = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (ENTITY_ID.test(value)) ids.add(value);
      return;
    }
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  visit(config);

  entityIdsByConfig.set(config, ids);
  return ids;
}

/** Whether a configuration has a `location` condition, per configuration object. */
const usesLocationByConfig = new WeakMap<object, boolean>();

/**
 * Every entity id whose state the card reads: those the configuration names, and where it has a
 * `location` visibility condition, the persons and zones that condition reads
 * (`Visibility.locationEntityIds`), which depend on `hass` rather than on the configuration.
 *
 * @param config - Card configuration
 * @param hass - The `hass` the card renders with
 * @returns The entity ids
 */
export function watchedEntityIds(
  config: Types.Config,
  hass: Types.Hass | undefined,
): ReadonlySet<string> {
  const named = configEntityIds(config);
  let usesLocation = usesLocationByConfig.get(config);
  if (usesLocation === undefined) {
    usesLocation = Visibility.entriesUseLocation(config.entities ?? []);
    usesLocationByConfig.set(config, usesLocation);
  }
  if (!usesLocation) return named;
  return new Set([...named, ...Visibility.locationEntityIds(hass)]);
}

/**
 * Whether a new `hass` can change anything the card draws.
 *
 * @param previous - The `hass` the card last saw, undefined before the first
 * @param next - The new `hass`
 * @param entityIds - The entity ids whose states the card reads (`watchedEntityIds`)
 * @returns False only when nothing but other entities' states changed
 */
export function hassChangeIsVisible(
  previous: Types.Hass | undefined,
  next: Types.Hass | undefined,
  entityIds: ReadonlySet<string>,
): boolean {
  if (!previous || !next) return previous !== next;

  const before = previous as unknown as Record<string, unknown>;
  const after = next as unknown as Record<string, unknown>;
  for (const key of Object.keys(after)) {
    if (key !== 'states' && after[key] !== before[key]) return true;
  }
  for (const key of Object.keys(before)) {
    if (!(key in after)) return true;
  }

  if (previous.states === next.states) return false;
  for (const id of entityIds) {
    if (previous.states?.[id] !== next.states?.[id]) return true;
  }
  return false;
}
