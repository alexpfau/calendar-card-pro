/**
 * The Weather panel — a forecast beside the day, beside the event, or both.
 *
 * The only part of the configuration besides the override block that genuinely nests,
 * and the nesting is two deep: `weather.date.*` and `weather.event.*`. Home Assistant
 * binds a named, unflattened group to `data[name]`, so saying so is the whole of the
 * plumbing — the old editor spelled every one of those paths out by hand.
 *
 * The outer level uses `scope`, which nests without drawing a heading, because a
 * *Weather* group inside the *Weather* panel would be the same word twice. The two
 * position groups are expandables, where a heading is exactly what is wanted.
 *
 * Everything is gated on the entity, and that gating is right for the same reason the
 * event panel's is: with no weather entity there is no forecast to style, and the
 * control that would supply one is the field directly above.
 *
 * The two scopes accept deliberately different options — a day shows a daily forecast
 * with a high and a low, an event shows the forecast for its own start time — so this
 * is two schemas rather than one shared one used twice.
 */

import { mdiWeatherPartlyCloudy } from '@mdi/js';

import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { bool, color, nested, number, row, scope, select, text } from './common';

/** Icon for the panel. */
export const WEATHER_ICON = mdiWeatherPartlyCloudy;

/** Icon paths for the two position groups. */
const DATE_POSITION_ICON =
  'M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m0' +
  ' 16H5V9h14v10Z';
const EVENT_POSITION_ICON = 'M3 5h18v2H3V5m0 6h18v2H3v-2m0 6h12v2H3v-2Z';

/** The styling every weather position shares, in the order it should read. */
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
 * The same shape as the UV threshold above, and for the same reason: the only thing in
 * the row that can reach a second line is the condition stated in words, and
 * `show_conditions` is the switch directly above that adds it. With the switch off the
 * row is an icon and two short numbers, and a limit on it would be a control for
 * nothing.
 *
 * Not offered for the date position at all: that header arranges its fields
 * horizontally and already truncates on its own.
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
 * Memoised on the entity's presence rather than its id — swapping one weather entity
 * for another changes no field — the chosen position, the two UV switches, whether the
 * event row states its condition in words, and the language.
 *
 * @param language - Effective language code
 * @param hasEntity - Whether a weather entity is configured
 * @param position - Where the forecast is shown
 * @param dateUvIndex - Whether the day forecast shows a UV index
 * @param eventUvIndex - Whether the event forecast shows a UV index
 * @param eventConditions - Whether the event row shows its condition, which is the only
 *   thing in it long enough to need a line limit
 * @returns The panel's schema
 */
export const weatherSchema = Helpers.memoizeLast(
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
