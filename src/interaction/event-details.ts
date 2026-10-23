/**
 * Event-detail support for Calendar Card Pro.
 *
 * A tap on an event opens Home Assistant's own event-detail dialog — the one its calendar
 * panel opens — so the full description, the recurrence and, where the calendar allows
 * them, Edit and Delete all stay Home Assistant's. The card only hands it the event.
 */

import * as Types from '../config/types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** Element name of Home Assistant's event-detail dialog. */
export const EVENT_DETAIL_DIALOG_TAG = 'dialog-calendar-event-detail';

/** Home Assistant's `CalendarEntityFeature.DELETE_EVENT` bit. */
export const DELETE_EVENT_FEATURE = 2;

/** Home Assistant's `CalendarEntityFeature.UPDATE_EVENT` bit. */
export const UPDATE_EVENT_FEATURE = 4;

/** How long to wait for a Home Assistant module that is being lazy-loaded. */
const LOAD_TIMEOUT_MS = 10000;

//-----------------------------------------------------------------------------
// DIALOG PARAMETERS
//-----------------------------------------------------------------------------

/** Home Assistant's `CalendarEventData`, the shape its event dialogs read. */
export interface DetailEntry {
  summary: string;
  dtstart: string;
  dtend: string;
  description?: string;
  location?: string;
  uid?: string;
  recurrence_id?: string;
  rrule?: string;
}

/**
 * The event as Home Assistant's dialog expects it, built from what Home Assistant returned.
 *
 * Reads `_source` rather than the row: a split segment's interval is one day of the event,
 * and the row's text is display text. Mirrors the frontend's own
 * `normalizeSubscriptionEventData`, including its `null` to absent conversion.
 *
 * @param event - A rendered event
 * @returns The dialog entry, or undefined for a row that is not an event
 */
export function buildDetailEntry(event: Types.CalendarEventData): DetailEntry | undefined {
  if (event._isEmptyDay) return undefined;

  const source = event._source ?? event;
  const dtstart = source.start.dateTime ?? source.start.date;
  const dtend = source.end.dateTime ?? source.end.date;
  if (!dtstart || !dtend) return undefined;

  return {
    summary: source.summary ?? '',
    dtstart,
    dtend,
    description: source.description ?? undefined,
    location: source.location ?? undefined,
    uid: source.uid ?? undefined,
    recurrence_id: source.recurrence_id ?? undefined,
    rrule: source.rrule ?? undefined,
  };
}

/**
 * Whether the dialog may offer Edit and Delete for this event.
 *
 * Follows the calendar's advertised features, as Home Assistant's calendar panel does, and
 * additionally requires a `uid`: Home Assistant's update and delete services address an
 * event by it, so offering either for an event without one would fail at the point of use.
 *
 * @param hass - Home Assistant instance
 * @param entityId - Calendar the event came from
 * @param entry - The dialog entry
 * @returns The two permissions
 */
export function detailPermissions(
  hass: Types.Hass | null | undefined,
  entityId: string,
  entry: DetailEntry,
): { canEdit: boolean; canDelete: boolean } {
  if (!entry.uid) return { canEdit: false, canDelete: false };

  const features = Number(hass?.states?.[entityId]?.attributes?.supported_features ?? 0);
  return {
    canEdit: (features & UPDATE_EVENT_FEATURE) !== 0,
    canDelete: (features & DELETE_EVENT_FEATURE) !== 0,
  };
}

//-----------------------------------------------------------------------------
// DIALOG
//-----------------------------------------------------------------------------

interface CardHelpers {
  createCardElement(config: Record<string, unknown>): HTMLElement;
}

/**
 * Wait for a custom element to be defined, giving up after a timeout.
 *
 * @param tag - Element name
 * @returns Resolves once defined
 */
