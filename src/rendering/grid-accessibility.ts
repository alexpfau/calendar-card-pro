/**
 * Grid-only accessible event names. Visual disclosure must not remove an event from the
 * accessibility tree or expose details the author intentionally disabled.
 */

import { type EventContentParts, eventWeatherContent } from './leaves';
import { buildEventPresentation } from './presentation';
import type * as Types from '../config/types';
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
    const namedId = isPersonEntityId(authored) ? authored : entityId;
    const name = namedId && hass?.states[namedId]?.attributes.friendly_name;
    return typeof name === 'string' && name.trim() ? [name] : namedId ? [namedId] : [];
  });
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
  const words = [
    ...labelNames(event, parts, config, hass),
    event.summary,
    original.shouldShowTime ? original.eventTime : '',
    original.countdownStr,
    parts.eventLocation,
    parts.eventDescription,
    weather?.showTemp ? `${weather.forecast.temperature}\u00b0` : '',
    weather?.showUvIndex ? `UV${weather.forecast.uv_index}` : '',
    weather?.conditionText,
    original.progressPercentage !== null && config.show_progress_bar
      ? `${Math.round(original.progressPercentage)}%`
      : '',
  ];
  return words
    .filter((word): word is string => typeof word === 'string' && word.trim().length > 0)
    .map((word) => `\u2068${word.trim()}\u2069`)
    .join(', ');
}
