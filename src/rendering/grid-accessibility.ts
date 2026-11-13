/**
 * Grid-only accessible event names. Visual disclosure must not remove an event from the
 * accessibility tree or expose details the author intentionally disabled.
 */

import { type EventContentParts, eventWeatherContent } from './leaves';
import { buildEventPresentation } from './presentation';
import type * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import { getNowString } from '../translations/dayjs';
import { calendarName } from '../utils/calendar-names';
import * as EventUtils from '../utils/events';
import { resolveLabelType } from '../utils/helpers';
import { isPersonEntityId } from '../utils/person-pictures';

function labelNames(
  event: Types.CalendarEventData,
  parts: EventContentParts,
  config: Types.Config,
  hass?: Types.Hass | null,
): string[] {
  const labels =
    parts.mergedLabels ??
    (parts.entityLabel
      ? [{ value: parts.entityLabel, type: event._matchedConfig?.label_type }]
      : []);
  return labels.flatMap(({ value, type }) => {
    const shape = resolveLabelType(value, type);
    if (shape === 'none') return [];
    if (shape === 'text') return [value];
    const contributor = parts.mergedLabels
      ? event._mergedFrom?.find(
          ({ entityId, config: matched }) =>
            EventUtils.resolveEntityLabel(
              entityId,
              config,
              { ...event, _entityId: entityId, _matchedConfig: matched },
              hass,
            ) === value,
        )
      : undefined;
    const entityId = contributor?.entityId ?? event._entityId;
    const source = contributor
      ? { ...event, _entityId: entityId, _matchedConfig: contributor.config }
      : event;
    const authored = EventUtils.getEntityLabel(entityId, config, source);
    // A person's picture is named by the person, whose name is their own; any other icon or
    // picture stands for its calendar, named as the card names it everywhere else.
    if (authored !== undefined && isPersonEntityId(authored)) {
      const person = hass?.states[authored]?.attributes.friendly_name;
      return [typeof person === 'string' && person.trim() ? person : authored];
    }
    return entityId ? [calendarName(entityId, config, hass)] : [];
  });
}

/**
 * Name a timed banner (`multiday_banners`): who it belongs to, its title and its whole time
 * span, whether or not the banner had room to draw its times. A banner draws nothing else, so
 * its name says nothing else.
 *
 * @param event - The banner's event, with its own start and end
 * @param parts - Its shared content
 * @param config - Card configuration
 * @param hass - Home Assistant instance
 * @returns The name
 */
export function gridBannerAccessibleName(
  event: Types.CalendarEventData,
  parts: EventContentParts,
  config: Types.Config,
  hass?: Types.Hass | null,
): string {
  const words = [
    ...labelNames(event, parts, config, hass),
    event.summary,
    parts.shouldShowTime ? parts.eventTime : '',
  ];
  return words
    .filter((word): word is string => typeof word === 'string' && word.trim().length > 0)
    .map((word) => `\u2068${word.trim()}\u2069`)
    .join(', ');
}

/** Name a timed block using configured presentation and original, never clipped, source times. */
export function gridEventAccessibleName(
  event: Types.CalendarEventData,
  parts: EventContentParts,
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): string {
  const source = event._gridSource
    ? { ...event, start: event._gridSource.start, end: event._gridSource.end }
    : event;
  const original =
    source.start.dateTime !== event.start.dateTime || source.end.dateTime !== event.end.dateTime
      ? buildEventPresentation(source, config, language, hass).contentParts
      : parts;
  const weather = eventWeatherContent(event, config, weatherForecasts, 'row', hass);
  // The now line is how the grid shows an event under way, and it is hidden from assistive
  // technology, so the name says it instead. Judged on the block itself, not its source, as
  // the line is: a block in tomorrow's column of an event running now is not where now is.
  const now =
    ViewConfig.resolveTimeGridOption(config, 'show_now_line') &&
    EventUtils.isEventCurrentlyRunning(event)
      ? getNowString(language)
      : '';
  const words = [
    ...labelNames(event, parts, config, hass),
    event.summary,
    now,
    original.shouldShowTime ? original.eventTime : '',
    original.countdownStr,
    parts.eventLocation,
    parts.eventDescription,
    weather?.showTemp ? `${weather.forecast.temperature}\u00b0` : '',
    weather?.showUvIndex ? `UV${weather.forecast.uv_index}` : '',
    weather?.conditionText,
    // The block's own percentage, not the source's: rebuilt from the whole event, the
    // source counts as running on every day it covers, so every day's block would
    // announce it. The block measures the same whole event, on today's block only.
    parts.progressPercentage !== null && config.show_progress_bar
      ? `${Math.round(parts.progressPercentage)}%`
      : '',
  ];
  return words
    .filter((word): word is string => typeof word === 'string' && word.trim().length > 0)
    .map((word) => `\u2068${word.trim()}\u2069`)
    .join(', ');
}
