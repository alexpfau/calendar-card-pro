/**
 * List-view rendering functions for Calendar Card Pro.
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Activation from './activation';
import { gridDrawsEvent } from './grid';
import * as Leaves from './leaves';
import * as Presentation from './presentation';
import * as Toolbar from './toolbar';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import * as Localize from '../translations/localize';
import * as FormatUtils from '../utils/format';
import * as Helpers from '../utils/helpers';
import * as Links from '../utils/links';

/**
 * Re-exported so the card can dispatch between views through a single import namespace. Keeping every renderer reachable as `Render.*` means the call sites in the card's view dispatch read as a set rather than pulling from different modules.
 */
export { renderColumnGroupedEvents } from './column';
export { renderGridGroupedEvents } from './grid';

/**
 * Whether a view draws at least one event for these days, rather than only empty-day
 * placeholders, a grid `+N` block or nothing at all.
 *
 * Asked before the content renders, because the card decides from it whether `ha-card`
 * hosts tap targets, and so whether it may still present itself as a button. List and
 * column views draw every event their days hold; grid view draws a subset, which
 * `gridDrawsEvent` works out.
 *
 * @param view - The view that renders the days
 * @param days - The days it renders, after any width-driven reduction
 * @param config - Card configuration, resolved for that view
 * @returns True when at least one event is drawn
 */
export function drawsEvent(
  view: Types.EffectiveView,
  days: Types.EventsByDay[],
  config: Types.Config,
): boolean {
  if (view === 'grid') return gridDrawsEvent(days, config);
  return days.some((day) => day.events.some((event) => !event._isEmptyDay));
}

/**
 * Whether a view draws at least one link in its events' rows (`open_links`).
 *
 * Asked before the content renders, as `drawsEvent` is: a card holding a link may not present
 * itself as a button, because a button's content is no place for a link.
 *
 * @param view - The view that renders the days
 * @param days - The days it renders, after any width-driven reduction
 * @param config - Card configuration, resolved for that view
 * @returns True when at least one row draws a link
 */
export function drawsLink(
  view: Types.EffectiveView,
  days: Types.EventsByDay[],
  config: Types.Config,
): boolean {
  if (!ViewConfig.VIEW_SCOPE.open_links.has(view) || !Presentation.rowLinksOn(config)) {
    return false;
  }
  return days.some((day) =>
    day.events.some((event) => {
      if (event._isEmptyDay) return false;
      const links = Links.rowLinks(Presentation.shownRowText(event, config), event._source);
      return links.location !== undefined || links.description !== undefined;
    }),
  );
}

//-----------------------------------------------------------------------------
// MAIN CARD STRUCTURE RENDERING
//-----------------------------------------------------------------------------

/**
 * Render the corner's answer to a refresh someone asked for, on a card with no refresh
 * button: the button's check, or its alert where a calendar could not be loaded, in place of
 * the spinner that turned before it.
 *
 * A picture only, hidden from assistive technology: as a live region with nothing in it but
 * an icon it would promise an announcement it never makes. A calendar that failed is named
 * in words by the notice at the card's foot.
 *
 * @param outcome How the refresh ended
 * @returns The corner indicator
 */
function renderRefreshOutcome(outcome: 'done' | 'failed'): TemplateResult {
  return html`<div
    class=${`loading-indicator ${Toolbar.REFRESH_PHASE_CLASS[outcome]}`}
    aria-hidden="true"
  >
    <svg class="loading-indicator-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d=${Toolbar.REFRESH_PHASE_ICON[outcome]}></path>
    </svg>
  </div>`;
}

/**
 * The control that runs the card's own `tap_action` while the card hosts controls of its own.
 *
 * A button may not contain another, so a card whose events, links or toolbar are buttons
 * cannot be one itself. This control stands in for it: a native button, first in the card's
 * Tab order, which runs the card's tap from the keyboard and from assistive technology. It
 * takes no pointer input, so a tap on the card still lands where it always did.
 */
