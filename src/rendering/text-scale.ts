/**
 * One calendar's events drawn with larger or smaller text: the per-calendar `text_scale`.
 *
 * The card writes its sizes on `ha-card` as custom properties, and every rule that sizes the
 * text in an event, or an icon beside it, reads them there. An event whose block carries a
 * scale writes the same properties again on its own element, multiplied, so everything inside
 * it follows and nothing outside it moves. It is the mechanism `accent-text.ts` uses for the
 * accent color. The grid's fit ladders measure the text they are handed, so a scaled block is
 * fitted as a card with those sizes would be. Two things outside this module complete it: each
 * event computes the room its boxes keep at their inline edges again from its own sizes
 * (`styles.ts`), and the grid's cascade gives each scale a threshold of its own
 * (`grid-cascade-threshold.ts`). The scalers themselves are length arithmetic and live in
 * `config/view.ts`.
 *
 * The properties are not listed here. Each scaled option is multiplied in a copy of the
 * configuration, both copies go through `generateCustomPropertiesObject`, and what differs is
 * what the event writes, so a property the stylesheet derives from one of these sizes (the room
 * a box keeps at its inline edges) follows without anyone remembering it.
 */

import { generateCustomPropertiesObject } from './styles';
import type * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import * as EventUtils from '../utils/events';

/** Whether a size is the size of text, or of an icon drawn beside text. */
type SizeKind = 'text' | 'icon';

/** One option a calendar's scale multiplies, and the custom property the card writes it to. */
interface ScaledSize {
  /** The option's path: a top-level name, or `weather.event.<name>`. */
  option: string;
  /** The property the card writes the option to on `ha-card`. */
  property: string;
  kind: SizeKind;
  /**
   * For a text size, what the rule reading the property falls back to when a CSS-wide keyword
   * leaves it unset: its own fallback, or `1em`, the size its text inherits, where it has none.
   */
  unsetAs?: string;
}

/**
 * 🚨 Every size an event draws its own content in, and nothing else. The day header's sizes,
 * the card title, the week numbers, the grid's hour labels and the today marker are not an
 * event's, so they stay the card's. `tests/text-scale.test.ts` reconciles this list against
 * the two tables in `config.ts` that name every size option, so a new one has to be put here
 * or excluded there on purpose.
 */
export const SCALED_SIZES: ReadonlyArray<ScaledSize> = [
  { option: 'event_font_size', property: '--calendar-card-font-size-event', kind: 'text' },
  { option: 'time_font_size', property: '--calendar-card-font-size-time', kind: 'text' },
  { option: 'location_font_size', property: '--calendar-card-font-size-location', kind: 'text' },
  {
    option: 'description_font_size',
    property: '--calendar-card-font-size-description',
    kind: 'text',
  },
  { option: 'time_icon_size', property: '--calendar-card-icon-size-time', kind: 'icon' },
  { option: 'location_icon_size', property: '--calendar-card-icon-size-location', kind: 'icon' },
  {
    option: 'description_icon_size',
    property: '--calendar-card-icon-size-description',
    kind: 'icon',
  },
  {
    option: 'weather.event.font_size',
    property: '--calendar-card-weather-event-font-size',
    kind: 'text',
    unsetAs: '12px',
  },
  {
    option: 'weather.event.icon_size',
    property: '--calendar-card-weather-event-icon-size',
    kind: 'icon',
  },
];

/**
 * The scale an event is drawn at: its block's `text_scale`, or 1 where it has none, has one
 * that is not a number above 0, or is an empty-day notice, which belongs to no calendar.
 *
 * @param event - The event as the views draw it
 * @param config - Card configuration
 * @returns The event's scale
 */
export function textScaleOf(event: Types.CalendarEventData, config: Types.Config): number {
  if (event._isEmptyDay) return 1;

  const scale = EventUtils.getEntitySetting(event._entityId, 'text_scale', config, event);
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * Every scale a card's calendars are drawn at, 1 among them, once each.
 *
 * @param config - Card configuration
 * @returns The scales, 1 first
 */
export function textScalesIn(config: Types.Config): number[] {
  const scales = new Set([1]);

  for (const entry of config.entities ?? []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const scale = entry.text_scale;
    if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) scales.add(scale);
  }

  return [...scales];
}

