/**
 * Add-event button support for Calendar Card Pro.
 *
 * The card never writes events itself. The button opens Home Assistant's own
 * create-event dialog — the one its calendar panel and calendar card use — so the form,
 * validation, recurrence rules and the service call all stay Home Assistant's.
 */

import * as Types from '../config/types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** Element name of Home Assistant's create/edit event dialog. */
export const EVENT_EDITOR_DIALOG_TAG = 'dialog-calendar-event-editor';

/** Home Assistant's `CalendarEntityFeature.CREATE_EVENT` bit. */
export const CREATE_EVENT_FEATURE = 1;

/** Home Assistant's string for the button, so it reads as it does on the core card. */
const HA_ADD_EVENT_LABEL_KEY = 'ui.components.calendar.event.add';

const FALLBACK_LABEL = 'Add event';

/** How long to wait for a Home Assistant module that is being lazy-loaded. */
const LOAD_TIMEOUT_MS = 10000;

//-----------------------------------------------------------------------------
// CONFIGURATION
//-----------------------------------------------------------------------------

/**
 * The configured calendars that accept new events, in configuration order.
 *
 * A calendar listed more than once appears once. Calendars that do not advertise the
 * create feature — typically holiday and other subscribed feeds — are left out, which is
 * what hides the button on a card that has nowhere to write to. Whether a calendar is
 * writable is the integration's call, not its name's.
 *
 * @param hass - Home Assistant instance, or null before it arrives
 * @param entities - The card's configured calendars
 * @returns Entity ids of writable calendars
 */
export function writableCalendarIds(
  hass: Types.Hass | null | undefined,
  entities: ReadonlyArray<string | Types.EntityConfig>,
): string[] {
  if (!hass?.states) return [];

  const ids: string[] = [];
  for (const entry of entities) {
    const id = typeof entry === 'string' ? entry : entry?.entity;
    if (!id || ids.includes(id)) continue;

    const features = Number(hass.states[id]?.attributes?.supported_features ?? 0);
    if ((features & CREATE_EVENT_FEATURE) !== 0) {
      ids.push(id);
    }
  }

  return ids;
}

/**
 * The button label, in the language of the Home Assistant frontend.
 *
 * Taken from Home Assistant's own string table rather than the card's, because the card's
 * language files must each carry every key and Home Assistant already ships this one in
 * every language it supports.
 *
 * @param hass - Home Assistant instance
 * @returns Localized label
 */
export function addEventLabel(hass: Types.Hass | null | undefined): string {
  const localized = hass?.localize?.(HA_ADD_EVENT_LABEL_KEY);
  return localized && localized !== HA_ADD_EVENT_LABEL_KEY ? localized : FALLBACK_LABEL;
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
 * Make sure Home Assistant's event editor dialog is defined.
 *
 * The dialog lives in a lazily loaded chunk whose file name is a build hash, so a custom
 * card cannot import it. It is defined already once anything in the session has opened
 * it. Otherwise this borrows the loader Home Assistant's own `ha-full-calendar` uses:
 * creating a core calendar card makes Home Assistant load `ha-full-calendar`, and calling
 * its add handler against a stand-in captures the `dialogImport` function it would have
 * dispatched — without opening anything. Running that import defines the dialog.
 *
 * 🚨 This reaches into Home Assistant's frontend internals (`_createEvent` and the shape
 * of its `show-dialog` event). It fails closed: any mismatch throws, and the caller falls
 * back to the calendar panel instead.
 *
 * @param calendarId - A calendar to give the core card, which refuses an empty list
 * @returns Resolves once the dialog element is defined
 */
export async function ensureEventEditorLoaded(calendarId: string): Promise<void> {
  if (customElements.get(EVENT_EDITOR_DIALOG_TAG)) return;

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
  const createEvent = (fullCalendar?.prototype as { _createEvent?: unknown } | undefined)
    ?._createEvent;
  if (typeof createEvent !== 'function') {
    throw new Error('ha-full-calendar has no _createEvent handler');
  }

  let dialogImport: unknown;
  const standIn = {
    _activeView: undefined,
    dispatchEvent(event: Event): boolean {
      const detail = (event as Event & { detail?: { dialogImport?: unknown } }).detail;
      dialogImport = detail?.dialogImport;
      return true;
    },
  };
  createEvent.call(standIn);

  if (typeof dialogImport !== 'function') {
    throw new Error('ha-full-calendar did not supply a dialog import');
  }

  await (dialogImport as () => Promise<unknown>)();
  await whenDefined(EVENT_EDITOR_DIALOG_TAG);
}

/**
 * Open Home Assistant's calendar panel, which has its own add button.
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
 * Open Home Assistant's create-event dialog with a calendar preselected.
 *
 * @param node - Element to dispatch from; must be inside Home Assistant's DOM
 * @param calendarId - Calendar to preselect in the dialog
 * @param onCreated - Called by the dialog once an event has been saved
 */
export async function openCreateEventDialog(
  node: HTMLElement,
  calendarId: string,
  onCreated: () => void,
): Promise<void> {
  try {
    await ensureEventEditorLoaded(calendarId);
  } catch (error) {
    Logger.warn('Could not load the event dialog, opening the calendar panel instead', error);
    navigateToCalendarPanel(node);
    return;
  }

  const event = new Event('show-dialog', { bubbles: true, composed: true });
  (event as Event & { detail?: unknown }).detail = {
    dialogTag: EVENT_EDITOR_DIALOG_TAG,
    dialogImport: () => whenDefined(EVENT_EDITOR_DIALOG_TAG),
    dialogParams: { calendarId, updated: onCreated },
  };
  node.dispatchEvent(event);
  Logger.debug(`Opened the event dialog for ${calendarId}`);
}
