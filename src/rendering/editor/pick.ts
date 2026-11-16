/**
 * Pick From Preview's part map: which page, and which heading on it, each part of the card in
 * the preview opens.
 *
 * The selectors are the card's own class names, grouped by the place they open, so they are a contract between the card's markup
 * and this table. `tests/editor-pick-map.test.ts` holds it in both directions: it renders the card
 * in List, Columns and Grid and fails on a selector that matches nothing, and on a drawn element
 * that reaches no part but a catch-all.
 *
 * A pick reads the part under the pointer innermost first: the first element on the event's path
 * that matches an entry here decides, and where one element matches several, the earlier entry
 * wins. So a specific part comes before the general one it sits in.
 *
 * DOM-free: `views/pick.ts` does the matching.
 */

import type { PageId } from './pages';

/** Where a part opens. */
export type PickTarget =
  | {
      readonly page: PageId;
      /** A heading on the page, by its `data-heading` key; absent for the page's top run. */
      readonly heading?: string;
      /** The layout whose scope the heading lives in, which a pick switches to. */
      readonly scope?: 'column' | 'grid';
    }
  /** The page of the calendar a legend chip names, by its `data-calendar`. */
  | { readonly calendar: true };

/**
 * The parts, each a selector list naming every class that opens one place, in the order an
 * element matching several is decided. The last two are catch-alls: a click between parts opens
 * the card's size, and anywhere else on the card Card & Header.
 */
export const PICK_PARTS: ReadonlyArray<readonly [selectors: string, target: PickTarget]> = [
  ['.legend-chip', { calendar: true }],
  ['.custom-button', { page: 'card_header', heading: 'toolbar.buttons.heading' }],
  ['.card-header', { page: 'card_header' }],
  ['.card-toolbar', { page: 'card_header', heading: 'heading_toolbar' }],
  ['.today-indicator-container', { page: 'day_header', heading: 'today_indicator' }],
  [
    '.week-number, .week-number-cell, .column-week-number',
    { page: 'day_header', heading: 'heading.weeks' },
  ],
  ['.event-weather', { page: 'weather', heading: 'weather.event' }],
  ['.weather', { page: 'weather', heading: 'weather.date' }],
  ['.date-column, .column-day-header, .grid-day-header', { page: 'day_header' }],
  [
    '.separator, .separator-cell, .column-separator, .grid-separator',
    { page: 'size_spacing', heading: 'heading_between_days' },
  ],
  ['.empty-day-title', { page: 'which_events', heading: 'heading_nothing' }],
  [
    '.allday-badge, .allday-title-pill, .calendar-label, .label-icon',
    { page: 'events', heading: 'heading_icon_and_badge' },
  ],
  ['.event-title, .grid-banner-title', { page: 'events', heading: 'heading_title' }],
  ['.time-countdown, .progress-bar', { page: 'events', heading: 'progress' }],
  ['.now-indicator', { page: 'events', heading: 'heading_event_state' }],
  ['.time', { page: 'events', heading: 'time' }],
  ['.location', { page: 'events', heading: 'location' }],
  ['.description', { page: 'events', heading: 'description' }],
  ['.event-accent-bar', { page: 'events', heading: 'heading_accent' }],
  ['.grid-banner', { page: 'which_events', heading: 'heading_multiday' }],
  [
    '.grid-event-overflow, .grid-now-line, .grid-now-dot, .grid-allday-band, .grid-weekend, .grid-today, .grid-day-body',
    { page: 'grid', heading: 'heading_on_the_grid', scope: 'grid' },
  ],
  ['.event', { page: 'events', heading: 'heading_details' }],
  ['.event-gap-row', { page: 'size_spacing', heading: 'heading_card_size' }],
  ['.grid-axis', { page: 'grid', heading: 'heading_hour_labels', scope: 'grid' }],
  ['.grid-rules', { page: 'size_spacing', heading: 'heading_across_the_grid', scope: 'grid' }],
  ['.grid-container', { page: 'grid', heading: 'time_grid.axis', scope: 'grid' }],
  ['.day-column', { page: 'size_spacing', heading: 'column.density', scope: 'column' }],
  ['.content-container', { page: 'size_spacing', heading: 'heading_card_size' }],
  ['.header-container, ha-card', { page: 'card_header' }],
];

/** The catch-alls: a part found only through one of these was not mapped on its own. */
export const PICK_CATCH_ALLS: ReadonlySet<string> = new Set([
  '.content-container',
  '.header-container, ha-card',
]);