export interface TapControl {
  /** Its accessible name: the action's own word where it has one, else the card's name. */
  label: string;
  /** For `expand`, whether the card is expanded; undefined for any other action. */
  expanded?: boolean;
  /** Runs the card's tap action, from the control. */
  activate: (control: HTMLElement) => void;
}

/**
 * Render the main calendar card structure. Creates a stable DOM structure for card-mod compatibility.
 *
 * @param customStyles Custom style properties from configuration
 * @param title Card title from configuration
 * @param content Main card content (events or status)
 * @param handlers Event handler functions
 * @param isLoading Flag to mark the card as busy while events load
 * @param titlePending True while a templated title awaits its first value
 * @param effectiveView The view actually being rendered, after any width fallback
 * @param hasTapAction Whether the card has a keyboard-accessible tap action
 * @param hasHoldAction Whether the card has a pointer hold action
 * @param notice The fetch-failure notice, drawn after the content
 * @param toolbar The controls for the header toolbar; none draws no toolbar
 * @param hostsControls Whether the card draws interactive children of its own
 * @param contentPending Whether the days drawn are about to be replaced by another page's
 * @param refreshPhase Where a refresh someone asked for stands; the corner shows it where no
 * refresh button does
 * @param swipePaging Whether a swipe pages the card, which hands the browser only vertical
 * panning on the card, its toolbar's rows and its body (`swipe-paging`)
 * @param tapControl The control standing in for the card's tap while it hosts controls
 * @returns TemplateResult for the complete card
 */
