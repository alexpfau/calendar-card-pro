/**
 * Opening Home Assistant's own calendar dialogs from the card.
 *
 * The card never writes events itself. Adding, viewing, editing and deleting all happen in
 * the dialogs Home Assistant's calendar panel and calendar card open, so the forms, the
 * validation, recurrence and the service calls stay Home Assistant's. This module gets
 * those dialogs defined and opens them. What goes into them is decided in `add-event.ts`
 * and `event-details.ts`, which hold no side effects.
 */

import type { DetailEntry } from './event-details';
import * as Types from '../config/types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** Element name of Home Assistant's create/edit event dialog. */
export const EVENT_EDITOR_DIALOG_TAG = 'dialog-calendar-event-editor';

/** Element name of Home Assistant's event-detail dialog. */
export const EVENT_DETAIL_DIALOG_TAG = 'dialog-calendar-event-detail';

/** One of the two dialogs this module opens. */
export type DialogTag = typeof EVENT_EDITOR_DIALOG_TAG | typeof EVENT_DETAIL_DIALOG_TAG;

/** Home Assistant's `CalendarEntityFeature.CREATE_EVENT` bit. */
export const CREATE_EVENT_FEATURE = 1;

/** Home Assistant's `CalendarEntityFeature.DELETE_EVENT` bit. */
export const DELETE_EVENT_FEATURE = 2;

/** Home Assistant's `CalendarEntityFeature.UPDATE_EVENT` bit. */
export const UPDATE_EVENT_FEATURE = 4;

/** Home Assistant's element whose handlers know where each dialog's chunk lives. */
const FULL_CALENDAR_TAG = 'ha-full-calendar';

/** How long a dialog may take to load before the card gives up and falls back. */
export const LOAD_TIMEOUT_MS = 10000;

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/**
 * Called by Home Assistant's dialog once it has saved a change.
 *
 * 🚨 Typed to return `undefined` rather than `void` on purpose. Home Assistant ends every
 * save with `await this._params.updated(); this.closeDialog();`, so a callback that hands
 * back the card's refetch promise keeps the dialog open until every calendar has answered
 * — up to the fetch timeout — with the create dialog's Save button already enabled again,
 * which invites a duplicate event. `void` accepts an expression-bodied arrow that returns
 * that promise; `undefined` refuses to compile one.
 */
export type DialogUpdated = () => undefined;

/** Home Assistant's `CalendarEventEditDialogParams`, as the card fills it for a new event. */
export interface CreateDialogParams {
  /** Calendar preselected in the dialog's picker. */
  calendarId: string;
  /** Date the new event starts on; Home Assistant rounds it down to the hour. */
  selectedDate?: Date;
  updated: DialogUpdated;
}

/** Home Assistant's `CalendarEventDetailDialogParams`. */
export interface DetailDialogParams {
  calendarId: string;
  entry: DetailEntry;
  color?: string;
  canEdit: boolean;
  canDelete: boolean;
  updated: DialogUpdated;
}

interface ShowDialogDetail {
  dialogTag?: unknown;
  dialogImport?: unknown;
}

type Handler = (this: unknown, ...args: unknown[]) => unknown;

//-----------------------------------------------------------------------------
// FEATURES
//-----------------------------------------------------------------------------

/**
 * Whether a calendar advertises one of Home Assistant's calendar features.
 *
 * Read from the entity's `supported_features`, as Home Assistant's own calendar panel
 * does. A calendar that is not in the states supports nothing.
 *
 * @param hass - Home Assistant instance, or null before it arrives
 * @param entityId - Calendar entity id
 * @param feature - One of the feature bits above
 * @returns Whether the bit is set
 */
export function calendarSupports(
  hass: Types.Hass | null | undefined,
  entityId: string,
  feature: number,
): boolean {
  const features = Number(hass?.states?.[entityId]?.attributes?.supported_features ?? 0);
  return (features & feature) !== 0;
}

//-----------------------------------------------------------------------------
// LOADING
//-----------------------------------------------------------------------------

/**
 * How each dialog's import is borrowed from `ha-full-calendar`.
 *
 * Each handler is called against a stand-in that records the `show-dialog` event instead of
 * dispatching it, so nothing opens. Only the event's `dialogImport` is kept: the parameters
 * Home Assistant computed for the stand-in are discarded, and the card dispatches its own.
 * Both stand-ins carry exactly what the handler reads. `_createEvent` reads `_activeView`,
 * and touches `this.calendar` only for its day-grid views. `_handleEventClick` reads
 * `this.hass.states` and the clicked event's `extendedProps` and `backgroundColor`.
 */
