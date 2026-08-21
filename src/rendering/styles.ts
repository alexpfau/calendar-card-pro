/** Styles module for Calendar Card Pro. */

import { css } from 'lit';

import * as Config from '../config/config';
import type * as Types from '../config/types';
import * as ViewConfig from '../config/view';

/**
 * Generate CSS custom properties from card configuration.
 * @param config Card configuration.
 * @returns CSS custom property names mapped to values.
 */
export function generateCustomPropertiesObject(config: Types.Config): Record<string, string> {
  const props: Record<string, string> = {
    '--calendar-card-background-color': config.background_color,
    '--calendar-card-font-size-weekday': config.weekday_font_size,
    '--calendar-card-font-size-day': config.day_font_size,
    '--calendar-card-font-size-month': config.month_font_size,
    '--calendar-card-font-size-event': config.event_font_size,
    '--calendar-card-font-size-time': config.time_font_size,
    '--calendar-card-font-size-location': config.location_font_size,
    '--calendar-card-font-size-description': config.description_font_size,
    '--calendar-card-color-weekday': config.weekday_color,
    '--calendar-card-color-day': config.day_color,
    '--calendar-card-color-month': config.month_color,
    '--calendar-card-color-event': config.event_color,
    '--calendar-card-color-time': config.time_color,
    '--calendar-card-color-location': config.location_color,
    '--calendar-card-color-description': config.description_color,
    '--calendar-card-line-color-vertical': config.accent_color,
    '--calendar-card-line-width-vertical': config.vertical_line_width,
    '--calendar-card-day-spacing': config.day_spacing,
    '--calendar-card-event-spacing': config.event_spacing,
    '--calendar-card-spacing-additional': config.additional_card_spacing,
    '--calendar-card-height': config.height || 'auto',
    '--calendar-card-max-height': config.max_height,
    '--calendar-card-progress-bar-color': config.progress_bar_color,
    '--calendar-card-progress-bar-height': config.progress_bar_height,
    '--calendar-card-icon-size-time': config.time_icon_size || '14px',
    '--calendar-card-icon-size-location': config.location_icon_size || '14px',
    '--calendar-card-icon-size-description': config.description_icon_size || '14px',
    '--calendar-card-description-max-lines':
      config.description_max_lines > 0 ? String(config.description_max_lines) : 'none',
    '--calendar-card-title-max-lines':
      config.title_max_lines > 0 ? String(config.title_max_lines) : 'none',
    '--calendar-card-time-max-lines':
      config.time_max_lines > 0 ? String(config.time_max_lines) : 'none',
    '--calendar-card-location-max-lines':
      config.location_max_lines > 0 ? String(config.location_max_lines) : 'none',
    // Keep the title inline until clamped, so a glyph label can share its first
    // line and the hanging indent on .summary applies. The row-height difference
    // this once showed against the blockified form was the .summary strut, not a
    // property of inline layout; .summary now carries a matching strut.
    '--calendar-card-title-display': config.title_max_lines > 0 ? '-webkit-box' : 'inline',
    // In countdown text placement, an inline time can share a line with the countdown.
    // Clamping switches it to -webkit-box and accepts that trade-off explicitly.
    '--calendar-card-time-display': config.time_max_lines > 0 ? '-webkit-box' : 'inline',
    // The date column is sized from the day number it holds. `day_font_size` is a CSS
    // length, so scale it in the author's own unit: parsing it to a number would size an
    // `em` font's column in `px` and reduce `calc(...)` to `NaN`.
    '--calendar-card-date-column-width': ViewConfig.scaleLength(config.day_font_size, 1.75),
    '--calendar-card-date-column-vertical-alignment': config.date_vertical_alignment,
    '--calendar-card-event-icon-vertical-alignment':
      config.event_icon_vertical_alignment === 'top'
        ? 'flex-start'
        : config.event_icon_vertical_alignment === 'bottom'
          ? 'flex-end'
          : 'center',
    '--calendar-card-event-border-radius': 'calc(var(--ha-card-border-radius, 10px) / 2)',
    '--ha-ripple-hover-opacity': '0.04',
    '--ha-ripple-hover-color': config.accent_color,
    '--ha-ripple-pressed-opacity': '0.12',
    '--ha-ripple-pressed-color': config.accent_color,

    '--calendar-card-today-indicator-color': config.today_indicator_color,
    '--calendar-card-today-indicator-size': config.today_indicator_size,

    '--calendar-card-week-number-font-size': config.week_number_font_size,
    '--calendar-card-week-number-color': config.week_number_color,
    '--calendar-card-week-number-bg-color': config.week_number_background_color,

    '--calendar-card-empty-day-color':
      config.empty_day_color === Config.DEFAULT_CONFIG.empty_day_color
        ? 'color-mix(in srgb, var(--primary-text-color) 60%, transparent)'
        : config.empty_day_color,

    // Weather host properties mirror the nested weather presentation options.
    // Date badges and event badges keep separate fallbacks because they sit beside
    // different text colors; the event icon size also drives the row hanging indent.
    '--calendar-card-weather-date-icon-size': config.weather?.date?.icon_size || '14px',
    '--calendar-card-weather-date-font-size': config.weather?.date?.font_size || '12px',
    '--calendar-card-weather-date-color':
      config.weather?.date?.color || 'var(--primary-text-color)',
    '--calendar-card-weather-event-icon-size': config.weather?.event?.icon_size || '14px',
    '--calendar-card-weather-event-font-size': config.weather?.event?.font_size || '12px',
    // Read with a fallback because a `weather:` block can arrive without `event`, in
    // which case `max_lines` is absent rather than 0. That is a defensive read rather
    // than a live one: the single production caller is `getCustomStyles`, which passes
    // the post-`setConfig` effective config, and `mergeConfig` fills the nested weather
    // defaults in. Nothing in the editor reaches this function. Tests are what exercise
    // the fallbacks today — see the note on WEATHER_FALLBACKS in
    // `tests/custom-property-mapping.test.ts`, which measured that.
    '--calendar-card-weather-event-max-lines':
      (config.weather?.event?.max_lines ?? 0) > 0
        ? String(config.weather?.event?.max_lines)
        : 'none',
    '--calendar-card-weather-event-condition-display':
      (config.weather?.event?.max_lines ?? 0) > 0 ? '-webkit-box' : 'inline',
  };

  // Emit optional properties only when the user set them, so placement-specific
  // stylesheet fallbacks remain distinguishable from explicit choices.
  if (config.progress_bar_width) {
    props['--calendar-card-progress-bar-width'] = config.progress_bar_width;
  }

  if (config.title_font_size) {
    props['--calendar-card-font-size-title'] = config.title_font_size;
  }

  if (config.title_color) {
    props['--calendar-card-color-title'] = config.title_color;
  }

  // Weather event color has no default. If absent, both placements use their
  // stylesheet fallback, matching the existing per-event badge color.
  if (config.weather?.event?.color) {
    props['--calendar-card-weather-event-color'] = config.weather.event.color;
  }

  return props;
}

