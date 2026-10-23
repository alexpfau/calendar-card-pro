import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import { EVENT_DETAIL_DIALOG_TAG, openEventDetailDialog } from '../src/interaction/event-details';

/**
 * How the card gets Home Assistant's event-detail dialog defined before opening it.
 *
 * 🚨 These tests run in order and share one custom-element registry, deliberately. A
 * defined element cannot be undefined again, so the file walks the one direction a real
 * session takes: nothing loaded, Home Assistant's calendar element loaded, the dialog
 * loaded. Each test states the registry it expects to start from.
 */

/** Stands in for Home Assistant's `ha-full-calendar`; its handler is set per test. */
class FakeFullCalendar extends HTMLElement {}

const event: Types.CalendarEventData = {
  summary: 'Dentist',
  start: { dateTime: '2026-06-17T14:00:00Z' },
  end: { dateTime: '2026-06-17T15:00:00Z' },
  uid: 'uid-dentist',
  _entityId: 'calendar.anna',
};

const hass = { states: {} } as unknown as Types.Hass;

type HelperWindow = Window & { loadCardHelpers?: () => Promise<unknown> };

function host() {
  const node = document.createElement('div');
  document.body.appendChild(node);
  const dispatched: { type: string; detail: unknown }[] = [];
  for (const type of ['show-dialog', 'location-changed']) {
    node.addEventListener(type, (ev) =>
      dispatched.push({ type, detail: (ev as Event & { detail?: unknown }).detail }),
    );
  }
  return { node, dispatched };
}

afterEach(() => {
  delete (window as HelperWindow).loadCardHelpers;
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('loading the event-detail dialog', () => {
  it('opens the calendar panel when card helpers are unavailable', async () => {
    expect(customElements.get('ha-full-calendar')).toBeUndefined();
    const { node, dispatched } = host();

    await openEventDetailDialog(node, hass, event, undefined, () => {});

    expect(dispatched.map((d) => d.type)).toEqual(['location-changed']);
    expect(window.location.pathname).toBe('/calendar');
  });

  it("opens the calendar panel when Home Assistant's calendar has no click handler", async () => {
    const createCardElement = vi.fn(() => {
      customElements.define('ha-full-calendar', FakeFullCalendar);
      return document.createElement('div');
    });
    (window as HelperWindow).loadCardHelpers = async () => ({ createCardElement });
    const { node, dispatched } = host();

    await openEventDetailDialog(node, hass, event, undefined, () => {});

    // A core calendar card for the tapped calendar is what makes Home Assistant load it.
    expect(createCardElement).toHaveBeenCalledWith({
      type: 'calendar',
      entities: ['calendar.anna'],
    });
    expect(dispatched.map((d) => d.type)).toEqual(['location-changed']);
  });

  it("borrows Home Assistant's own dialog import, without opening anything", async () => {
    expect(customElements.get('ha-full-calendar')).toBe(FakeFullCalendar);
    const dialogImport = vi.fn(async () => {
      customElements.define(EVENT_DETAIL_DIALOG_TAG, class extends HTMLElement {});
    });
    const handler = vi.fn(function (
      this: { dispatchEvent(ev: Event): boolean },
      _info: { event: { extendedProps: { calendar: string } } },
    ) {
      this.dispatchEvent(
        Object.assign(new Event('show-dialog'), {
          detail: { dialogTag: EVENT_DETAIL_DIALOG_TAG, dialogImport, dialogParams: {} },
        }),
      );
    });
    Object.assign(FakeFullCalendar.prototype, { _handleEventClick: handler });
    const { node, dispatched } = host();

    await openEventDetailDialog(node, hass, event, '#ff0000', () => {});

    expect(handler.mock.calls[0][0].event.extendedProps.calendar).toBe('calendar.anna');
    expect(dialogImport).toHaveBeenCalledOnce();
    // Only the card's own dialog reaches the page; the borrowed one went to a stand-in.
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      type: 'show-dialog',
      detail: {
        dialogTag: EVENT_DETAIL_DIALOG_TAG,
        dialogParams: { calendarId: 'calendar.anna', color: '#ff0000' },
      },
    });
  });

  it('opens the dialog straight away once it is defined', async () => {
    expect(customElements.get(EVENT_DETAIL_DIALOG_TAG)).toBeDefined();
    const loadCardHelpers = vi.fn();
    (window as HelperWindow).loadCardHelpers = loadCardHelpers;
    const handler = vi.fn();
    Object.assign(FakeFullCalendar.prototype, { _handleEventClick: handler });
    const { node, dispatched } = host();

    await openEventDetailDialog(node, hass, event, undefined, () => {});

    expect(loadCardHelpers).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(dispatched.map((d) => d.type)).toEqual(['show-dialog']);
  });
});
