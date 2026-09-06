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
 * 🚨 The event weather badge is also excluded, and that one is a judgement call rather than
 * an obvious exclusion — see `docs/features/event-content.md`. Its color lives at
 * `weather.event.color`, nested, where a per-view default cannot reach it; including it
 * would make the editor's derived toggle read *off* on a default grid card, because one of
 * its governed fields could never be defaulted to the sentinel.
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

  return properties;
}
