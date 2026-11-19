/**
 * Weather schema rows.
 */

import { blockScope, bool, color, number, scope, select, text } from './common';
import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import { weatherEntityOf } from '../../../utils/weather-position';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';

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
 * The weather entity, written as `weather_entity`: one for every layout. Its label and helper are
 * the bare `entity` keys, which every translation already holds the label for.
 */
const ENTITY_FIELD: HaFormSchema = {
  name: 'weather_entity',
  titleKey: 'entity',
  selector: { entity: { filter: { domain: 'weather' } } },
};

/**
 * Builds the Weather panel schema for one layout: the card's entity, and with it the layout's own
 * `weather:`, which routing stores in its block (`list.weather`, `time_grid.weather`).
 *
 * @param language - Effective language code
 * @param layout - Whether a layout is being edited; All Layouts offers the entity alone
 * @param month - Whether the layout is Month, which draws the forecast beside events only
 * @param hasEntity - Whether a weather entity is configured
 * @param position - Where this layout shows the forecast
 * @param dateUvIndex - Whether the day forecast shows a UV index
 * @param eventUvIndex - Whether the event forecast shows a UV index
 * @param eventConditions - Whether the event row shows its condition, which is the only
 *   thing `max_lines` depends on
 * @returns The panel's schema
 */
const weatherSchema = Helpers.memoizeLast(
  (
    language: string,
    layout: boolean,
    month: boolean,
    hasEntity: boolean,
    position: string,
    dateUvIndex: boolean,
    eventUvIndex: boolean,
    eventConditions: boolean,
  ): HaFormSchema[] => {
    if (!layout || !hasEntity) return [ENTITY_FIELD];

    const inside: HaFormSchema[] = [
      month
        ? select(language, 'position', ['none', 'event'])
        : select(language, 'position', ['none', 'date', 'event', 'both']),
    ];

    if (!month && (position === 'date' || position === 'both')) {
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

    return [ENTITY_FIELD, scope('weather', inside)];
  },
);

/**
 * Builds the Weather panel schema for a context: the layout being edited, or the card's entity
 * alone where no layout is.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildWeatherSchema(ctx: SchemaCtx): HaFormSchema[] {
  const workspace = ctx.workspace ?? ctx.view;
  const view = workspace === 'shared' ? undefined : workspace;
  const weather = view === undefined ? undefined : ViewConfig.layoutWeather(ctx.config, view);

  return weatherSchema(
    ctx.language,
    view !== undefined,
    view === 'month',
    weatherEntityOf(ctx.config) !== undefined,
    weather?.position ?? 'none',
    Boolean(weather?.date?.show_uv_index),
    Boolean(weather?.event?.show_uv_index),
    weather?.event?.show_conditions !== false,
  );
}