/**
 * The configuration with each size in {@link SCALED_SIZES} multiplied, read from the values the
 * card writes so each one's fallback is the stylesheet's own.
 *
 * @param config - Card configuration
 * @param base - What `generateCustomPropertiesObject` writes for it
 * @param scale - The calendar's scale
 * @returns A copy to generate the scaled properties from
 */
function scaledConfig(
  config: Types.Config,
  base: Readonly<Record<string, string>>,
  scale: number,
): Types.Config {
  const scaled = { ...config } as unknown as Record<string, unknown>;
  const weatherEvent: Record<string, unknown> = { ...(config.weather?.event ?? {}) };

  for (const { option, property, kind, unsetAs } of SCALED_SIZES) {
    const written = base[property];
    if (typeof written !== 'string') continue;

    const value =
      kind === 'text'
        ? ViewConfig.scaleTextSize(written, scale, unsetAs)
        : ViewConfig.scaleIconSize(written, scale);
    const nested = /^weather\.event\.(.+)$/.exec(option);

    if (nested) weatherEvent[nested[1]] = value;
    else scaled[option] = value;
  }

  scaled.weather = { ...(config.weather ?? {}), event: weatherEvent };
  return scaled as unknown as Types.Config;
}

/**
 * The class a scaled event carries. The stylesheet keys two things on it: the room its boxes
 * keep at their inline edges, computed again from the event's own sizes, and the icon of a
 * weather badge beside the title. Neither is declared on an unscaled event, which inherits both
 * from `ha-card` as it always has, a theme's own value included.
 */
export const TEXT_SCALED_CLASS = 'event-text-scaled';

/**
 * The size of a weather badge's icon beside the title, where list view draws the badge.
 *
 * Everywhere else an event's icons sit inside text the scale sizes, so an icon sized in `em`
 * follows it on its own. Beside the title the badge's icon is sized in the font of the row,
 * which no option sets, so an `em` size there takes the scale in full. Written only where that
 * differs from the event's other weather icon size; `styles.ts` reads it on a scaled event.
 */
export const WEATHER_TITLE_ICON_PROPERTY = '--calendar-card-weather-event-title-icon-size';

/** Each configuration's properties per scale, so a render computes each pair once. */
const CACHE = new WeakMap<Types.Config, Map<number, Readonly<Record<string, string>>>>();

/** What an unscaled event writes: nothing, so its markup is what it always was. */
const NONE: Readonly<Record<string, string>> = Object.freeze({});

/**
 * The custom properties an event drawn at `scale` writes on its own element.
 *
 * @param config - Card configuration, the one the card's own properties were written from
 * @param scale - The event's scale, from {@link textScaleOf}
 * @returns Property names mapped to values; empty at a scale of 1
 */
export function textScaleProperties(
  config: Types.Config,
  scale: number,
): Readonly<Record<string, string>> {
  if (scale === 1 || !Number.isFinite(scale) || scale <= 0) return NONE;

  let byScale = CACHE.get(config);
  if (!byScale) {
    byScale = new Map();
    CACHE.set(config, byScale);
  }

  const cached = byScale.get(scale);
  if (cached) return cached;

  const base = generateCustomPropertiesObject(config);
  const scaled = generateCustomPropertiesObject(scaledConfig(config, base, scale));
  const properties: Record<string, string> = {};

  for (const [name, value] of Object.entries(scaled)) {
    if (base[name] !== value) properties[name] = value;
  }

  const weatherIcon = base['--calendar-card-weather-event-icon-size'];
  if (typeof weatherIcon === 'string') {
    const besideTitle = ViewConfig.scaleIconSize(weatherIcon, scale, false);
    const inRow = properties['--calendar-card-weather-event-icon-size'] ?? weatherIcon;
    if (besideTitle !== inRow) properties[WEATHER_TITLE_ICON_PROPERTY] = besideTitle;
  }

  byScale.set(scale, properties);
  return properties;
}
