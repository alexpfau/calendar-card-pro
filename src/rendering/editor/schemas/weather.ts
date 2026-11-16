/**
 * Weather schema rows.
 */

import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { blockScope, bool, color, number, scope, select, text } from './common';

function styling(): HaFormSchema[] {
  return [text('icon_size'), text('font_size'), color('color')];
}

/**
 * The UV-index pair, whose threshold only means something once the index is shown.
 *
 * @param showUvIndex - Whether the UV index is shown for this position
 * @returns The switch, and the threshold when it applies
 */
function uvIndexFields(showUvIndex: boolean): HaFormSchema[] {
  return [bool('show_uv_index'), ...(showUvIndex ? [number('uv_index_threshold', 0)] : [])];
}

/**
 * The event row's line limit, which only means something once there is prose to limit.
 *
 * @param showConditions - Whether the event row states its condition in words
 * @returns The limit, when it applies
 */
function eventLineLimit(showConditions: boolean): HaFormSchema[] {
  return showConditions ? [number('max_lines', 0)] : [];
}

/**
 * Builds the Weather panel schema.
 *
 * @param language - Effective language code
 * @param hasEntity - Whether a weather entity is configured
 * @param position - Where the forecast is shown
 * @param dateUvIndex - Whether the day forecast shows a UV index
 * @param eventUvIndex - Whether the event forecast shows a UV index
 * @param eventConditions - Whether the event row shows its condition, which is the only
 *   thing `max_lines` depends on
 * @returns The panel's schema
 */
const weatherSchema = Helpers.memoizeLast(
  (
    language: string,
    hasEntity: boolean,
    position: string,
    dateUvIndex: boolean,
    eventUvIndex: boolean,
    eventConditions: boolean,
  ): HaFormSchema[] => {
    const inside: HaFormSchema[] = [
      { name: 'entity', selector: { entity: { filter: { domain: 'weather' } } } },
    ];

    if (hasEntity) {
      inside.push(select(language, 'position', ['none', 'date', 'event', 'both']));

      if (position === 'date' || position === 'both') {
        inside.push(
          blockScope('date', [
            bool('show_conditions'),
            bool('show_high_temp'),
            bool('show_low_temp'),
            ...uvIndexFields(dateUvIndex),
            ...styling(),
          ]),
        );
      }

      if (position === 'event' || position === 'both') {
        inside.push(
          blockScope('event', [
            bool('show_conditions'),
            bool('show_temp'),
            ...uvIndexFields(eventUvIndex),
            bool('daily_forecast_fallback'),
            ...styling(),
            ...eventLineLimit(eventConditions),
          ]),
        );
      }
    }

    return [scope('weather', inside)];
  },
);

/**
 * Builds the Weather panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildWeatherSchema(ctx: SchemaCtx): HaFormSchema[] {
  const weather = ctx.config.weather;

  return weatherSchema(
    ctx.language,
    Boolean(weather?.entity),
    weather?.position ?? 'date',
    Boolean(weather?.date?.show_uv_index),
    Boolean(weather?.event?.show_uv_index),
    weather?.event?.show_conditions !== false,
  );
}