export function renderMainCardStructure(
  customStyles: Record<string, string>,
  title: string | undefined,
  content: TemplateResult,
  handlers: {
    keyDown: (ev: KeyboardEvent) => void;
    keyUp: (ev: KeyboardEvent) => void;
    click: (ev: MouseEvent) => void;
    pointerDown: (ev: PointerEvent) => void;
    pointerMove: (ev: PointerEvent) => void;
    pointerUp: (ev: PointerEvent) => void;
    pointerCancel: (ev: PointerEvent) => void;
    pointerLeave: (ev: PointerEvent) => void;
    lostPointerCapture: (ev: PointerEvent) => void;
    /**
     * A listener that may refuse a finger's scroll, bound only where the card can be drawing
     * a new event; anywhere else the card binds none, so a touch never waits on it.
     */
    touchMove?: EventListenerObject;
    /** Refuses the `touchend` of a finger that just opened the popover; see the card. */
    touchEnd?: (ev: TouchEvent) => void;
    /**
     * Refuses the browser's own text selection and drag while a press may move an event,
     * bound only on a card that moves events by drag.
     */
    nativeDrag?: (ev: Event) => void;
  },
  isLoading: boolean = false,
  titlePending: boolean = false,
  effectiveView: Types.EffectiveView = 'list',
  hasTapAction: boolean = false,
  hasHoldAction: boolean = false,
  notice: TemplateResult | typeof nothing = nothing,
  toolbar: Toolbar.HeaderToolbar = {},
  hostsControls: boolean = false,
  contentPending: boolean = false,
  refreshPhase: Toolbar.RefreshPhase = 'idle',
  swipePaging: boolean = false,
  tapControl?: TapControl,
): TemplateResult {
  const isPointerInteractive = hasTapAction || hasHoldAction;
  // A button may not contain another. While the card hosts controls of its own it stops
  // presenting itself as one to assistive technology, and its tap moves to a control of its
  // own, first in its Tab order (`TapControl`), so the card is not a focusable container
  // whose Enter nobody announces. A pointer tap anywhere off the controls still runs the tap
  // action, which is why the ripple and cursor stay. The ripple's binding carries the control,
  // so a card without one keeps exactly the nodes it had.
  const isCardButton = hasTapAction && !hostsControls;
  const tapButton =
    hasTapAction && hostsControls && tapControl
      ? html`<button
          class="card-tap-control"
          type="button"
          aria-label=${tapControl.label}
          aria-expanded=${tapControl.expanded === undefined ? nothing : String(tapControl.expanded)}
          @click=${(ev: MouseEvent) => {
            ev.stopPropagation();
            tapControl.activate(ev.currentTarget as HTMLElement);
          }}
        ></button>`
      : nothing;
  const ripple = isPointerInteractive ? html`<ha-ripple></ha-ripple>` : nothing;
  const lead = tapButton === nothing ? ripple : html`${tapButton}${ripple}`;
  const hasTitle = Boolean(title || titlePending);
  const titleBlock = hasTitle
    ? html`<h1 class="card-header">${title}</h1>`
    : html`<div class="card-header-placeholder"></div>`;
  // The header toolbar rule:
  // - no control: no toolbar, and the header exactly as it was before there was one. Hence
  //   a single binding below; a second, even one rendering nothing, adds a marker and a
  //   text node to the header.
  // - with a control: two rows above the events. The action row (a folded filter and add,
  //   the view switch, reset and refresh) when it holds a control, then the heading row: the
  //   title as a small label over the month the page starts in, the date navigation, and the
  //   filter's chips where they all fit.
  // With a toolbar the title moves into the heading row, as a small label over the month,
  // keeping its element and classes inside `.header-container`; `.header-container
  // h1.card-header` still finds it, `.header-container > h1.card-header` only without one.
  const toolbarBlock = Toolbar.renderHeaderToolbar(toolbar, titleBlock);
  const headerClass = toolbarBlock ? 'header-container has-toolbar' : 'header-container';
  // Days about to give way to another page's are dimmed until its events arrive. A class
  // only while that is so, so the container reads as it always has otherwise.
  const contentClass = contentPending ? 'content-container page-pending' : 'content-container';
  // `viewCssClass` returns '' for list view, so the filter is what keeps a stray
  // separator out of the class attribute. `swipe-paging` only while a swipe pages the card,
  // so a card that does not swipe keeps the browser's touch behavior untouched.
  const cardClasses = [
    'calendar-card-pro',
    ViewConfig.viewCssClass(effectiveView),
    isPointerInteractive ? 'card-interactive' : '',
    swipePaging ? 'swipe-paging' : '',
  ]
    .filter((cls) => cls !== '')
    .join(' ');

  // The header's binding stands on a line of its own, as it did before there was a toolbar, so a
  // card without one keeps the same whitespace on either side of its title, byte for byte.
  // Prettier treats the space at a block element's edges as insignificant and pulls the binding
  // onto the div's line, so this template is kept as written; match its style by hand.
  // prettier-ignore
  return html`
    <ha-card
      class=${cardClasses}
      style=${styleMap(customStyles)}
      tabindex=${hasTapAction && tapButton === nothing ? '0' : nothing}
      role=${isCardButton ? 'button' : nothing}
      aria-busy=${isLoading ? 'true' : 'false'}
      @keydown=${handlers.keyDown}
      @keyup=${handlers.keyUp}
      @click=${handlers.click}
      @pointerdown=${handlers.pointerDown}
      @pointermove=${handlers.pointerMove}
      @pointerup=${handlers.pointerUp}
      @pointercancel=${handlers.pointerCancel}
      @pointerleave=${handlers.pointerLeave}
      @lostpointercapture=${handlers.lostPointerCapture}
      @touchmove=${handlers.touchMove ?? nothing}
      @touchend=${handlers.touchEnd ?? nothing}
      @selectstart=${handlers.nativeDrag ?? nothing}
      @dragstart=${handlers.nativeDrag ?? nothing}
    >
      ${lead}
      ${
        // The refresh button turns while the card loads and shows how a refresh someone asked
        // for ended, so the corner says nothing beside it. Without the button the corner does
        // both (`refreshPhase`).
        toolbar.refresh
          ? nothing
          : refreshPhase === 'done' || refreshPhase === 'failed'
            ? renderRefreshOutcome(refreshPhase)
            : isLoading || refreshPhase === 'turning'
              ? html`
                  <div
                    class=${refreshPhase === 'turning'
                      ? 'loading-indicator'
                      : 'loading-indicator unasked'}
                    role="status"
                    aria-live="polite"
                    title="Loading"
                  >
                    <div class="spinner" aria-hidden="true"></div>
                  </div>
                `
              : nothing
      }

      <!-- Title is always rendered with the same structure, even if empty.
           A templated title holds the h1 open from first paint, so the header
           does not gain 16px of margin the moment its value arrives. That is a
           claim about the *pending* window only: once a value is in hand the
           header behaves exactly as it would for a static title of the same
           text, so a template resolving to an empty string collapses back to
           the zero-height placeholder rather than leaving an empty heading
           taking up space forever. -->
      <div class=${headerClass}>
        ${toolbarBlock ?? titleBlock}
      </div>

      <!-- Content container is always present -->
      <div class=${contentClass}>${content}</div>
      ${notice}
    </ha-card>
  `;
}