function whenDefined(tag: string): Promise<unknown> {
  if (customElements.get(tag)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${tag} was not defined within ${LOAD_TIMEOUT_MS}ms`)),
      LOAD_TIMEOUT_MS,
    );
    customElements.whenDefined(tag).then(() => {
      window.clearTimeout(timer);
      resolve(undefined);
    }, reject);
  });
}

/**
 * Make sure Home Assistant's event-detail dialog is defined.
 *
 * The dialog lives in a lazily loaded chunk whose file name is a build hash, so a custom
 * card cannot import it. It is defined already once anything in the session has opened
 * it. Otherwise this borrows the loader Home Assistant's own `ha-full-calendar` uses:
 * creating a core calendar card makes Home Assistant load `ha-full-calendar`, and calling
 * its event-click handler against a stand-in captures the `dialogImport` function it would
 * have dispatched — without opening anything. Running that import defines the dialog.
 *
 * 🚨 This reaches into Home Assistant's frontend internals (`_handleEventClick` and the
 * shape of its `show-dialog` event). It fails closed: any mismatch throws, and the caller
 * falls back to the calendar panel instead.
 *
 * @param calendarId - A calendar to give the core card, which refuses an empty list
 * @returns Resolves once the dialog element is defined
 */
export async function ensureEventDetailLoaded(calendarId: string): Promise<void> {
  if (customElements.get(EVENT_DETAIL_DIALOG_TAG)) return;

  if (!customElements.get('ha-full-calendar')) {
    const loadCardHelpers = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> })
      .loadCardHelpers;
    if (typeof loadCardHelpers !== 'function') {
      throw new Error('window.loadCardHelpers is unavailable');
    }

    const helpers = await loadCardHelpers();
    helpers.createCardElement({ type: 'calendar', entities: [calendarId] });
    await whenDefined('ha-full-calendar');
  }

  const fullCalendar = customElements.get('ha-full-calendar');
  const handleEventClick = (fullCalendar?.prototype as { _handleEventClick?: unknown } | undefined)
    ?._handleEventClick;
  if (typeof handleEventClick !== 'function') {
    throw new Error('ha-full-calendar has no _handleEventClick handler');
  }

  let dialogImport: unknown;
  const standIn = {
    hass: { states: {} },
    dispatchEvent(event: Event): boolean {
      const detail = (event as Event & { detail?: { dialogImport?: unknown } }).detail;
      dialogImport = detail?.dialogImport;
      return true;
    },
  };
  handleEventClick.call(standIn, {
    event: { extendedProps: { calendar: calendarId, eventData: {} }, backgroundColor: '' },
  });

  if (typeof dialogImport !== 'function') {
    throw new Error('ha-full-calendar did not supply a dialog import');
  }

  await (dialogImport as () => Promise<unknown>)();
  await whenDefined(EVENT_DETAIL_DIALOG_TAG);
}

/**
 * Open Home Assistant's calendar panel, which shows the same event when tapped.
 *
 * @param node - Element to dispatch from
 */
function navigateToCalendarPanel(node: HTMLElement): void {
  window.history.pushState(null, '', '/calendar');
  node.dispatchEvent(
    new CustomEvent('location-changed', {
      bubbles: true,
      composed: true,
      detail: { replace: false },
    }),
  );
}

/**
 * Open Home Assistant's event-detail dialog for one rendered event.
 *
 * @param node - Element to dispatch from; must be inside Home Assistant's DOM
 * @param hass - Home Assistant instance, for the calendar's features
 * @param event - The rendered event that was tapped
 * @param color - The event's accent color, shown by the dialog
 * @param onUpdated - Called by the dialog once the event was edited or deleted
 */
export async function openEventDetailDialog(
  node: HTMLElement,
  hass: Types.Hass | null | undefined,
  event: Types.CalendarEventData,
  color: string | undefined,
  onUpdated: () => void,
): Promise<void> {
  const calendarId = event._entityId;
  const entry = buildDetailEntry(event);
  if (!calendarId || !entry) return;

  try {
    await ensureEventDetailLoaded(calendarId);
  } catch (error) {
    Logger.warn('Could not load the event dialog, opening the calendar panel instead', error);
    navigateToCalendarPanel(node);
    return;
  }

  const showDialog = new Event('show-dialog', { bubbles: true, composed: true });
  (showDialog as Event & { detail?: unknown }).detail = {
    dialogTag: EVENT_DETAIL_DIALOG_TAG,
    dialogImport: () => whenDefined(EVENT_DETAIL_DIALOG_TAG),
    dialogParams: {
      calendarId,
      entry,
      color,
      ...detailPermissions(hass, calendarId, entry),
      updated: onUpdated,
    },
  };
  node.dispatchEvent(showDialog);
  Logger.debug(`Opened the event-detail dialog for ${calendarId}`);
}