const BORROWS: Record<
  DialogTag,
  {
    method: string;
    invoke(handler: Handler, dispatchEvent: (event: Event) => boolean, calendarId: string): void;
  }
> = {
  [EVENT_EDITOR_DIALOG_TAG]: {
    method: '_createEvent',
    invoke: (handler, dispatchEvent) => {
      handler.call({ _activeView: undefined, dispatchEvent }, undefined);
    },
  },
  [EVENT_DETAIL_DIALOG_TAG]: {
    method: '_handleEventClick',
    invoke: (handler, dispatchEvent, calendarId) => {
      handler.call(
        { hass: { states: {} }, dispatchEvent },
        { event: { extendedProps: { calendar: calendarId, eventData: {} }, backgroundColor: '' } },
      );
    },
  },
};

/**
 * Loads in flight, keyed by the element each one defines.
 *
 * Module state rather than card state, because every card on the page loads the same
 * elements: a second press, or a second card, joins the load already under way instead of
 * creating another core card and starting another import. An entry leaves the map once its
 * load settles either way, so a load that failed is tried afresh next time.
 */
const loads = new Map<string, Promise<void>>();

/**
 * The request waiting for its dialog to load, if any: the newest, whichever dialog it asks
 * for.
 *
 * One slot rather than one per dialog, because only one dialog should end up on screen. A
 * press on the add button followed, during the first load, by a tap on an event means the
 * event, and must not leave the create dialog opening behind it a moment later.
 */
let waiting: OpenRequest | undefined;

interface OpenRequest {
  node: HTMLElement;
  params: CreateDialogParams | DetailDialogParams;
  fallback(): void;
}

/**
 * Reject a promise that has not settled within the load timeout.
 *
 * @param promise - Promise to bound
 * @param what - What is loading, for the error
 * @returns The promise's own outcome, or a rejection after the timeout
 */
function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error(`${what} was not defined within ${LOAD_TIMEOUT_MS}ms`)),
      LOAD_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

/**
 * Define an element once, however many callers ask at the same time.
 *
 * @param tag - Element the load defines
 * @param load - Starts the load; called only when no load for the tag is under way
 * @returns Resolves once the element is defined
 */
function defineOnce(tag: string, load: () => Promise<void>): Promise<void> {
  if (customElements.get(tag)) return Promise.resolve();

  let pending = loads.get(tag);
  if (!pending) {
    pending = withTimeout(load(), tag).finally(() => loads.delete(tag));
    loads.set(tag, pending);
  }
  return pending;
}

/**
 * Make Home Assistant define `ha-full-calendar`, by creating a core calendar card.
 *
 * Creating the card makes Home Assistant import its module, which imports
 * `ha-full-calendar`. The card is never attached.
 *
 * @param calendarId - A calendar to give the core card, which refuses an empty list
 */
async function defineFullCalendar(calendarId: string): Promise<void> {
  const loadCardHelpers = (window as unknown as { loadCardHelpers?: unknown }).loadCardHelpers;
  if (typeof loadCardHelpers !== 'function') {
    throw new Error('window.loadCardHelpers is unavailable');
  }

  const helpers = (await loadCardHelpers()) as { createCardElement?: unknown } | undefined;
  if (typeof helpers?.createCardElement !== 'function') {
    throw new Error('Home Assistant card helpers have no createCardElement');
  }

  helpers.createCardElement({ type: 'calendar', entities: [calendarId] });
  await customElements.whenDefined(FULL_CALENDAR_TAG);
}

/**
 * Define one of Home Assistant's calendar dialogs by borrowing its import.
 *
 * The dialog lives in a lazily loaded chunk whose file name is a build hash, so a custom
 * card cannot import it. `ha-full-calendar` can: its handlers dispatch `show-dialog` with
 * a `dialogImport` function, and calling one against a stand-in captures that function
 * without opening anything. Running it defines the dialog.
 *
 * 🚨 This reaches into Home Assistant's frontend internals: two private methods and the
 * shape of their `show-dialog` event. Every step is checked and throws on a mismatch, and
 * the caller falls back rather than opening a broken dialog.
 *
 * @param tag - Dialog to define
 * @param calendarId - A calendar to give the core card
 */
