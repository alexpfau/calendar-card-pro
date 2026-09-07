/**
 * The `accent` sentinel's governed fields, and the properties they are rendered through.
 *
 * 🚨 A module of its own, and the reason is bundle size rather than tidiness. The editor's
 * synthetic toggle needs this table, and `synthetic.ts` is in the **editor** bundle — so
 * reading it out of `styles.ts` dragged the card's entire `css` template in behind it and
 * put 37 KB onto a file every HACS user downloads. Nothing here may import a stylesheet,
 * a renderer or Lit; keep it to config types and the sentinel.
 */

import type * as Types from '../config/types';
import * as EntityColors from '../utils/entity-colors';

/**
 * The color options inside the event box that the `accent` sentinel governs, each paired
 * with the custom property the card renders it through.
 *
 * One table, read from both ends: `generateCustomPropertiesObject` in `styles.ts` substitutes the
 * shipped default at card level for any of them holding the sentinel, and
 * {@link accentTextProperties} writes the event's own accent over the same property on the
 * event element. Keeping the pairing here rather than beside either caller is what stops
 * the two disagreeing about which property carries which option —
 * `tests/accent-event-text.test.ts` reconciles every row against the mapping below.
 *
 * The list is the text inside the event box and nothing else. Excluded on purpose:
 * `allday_badge_color`, which has answered `accent` on its own since v4 and needs no help;
 * `empty_day_color`, whose row belongs to no calendar; and the date column, separators and
 * card title, which are the card's furniture rather than an event's.
 *
 * 🚨 The event weather badge is governed too, and it is deliberately **not** a row here.
 * See {@link WEATHER_EVENT_PROPERTY}.
 */
export const ACCENT_TEXT_OPTIONS = [
  ['event_color', '--calendar-card-color-event'],
  ['time_color', '--calendar-card-color-time'],
  ['location_color', '--calendar-card-color-location'],
  ['description_color', '--calendar-card-color-description'],
  ['progress_bar_color', '--calendar-card-progress-bar-color'],
] as const;

/** The governed option keys alone, for callers that only need to ask "is this one". */
export const ACCENT_TEXT_KEYS: ReadonlyArray<string> = ACCENT_TEXT_OPTIONS.map(([key]) => key);

/**
 * The property the event weather badge is colored through.
 *
 * 🚨 The badge is governed by the accent and is still not a row in the table above, and
 * the reason is that it has no stored value for a row to be about. Every option up there
 * ships a default, so `accent` is a value a view or a user writes *instead of* one;
 * `weather.event.color` deliberately ships **no** default at all — `DEFAULT_CONFIG.weather`
 * says so in as many words, because a default written there would be echoed back into the
 * user's YAML by the editor and stop being distinguishable from a choice. So the badge has
 * three states where the others have two, and absence is already "defer to whatever this
 * surface colors its text with".
 *
 * That is also why the flat override table could not reach it. `TIME_GRID_DEFAULT_OVERRIDES`
 * is keyed by top-level config keys, and this one is nested two deep; and adding it to the
 * table above would make the editor's derived toggle read *off* on a default grid card,
 * because one of its governed fields could never be defaulted to the sentinel.
 *
 * So it is resolved here, from the two states that mean "take the accent":
 *
 * - the sentinel written at `weather.event.color`, which opts in from any view; or
 * - no color at all, on an event whose own text is already taking the accent.
 *
 * The second is what makes it on by default in grid and off everywhere else, with no view
 * check to keep in step — grid defaults `event_color` to the sentinel and no other view
 * does. And an explicitly configured color wins in both directions by construction: it is
 * not the sentinel, so the first arm cannot fire, and it is set, so the second cannot
 * either.
 *
 * The day-header badge is untouched. It is colored through
 * `--calendar-card-weather-date-color`, a different property on a different element, and
 * nothing here is written above an event box.
 */
export const WEATHER_EVENT_PROPERTY = '--calendar-card-weather-event-color';

/** The property `event_color` is rendered through, read back rather than repeated. */
const EVENT_COLOR_PROPERTY = ACCENT_TEXT_OPTIONS.find(([key]) => key === 'event_color')![1];

/**
 * The custom properties an event element must set so its own subtree reads the accent.
 *
 * Written on the event element rather than resolved per field, because the cascade is
 * already how every one of these colors reaches its text: the properties are read from an
 * ancestor, so setting them one level down overrides them for that event and nothing else.
 * `leaves.ts` has done exactly this for the title since v3.
 *
 * @param config - Configuration, already resolved for the view being rendered
 * @param accent - The event's own resolved accent color
 * @param isEmptyDay - Whether this is an empty-day placeholder rather than an event
 * @returns Properties to set on the event element, empty when nothing is governed
 */
export function accentTextProperties(
  config: Types.Config,
  accent: string,
  isEmptyDay = false,
): Record<string, string> {
  const properties: Record<string, string> = {};

  // An empty day belongs to no calendar, so there is no accent to take: `_entityId` is the
  // first configured calendar's, which would paint "No upcoming events" in whatever color
  // that one happens to use and say something false about the day.
  if (isEmptyDay || !accent) {
    return properties;
  }

  for (const [key, property] of ACCENT_TEXT_OPTIONS) {
    if (EntityColors.isAccentTextSentinel(config[key])) {
      properties[property] = accent;
    }
  }

  // The event weather badge, resolved from its own three states rather than from a row in
  // the table — see WEATHER_EVENT_PROPERTY for why it cannot be one. The falsy test is the
  // exact complement of the guard `generateCustomPropertiesObject` writes the option under,
  // so the two can never both fire on one card.
  const badge = config.weather?.event?.color;

  if (EntityColors.isAccentTextSentinel(badge) || (!badge && properties[EVENT_COLOR_PROPERTY])) {
    properties[WEATHER_EVENT_PROPERTY] = accent;
  }

  return properties;
}
