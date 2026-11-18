/**
 * Converting weather as written before v6 into weather per layout.
 *
 * Before v6 one top-level `weather:` block held the entity and how every layout drew its
 * forecast. From v6 the entity is `weather_entity`, and each layout's block holds its own
 * `weather:`, off until it says otherwise. The card still reads the old block wherever it names
 * an entity (`readsWeatherAsBefore`), so nothing here is needed for a card to keep working; this
 * is what the editor writes when it converts one, so the card it saves draws what it drew.
 *
 * Pure and free of Lit and the DOM, so the editor and the test suite import it alike. It never
 * stamps `config_version`: weather is told apart by its shape, not by a version.
 */

import type * as Types from './types';
import { VIEW_BLOCKS } from './view';
import * as Helpers from '../utils/helpers';

/** The layouts that drew the top-level block before v6. Month never drew it, and stays off. */
export const LAYOUTS_DRAWING_OLD_WEATHER: ReadonlyArray<Types.EffectiveView> = [
  'list',
  'column',
  'grid',
];

/** What converting a configuration did, for the editor to say. */
export interface WeatherMigrationResult {
  /** The configuration to store: unchanged where there was nothing to convert. */
  readonly config: Record<string, unknown>;
  /** Whether a top-level `weather:` block was converted. */
  readonly converted: boolean;
  /** The layouts that took the top-level block's options, in `VIEWS` order. */
  readonly filled: ReadonlyArray<Types.EffectiveView>;
  /**
   * Lines the configuration held that the converted one no longer does, as option paths such as
   * `list.weather` or `weather_entity`: each was ignored by the card, so dropping it changes
   * nothing the card drew.
   */
  readonly dropped: ReadonlyArray<string>;
}

/**
 * A layout's `weather:` from the top-level block's options: a copy, so no two layouts share an
 * object a YAML writer could turn into an anchor, with the `date` position that block defaulted
 * to written out, because a layout's own block defaults to none.
 *
 * @param presentation - The top-level block without its entity
 * @param drawn - Whether the card draws it, which is when the missing position meant `date`
 * @returns The layout's block
 */
function layoutWeather(
  presentation: Readonly<Record<string, unknown>>,
  drawn: boolean,
): Record<string, unknown> {
  const copy = structuredClone(presentation) as Record<string, unknown>;
  if (!drawn || copy.position) return copy;
  // Before v6 a missing, empty or cleared position read as `date` (`resolveWeatherPosition`).
  delete copy.position;
  return { position: 'date', ...copy };
}

/**
 * Converts a top-level `weather:` block into `weather_entity` and the layouts' own `weather:`.
 *
 * - A block that names an entity is the weather the card drew. Its entity becomes
 *   `weather_entity`, and List, Columns and Grid each take its other options, the `date` position
 *   it defaulted to written out. Month, which never drew it, gets none. Each layout's own
 *   `weather:`, and a `weather_entity` naming another entity, were ignored beside it and are
 *   dropped.
 * - A block without an entity drew nothing. The card reads such a configuration per layout
 *   already, so a layout's own `weather:` wins, and the block's options fill List, Columns and
 *   Grid where they have none, as it would have been read with `weather_entity` as its entity.
 *   That can turn weather on in a configuration that was half converted by hand, which is what
 *   its author meant; the editor names those layouts. An empty block is only removed.
 * - Anything else, including `weather: null`, a scalar, or no block at all, is left as written.
 *
 * Converting a converted configuration changes nothing: it holds no top-level block.
 *
 * @param stored - The configuration to store, as the editor writes it
 * @returns The converted configuration and what changed
 */
export function migrateWeatherFormat(
  stored: Readonly<Record<string, unknown>>,
): WeatherMigrationResult {
  const block = stored.weather;
  if (!Helpers.isConfigBlock(block)) {
    return { config: stored as Record<string, unknown>, converted: false, filled: [], dropped: [] };
  }

  const { entity, ...presentation } = block as Record<string, unknown>;
  const asBefore = !!entity;
  const ownEntity = typeof stored.weather_entity === 'string' ? stored.weather_entity : undefined;
  const resulting = asBefore ? entity : ownEntity?.trim() ? ownEntity : undefined;
  const hasOptions = Object.keys(presentation).length > 0;
  const dropped: string[] = [];
  const filled: Types.EffectiveView[] = [];

  // Rebuilt in the configuration's own order, `weather_entity` where `weather` was.
  const config: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (key === 'weather') {
      if (resulting !== undefined) config.weather_entity = resulting;
      continue;
    }
    if (key === 'weather_entity') {
      if (asBefore && value !== entity) dropped.push('weather_entity');
      if (resulting !== undefined) continue;
    }
    config[key] = Helpers.isConfigBlock(value) ? { ...value } : value;
  }

  for (const [view, viewBlock] of Object.entries(VIEW_BLOCKS) as Array<
    [Types.EffectiveView, NonNullable<(typeof VIEW_BLOCKS)[Types.EffectiveView]>]
  >) {
    const key = viewBlock.blockKey as string;
    const own = config[key];
    const holds = Helpers.isConfigBlock(own) && Helpers.hasOwn(own, 'weather');
    const draws = LAYOUTS_DRAWING_OLD_WEATHER.includes(view);

    if (asBefore) {
      if (holds) dropped.push(`${key}.weather`);
      if (!draws) {
        if (holds) {
          const rest = { ...(own as Record<string, unknown>) };
          delete rest.weather;
          if (Object.keys(rest).length > 0) config[key] = rest;
          else delete config[key];
        }
        continue;
      }
    } else if (holds || !draws || !hasOptions) {
      continue;
    }

    config[key] = {
      ...(Helpers.isConfigBlock(own) ? own : {}),
      weather: layoutWeather(presentation, resulting !== undefined),
    };
    filled.push(view);
  }

  return { config, converted: true, filled, dropped };
}