async function borrowDialogImport(tag: DialogTag, calendarId: string): Promise<void> {
  await defineOnce(FULL_CALENDAR_TAG, () => defineFullCalendar(calendarId));

  const borrow = BORROWS[tag];
  const prototype = customElements.get(FULL_CALENDAR_TAG)?.prototype as
    Record<string, unknown> | undefined;
  const handler = prototype?.[borrow.method];
  if (typeof handler !== 'function') {
    throw new Error(`${FULL_CALENDAR_TAG} has no ${borrow.method} handler`);
  }

  let dialogImport: unknown;
  borrow.invoke(
    handler as Handler,
    (event: Event): boolean => {
      const detail = (event as Event & { detail?: ShowDialogDetail }).detail;
      if (detail?.dialogTag === tag) dialogImport = detail.dialogImport;
      return true;
    },
    calendarId,
  );

  if (typeof dialogImport !== 'function') {
    throw new Error(`${FULL_CALENDAR_TAG}.${borrow.method} did not supply an import for ${tag}`);
  }

  await (dialogImport as () => Promise<unknown>)();
  await customElements.whenDefined(tag);
}

/**
 * Make sure one of Home Assistant's calendar dialogs is defined.
 *
 * Immediate once anything in the session has opened the dialog. Otherwise the dialog is
 * borrowed, one load per dialog for the whole page, bounded by `LOAD_TIMEOUT_MS`.
 *
 * @param tag - Dialog to define
 * @param calendarId - A calendar to give the core card, if one has to be created
 * @returns Resolves once the dialog is defined; rejects when it cannot be loaded
 */
export function ensureDialogLoaded(tag: DialogTag, calendarId: string): Promise<void> {
  return defineOnce(tag, () => borrowDialogImport(tag, calendarId));
}

//-----------------------------------------------------------------------------
// OPENING
//-----------------------------------------------------------------------------

/**
 * Open a dialog once it is defined, or run the fallback when it cannot be loaded.
 *
 * Presses made while a dialog is still loading do not each open one once it arrives: the
 * newest request, for either dialog, replaces any older one still waiting, so only one
 * dialog opens, the newest, with the newest parameters.
 *
 * @param tag - Dialog to open
 * @param request - Where to dispatch, what to pass, and what to do on failure
 * @returns Resolves once the request has opened the dialog, fallen back, or been replaced
 */
async function openDialog(tag: DialogTag, request: OpenRequest): Promise<void> {
  waiting = request;

  let failure: unknown;
  let failed = false;
  try {
    await ensureDialogLoaded(tag, request.params.calendarId);
  } catch (error) {
    failed = true;
    failure = error;
  }

  if (waiting !== request) return;
  waiting = undefined;

  if (failed) {
    Logger.warn(`Could not load ${tag}, falling back`, failure);
    request.fallback();
    return;
  }

  const showDialog = new Event('show-dialog', { bubbles: true, composed: true });
  (showDialog as Event & { detail?: unknown }).detail = {
    dialogTag: tag,
    // Home Assistant's dialog manager imports a tag it has not shown before. The card
    // defined this one itself, so the import only has to confirm it.
    dialogImport: () => customElements.whenDefined(tag),
    dialogParams: request.params,
  };
  request.node.dispatchEvent(showDialog);
  Logger.debug(`Opened ${tag} for ${request.params.calendarId}`);
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
 * Open Home Assistant's more-info dialog for a calendar.
 *
 * Keeps the user on the dashboard, which matters on the wall tablets and kiosks this
 * card is often shown on, where the calendar panel may be out of reach.
 *
 * @param node - Element to dispatch from
 * @param entityId - Calendar to show
 */
function showMoreInfo(node: HTMLElement, entityId: string): void {
  node.dispatchEvent(
    new CustomEvent('hass-more-info', {
      bubbles: true,
      composed: true,
      detail: { entityId },
    }),
  );
}

/**
 * Open Home Assistant's create-event dialog.
 *
 * Falls back to the calendar panel when the dialog cannot be loaded.
 *
 * @param node - Element to dispatch from; must be inside Home Assistant's DOM
 * @param params - The dialog's parameters
 * @returns Resolves once the request has been dealt with
 */
export function openCreateEventDialog(
  node: HTMLElement,
  params: CreateDialogParams,
): Promise<void> {
  return openDialog(EVENT_EDITOR_DIALOG_TAG, {
    node,
    params,
    fallback: () => navigateToCalendarPanel(node),
  });
}

/**
 * Open Home Assistant's event-detail dialog.
 *
 * Falls back to the more-info dialog of the event's calendar when the dialog cannot be
 * loaded.
 *
 * @param node - Element to dispatch from; must be inside Home Assistant's DOM
 * @param params - The dialog's parameters
 * @returns Resolves once the request has been dealt with
 */
export function openEventDetailDialog(
  node: HTMLElement,
  params: DetailDialogParams,
): Promise<void> {
  return openDialog(EVENT_DETAIL_DIALOG_TAG, {
    node,
    params,
    fallback: () => showMoreInfo(node, params.calendarId),
  });
}
