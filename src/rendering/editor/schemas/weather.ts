/**
 * Weather schema rows.
 */

import { mdiWeatherPartlyCloudy } from '@mdi/js';

import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { bool, color, nested, number, row, scope, select, text } from './common';

export const WEATHER_ICON = mdiWeatherPartlyCloudy;

const DATE_POSITION_ICON =
  'M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m0' +
  ' 16H5V9h14v10Z';
const EVENT_POSITION_ICON = 'M3 5h18v2H3V5m0 6h18v2H3v-2m0 6h12v2H3v-2Z';

function styling(): HaFormSchema[] {
  return [row(text('icon_size'), text('font_size')), color('color')];
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
          nested(language, 'date', 'weather.date', DATE_POSITION_ICON, [
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
          nested(language, 'event', 'weather.event', EVENT_POSITION_ICON, [
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
