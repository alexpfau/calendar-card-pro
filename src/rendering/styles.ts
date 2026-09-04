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

  /* A badge row centres regardless of what event_icon_vertical_alignment says, and is
     allowed to shrink below its content.

     align-items: that option exists to decide where an icon sits against text that may wrap
     over several lines. A badge row cannot wrap -- the pill is nowrap and the label is one
     phrase -- so the only thing the setting can still decide here is what happens when the
     pill and the clock are different heights, and at that point top-alignment is simply the
     wrong answer: the pill is sized from the font and the icon from time_icon_size, so
     raising time_font_size makes the pill the taller of the two and flex-start hangs the
     icon off its top edge. At equal heights centre and flex-start are identical, so this
     changes nothing at the default and only helps once the two diverge.

     min-width: this is what makes the pill's own ellipsis reachable, and without it that
     ellipsis is unreachable in principle rather than merely rare. .time-actual is a flex
     item of .time, so it defaults to min-width: auto -- its min-content width. A nowrap
     pill has no soft break, so its min-content width is the whole label, and .time-actual
     therefore refuses to go narrower than the label no matter how narrow the card gets.
     Measured with the host forced from 1180px down to 110px: .event-content shrank to 35px
     as it should, .time followed it, and .time-actual stayed at 281px and simply hung out of
     the card. max-width: 100% on the pill cannot help there, because 100% resolves against a
     parent that is itself being sized by the pill. Releasing the floor here lets the chain
     reach the pill, which then clips and shows its ellipsis. */
  .time .time-actual:has(.allday-badge) {
    align-items: center;
    min-width: 0;
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

  /* That 4px lead-in exists to separate the countdown from the time text before it. After a
     badge there is no time text — the label became the badge — and the badge brings its own
     margin, so keeping this one stacked the two into a visibly lopsided run-up to the dot.
     No margin figures here on purpose: the same commit that first wrote them also changed
     the badge's own margin from 4px to 5px, so they were stale the moment they were
     committed. The badge's rule carries the live number and the reasoning for it; one copy
     is enough. The two figures further down are not that -- they measure what the SELECTOR
     did when it was losing, which is a fact about a fixed bug rather than a live spacing
     that can drift out from under this comment.
     Adjacent-sibling rather than :has(), because the badge really is the element before.
     The two-class prefix on the front of this selector is load-bearing: without it the
     selector carries three classes against the four of the rule it has to beat, loses on
     specificity and silently changes nothing. Measured at 8.62px before the dot against
     5.62px after it while that was the case — a fix that typechecked, built, deployed and
     did nothing. */
  .time .time-actual .allday-badge + .time-text > .time-countdown {
    margin-inline-start: 0;
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
   * A long label (French reads "toute la journee", eight times the length of the Chinese
   * one) does NOT wrap: the rule below sets white-space: nowrap and lets the text end in an
   * ellipsis instead. This paragraph said the opposite for twenty-six commits, describing
   * defaults the rule had already overridden -- a broken pill is not a pill, and the wrapped
   * version put the second line outside the shape entirely.
   *
   * ===== Why the colours are derived, and why the ring carries the weight =====
   *
   * All three colours come from one input, the calendar accent, resolved by the BROWSER at
   * paint time. That matters because an accent may be a theme token such as
   * var(--primary-color), which JavaScript cannot decompose into channels -- see the comment
   * on computeRGBA in utils/helpers.ts, which records the shipped bug where this card tried
   * exactly that and silently fell back to a hardcoded blue. So no lookup table from accent
   * to text colour can be built here, and none is needed: color-mix resolves the token.
   *
   * The ink mixes the accent INTO the primary text colour rather than replacing it, and the
   * wash mixes it into the card background, so both invert with the theme on their own -- no
   * light-dark(), no media query.
   *
   * The ring carries visibility; the fill does not. That is the opposite of the obvious
   * arrangement and was measured, not guessed. A saturated fill is loud for what is secondary
   * information, and it wrecks legibility: at 70% the muted time colour measured 3.24:1 on the
   * default blue and 2.12:1 on pink, both failing WCAG AA. But a pale fill alone dissolves
   * once event_background_opacity tints the row in the same accent, which is the failure the
   * 70% attempt was made to fix. A 1px boundary resolves it, because a crisp edge survives a
   * tinted ground where an area wash cannot -- so the fill is free to stay quiet.
   *
   * The fill's strength is measured. A 22% ring is decorative: removing it was visually
   * indistinguishable. Sweeping fill against ring (6,720 samples) put 10%/40% in the only
   * region satisfying both constraints, and in the card that read 11.77:1 text with the
   * weakest boundary at 1.66:1 across event_background_opacity 0-80.
   *
   * 🚨 That sweep chose the RING at 40% too, and tinted no longer uses that half of its
   * answer -- see the rule itself for why. Recorded rather than deleted because the fill's
   * 10% is the same measurement and still stands, and because the sweep was sound for what
   * it varied: every sample was a chromatic accent, so it never saw the case that overturned
   * it. A stronger ring only raises boundary contrast, so nothing it established is at
   * risk.
   *
   * --badge-ink and --badge-wash are declared once and consumed by every mode, so the modes
   * differ only in how hard they use them -- and so the OKLCH block at the end can improve all
   * four by redefining two values. */
  .allday-badge,
  .allday-title-pill {
    --badge-ink: color-mix(
      in srgb,
      var(--calendar-card-event-accent) 30%,
      var(--primary-text-color)
    );
    --badge-wash: color-mix(
      in srgb,
      var(--calendar-card-event-accent) 10%,
      var(--calendar-card-background-color, var(--card-background-color))
    );
    /* The source used RAW, by the two treatments that show it undiluted. It exists so those
       two stop naming --calendar-card-event-accent directly: with all three colours behind
       tokens, allday_badge_color switches the source by redefining three properties in one
       place, and no shape rule has to know a source exists. */
    --badge-solid: var(--calendar-card-event-accent);

    /* Sized from the pill's OWN font, never from anything beside it. The line box and the
       vertical padding are set per position, just below, because the two wrap different
       KINDS of text -- see each rule for why one is not the other's answer.
       The time-row badge took its height from the clock icon, so that flex-start would land
       the two boxes level. That is correct only while the two happen to be similar:
       --calendar-card-icon-size-time does not move with time_font_size, so at
       time_font_size: 20px the label rendered at 17px inside a box still fixed at 14px and
       spilled straight out of the pill. A pill has to be a function of the text it wraps,
       which is also the only definition that transfers to the title, where there is no icon
       to measure against in the first place.
       Each position states its own line box and vertical padding, immediately below, and the
       two are NOT the same: the badge wraps one uppercase label and the title wraps the
       user's own mixed-case words, often starting with an emoji. What is shared is only the
       rule that a pill is a function of the text inside it -- every number lives with the
       position it belongs to, so neither can be read here and be wrong. */
    /* Never wrap. A broken pill is not a pill -- the label is one phrase, French reads
       toute la journee at eight times the length of the Chinese, and it split across two
       lines with the text escaping the shape entirely. Where even one line will not fit, the
       pill keeps its shape and the text ends in an ellipsis instead.
       This is also the whole of the title pill's line limit. It deliberately does NOT reuse
       title_max_lines: that option clamps with -webkit-box, which is block-level and would
       break the hanging indent a glyph label depends on, and it is the user's setting for
       every event rather than a property of being in a pill. A pill is one line by
       construction, whatever title_max_lines says.
       min-width: 0 lets it shrink at all: a flex item defaults to min-content, which for
       nowrap text is the whole string, so without it the pill would overflow rather than
       clip. */
    display: inline-block;
    /* border-box, so max-width: 100% means what a reader assumes it means. The card sets
       box-sizing per element rather than globally, so the default here is content-box -- and
       under that, max-width caps the CONTENT and the inline padding is added outside it, so a
       pill clamped to its container still ends up wider than the container. Measured in a
       column cell: the clipped pill sat 1.19px past the cell's right edge, and switching to
       border-box put it 12.00px inside. Small, but an overflow rather than a rounding, and it
       grows with padding-inline. */
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 999px;
  }

  /* Both halves at once: the wash of subtle inside the ring of outline, each exactly as
     that treatment draws it -- the same colour, from the same token, so "matching" is a
     fact rather than a description. So the four are orthogonal: subtle is the wash, outline
     is the ring, tinted is both, filled is the solid.
     It was not true until 4.2. The ring was 40% of the ink, which is the sweep's answer
     recorded in the base rule, and the reasoning was that a ring on a wash would otherwise
     read as a second colour. Sound for a chromatic accent, and false for a neutral one:
     weakening a colour preserves its hue, so 40% blue still reads as blue, softer -- but
     black has no hue to preserve, so 40% black reads as GREY, which is a different colour
     rather than a quieter one. Measured on canvas pixels over a white card, the ring's
     distance from its own ink was 227 for a black title against 146-165 for every chromatic
     source, and the black pill read as a grey ring that had wandered in around black text.
     Reported against a live card, at allday_badge_color: text.
     Special-casing the text source was the obvious repair and is the wrong one: it would
     reintroduce exactly the "one treatment is the exception" shape that splitting shape from
     colour had just removed. A ring that always matches its ink has no exception in it.
     This rule also used to not exist -- the base declared these three and tinted was
     whatever you got by naming no other treatment. That worked and was still wrong: the
     class in the DOM matched nothing, the treatment could not be reconciled against the
     others, and any rule added to the base silently became part of tinted. */
  .allday-pill-tinted {
    color: var(--badge-ink);
    background-color: var(--badge-wash);
    /* 🚨 --badge-solid, NOT currentColor. Outline's ring is written as currentColor and that
       is correct there, because outline sets its own colour to --badge-solid -- so the two
       rules would read as identical rings and paint DIFFERENT ones, the only difference
       being which token each rule's own color declaration happens to name. Measured: the bar beside the
       event and outline's ring both draw #03a9f4, while tinted's currentColor ring drew
       rgb(44,91,120), the legibility-mixed ink. Reported from a live card as the pill's
       border not matching the bar, which it sits four pixels from.
       A ring is a 1px boundary that nobody reads, so it has no legibility requirement and
       belongs with the bar. The LABEL is read, and keeps the mix: raw accent as text on this
       wash measures 2.33:1 on the default blue, 2.28:1 on pink and 1.92:1 on green, all
       failing WCAG AA, against 6.11 / 6.66 / 5.77 for the mixed ink. So the two halves of
       this rule answer to different constraints and cannot share a token.
       The text source is unaffected: there --badge-solid and --badge-ink are both the row's
       own colour, so the ring stays exactly the ink, which is what the black pill needs. */
    box-shadow: inset 0 0 0 1px var(--badge-solid);
  }

  /* The time-row badge draws a LABEL -- the localized words for "all day" -- so it is set
     small, spaced and uppercased to read as a tag rather than as prose. */
  .allday-badge {
    font-size: 0.85em;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    /* 1.05em of line box plus 0.32em of padding is 1.37em of the badge's own font, which at
       the 0.85em it is set to comes back to 1.165em of the time font -- 14px at the 12px
       default, so the shipped look is unchanged, and it grows with the option.
       The padding is asymmetric because the INK is not centred in the line box. A line box
       centres the font's em square, and the em square reserves descender depth that an
       uppercase label never uses, so the caps sit high with dead space under them. The shift
       is (padding-top - padding-bottom) / 2.
       0.033em is a MEASURED font constant, not a guess. Fourteen sizes from 12px to 48px
       were rendered at 8x device scale and the glyph ink located by pixel, giving a mean
       residual of +0.027em of badge font with the previous 0.12em split -- consistently LOW,
       which is what the maintainer reported seeing at 28px. Removing 2 x 0.027 from the split
       leaves 0.066em, so 0.193 against 0.127. The total is unchanged at 0.32em, so no pill
       anywhere changes height.
       The residual after that is NOT zero and cannot be made zero from here: the sweep's
       standard deviation was 0.018em, because the browser snaps the baseline to a whole CSS
       pixel. That is a sawtooth of up to half a pixel which lands either way depending on
       the size, and no em-valued padding can flatten it -- which is why the block below
       exists rather than a more precise number here. */
    line-height: 1.05;
    padding-block: 0.193em 0.127em;
    padding-inline: 0.5em;
    /* 5px, where the separator dot uses 4px on its far side, and the extra pixel is optical
       rather than arbitrary. A timed event's countdown measures 5.50px before the dot against
       5.62px after it: the digits ahead of it carry a right side bearing. A badge is a drawn
       box and has none, so the 4px this used to be measured 4.62px against 5.62px -- visibly
       tighter on one side, which is what prompted the change. At 5px the badge lands on the
       same rhythm as every other countdown in the card. */
    margin-inline-end: 5px;
  }

  /* The title pill draws the user's OWN WORDS, which changes every type decision the badge
     made. No uppercase: an event called "Dentist" is not called "DENTIST", and forcing the
     case would mangle every language that carries meaning in it. No letter-spacing either --
     that opens a short label out into a tag, and spread across a whole title it only makes
     the title harder to read.
     The size and the weight DO step down, a little, and each states its own reasoning where
     it is set below. Between them they are the whole of "quieter than the title it wraps",
     and no number for either belongs up here where it would go stale out of sight of the
     declaration it describes.
     Wider inline padding than the badge, because the eye reads a capsule against the length
     of what is inside it: 0.5em looks generous around the two short words of a label and
     mean around a full title.
     🚨 That padding is deliberately NOT pulled back by a negative inline margin, and it once
     was. A margin-inline-start of exactly the padding put the pill's TEXT on the same optical
     line as every other title, which reads well in isolation and was wrong in place: the pill
     then began further left than anything else in the card, and the container clipped its
     leading curve. The pill's BOX aligns with the row instead -- measured at the same edge as
     a plain title -- and the text sits indented inside it, which is what Apple Calendar does.
     The consequence is real and is the accepted trade: in a list mixing pilled and unpilled
     events, the all-day titles are indented by the pill's own inline padding, which scales
     with it and is about 7px at the shipped default. Do not "fix" that indent by restoring
     the margin without first re-checking the clipping it caused. */
  .allday-title-pill {
    /* Taller than the badge, and symmetric where the badge is not. Both differences come
       from the same fact: this pill wraps the user's own words rather than one uppercase
       label, so its content is mixed case WITH descenders and, very often, an emoji.
       Symmetric because mixed-case text is centred on the em square by definition -- the
       badge's correction exists only because uppercase leaves the descender depth empty, and
       applying it here would push real descenders toward the lower edge.
       Taller because an emoji is drawn to a larger box than a Latin glyph and overflows a
       1.05 line box at both ends, so at the badge's 0.32em of padding it touched the pill's
       border. 1.16em of line box plus 0.42em of padding is 1.58em against the badge's 1.37em
       -- about a sixth more, which is the smallest increase that cleared the emoji at every
       size measured. */
    /* A little smaller than the title it wraps, which is the other half of not shouting --
       the pill already carries the accent colour and a border. 0.95 rather than the badge's
       0.85 because this holds the user's own prose while the badge holds one short uppercase
       label, so it has to stay comfortably readable.
       Relative, never absolute: every other number in this rule is em of the pill's OWN font,
       so one font-size scales the line box, both paddings and the negative margin together.
       An absolute value here would freeze the pill while event_font_size moved around it.
       It also SHRINKS the row-height residue documented below rather than adding to it,
       because the pill's height falls faster than the margin's pull-back does: measured
       against a plain unpilled row, +1.18px at 1.00em, +0.74px at 0.95em, and 0.00px at
       0.85em. Do not read that as an argument for 0.85 on its own -- it was tried and reads
       too small for prose -- but do re-measure the residue if this value ever changes. */
    font-size: 0.95em;
    line-height: 1.16;
    padding-block: 0.21em;
    padding-inline: 0.55em;
    /* One step lighter than the title it sits in, because the pill is already carrying the
       calendar's colour and a border -- at the title's own 500 it read as shouting.
       400 and not 450: Home Assistant ships Roboto as STATIC faces (100/300/400/500/700/900),
       not as a variable font, so the whole 425-500 range resolves to 500 under the CSS
       font-matching rule that a target between 400 and 500 searches upward first. Measured
       across the axis in a real browser: 17 weights from 300 to 700 produce exactly FOUR
       distinct renderings. A font-weight of 450 here would be a silent no-op that looks
       deliberate, which is worse than 500. If HA ever ships a variable Roboto, 450 becomes
       reachable and is the nicer value -- re-measure before assuming it is. */
    font-weight: 400;
    /* Sit on the text's own centre line, and give back the height the capsule borrowed.
       Both lines exist because an inline-block with overflow: hidden takes its baseline from
       its BOTTOM MARGIN EDGE rather than from the text inside it -- a rule that exists so a
       scrollable box does not hang its last line into the paragraph below, and that here made
       the whole pill hang ABOVE the text baseline. The row then grew by the pill's full
       overhang: measured 22.39px without the pill against 31.50px with it, and the gap from
       the title's text down to the time row went from 5.59px to 11.77px, which is the
       double-spaced look reported against a live card.
       vertical-align: middle re-centres the pill on the text rather than hanging it, which
       recovers most of it (gap 7.97px). The rest is that the capsule is genuinely taller than
       a line of text, and a negative block margin hands that difference back to the line box
       without moving what is painted -- for an atomic inline the line box measures the MARGIN
       box, so this shrinks the space the pill claims while leaving the capsule its full size.
       -0.17em is measured, not chosen: a sweep from 0 to -0.25em puts the text-to-text gap at
       exactly 5.59px here, matching a row with no pill at all. Beyond about -0.25em it stops
       having any effect, because the line box has hit the strut's own height -- an absurd
       -2em control returns the same numbers as -0.30em, which is the floor rather than a dead
       measurement.
       The row is left a little taller than a timed one, and that is the honest residue: the
       capsule IS bigger than a line of text. What the maintainer asked for, and what this
       matches exactly, is the rhythm from one text baseline to the next.
       That residue is ROW height, not the baseline gap, and it SCALES WITH THE PILL'S OWN
       FONT rather than being a constant -- which is why no number is quoted here. It was
       ~1.25px when the pill matched the title's size, and the 0.95em set above brings it to
       ~0.74px, because the capsule shrinks faster than the margin's pull-back does. The
       pilled title's own line box is exact: measured 18.00px against 18.00px for an unpilled
       title at the shipped default. Anyone changing font-size, line-height, padding-block or
       this margin should re-measure the pair rather than trusting either figure; four
       container definitions of "row" (td.event, .summary-row, .summary and the whole table)
       agree with each other, and a control with no pill anywhere returns 0. */
    vertical-align: middle;
    margin-block: -0.17em;
  }

  /* Centre the CAPS rather than the em square, where the browser can.
     The measured correction above removes the average error but not the per-size scatter,
     because that comes from baseline snapping rather than from the padding. text-box-trim
     removes the cause instead of compensating for it: it trims the line box to the cap
     height and the alphabetic baseline, so what symmetric padding then centres IS the ink.
     Exact at every size, and in any font, without this stylesheet knowing that font's
     metrics.
     Only the time badge takes it. The title pill's content is mixed case with descenders and
     emoji, where the em square is the right thing to centre and cap-to-baseline is not.
     0.3295em keeps the height at the 1.37em the fallback draws: trimming leaves the cap
     height, which is near enough 0.711em in the fonts Home Assistant ships, and
     (1.37 - 0.711) / 2 is 0.3295. A font with different metrics gets a pill sized to its own
     caps, which is more correct rather than less. */
  @supports (text-box-trim: trim-both) and (text-box-edge: cap alphabetic) {
    .allday-badge {
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
      padding-block: 0.3295em;
    }
  }

  /* Wash with no boundary. The quietest treatment that is still a badge, for a dashboard
     where the ring reads as one line too many. It gives up the ring's separation, so on a
     row tinted in the same accent it is the first mode to lose its edge -- which is the
     trade the user makes by choosing it. */
  .allday-pill-subtle {
    color: var(--badge-ink);
    background-color: var(--badge-wash);
    box-shadow: none;
  }

  /* Boundary with no wash, in the calendar's colour exactly as configured.
   *
   * The mirror image of tinted, one step further: that one draws the same ring over a wash
   * and mixes its LABEL for legibility, this one leaves the ground alone and leaves the
   * label raw too. So both halves here are the colour the user configured, exactly.
   *
   * 🚨 That is a deliberate, maintainer-level decision and NOT an oversight, which is worth
   * saying because it is measurable and it measures badly. Raw accent as text on the card
   * is 2.63:1 for the default blue, 2.69 on pink and 2.10 on green -- all failing WCAG AA on
   * a light theme, where tinted's mixed ink reads 6.9 / 7.86 / 6.3. Anyone auditing contrast
   * will find this rule and it will look like the bug that tinted's ink was written to
   * avoid.
   *
   * It is kept because outline promises WYSIWYG: a frame with text inside it, both in the
   * colour that was asked for. The card now offers four shapes, three colour sources and a
   * free-form colour, so a user who cannot read this combination on their background has
   * many ways to change it -- and every one of them is a choice they can see the result of,
   * where a silent legibility mix is a choice made for them that makes the option not do
   * what it says. Configurability is the answer here rather than correction.
   *
   * The ring follows the same logic and needs no argument of its own: the vertical bar
   * beside every event is already the raw accent, and filled already paints it as its ground.
   *
   * Setting colour rather than --badge-ink is also what keeps the chroma block below from
   * reaching it: there is nothing here to correct. */
  .allday-pill-outline {
    color: var(--badge-solid);
    background-color: transparent;
    box-shadow: inset 0 0 0 1px currentColor;
  }

  /* The loud one, for people who want the calendar colour to read as a solid chip.

     Text is the CARD BACKGROUND rather than a derivation of the accent, because on a
     saturated ground the only reliably legible ink is the page's own extreme -- near-white
     on a light theme, near-black on a dark one. That inverts with the theme for free, and is
     the same choice Google Calendar exposes as Modern/Classic.

     In sRGB this is a heuristic rather than a guarantee: it assumes a light theme's accents
     are mid-dark and a dark theme's are bright, which holds for the usual palette and fails
     for a pale yellow on a light theme. The OKLCH block below replaces the heuristic with an
     actual per-accent decision, so this rule is the floor rather than the intent. */
  .allday-pill-filled {
    color: var(--calendar-card-background-color, var(--card-background-color));
    background-color: color-mix(
      in srgb,
      var(--badge-solid) 85%,
      var(--calendar-card-background-color, var(--card-background-color))
    );
    box-shadow: none;
  }

  /* ===== Progressive enhancement: keep the accent's chroma =====
   *
   * Everything above mixes in sRGB, and mixing a saturated colour toward white or black
   * necessarily desaturates it. On a dark theme --badge-ink is 30% accent into a near-white
   * text colour, so a vivid pink arrives as blush rose -- legible, but visibly a different
   * colour from the accent it is meant to name, which is what the maintainer reported seeing.
   *
   * OKLCH interpolation keeps chroma across the mix instead of cutting through the middle of
   * the sRGB cube, so the same 30/70 split arrives recognisably as this calendar's colour.
   * Because color-mix resolves at paint time this still works when the accent is a theme
   * token JavaScript could never read, and the accent weight is raised now that the mix no
   * longer costs saturation.
   *
   * 🚨 This block used light-dark() to pick a lightness per theme, and that was wrong.
   * light-dark() resolves against the used value of color-scheme, and Home Assistant
   * declares none -- measured on a live dashboard it computes to normal on the badge, on the
   * shadow host and on the document element alike -- so the browser falls back to
   * prefers-color-scheme and the badge tracked the OPERATING SYSTEM. A dark HA theme under a
   * light OS, which is an ordinary way to run Home Assistant, got the light theme's ink: on
   * a card at rgb(56,23,39) the accent #e67c73 rendered as oklch(0.42 ...), a maroon barely
   * separable from the row. Three of the five modes were affected; neutral and filled were
   * immune only because neither reads --badge-ink.
   *
   * Nothing caught it because the screenshot harness passes colorScheme: dark to Playwright,
   * so every published image resolved the branch the OS was never going to pick.
   *
   * Mixing into --primary-text-color and into the card background fixes it at the root
   * rather than correcting for it: those are the THEME's own colours, so they already invert
   * when the theme does, whatever the OS is doing. The wash can no longer collide with the
   * card either, since it is defined relative to the card instead of at an absolute
   * lightness -- which retires the 0.26-to-0.38 tuning that collision previously forced.
   *
   * Gated on OKLCH interpolation alone, which is Chrome 111+ / Firefox 113+ / Safari 16.2+,
   * essentially the color-mix floor the rest of this stylesheet already assumes. The filled
   * rule below still needs relative colour syntax and keeps its own, higher gate. */
  @supports (color: color-mix(in oklch, red, blue)) {
    .allday-badge,
    .allday-title-pill {
      --badge-ink: color-mix(
        in oklch,
        var(--calendar-card-event-accent) 45%,
        var(--primary-text-color)
      );
      --badge-wash: color-mix(
        in oklch,
        var(--calendar-card-event-accent) 14%,
        var(--calendar-card-background-color, var(--card-background-color))
      );
    }
  }

  /* Second tier: put the chroma back that the mix above had to spend on lightness.
   *
   * color-mix couples the two axes -- 45% of the way to a near-white text colour is also 45%
   * of the accent's chroma -- which is the very desaturation the sRGB rule was criticised
   * for, merely less of it. Measured on #e67c73 the mix lands at c 0.060 against the 0.12
   * the light-dark() version aimed at, so on its own it is a fix for the theme fault that
   * reintroduces the pastel one.
   *
   * Relative colour syntax accepts any colour as its origin, including a color-mix(), so the
   * two compose: take the LIGHTNESS from the mix, which is theme-correct because it was
   * mixed into a theme colour, and multiply the chroma back up to roughly the accent's own.
   * That recovers what light-dark() was for -- lightness and chroma set independently --
   * without asking the browser a question about the operating system.
   *
   * The multipliers are not the same, and the difference is the point. The ink mixes into
   * --primary-text-color, which is near-neutral, so the mix's chroma is almost purely the
   * accent's and 2.2 lands it back at its own: measured 0.131 against the accent's 0.133.
   * The wash mixes into the CARD, which is not neutral -- a themed dark card carries real
   * chroma of its own -- so most of the mix's chroma is the card's, and a multiplier large
   * enough to restore the accent's share amplifies the card's with it. At 3 the wash came
   * out at 0.115, nearly double what a wash this quiet should carry; 1.8 puts it near 0.069,
   * which is the share the earlier tuning had settled on. Gamut mapping is the browser's
   * problem, and it is better at it than a lookup table would be.
   *
   * Only chroma is touched, never lightness, so the wash stays a small step off the card
   * rather than an absolute target -- which is why the collision the old 0.26-to-0.38 tuning
   * existed to escape cannot recur, for any theme or any hue.
   *
   * Chrome 122+ / Firefox 133+ / Safari 18+. Below that the mix above stands on its own and
   * is still an improvement on sRGB; below that again the sRGB rule is the floor. */
  @supports (color: oklch(from red l c h)) {
    .allday-badge,
    .allday-title-pill {
      --badge-ink: oklch(
        from color-mix(in oklch, var(--calendar-card-event-accent) 45%, var(--primary-text-color)) l
          calc(c * 2.2) h
      );
      --badge-wash: oklch(
        from
          color-mix(
            in oklch,
            var(--calendar-card-event-accent) 14%,
            var(--calendar-card-background-color, var(--card-background-color))
          )
          l calc(c * 1.8) h
      );
    }
  }

  /* filled gains what no mix can give it. clamp(0, calc((l - 0.55) * -1000), 1) is a step
   * function on the SOURCE's OWN lightness -- above 0.55 it floors to 0 and the ink is
   * black, below it ceils to 1 and the ink is white -- with chroma 0 so the result is a true
   * neutral. That is the per-colour decision the sRGB rule can only approximate, and it is
   * the whole reason no lookup table is needed: the browser makes it, per event, for free.
   * It reads only the source, so unlike the block above it never depended on the theme and
   * was never affected by the light-dark() fault.
   *
   * Relative colour is Chrome 122+ / Firefox 133+ / Safari 18+, so this stays a separate,
   * higher gate; below it the heuristic above is the floor. */
  @supports (color: oklch(from red l c h)) {
    .allday-pill-filled {
      color: oklch(from var(--badge-solid) clamp(0, calc((l - 0.55) * -1000), 1) 0 h);
      background-color: var(--badge-solid);
    }
  }

  /* ===== The second axis: which colour feeds all of the above =====
   *
   * allday_badge_style names a SHAPE and allday_badge_color names the colour that shape
   * is drawn in, so four treatments cover both sources rather than one of them owning a
   * treatment of its own. Until 4.2 the accent-free look was a sixth class called neutral,
   * which meant exactly one shape could be had without an accent -- and which shape that was
   * changed under the maintainer's hands twice in one evening, because there was only ever
   * room for one.
   *
   * Two of the three sources need nothing here at all. accent is the default the base rule
   * already describes, and a CUSTOM COLOUR arrives as the pill's own
   * --calendar-card-event-accent, because a colour the whole card shares is just the accent
   * overridden -- so every rule above works on it untouched, chroma recovery included.
   *
   * text is the one that cannot be expressed as a colour before the render, because it is
   * whatever the pill is nested in: the time colour on the time row, the title colour on the
   * title. The renderer publishes that as --badge-source and this block points the three
   * tokens at it.
   *
   * 🚨 --badge-source is a published token and NOT currentColor, and the difference is
   * filled. currentColor resolves against the element's own computed colour -- which is
   * the thing the treatments SET. subtle, tinted and outline get away with it because each
   * sets color to the inherited value anyway, so reading it back is identity. filled
   * deliberately sets a CONTRASTING ink, so its own ground would resolve to its own ink: a
   * pill filled with the colour of its letters. There is no ordering fix, because
   * currentColor always names the final computed value regardless of declaration order.
   *
   * The ink is the source EXACTLY, where the accent path mixes 45% into --primary-text-color.
   * That mix is a legibility step -- a raw accent measured 3.24:1 on the default blue and
   * 2.12:1 on pink -- and its job is to make a named colour readable against the card. For
   * the colour the row is ALREADY painted in, that operation is identity: it is legible here
   * by construction, since it is the text the user is reading. Running it through the mix
   * anyway would land the label 45% of the way toward the primary text and draw the pill
   * darker than the time beside it, which is the one quality this source exists for.
   *
   * The wash is 14% ALPHA rather than a mix into the card, which is the one place this does
   * not copy the accent path. Alpha composites over whatever is actually behind the pill, so
   * under event_background_opacity it deepens the tinted row evenly; a card-derived mix
   * paints a patch of near-card-background and reads as a hole punched in the tint. Nothing
   * is given up by not being a mix, because there is no accent here whose chroma a mix could
   * protect -- and an alpha veil keeps a chromatic time_color's own hue exactly, where an
   * sRGB mix toward the card would drain it. 14% is the accent wash's own OKLCH weight, so
   * the two sources carry the same quantity of wash and differ only in whose colour it is.
   *
   * The selector is compound rather than a bare class, and both blocks above are the reason.
   * They redefine --badge-ink and --badge-wash at (0,1,0) from inside @supports, and this
   * must beat them for any browser that has OKLCH -- which is every browser this stylesheet
   * targets. (0,2,0) wins on specificity, so it does not also depend on staying below them
   * in source order. */
  .allday-badge.allday-source-text,
  .allday-title-pill.allday-source-text {
    --badge-ink: var(--badge-source);
    --badge-wash: color-mix(in srgb, var(--badge-source) 14%, transparent);
    --badge-solid: var(--badge-source);
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

     The child combinator plus the two :not()s make this the *trailing* placement's rule
     and nothing else. In the countdown's text placement the only direct-child span is the
     wrapper, which is excluded, and the pieces inside it are matched by their own rule up
     beside .time-actual. The two selectors are disjoint by construction rather than by
     specificity, so neither can start winning over the other because a rule moved.

     :not(.allday-badge) is the second exclusion and it is load-bearing rather than tidy.
     The badge is deliberately a direct child of .time-actual -- being inside .time-text
     would clamp it -- but that placement is exactly the shape this selector describes, so
     it swept the badge up too. At four classes it also outranks the badge's own one-class
     rule, so it won silently: the pill computed display: -webkit-box, which cannot show a
     text-overflow ellipsis, and -webkit-line-clamp: none meant no clamp ellipsis either.
     A pill too wide for its column was therefore cut off flat, mid-word, with no mark that
     anything had been dropped. Excluding it here is what lets the badge's own
     inline-block + nowrap + ellipsis apply. */
  .time .time-actual > span:not(.time-text):not(.allday-badge) {
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

  /* ===== GRID VIEW STYLES ===== */

  /* Same 16px inset as column view, and for the same reason: the axis gutter is the
     first track, so the card must supply the whole horizontal inset itself or the
     hour labels sit inboard of the title. */
  .calendar-card-pro.grid-view {
    padding-inline: 16px;
  }

  .calendar-card-pro.grid-view .card-header {
    margin-inline-start: 0;
  }

  /* One grid for the whole view. The four rows -- week numbers, day headers, the
     all-day band, the time body -- all resolve against this single column template,
     which is what keeps the axis measuring the columns it is drawn beside. Laying the
     rows out independently is the classic way for an axis to end up a few pixels out.

     The body row takes its height from a custom property rather than from content,
     because a time axis has a height whether or not anything is scheduled. Under a
     fixed card height the property is overridden with a share of the card instead, and
     nothing needs recomputing: every block inside is positioned as a percentage. */
  .grid-container {
    display: grid;
    grid-template-rows: auto auto auto var(--calendar-card-grid-body-height, 720px);
    width: 100%;
    --calendar-card-grid-event-gap: 1px;
  }

  /* ----- Time axis ----- */

  .grid-axis {
    position: relative;
  }

  /* Nudged up by half a line so the text centres on its rule rather than hanging
     below it. Right-aligned against the gutter's inner edge, which is where the eye
     looks for a scale. */
  .grid-axis-label {
    position: absolute;
    inset-inline-end: 8px;
    transform: translateY(-50%);
    font-size: var(--calendar-card-font-size-time);
    line-height: 1;
    color: var(--secondary-text-color);
    white-space: nowrap;
  }

  /* Two repeating gradients rather than an element per slot: a week at a 15-minute
     resolution would otherwise cost several hundred empty divs. The hour rule is drawn
     second so it wins where the two coincide. */
  .grid-rules {
    background-image:
      repeating-linear-gradient(
        to bottom,
        var(--divider-color) 0 1px,
        transparent 1px var(--calendar-card-grid-slot-pct)
      ),
      repeating-linear-gradient(
        to bottom,
        var(--divider-color) 0 1px,
        transparent 1px var(--calendar-card-grid-hour-pct)
      );
    opacity: 0.5;
    pointer-events: none;
  }

  .grid-separator {
    pointer-events: none;
    z-index: 1;
  }

  /* ----- Day headers ----- */

  .grid-day-header {
    padding-block-end: 8px;
    min-width: 0;
  }

  .grid-week-number {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-inline-end: 8px;
  }

  /* ----- All-day band ----- */

  /* Its own nested grid so banners can span day columns while the band as a whole
     spans the outer grid's full width. The row template is set inline from the number
     of rows the packing actually needed, so an empty band costs no height. */
  .grid-allday-band {
    display: grid;
    row-gap: 2px;
    padding-block-end: 4px;
  }

  .grid-banner {
    display: flex;
    align-items: center;
    /* The card sets box-sizing only where a box needs it, not globally. These
       positioned grid boxes combine percentage sizing with padding or borders, so
       content-box would add the decoration outside the geometry the renderer wrote. */
    box-sizing: border-box;
    min-width: 0;
    padding: 1px 6px;
    border-radius: 4px;
    border-inline-start: var(--calendar-card-line-width-vertical) solid transparent;
    font-size: var(--calendar-card-font-size-event);
    line-height: 1.4;
  }

  .grid-banner-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The event runs past the window edge. Drawn as content rather than as a border so
     it travels with the text direction. */
  .grid-banner.continues-before .grid-banner-title::before {
    content: '\\25C2\\00A0';
  }

  .grid-banner.continues-after .grid-banner-title::after {
    content: '\\00A0\\25B8';
  }

  /* ----- Time body ----- */

  .grid-day-body {
    position: relative;
    min-width: 0;
  }

  /* Absolute, because a block's position is its start time. min-height is what keeps a
     ten-minute event legible, and it belongs here rather than in the placement maths:
     CSS resolves it against the band's real pixel height, which the geometry module
     deliberately does not know. */
  .grid-event {
    position: absolute;
    /* See .grid-banner: height is a percentage of the time band, and padding/borders
       must live inside that percentage or events visually run past their end rule. */
    box-sizing: border-box;
    overflow: hidden;
    min-height: 14px;
    padding: 2px 4px;
    border-radius: 4px;
    border-inline-start: var(--calendar-card-line-width-vertical) solid transparent;
    font-size: var(--calendar-card-font-size-event);
    line-height: 1.25;
    container: calendar-card-grid-event / size;
  }

  /* The event starts before or ends after the visible band. */
  .grid-event.clipped-top {
    border-start-start-radius: 0;
    border-start-end-radius: 0;
  }

  .grid-event.clipped-bottom {
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }

  .grid-event.clipped-top::before,
  .grid-event.clipped-bottom::after {
    content: '';
    position: absolute;
    inset-inline: 4px;
    border-block-start: 1px dashed currentColor;
    opacity: 0.45;
    pointer-events: none;
  }

  .grid-event.clipped-top::before {
    top: 1px;
  }

  .grid-event.clipped-bottom::after {
    bottom: 1px;
  }

  .grid-event-disclosure .time,
  .grid-event-disclosure .location,
  .grid-event-disclosure .description,
  .grid-event-disclosure .event-weather {
    display: none;
  }

  /* The renderer deliberately knows only percentages; the browser alone knows whether a
     30-minute block became 24px or 44px in this card. Height container queries keep that
     pixel decision in CSS, inside the shadow root, so the geometry module never gains a
     hidden pixel scale. Title is always visible, time starts once the block has room for a
     second line, and location/description wait for a third. */
  @container calendar-card-grid-event (min-height: 32px) {
    .grid-event-disclosure .time,
    .grid-event-disclosure .event-weather {
      display: block;
    }
  }

  @container calendar-card-grid-event (min-height: 56px) {
    .grid-event-disclosure .location,
    .grid-event-disclosure .description {
      display: flex;
    }
  }

  /* Stands in for events the column had no room to draw. Dashed so it reads as a
     placeholder rather than as an event in its own right. */
  .grid-event-overflow {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--secondary-text-color);
    background: transparent;
    color: var(--secondary-text-color);
  }

  .grid-event-overflow-label {
    font-size: var(--calendar-card-font-size-time);
    white-space: nowrap;
  }

  /* Inside today's column only, so it says where today has got to rather than drawing
     a line across days it makes no claim about. */
  .grid-now-line {
    position: absolute;
    inset-inline: 0;
    height: 2px;
    background: var(--calendar-card-grid-now-color, var(--error-color));
    pointer-events: none;
    z-index: 2;
  }

  /* The dot that marks which column the line belongs to. */
  .grid-now-line::before {
    content: '';
    position: absolute;
    inset-inline-start: -3px;
    top: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: inherit;
  }
`;
