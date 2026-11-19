/**
 * The field ids of the weather the editor draws on each layout's Weather page: the one entity
 * every layout draws from, and each layout's own `weather:`, stored in its block. A module of its
 * own, importing only the view registry, so the page registry, the gates and the element all name
 * them alike without importing each other.
 */

import { OVERRIDE_BLOCK_BY_VIEW, VIEWS } from '../../config/view';

/** The weather entity every layout draws from, at the top level. */
export const WEATHER_ENTITY = 'weather:weather_entity';

/** The layout blocks that hold a `weather:` of their own, in `VIEWS` order. */
export const WEATHER_BLOCKS: ReadonlyArray<string> = VIEWS.map(
  (view) => OVERRIDE_BLOCK_BY_VIEW[view] as string,
);

/** Month's block, whose weather shows beside events only. */
export const MONTH_WEATHER_BLOCK = OVERRIDE_BLOCK_BY_VIEW.month as string;

/**
 * A field of one layout's own weather.
 *
 * @param block - The layout's block key, such as `time_grid`
 * @param path - The option under its `weather:`, such as `date.show_conditions`
 * @returns The field id, such as `weather:time_grid.weather.date.show_conditions`
 */
export function weatherField(block: string, path: string): string {
  return `weather:${block}.weather.${path}`;
}