/** Base styles for the card component. */
export const cardStyles = css`
  /* ===== CORE CONTAINER STYLES ===== */

  :host {
    display: block;
    height: 100%;
  }

  ha-card {
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
    overflow: hidden;

    box-sizing: border-box;
    padding: calc(var(--calendar-card-spacing-additional) + 16px) 16px
      calc(var(--calendar-card-spacing-additional) + 16px) 8px;

    background: var(--calendar-card-background-color, var(--card-background-color));
    cursor: pointer;
  }

  ha-card:focus {
    outline: none;
  }

  ha-card:focus-visible {
    outline: 2px solid var(--calendar-card-line-color-vertical);
  }

  .header-container,
  .content-container {
    width: 100%;
  }

  .content-container {
    max-height: var(--calendar-card-max-height, none);
    height: var(--calendar-card-height, auto);
    overflow-x: hidden;
    overflow-y: auto;
    padding-bottom: 1px;
    hyphens: auto;

    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }

  .content-container:hover {
    scrollbar-width: thin; /* Firefox */
    scrollbar-color: var(--secondary-text-color) transparent; /* Firefox */
    -ms-overflow-style: auto; /* IE/Edge */
  }

  .card-header-placeholder {
    height: 0;
  }

  /* ===== HEADER STYLES ===== */

  .card-header {
    float: left;

    margin: 0 0 16px 8px;
    padding: 0;

    /* Literal fallbacks are load-bearing: undefined Home Assistant font
     * variables invalidate the whole var() without them. */
    color: var(--calendar-card-color-title, var(--primary-text-color));
    font-size: var(--calendar-card-font-size-title, var(--ha-card-header-font-size, 24px));
    font-weight: var(--ha-font-weight-normal, 400);
    letter-spacing: -0.012em;
    line-height: 1.33;
  }

  /* ===== WEEK NUMBER & SEPARATOR STYLES ===== */

  .week-row-table {
    height: calc(var(--calendar-card-week-number-font-size) * 1.5);
    width: 100%;
    table-layout: fixed;
    padding-left: 8px;
    border-spacing: 0;
    border: none !important;
  }

  .week-number-cell,
  .separator-cell {
    height: 100%;
  }

  .week-number-cell {
    width: var(--calendar-card-date-column-width);
    position: relative;
    text-align: center;
    vertical-align: middle;
    padding-right: 12px; /* Match date column padding */
  }

  .week-number {
    width: calc(var(--calendar-card-week-number-font-size) * 2.5);
    height: calc(var(--calendar-card-week-number-font-size) * 1.5);
    display: inline-flex; /* Centering */
    align-items: center;
    justify-content: center;
    font-size: var(--calendar-card-week-number-font-size);
    font-weight: 500;
    color: var(--calendar-card-week-number-color);
    background-color: var(--calendar-card-week-number-bg-color);
    border-radius: 999px;
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* iOS Safari needs a small optical vertical-alignment adjustment. */
  @supports (-webkit-touch-callout: none) {
    .week-number {
      padding-top: calc(var(--calendar-card-week-number-font-size) * 0.1);
    }
  }

  .separator-cell {
    vertical-align: middle;
  }

  .separator-line {
    width: 100%;
    height: var(--separator-border-width, 0);
    background-color: var(--separator-border-color, transparent);
    display: var(--separator-display, none);
  }

  .separator {
    width: 100%;
    margin-left: 8px;
  }

  .week-separator {
    width: 100%;
    margin-left: 8px;
    border-top-style: solid; /* Ensure line is visible */
  }

  .month-separator {
    width: 100%;
    margin-left: 8px;
    border-top-style: solid; /* Ensure line is visible */
  }

  /* ===== DAY TABLE STYLES ===== */

  table {
    width: 100%;
    table-layout: fixed;
    border-spacing: 0;
    border-collapse: separate;

    margin-bottom: var(--calendar-card-day-spacing);
  }

  .day-table {
    border: none !important;
  }

  table:last-of-type {
    margin-bottom: 0;
    border-bottom: 0;
  }

  /* ===== DATE COLUMN STYLES =====
   *
   * date_vertical_alignment reaches this cell as vertical-align, which works because the
   * list view is a table. Converting this container to flex or grid cannot carry the option
   * over as align-self: that overrides align-items: stretch and shrinks the item to content
   * height, so the cell collapses from the full day to roughly one line of date text, and a
   * height: 100% today indicator collapses with it. The two-part mapping is to keep the cell
   * stretched and move its content with justify-content on an inner flex column, which is
   * what column view's header does. today_indicator defaults to false, so the damage would
   * reach opted-in users only -- invisible to a screenshot pass. */

  .date-column {
    width: var(--calendar-card-date-column-width);
    min-width: var(--calendar-card-date-column-width);
    max-width: var(--calendar-card-date-column-width);
    vertical-align: var(--calendar-card-date-column-vertical-alignment);
    text-align: center;
    position: relative;

    padding-left: 8px;
    padding-right: 12px;
  }

  /* List-view today indicators are positioned inside the full date cell.
   * Inline indicators stay in normal flow and must not receive this box. */
  .today-indicator-container:not(.inline) {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  .weekday {
    font-size: var(--calendar-card-font-size-weekday);
    line-height: var(--calendar-card-font-size-weekday);
    color: var(--calendar-card-color-weekday);
  }

  .day {
    font-size: var(--calendar-card-font-size-day);
    line-height: var(--calendar-card-font-size-day);
    font-weight: 500;
    color: var(--calendar-card-color-day);
  }

  .month {
    font-size: var(--calendar-card-font-size-month);
    line-height: var(--calendar-card-font-size-month);
    text-transform: uppercase;
    color: var(--calendar-card-color-month);
  }

  /* Shared today-indicator values. Positioning stays out of this rule so the
   * inline column-view indicator is not forced absolute by equal specificity. */
  .today-indicator-container {
    color: var(--calendar-card-today-indicator-color);
    pointer-events: none;
    z-index: 1;
  }

  /* Column-view inline indicator; flex centers icon, image, or emoji boxes
   * consistently beside the weekday. */
  .today-indicator-container.inline {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  ha-icon.today-indicator {
    --mdc-icon-size: var(--calendar-card-today-indicator-size);
  }

  img.today-indicator.image {
    width: var(--calendar-card-today-indicator-size);
    height: auto;
    max-height: var(--calendar-card-today-indicator-size);
    object-fit: contain;
  }

  span.today-indicator.emoji {
    font-size: var(--calendar-card-today-indicator-size);
    line-height: 1;
  }

  ha-icon.today-indicator.pulse {
    animation: pulse-animation 2s infinite ease-in-out;
  }

  ha-icon.today-indicator.glow {
    filter: drop-shadow(
      0 0 calc(var(--calendar-card-today-indicator-size) * 0.5)
        var(--calendar-card-today-indicator-color)
    );
  }

  @keyframes pulse-animation {
    0% {
      transform: scale(0.95);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.1);
      opacity: 1;
    }
    100% {
      transform: scale(0.95);
      opacity: 0.7;
    }
  }

  .date-column .weather,
  .column-date-content .weather {
    font-size: var(--calendar-card-weather-date-font-size, 12px);
    color: var(--calendar-card-weather-date-color, var(--primary-text-color));
  }

  .date-column .weather {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .weather ha-icon {
    margin-right: 1px;
  }

  .date-column .weather ha-icon,
  .column-date-content .weather ha-icon {
    --mdc-icon-size: var(--calendar-card-weather-date-icon-size, 14px);
  }

  .weather-temp-high,
  .weather-temp-low {
    line-height: 1;
    vertical-align: middle;
  }

  .weather-temp-high {
    font-weight: 500;
  }

  .weather-temp-low {
    opacity: 0.8;
  }

  .weather .weather-uv-index {
    line-height: 1;
    vertical-align: middle;
    font-weight: 500;
    margin-left: 2px;
  }

  .event-weather .weather-uv-index {
    font-weight: 500;
    margin-left: 2px;
  }

  /* ===== EVENT STYLES ===== */

  .event {
    padding: var(--calendar-card-event-spacing) 0 var(--calendar-card-event-spacing) 12px;
    border-radius: 0;
  }

  .event-first.event-last {
    border-start-start-radius: 0;
    border-start-end-radius: var(--calendar-card-event-border-radius);
    border-end-end-radius: var(--calendar-card-event-border-radius);
    border-end-start-radius: 0;
  }

  .event-first {
    border-start-end-radius: var(--calendar-card-event-border-radius);
    border-start-start-radius: 0;
  }

  .event-last {
    border-end-end-radius: var(--calendar-card-event-border-radius);
    border-end-start-radius: 0;
  }

  .past-event .event-content {
    opacity: 0.6;
  }

  .event-content {
    display: flex;
    flex-direction: column;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  /* The 12px trailing gutter belongs on .summary. Putting it on the inline
   * title makes the hidden overflow box wider than the painted text and can
   * trigger false ellipses. Real title limits come from the title clamp;
   * overflow hidden remains only as a backstop for unbreakable content. */
  .summary {
    flex: 1;
    margin-right: 12px;
    overflow: hidden;
    overflow-wrap: break-word;
    /* The title is inline, so each line box is max(this block's strut, the
     * inline box). Unstyled, the strut came from Home Assistant -- 22.4px --
     * against the title's own 14px x 1.2 = 16.8px, so it won every line and
     * wrapped titles were pinned to Home Assistant's leading whatever
     * event_font_size said. It belongs here and not on .event-title: an inline
     * element cannot shrink its container's strut, and blockifying the title is
     * ruled out by the trap above.
     *
     * That strut was also all that separated the title from the time below it
     * and the top of the event, so tightening it alone pulled the block
     * together (v3.6.0: 7.0px -> 4.0px above, 5.4px -> 2.8px below).
     * padding-block gives that back, half each side; 0.2em is that half at the
     * v3.x default and, unlike the strut, it scales. So a one-line title
     * occupies what it did in 3.x and only a wrapped one gets shorter. Not the
     * shorthand -- the :has() rules below set padding-inline-start. */
    font-size: var(--calendar-card-font-size-event);
    line-height: 1.2;
    padding-block: 0.2em;
  }

  .event-title {
    font-size: var(--calendar-card-font-size-event);
    font-weight: 500;
    line-height: 1.2;
    color: var(--calendar-card-color-event);
    padding-bottom: 2px;
    /* The hanging indent below is set on .summary, and text-indent inherits.
       That is harmless while this span is inline, but the moment
       title_max_lines blockifies it the inherited value would indent the
       title's own first line as well. Neutralise it here once. */
    text-indent: 0;
    /* Per-field line clamping. The clamp lands on this element because it is
       what directly contains the text, and -webkit-line-clamp only takes
       effect on a display: -webkit-box element. Unlimited is expressed as the
       string 'none', emitted by generateCustomPropertiesObject when the option
       is 0 -- see the note on --calendar-card-title-display for why the
       display value is a variable rather than a literal here. */
    display: var(--calendar-card-title-display);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-title-max-lines);
    overflow: hidden;
  }

  /* Hanging indent for glyph labels. Wrapped title lines align with the text
   * after the label without changing .summary into flex or grid, which would
   * blockify the title. Prose labels are excluded because their width can
   * consume most of a narrow column. Offsets match each glyph label box plus
   * its 4px gap. */
  .summary:has(> .label-icon),
  .summary:has(> .label-image) {
    text-indent: calc(-1 * (var(--calendar-card-font-size-event) + 4px));
    padding-inline-start: calc(var(--calendar-card-font-size-event) + 4px);
  }

  .summary:has(> .label-emoji) {
    text-indent: calc(-1 * (var(--calendar-card-font-size-event) * 1.25 + 4px));
    padding-inline-start: calc(var(--calendar-card-font-size-event) * 1.25 + 4px);
  }

  .calendar-label {
    display: inline;
    margin-right: 4px;
  }

  .label-icon {
    --mdc-icon-size: var(--calendar-card-font-size-event);
    vertical-align: middle;
    margin-right: 4px;
  }

  .label-image {
    height: var(--calendar-card-font-size-event);
    width: auto;
    vertical-align: middle;
    margin-right: 4px;
  }

  .event-weather {
    display: flex;
    align-items: center;
    font-weight: 500;
    margin-left: 8px;
    margin-right: 12px;
  }

  .event-weather ha-icon {
    margin-right: 2px;
    --mdc-icon-size: var(--calendar-card-weather-event-icon-size, 14px);
    color: var(--calendar-card-weather-event-color, var(--secondary-text-color));
  }

  /* Summary-row weather placement. These unscoped rules are the list-view
   * counterpart to the more specific time-location placement below. Both
   * placements use the same secondary-text fallback so event weather color
   * stays consistent unless the user overrides it.
   *
   * font-size sits on the wrapper rather than on its child spans. The chips
   * render at the same size either way, since they inherit it, but a wrapper
   * left at the inherited 14px event font builds its line box from 14px and
   * the badge measures 4px taller than its contents. Nothing reflows - the
   * row is unchanged and no text moves relative to its neighbors - but the
   * glyphs sit 1px lower than they did in v3.6.0.
   *
   * This is safe to leave unscoped even though the row placement below also
   * matches it: that placement declares the same font-size on the container
   * at .time-location .event-weather, so the wrapper already computed this
   * value by inheritance and the explicit declaration changes nothing there.
   * Column view is unaffected for a second, independent reason - it always
   * passes weatherPlacement: 'row', which leaves the title forecasts
   * undefined, so it never emits this badge at all. */
  .event-weather .event-weather-text {
    color: var(--calendar-card-weather-event-color, var(--secondary-text-color));
    font-size: var(--calendar-card-weather-event-font-size, 12px);
  }

  /* ===== TIME, LOCATION & DESCRIPTION STYLES ===== */

  .time-location {
    display: flex;
    flex-direction: column;
    margin-top: 0;
  }

  .time,
  .location,
  .description {
    display: flex;
    align-items: var(--calendar-card-event-icon-vertical-alignment);
    line-height: 1.2;
    margin-top: 2px;
    margin-right: 12px;
  }

  /* break-word prevents unclamped time, location, and description flex items
   * from shrinking below their longest word and then clipping mid-glyph under
   * overflow hidden. It does not affect intrinsic sizing, so rows that already
   * fit do not widen. */
  .time span,
  .location span,
  .description span {
    display: inline-block;
    vertical-align: middle;
    overflow-wrap: break-word;
  }

  /* The time row can contain time text plus a countdown or progress bar. It
   * wraps so the trailing item moves to a second line instead of overflowing.
   * align-items centers those row siblings; icon alignment is handled inside
   * .time-actual. */
  .time {
    font-size: var(--calendar-card-font-size-time);
    color: var(--calendar-card-color-time);
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    flex-wrap: wrap;
    row-gap: 2px;
    column-gap: 8px;
  }

  /* The icon alignment lives on .time-actual, whose children are the icon and
   * text. Applying the option on .time would align the time wrapper against
   * countdown or progress siblings instead of aligning the icon to its text. */
  .time-actual {
    display: flex;
    align-items: var(--calendar-card-event-icon-vertical-alignment);
  }

  /* Countdown text placement. The time and countdown share one inline
   * formatting context inside this flex item, so either string can wrap at
   * normal text boundaries while the icon still aligns against the whole text
   * block. min-width: 0 lets long words shrink and break instead of pushing
   * the row wider. */
  .time .time-actual .time-text {
    min-width: 0;
    flex: 1 1 auto;
  }

  /* Put the time value back into inline flow after the broad row span rule
   * blockifies spans. The display custom property still allows a configured
   * time_max_lines clamp; baseline alignment keeps the countdown reading as
   * part of the same phrase. */
  .time .time-actual .time-text > span {
    display: var(--calendar-card-time-display);
    vertical-align: baseline;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-time-max-lines);
    overflow: hidden;
  }

  /* The countdown itself is never the clamp target; time_max_lines limits the
   * time text only. Reset the trailing-placement margins and clamp-related
   * properties so this inline phrase can wrap normally. */
  .time .time-actual .time-text > .time-countdown {
    display: inline;
    -webkit-line-clamp: none;
    overflow: visible;
    margin-inline-start: 4px;
    margin-inline-end: 0;
    white-space: normal;
  }

  /* Text-placement countdown separator. The generated middot avoids adding
   * punctuation to translated strings. WORD JOINER keeps the dot attached to
   * the preceding time text for CJK as well as Latin text, and ZERO WIDTH
   * SPACE gives the line a safe break after the dot. The trailing placement
   * keeps a plain middot because its separator starts a separate flex item. */
  .time .time-actual .time-text > .time-countdown::before {
    content: '\\2060·\\200B';
    margin-inline-end: 4px;
  }

  /* Auto start margin right-aligns a countdown that wraps onto its own flex
   * line; on the first line it behaves like the existing space-between gap. */
  .time-countdown {
    text-align: right;
    color: var(--calendar-card-color-time);
    font-size: var(--calendar-card-font-size-time);
    margin-inline-start: auto;
    margin-inline-end: 12px;
    white-space: nowrap;
  }

  .location {
    font-size: var(--calendar-card-font-size-location);
    color: var(--calendar-card-color-location);
  }

  .description {
    font-size: var(--calendar-card-font-size-description);
    color: var(--calendar-card-color-description);
  }

  /* The all-day badge, drawn instead of the plain "all day" words when allday_badge is on.
   *
   * It is a flex child of .time-actual, never of .time-text. Inside .time-text it would
   * match the time_max_lines clamp selector above and be truncated like body text.
   *
   * font-size is em rather than a config key of its own, so the badge tracks time_font_size
   * in whatever unit the user wrote it -- em, rem, calc() and theme vars all survive, where
   * computing a percentage of it in JS would have thrown the unit away. letter-spacing is
   * em for the same reason.
   *
   * No white-space or flex-shrink override: the defaults let a long label (French reads
   * "toute la journee", eight times the length of the Chinese one) wrap inside the pill
   * rather than overflow a narrow column track.
   *
   * The accent arrives as a custom property set inline on this element, because the
   * calendar's color reaches the event row as an inline border value that no descendant can
   * read. Blending it here rather than in the markup keeps the mix reachable from a theme.
   *
   * 70% rather than a lighter wash because event_background_opacity may already have tinted
   * the row with this same accent: a 20% badge on top of an accent-tinted row is close to
   * invisible, and the two options are independent, so the badge cannot assume an untinted
   * background. Both are opt-in and the maintainer's call is that pairing a high background
   * opacity with the badge is the user's to tune. */
  .allday-badge {
    font-size: 0.85em;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    line-height: 1.5;
    padding-inline: 0.5em;
    margin-inline-end: 4px;
    border-radius: 999px;
    background-color: color-mix(in srgb, var(--calendar-card-event-accent) 70%, transparent);
  }

  /* Own-row event weather placement. The descendant selector keeps these
   * rules away from the list-view title-row badge. Resets remove the title
   * badge margins and weight; the wrapper creates a hanging indent so wrapped
   * lines start under the temperature, not under the icon.
   *
   * font-size belongs on the row, not only on the leaf chips, because
   * line-height is relative: leaving the row at the inherited event font size
   * builds a strut from 14px while the chips render at 12px, so the text's
   * baseline sits ~2px below the icon under flex-start and the row reads as
   * misaligned next to .time and .description, which both size their own row. */
  .time-location .event-weather {
    display: flex;
    flex-wrap: nowrap;
    row-gap: 2px;
    align-items: var(--calendar-card-event-icon-vertical-alignment);
    font-size: var(--calendar-card-weather-event-font-size, 12px);
    line-height: 1.2;
    font-weight: normal;
    margin-top: 2px;
    margin-inline-start: 0;
    margin-inline-end: 12px;
    padding-inline-start: calc(var(--calendar-card-weather-event-icon-size, 14px) + 4px);
  }

  .time-location .event-weather ha-icon {
    margin-inline-end: 4px;
    margin-inline-start: calc(-1 * (var(--calendar-card-weather-event-icon-size, 14px) + 4px));
    color: var(--calendar-card-weather-event-color, var(--secondary-text-color));
  }

  .time-location .event-weather .event-weather-text {
    min-width: 0;
    flex: 1 1 auto;
    color: var(--calendar-card-weather-event-color, var(--secondary-text-color));
    overflow-wrap: break-word;
  }

  /* Weather condition text wraps by default and clamps only when
   * weather.event.max_lines is set. Hyphenation is disabled for generated
   * condition words because normal wrapping is clearer than automatic splits.
   * overflow-wrap lives on the wrapper so all weather chips share emergency
   * break behavior; setting it only here leaves combined chip runs able to
   * overflow. overflow-wrap: normal was tried and does not prevent the
   * separator issue. */
  .time-location .event-weather .weather-condition {
    display: var(--calendar-card-weather-event-condition-display);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-weather-event-max-lines);
    overflow: hidden;
    hyphens: manual;
  }

  /* Weather chip separators. The row is adjacent inline text, so generated
   * content supplies both spacing and break points. WORD JOINER prevents a
   * legal break before the middot; ZERO WIDTH SPACE creates the intended
   * break after it. Emergency breaks can still split a very narrow chip, but
   * that is preferable to placing the dot at the start of the following line.
   * Keep the margins on the pseudo-element: chip margins would indent only
   * continuation lines, and real spaces would create the wrong break before
   * the dot. Scoped to the row placement so the list-view badge remains
   * unchanged. */
  .time-location .event-weather .event-weather-text > span + span::before {
    content: '\\2060·\\200B';
    margin-inline-start: 4px;
    margin-inline-end: 4px;
  }

  /* Undo title-row badge styling that is declared directly on the UV chip:
   * its 2px margin would double one separator gap, and its 500 weight would
   * survive the container reset. */
  .time-location .event-weather .weather-uv-index {
    margin-inline-start: 0;
    font-weight: normal;
  }

  .description span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-description-max-lines);
    overflow: hidden;
  }

  /* Per-field line clamping. Each clamp lands on the element that directly
     contains the text, because -webkit-line-clamp only takes effect on a
     display: -webkit-box element. Unlimited is expressed as the string 'none',
     emitted by generateCustomPropertiesObject when the option is 0.
     The .event-title clamp is declared with the rest of its styling above,
     because that one has to co-exist with the hanging-indent reset. */

  /* Target the text span inside .time-actual only -- the .time row also holds a
     countdown and/or a progress bar as siblings, and clamping the .time or the
     .time-actual wrapper itself would clamp those away too.

     The child combinator plus :not(.time-text) makes this the *trailing* placement's rule
     and nothing else. In the countdown's text placement the only direct-child span is the
     wrapper, which is excluded, and the pieces inside it are matched by their own rule up
     beside .time-actual. The two selectors are disjoint by construction rather than by
     specificity, so neither can start winning over the other because a rule moved. */
  .time .time-actual > span:not(.time-text) {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-time-max-lines);
    overflow: hidden;
  }

  .location span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-location-max-lines);
    overflow: hidden;
  }

  /* ===== PROGRESS BAR STYLES ===== */

  /* Width falls back here rather than defaulting in DEFAULT_CONFIG, because the two
     placements want different answers and a shipped default can only give one. 60px is
     what the inline bar has always been. See leaves.ts progressPlacement.

     margin-inline-start: auto for the same reason as .time-countdown -- it is the
     other element that can end up alone on the time row's second line. */
  .progress-bar {
    width: var(--calendar-card-progress-bar-width, 60px);
    height: var(--calendar-card-progress-bar-height);
    background-color: color-mix(in srgb, var(--calendar-card-progress-bar-color) 20%, transparent);
    border-radius: 999px;
    overflow: hidden;
    margin-inline-start: auto;
    margin-inline-end: 12px;
  }

  /* The own-row placement. Must stay directly after .progress-bar: both selectors are one
     class, so source order is what lets the modifier win. Unscoped on purpose -- this is
     a placement, not a view. Flush left aligns it with the title above rather than the
     time below. THE ROW WIDTH is the 80%, a percentage because the row is as wide as the
     column; ruled by the maintainer after seeing 75% live. */
  .progress-bar-row {
    width: var(--calendar-card-progress-bar-width, 80%);
    margin-inline-start: 0;
    margin-top: 2px;
  }

  .progress-bar-filled {
    height: 100%;
    background-color: var(--calendar-card-progress-bar-color);
    border-radius: 999px 0 0 999px;
  }

  /* ===== ICON STYLES ===== */

  ha-icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    position: relative;
    vertical-align: top;
    top: 0;
    margin-right: 4px;
  }

  .time ha-icon {
    --mdc-icon-size: var(--calendar-card-icon-size-time, 14px);
  }

  .location ha-icon {
    --mdc-icon-size: var(--calendar-card-icon-size-location, 14px);
  }

  .description ha-icon {
    --mdc-icon-size: var(--calendar-card-icon-size-description, 14px);
  }

  /* ===== STATUS MESSAGES ===== */

  .loading,
  .error {
    text-align: center;
    padding: 16px;
  }

  .error {
    color: var(--error-color);
  }

  /* ===== CORNER LOADING INDICATOR ===== */
  .loading-indicator {
    position: absolute;
    top: calc(var(--ha-card-border-radius, 12px) * 0.5 + 2px);
    right: calc(var(--ha-card-border-radius, 12px) * 0.5 + 2px);
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
    pointer-events: none;
  }

  .loading-indicator .spinner {
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border: 2px solid color-mix(in srgb, var(--primary-text-color) 25%, transparent);
    border-top-color: var(--primary-text-color);
    border-radius: 50%;
    animation: ccp-spin 0.8s linear infinite;
  }

  @keyframes ccp-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Column view supplies the full 16px horizontal inset itself, matching the
   * list view's combined card and date-column inset while keeping the title
   * aligned with the first column. */
  .calendar-card-pro.column-view {
    padding-inline: 16px;
  }

  /* The title's 8px margin exists to add to the list view's 8px card padding.
     Column view already supplies the full 16px, so the margin would push the
     title 8px past the first column's edge. */
  .calendar-card-pro.column-view .card-header {
    margin-inline-start: 0;
  }

  /* ===== COLUMN VIEW STYLES ===== */

  /* Column-view refinements stay last so equal-specificity shared-class rules
   * override the list-view definitions they refine. */

  .column-grid {
    display: grid;
    /* grid-template-columns and column-gap are set inline: the track count is the
       number of days being rendered, and the gap is the day_spacing option.
       The two rows are declared here because they are structural, not configurable:
       row 1 is the week-number band, row 2 is the day columns. Declaring them
       explicitly is also what makes the week and month rules' "1 / -1" span
       resolve -- with implicit rows only, -1 would name the first line.
       With week numbers off the band row holds nothing and collapses to zero. */
    grid-template-rows: auto auto;
    align-items: start;
    width: 100%;
  }

  /* Columns are flex stacks; the grid keeps them top-aligned so quiet days do
   * not stretch their accent borders through empty space. */
  .day-column {
    display: flex;
    flex-direction: column;
    min-width: 0; /* Allow the track to shrink below its content's intrinsic width. */
  }

  /* The header owns the configurable gap above the first event, independent of
   * whether a separator is rendered. position relative remains available for
   * header-local positioning. */
  .column-day-header {
    position: relative;
    padding-bottom: var(--calendar-card-column-header-gap, 8px);
  }

  /* Column headers use two rows: weekday above day, month, and weather. This
   * gives the weather badge usable width in narrow tracks while preserving the
   * list view markup. Grid areas place the flat children without wrappers, and
   * baseline alignment keeps the day and month visually level. */
  .column-date-content {
    display: grid;
    grid-template-columns: auto auto 1fr;
    grid-template-areas:
      'weekday weekday .'
      'day month weather';
    align-items: baseline;
    column-gap: 6px;
    row-gap: 2px;
    position: relative;
    z-index: 2; /* Above the today indicator, matching the list view. */
    min-width: 0;
  }

  .column-date-content .weekday {
    grid-area: weekday;
  }

  .column-date-content .day {
    grid-area: day;
  }

  .column-date-content .month {
    grid-area: month;
  }

  /* Inline today indicator shares the weekday grid cell rather than adding a
   * leading track that would offset the day number. The container class reserves
   * exactly the indicator size plus the 4px gap. */
  .column-date-content .today-indicator-container.inline {
    grid-area: weekday;
    justify-self: start;
    align-self: center;
    z-index: 3;
  }

  .column-date-content.with-today-indicator .weekday {
    padding-inline-start: calc(var(--calendar-card-today-indicator-size, 6px) + 4px);
  }

  /* The weather badge starts immediately after the month on the second row.
   * Starting it in the flexible third track keeps it attached to its own date
   * instead of drifting toward the next column. It truncates instead of wrapping
   * so header height remains stable. */
  .column-date-content .weather {
    grid-area: weather;
    justify-self: start;
    align-self: baseline;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Column separators sit under the header because the grid gap already
   * separates days horizontally. The bottom margin centers the rule in the
   * header-to-events gap instead of shifting events downward. */
  .column-header-separator {
    margin-bottom: var(--calendar-card-column-header-gap, 8px);
  }

  /* Week numbers occupy the grid's own band row. Every column emits the cell and
   * hides non-starts, so the band is one uniform height across the card and the
   * weekday rows cannot stagger. Keeping the cell here rather than inside the day
   * column is what gives a day separator a row boundary to stop at.
   *
   * The gap to the weekday below lives on this cell rather than on the grid's
   * row-gap: a row-gap would still apply when the band row is empty and would
   * push every header down 2px on cards with week numbers off. */
  .column-grid > .column-week-number {
    justify-self: start;
    margin-bottom: 2px;
  }

  .column-events {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Column event rows already include their 12px trailing gutter. Countdown
   * and progress elements add another 12px inside .time, so zero that extra
   * margin only in column view where right alignment makes it visible. */
  .column-events .time-countdown,
  .column-events .progress-bar {
    margin-inline-end: 0;
  }

  /* The countdown in column view. Stays inline with the time, marked off with a
     middot; a row of its own was rejected because every other row leads with an icon and
     a bare text row reads as one that lost its icon. Stays a flex row -- inline flow
     would stack .time-actual and the countdown and drop align-items. Pinned in
     stylesheet.test.ts.

     These rules now serve only the leftover case. Normally the countdown moves *into* the
     time text in this view, through countdownPlacement: 'text' and the .time-text wrapper
     beside .time-actual, and everything about how it wraps, where its separator sits and
     what it aligns against lives in that block -- read it first. The leftover case is
     show_time off with a countdown on, where there is no time text to fold into and the
     countdown is still a trailing <div>: the empty .time-actual collapses to nothing and
     the countdown sits one column-gap in.

     The padding and .time-actual's matching negative margin are a hanging indent, so a
     wrapped countdown lands under the time text rather than under the icon -- the middot
     sits directly below the first digit of 16:00. The icon is nested inside .time-actual
     rather than being a child of .time, so the negative margin goes on that wrapper: its
     margin box collapses to zero width, the icon still paints in the gutter, and every
     wrapped line starts at the padding edge where the time text begins.
     .time-location .event-weather carries the same pair for the same reason.

     box-sizing is not optional here: .time declares width: 100%, so with the inherited
     content-box the padding would be added *outside* that and overflow the column.

     white-space below releases the nowrap the list view sets, and it is the indent's own
     bill being paid: reserving the gutter costs the wrapped countdown 18px of the line it
     lands on, and a nowrap box cannot give that back. The nowrap existed to stop the
     separator being orphaned at the end of a line, and the word joiner in the folded
     separator's own content does that job properly. Scoped to the column, so the list
     view keeps its single line. */
  .column-events .time {
    justify-content: flex-start;
    box-sizing: border-box;
    column-gap: 4px;
    padding-inline-start: calc(var(--calendar-card-icon-size-time, 14px) + 4px);
  }

  .column-events .time-actual {
    margin-inline-start: calc(-1 * (var(--calendar-card-icon-size-time, 14px) + 4px));
  }

  .column-events .time-countdown {
    margin-inline-start: 0;
    text-align: start;
    white-space: normal;
  }

  /* Generated, not baked into the strings: the countdown is translated into 35 languages
     and every one would then carry the punctuation in list view too. .time's column-gap
     supplies the leading space; this matches it, so the middot is spaced equally on both
     sides. Inside the nowrap box, so the separator travels with the phrase instead of
     being orphaned at the end of the line.

     4px, down from the 8px this and the column-gap above both inherited from .time, and
     now matching the weather row's separator gutter. */
  .column-events .time-countdown::before {
    content: '·';
    margin-inline-end: 4px;
  }

  /* Vertical day, week, or month rule in the gap between columns. Variable
   * geometry is set inline per boundary. Stretch makes every rule match the
   * row height instead of the following day's content height; start alignment
   * lets the inline margin pull the fixed-width rule into the gutter. */
  .column-separator {
    align-self: stretch;
    justify-self: start;
    pointer-events: none;
  }
`;