/**
 * Render the line naming the calendars that could not be loaded.
 *
 * A label followed by the names rather than a sentence with a slot in it, so it reads
 * naturally in every language without the card needing an interpolation mechanism. The
 * label carries its own colon, because the punctuation differs by language.
 *
 * @param names Display names of the calendars that failed
 * @param language Language code for translations
 * @returns Template result for the notice
 */
export function renderFetchErrorNotice(names: string[], language: string): TemplateResult {
  const translations = Localize.getTranslations(language);

  return html`
    <div class="fetch-error" role="status">
      <ha-icon class="fetch-error-icon" icon="mdi:alert-circle-outline"></ha-icon>
      <span class="fetch-error-text">${translations.loadFailed} ${names.join(', ')}</span>
    </div>
  `;
}

/**
 * Render card content based on state
 *
 * @param state Card state (loading, error)
 * @param language Language code for translations
 * @returns Template result for card content
 */
export function renderCardContent(state: 'loading' | 'error', language: string): TemplateResult {
  const translations = Localize.getTranslations(language);

  if (state === 'loading') {
    return html`
      <div class="calendar-card">
        <div class="loading">${translations.loading}</div>
      </div>
    `;
  }

  return html`
    <div class="calendar-card">
      <div class="error">${translations.error}</div>
    </div>
  `;
}

//-----------------------------------------------------------------------------
// SEPARATOR RENDERING HELPERS
//-----------------------------------------------------------------------------

/**
 * Create consistent separator styles for any type of horizontal separator. Properly calculates margins based on day_spacing to ensure vertical centering.
 *
 * Offsets are derived with {@link ViewConfig.scaleLength} rather than `parseFloat`, so a
 * `day_spacing` expressed in `em` positions the rules in `em` too. The day rule needs no
 * scaling at all: its margin is one `day_spacing` by definition, so the configured value
 * passes straight through.
 *
 * @param lineWidth - Border width for the separator
 * @param lineColor - Border color for the separator
 * @param config - Card configuration for spacing values
 * @param separatorType - Type of separator (day, week, or month)
 * @returns Style object for use with styleMap
 */
function createSeparatorStyle(
  lineWidth: string,
  lineColor: string,
  config: Types.Config,
  separatorType: 'day' | 'week' | 'month' = 'day',
): Record<string, string> {
  if (separatorType === 'day') {
    return {
      borderTopWidth: lineWidth,
      borderTopColor: lineColor,
      borderTopStyle: 'solid',
      marginTop: '0px', // No additional margin needed on top (table already has margin)
      marginBottom: config.day_spacing, // Equal spacing below
    };
  }

  let multiplier = Constants.UI.SEPARATOR_SPACING.WEEK; // Default to week multiplier
  if (separatorType === 'month') {
    multiplier = Constants.UI.SEPARATOR_SPACING.MONTH;
  }

  const finalSpacing = ViewConfig.scaleLength(config.day_spacing, multiplier);

  return {
    borderTopWidth: lineWidth,
    borderTopColor: lineColor,
    borderTopStyle: 'solid',
    marginTop: finalSpacing,
    marginBottom: finalSpacing,
  };
}

