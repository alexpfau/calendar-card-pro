/**
 * Telling every card on the page that one of Home Assistant's dialogs changed a calendar.
 *
 * The card that opened the dialog refreshes itself, but a dashboard often shows the same
 * calendar on several cards: a week on one, today on another. Without this, those keep
 * drawing the old events until their own next scheduled refresh.
 */

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * Window event announcing a saved change.
 *
 * 🚨 Must never contain `calendar-card-pro-dev`. The production build rewrites that string
 * to `calendar-card-pro` wherever it appears, which is how the element names move, and an
 * event name rewritten in one build only would stop a development card and an installed
 * release on the same dashboard from hearing each other.
 */
export const CALENDARS_CHANGED_EVENT = 'calendar-card-pro-calendars-changed';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** What a `CALENDARS_CHANGED_EVENT` carries. */
export interface CalendarsChangedDetail {
  /**
   * Calendars whose events changed, or `null` when it could be any of them. A new event is
   * announced as `null`, because Home Assistant's create dialog lets the user pick any
   * writable calendar, not only the one the card preselected.
   */
  calendarIds: ReadonlyArray<string> | null;
  /** The card that announced it, which has already refreshed. */
  source: EventTarget;
}

//-----------------------------------------------------------------------------
// FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Announce on `window` that a dialog saved a change.
 *
 * @param source - The announcing card
 * @param calendarIds - Calendars that changed, or `null` for any
 */
export function announceCalendarsChanged(
  source: EventTarget,
  calendarIds: ReadonlyArray<string> | null,
): void {
  window.dispatchEvent(
    new CustomEvent<CalendarsChangedDetail>(CALENDARS_CHANGED_EVENT, {
      detail: { calendarIds, source },
    }),
  );
}

/**
 * Whether an announced change concerns a card showing these calendars.
 *
 * @param detail - The announcement
 * @param shownIds - Entity ids of the calendars the card shows
 * @returns True when any of them may have changed
 */
export function concernsCalendars(
  detail: CalendarsChangedDetail,
  shownIds: ReadonlyArray<string>,
): boolean {
  return detail.calendarIds === null || detail.calendarIds.some((id) => shownIds.includes(id));
}
