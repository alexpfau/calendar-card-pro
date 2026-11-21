/**
 * Pick From Preview's part map: which page, and which heading on it, each part of the card in
 * the preview opens.
 *
 * The selectors are the card's own class names, grouped by the place they open, so they are a contract between the card's markup
 * and this table. `tests/editor-pick-map.test.ts` holds it in both directions: it renders the card
 * in List, Columns, Grid and Month, wide and narrow, and fails on a selector that matches nothing,
 * and on a drawn element that reaches no part but a catch-all. Month's day panel is a dialog of
 * its own, outside the card, so nothing in it is picked.
 *
 * A pick reads the part under the pointer innermost first: the first element on the event's path
 * that matches an entry here decides, and where one element matches several, the earlier entry
 * wins. So a specific part comes before the general one it sits in.
 *
 * DOM-free: `views/pick.ts` does the matching.
 */

import type { FieldId } from './field-index';
import type { PageId } from './pages';

/** Where a part opens. */
export type PickTarget =
  | {
      readonly page: PageId;
      /** A heading on the page, by its `data-heading` key. */
      readonly heading: string;
      /** The layout whose scope the heading lives in, which a pick switches to. */
      readonly scope?: 'column' | 'grid' | 'month';
      /**
       * The setting under the heading the part is, where one is, marked and opened in place of
       * the first one drawn there; the first again where it is not drawn.
       */
      readonly field?: FieldId;
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
  ['.card-header', { page: 'card_header', heading: 'heading.general' }],
  // The switcher opens Layouts in Switcher, under the Controls that hold its on and off.
  [
    '.view-switcher',
    {
      page: 'card_header',
      heading: 'heading_toolbar',
      field: 'card:toolbar.view_switcher_layouts',
    },
  ],
  // The filter's menu button, its menu and its row of chips open the Calendar Filter chip, under
  // which its form is chosen; a chip of one calendar opens that calendar, above.
  [
    '.legend-button, .legend-menu, .legend-chips',
    { page: 'card_header', heading: 'heading_toolbar', field: 'card:toolbar.legend' },
  ],
  ['.card-toolbar', { page: 'card_header', heading: 'heading_toolbar' }],
  ['.today-indicator-container', { page: 'day_header', heading: 'today_indicator' }],
  [
    '.week-number, .week-number-cell, .column-week-number, .month-week-number, .month-weekday-gutter',
    { page: 'day_header', heading: 'heading.weeks' },
  ],
  ['.event-weather', { page: 'weather', heading: 'weather.event' }],
  ['.weather', { page: 'weather', heading: 'weather.date' }],
  [
    '.date-column, .column-day-header, .grid-day-header, .month-weekdays, .month-date, .month-day-list-date',
    { page: 'day_header', heading: 'heading.date' },
  ],
  [
    '.separator, .separator-cell, .week-separator, .month-separator, .column-separator, .grid-separator',
    { page: 'size_spacing', heading: 'heading_between_days' },
  ],
  ['.empty-day-title', { page: 'which_events', heading: 'heading_nothing' }],
  [
    '.allday-badge, .allday-title-pill, .calendar-label, .label-icon',
    { page: 'events', heading: 'heading_icon_and_badge' },
  ],
  // A title in the Wide Month's days opens the size its days draw titles at; any other title, a
  // row's in the Day List among them, the size every row's title takes.
  [
    '.month-line-title',
    {
      page: 'events',
      heading: 'heading_title',
      scope: 'month',
      field: 'layout:month.cell_event_font_size',
    },
  ],
  [
    '.event-title, .grid-banner-title',
    { page: 'events', heading: 'heading_title', field: 'events:event_font_size' },
  ],
  ['.time-countdown, .progress-bar', { page: 'events', heading: 'progress' }],
  ['.now-indicator', { page: 'events', heading: 'heading_event_state' }],
  // A time in the Wide Month's days opens the size its days draw times at; any other time, a row's
  // in the Day List among them, the size every row's time takes.
  [
    '.month-line-time',
    { page: 'events', heading: 'time', scope: 'month', field: 'layout:month.cell_time_font_size' },
  ],
  ['.time', { page: 'events', heading: 'time', field: 'events:time_font_size' }],
  ['.location', { page: 'events', heading: 'location' }],
  ['.description', { page: 'events', heading: 'description' }],
  ['.event-accent-bar', { page: 'events', heading: 'heading_accent' }],
  ['.grid-banner', { page: 'which_events', heading: 'heading_allday_multiday' }],
  // Grid's own parts open their settings where each topic keeps them, in Grid.
  [
    '.grid-now-line, .grid-now-dot',
    {
      page: 'events',
      heading: 'heading_event_state',
      scope: 'grid',
      field: 'layout:time_grid.show_now_line',
    },
  ],
  [
    '.grid-event-overflow',
    {
      page: 'events',
      heading: 'heading_overlapping_events',
      scope: 'grid',
      field: 'layout:time_grid.max_simultaneous_events',
    },
  ],
  [
    '.grid-allday-band',
    {
      page: 'which_events',
      heading: 'heading_allday_multiday',
      scope: 'grid',
      field: 'layout:time_grid.allday_band_max_rows',
    },
  ],
  [
    '.grid-weekend',
    {
      page: 'day_header',
      heading: 'weekend_colors',
      scope: 'grid',
      field: 'layout:time_grid.weekend_background_color',
    },
  ],
  [
    '.grid-today',
    {
      page: 'day_header',
      heading: 'heading_today',
      scope: 'grid',
      field: 'layout:time_grid.today_background_color',
    },
  ],
  // A day's body between its events is as tall as Height Per Hour makes it.
  [
    '.grid-day-body',
    {
      page: 'size_spacing',
      heading: 'heading_card_size',
      scope: 'grid',
      field: 'layout:time_grid.hour_height',
    },
  ],
  ['.event', { page: 'events', heading: 'heading_details' }],
  ['.event-gap-row', { page: 'size_spacing', heading: 'heading_event_rows' }],
  ['.grid-axis', { page: 'size_spacing', heading: 'heading_hour_labels', scope: 'grid' }],
  ['.grid-rules', { page: 'size_spacing', heading: 'heading_across_the_grid', scope: 'grid' }],
  ['.grid-container', { page: 'which_events', heading: 'heading_hours', scope: 'grid' }],
  // A Narrow Month's day, and its dots, open what made it narrow, under Wide or Narrow Month; a
  // wide one's, and the rest of the weeks, open the card's size, which sets how many lines a day
  // holds before "+N more".
  [
    '.month-narrow-marks, .month-narrow .month-day',
    {
      page: 'size_spacing',
      heading: 'heading_narrow_cards',
      scope: 'month',
      field: 'layout:month.min_day_width',
    },
  ],
  // The Day List, its room and its "+N more" open Narrow Month Height, whose room the list fits
  // its rows to: its events and its day's name keep the parts above.
  [
    '.month-day-list-more, .month-day-list-rows, .month-day-list',
    {
      page: 'size_spacing',
      heading: 'heading_narrow_month',
      scope: 'month',
      field: 'layout:month.narrow_card_height',
    },
  ],
  [
    '.month-more, .month-day, .month-container',
    { page: 'size_spacing', heading: 'heading_card_size', scope: 'month' },
  ],
  ['.day-column', { page: 'size_spacing', heading: 'heading_narrow_cards', scope: 'column' }],
  ['.content-container', { page: 'size_spacing', heading: 'heading_card_size' }],
  ['.header-container, ha-card', { page: 'card_header', heading: 'heading.general' }],
];

/** The catch-alls: a part found only through one of these was not mapped on its own. */
export const PICK_CATCH_ALLS: ReadonlySet<string> = new Set([
  '.content-container',
  '.header-container, ha-card',
]);