/**
 * Render a horizontal separator line with consistent styling
 *
 * @param lineWidth - Width of the separator line
 * @param lineColor - Color of the separator line
 * @param className - CSS class to apply (week-separator or month-separator)
 * @param config - Card configuration
 * @param isFirstWeek - Whether this is the first week in the view
 * @returns TemplateResult or nothing
 */
function renderHorizontalSeparator(
  lineWidth: string,
  lineColor: string,
  className: string,
  config: Types.Config,
  isFirstWeek: boolean = false,
  separatorType: 'day' | 'week' | 'month' = 'day',
): TemplateResult | typeof nothing {
  if (ViewConfig.isZeroLength(lineWidth) || isFirstWeek) {
    return nothing;
  }

  const separatorStyle = createSeparatorStyle(lineWidth, lineColor, config, separatorType);

  return html`<div class="${className}" style=${styleMap(separatorStyle)}></div>`;
}

/**
 * Render a month separator line
 *
 * @param config - Card configuration
 * @returns TemplateResult or nothing
 */
function renderMonthSeparator(config: Types.Config): TemplateResult | typeof nothing {
  return renderHorizontalSeparator(
    config.month_separator_width,
    config.month_separator_color,
    'month-separator',
    config,
    false,
    'month',
  );
}

/**
 * Render a full-width week separator line (when show_week_numbers is null)
 *
 * @param config - Card configuration
 * @param isFirstWeek - Whether this is the first week in the view
 * @returns TemplateResult or nothing
 */
function renderWeekSeparator(
  config: Types.Config,
  isFirstWeek: boolean = false,
): TemplateResult | typeof nothing {
  return renderHorizontalSeparator(
    config.week_separator_width,
    config.week_separator_color,
    'week-separator',
    config,
    isFirstWeek,
    'week',
  );
}

/**
 * Render a week row with a week number pill and a separator line. Uses table structure to align perfectly with day tables.
 *
 * @param weekNumber - Week number to display
 * @param isMonthBoundary - Whether this is also a month boundary
 * @param config - Card configuration
 * @param isFirstWeek - Whether this is the first week in the view
 * @returns TemplateResult or nothing
 */
function renderWeekRow(
  weekNumber: number | null,
  isMonthBoundary: boolean,
  config: Types.Config,
  isFirstWeek: boolean = false,
): TemplateResult | typeof nothing {
  if (weekNumber === null) {
    return nothing;
  }

  const multiplier = isMonthBoundary
    ? Constants.UI.SEPARATOR_SPACING.MONTH
    : Constants.UI.SEPARATOR_SPACING.WEEK;

  // The row carries half the separator spacing below it, and pulls up by whatever the
  // day table's own margin already contributed, so the rule lands centered on the gap.
  const rowStyle = {
    marginTop: isFirstWeek ? '0px' : ViewConfig.scaleLength(config.day_spacing, multiplier / 2 - 1),
    marginBottom: ViewConfig.scaleLength(config.day_spacing, multiplier / 2),
  };

  const lineStyle: Record<string, string> = {};

  if (!isFirstWeek) {
    if (isMonthBoundary && !ViewConfig.isZeroLength(config.month_separator_width)) {
      lineStyle['--separator-border-width'] = config.month_separator_width;
      lineStyle['--separator-border-color'] = config.month_separator_color;
      lineStyle['--separator-display'] = 'block';
    } else if (!ViewConfig.isZeroLength(config.week_separator_width)) {
      lineStyle['--separator-border-width'] = config.week_separator_width;
      lineStyle['--separator-border-color'] = config.week_separator_color;
      lineStyle['--separator-display'] = 'block';
    } else {
      lineStyle['--separator-display'] = 'none';
    }
  } else {
    lineStyle['--separator-display'] = 'none';
  }

  return html`
    <table class="week-row-table" style=${styleMap(rowStyle)}>
      <tr>
        <td class="week-number-cell">
          <div class="week-number">${weekNumber}</div>
        </td>
        <td class="separator-cell" style=${styleMap(lineStyle)}>
          <div class="separator-line"></div>
        </td>
      </tr>
    </table>
  `;
}

// CONTENT GENERATION FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Render a date column for the given date with appropriate styling
 *
 * @param date Date to display
 * @param config Card configuration
 * @param language - Language code for translations
 * @param isToday Whether the date is today
 * @param weatherForecasts Fetched forecasts, if any
 * @param hass Home Assistant instance, whose country decides which days are the weekend,
 *   or its language when no country is set
 * @returns Rendered date column
 */
function renderDateColumn(
  date: Date,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const weatherContent = Leaves.renderDateWeather(date, config, weatherForecasts);

  return Leaves.renderDateContent(date, config, language, isToday, weatherContent, hass);
}

/**
 * Render a single day with its events
 *
 * @param day - Day data containing events
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param prevDay - Previous day data for determining separators
 * @param boundaryInfo - Information about week and month boundaries
 * @param eventsTappable - Whether each event is a tap target of its own
 * @param dayAdd - How to draw the day's add button, or undefined while a tap on a day adds
 *   nothing
 * @returns TemplateResult for the day
 */
export function renderDay(
  day: Types.EventsByDay,
  config: Types.Config,
  language: string,
  prevDay?: Types.EventsByDay,
  boundaryInfo?: { isNewWeek: boolean; isNewMonth: boolean },
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
  eventsTappable = false,
  dayAdd?: Activation.DayAddButtons,
): TemplateResult {
  const { isToday, isTomorrow } = Leaves.classifyDay(day.timestamp);
  // Column view carries `weekend` on its day container, so list view does too — a card-mod
  // rule targeting weekends should not need to know which view is active. List view also
  // keeps it on `.date-column`, where it drives the built-in date-cell styling.
  const isWeekendDay = FormatUtils.isWeekendDate(new Date(day.timestamp), hass);

  let daySeparator: TemplateResult | typeof nothing = nothing;

  const isMonthBoundary = boundaryInfo?.isNewMonth || false;
  const isWeekBoundary = boundaryInfo?.isNewWeek || false;
  const hasMonthSeparator =
    isMonthBoundary && !ViewConfig.isZeroLength(config.month_separator_width);
  const hasWeekSeparator =
    isWeekBoundary &&
    (config.show_week_numbers !== null || !ViewConfig.isZeroLength(config.week_separator_width));

  const dayLabelId = eventsTappable || dayAdd ? Activation.dayLabelId(day.timestamp) : undefined;
  const eventGap = ViewConfig.hasEventGap(config);

  const daySeparatorWidth = config.day_separator_width;
  const daySeparatorColor = config.day_separator_color;

  if (
    prevDay &&
    !ViewConfig.isZeroLength(daySeparatorWidth) &&
    !hasMonthSeparator &&
    !hasWeekSeparator
  ) {
    const separatorStyle = createSeparatorStyle(
      daySeparatorWidth,
      daySeparatorColor,
      config,
      'day',
    );

    daySeparator = html`<div class="separator" style=${styleMap(separatorStyle)}></div>`;
  }

  return html`
    ${daySeparator}
    <table
      class=${classMap({
        'day-table': true,
        today: isToday,
        tomorrow: isTomorrow,
        'future-day': !isToday,
        weekend: isWeekendDay,
        'with-event-gap': eventGap,
      })}
      .calendarCardDaySlot=${Activation.daySlot(day.timestamp)}
    >
      ${repeat(
        day.events,
        (event, index) => `${event._entityId}-${event.summary}-${index}`,
        (event, index) => {
          const row = renderEvent(
            event,
            day,
            index,
            config,
            language,
            isToday,
            weatherForecasts,
            hass,
            eventsTappable,
            dayLabelId,
            dayAdd,
          );

          return eventGap && index > 0 ? html`${renderEventGapRow()}${row}` : row;
        },
      )}
    </table>
  `;
}

/**
 * The row that holds two of a day's events apart while `event_gap` is set.
 *
 * A table row takes no margin, and spacing the rows with `border-spacing` also pads above
 * the first row and below the last, which moves the day itself and every separator whose
 * distance is derived from `day_spacing`. A row of its own keeps the gap inside the day. It
 * fills the event column only, because the day's date cell spans it, and it is hidden from
 * assistive technology because it holds nothing to read.
 *
 * @returns The gap row
 */
function renderEventGapRow(): TemplateResult {
  return html`<tr class="event-gap-row" aria-hidden="true">
    <td class="event-gap-cell"></td>
  </tr>`;
}

/**
 * Render grouped events with week and month separators. Uses a precedence system for different separator types.
 *
 * @param eventsTappable - Whether each event is a tap target of its own
 * @param dayAdd - How to draw each day's add button, or undefined while a tap on a day adds
 *   nothing
 */
export function renderGroupedEvents(
  days: Types.EventsByDay[],
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
  eventsTappable = false,
  dayAdd?: Activation.DayAddButtons,
): TemplateResult {
  return html`
    ${days.map((day, index) => {
      const prevDay = index > 0 ? days[index - 1] : undefined;
      const weekNumber = day.weekNumber ?? null;

      let isNewWeek = false;

      if (!prevDay) {
        isNewWeek = true;
      } else {
        const currentWeekNumber = day.weekNumber;
        const prevWeekNumber = prevDay.weekNumber;

        isNewWeek = currentWeekNumber !== prevWeekNumber;
      }

      const isNewMonth = prevDay && day.monthNumber !== prevDay.monthNumber;
      const isFirstWeek = index === 0;

      const boundaryInfo = {
        isNewWeek,
        isNewMonth: Boolean(isNewMonth),
      };

      let separator: TemplateResult | typeof nothing = nothing;

      if (
        isNewMonth &&
        !ViewConfig.isZeroLength(config.month_separator_width) &&
        (!isNewWeek || config.show_week_numbers === null)
      ) {
        separator = renderMonthSeparator(config);
      } else if (isNewWeek) {
        if (isFirstWeek && config.show_week_numbers !== null && !config.show_current_week_number) {
          separator = isNewMonth
            ? renderMonthSeparator(config)
            : renderWeekSeparator(config, isFirstWeek);
        } else {
          separator =
            config.show_week_numbers !== null
              ? renderWeekRow(weekNumber, Boolean(isNewMonth), config, isFirstWeek)
              : renderWeekSeparator(config, isFirstWeek);
        }
      }

      return html`
        ${separator}
        ${renderDay(
          day,
          config,
          language,
          prevDay,
          boundaryInfo,
          weatherForecasts,
          hass,
          eventsTappable,
          dayAdd,
        )}
      `;
    })}
  `;
}

/**
 * A list event's content, inside the button that makes the event a tap target when it is one.
 *
 * Not the cell itself: in a table exposed as one, ARIA in HTML keeps a `<td>` a cell, and a
 * cell given `role="button"` stops being the row's cell. So the button is an element of its
 * own, drawn only while events are tap targets, which leaves the default markup exactly as it
 * was. The cell carries `event-tappable` meanwhile, which is what lets the button answer for
 * the whole cell; see `.event-button` in `styles.ts`.
 *
 * @param content - The event's rendered content
 * @param tap - The event's tap target, or undefined when it is not one
 * @param dayLabelId - The id of the day's date cell, which describes the button
 * @returns The content, wrapped in the button when the event is a tap target
 */
function renderEventButton(
  content: TemplateResult,
  tap: Activation.EventTapTarget | undefined,
  dayLabelId: string | undefined,
): TemplateResult {
  if (!tap) return content;
  return html`<div
    class="event-button event-interactive"
    role="button"
    tabindex="0"
    aria-describedby=${dayLabelId ?? nothing}
    .calendarCardEventTap=${tap}
  >
    ${content}
  </div>`;
}

/**
 * A list day's date, inside the button that adds an event on the day while a tap on a day
 * does.
 *
 * Not the cell, for the reason `renderEventButton` gives. The button is named by Home
 * Assistant's own "Add event" and described by the date, which carries the day's id while the
 * button is drawn: an id on the cell would describe each of the day's events by the button's
 * name instead of by its date. Drawn only while day taps are on, which leaves the default
 * markup exactly as it was.
 *
 * @param content - The day's rendered date
 * @param timestamp - The day's local midnight
 * @param dayAdd - How to draw the button, or undefined for none
 * @param dayLabelId - The id the date carries
 * @returns The date, wrapped in the button while there is one
 */
function renderDayAddButton(
  content: TemplateResult,
  timestamp: number,
  dayAdd: Activation.DayAddButtons | undefined,
  dayLabelId: string | undefined,
): TemplateResult {
  if (!dayAdd) return content;
  return html`<div
    class="day-add-button"
    role="button"
    tabindex="0"
    aria-label=${dayAdd.label}
    aria-describedby=${dayLabelId ?? nothing}
    .calendarCardDayAdd=${timestamp}
  >
    <div class="day-add-date" id=${dayLabelId ?? nothing}>${content}</div>
  </div>`;
}

/**
 * Render a single event
 *
 * @param event - Event data to render
 * @param day - Day that contains this event
 * @param index - Event index within the day
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param eventsTappable - Whether the event is a tap target of its own
 * @param dayLabelId - The id the day's date carries while events are tap targets or the day
 *   is a button, by which each event and the button name the day
 * @param dayAdd - How to draw the day's add button, or undefined for none
 * @returns TemplateResult for the event
 */
function renderEvent(
  event: Types.CalendarEventData,
  day: Types.EventsByDay,
  index: number,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
  eventsTappable = false,
  dayLabelId?: string,
  dayAdd?: Activation.DayAddButtons,
): TemplateResult {
  const presentation = Presentation.buildEventPresentation(event, config, language, hass);
  const tap = Activation.eventTapTarget(event, presentation.entityAccentColor, eventsTappable);

  const dayDate = new Date(day.timestamp);
  const isWeekendDay = FormatUtils.isWeekendDate(dayDate, hass);

  const isFirst = index === 0;
  const isLast = index === day.events.length - 1;
  const isMiddle = !isFirst && !isLast;
  // The day's date cell spans the gap rows between its events as well as the events.
  const rowSpan = ViewConfig.hasEventGap(config) ? day.events.length * 2 - 1 : day.events.length;

  const eventClasses = {
    event: true,
    'event-first': isFirst,
    'event-middle': isMiddle,
    'event-last': isLast,
    'past-event': presentation.isPastEvent,
    'event-tappable': tap !== undefined,
    'event-now': presentation.isNow,
    'search-ring': event._searchRing === true,
  };

  // Prettier 3.9 would put each multi-line `${…}` below on lines of its own, which breaks
  // the source-shape guard on the `: ''` idiom here ("preserves no-output idioms at
  // extraction seams" in tests/list-dom.test.ts).
  // prettier-ignore
  return html`
    <tr>
      ${index === 0
        ? html`
            <td
              class="date-column ${isWeekendDay ? 'weekend' : ''}"
              rowspan="${rowSpan}"
              style="position: relative;"
              id=${dayAdd ? nothing : (dayLabelId ?? nothing)}
            >
              ${renderDayAddButton(
                renderDateColumn(dayDate, config, language, isToday, weatherForecasts, hass),
                day.timestamp,
                dayAdd,
                dayLabelId,
              )}
              ${Leaves.renderTodayIndicator(config, isToday)}
            </td>
          `
        : ''}
      <td
        class=${classMap(eventClasses)}
        .calendarCardDaySlot=${event._isEmptyDay ? undefined : Activation.COVERED}
        style="--calendar-card-event-accent-bar-color: ${presentation.entityAccentColor}; background-color: ${presentation.entityAccentBackgroundColor};${Helpers.styleDeclarations(
          presentation.accentTextProperties,
        )}"
      >
        ${Leaves.renderAccentBar()}
        ${renderEventButton(
          Leaves.renderEventContent(event, config, presentation.contentParts, {
            weatherForecasts,
            links: Presentation.rowLinksOn(config),
            timePosition: Helpers.resolveTimePosition(config.time_position),
          }),
          tap,
          dayLabelId,
        )}
      </td>
    </tr>
  `;
}
