import { describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import {
  calendarSupports,
  createEvent,
  deleteEvent,
  updateEvent,
  writeErrorMessage,
} from '../src/interaction/calendar-writes';

/**
 * The three WebSocket commands the popover writes with, as Home Assistant's calendar panel
 * sends them: `calendar/event/create`, `update` and `delete`.
 */

const event = { summary: 'Swim', dtstart: '2026-11-03T16:00:00Z', dtend: '2026-11-03T17:00:00Z' };

function hass() {
  const callWS = vi.fn(async () => undefined);
  return { hass: { states: {}, callWS } as unknown as Types.Hass, callWS };
}

describe('the write commands', () => {
  it('creates an event in a calendar', async () => {
    const { hass: h, callWS } = hass();
    await createEvent(h, 'calendar.ben', event);
    expect(callWS).toHaveBeenCalledWith({
      type: 'calendar/event/create',
      entity_id: 'calendar.ben',
      event,
    });
  });

  it('updates a single event by its uid, and names no occurrence', async () => {
    const { hass: h, callWS } = hass();
    await updateEvent(h, { entityId: 'calendar.ben', uid: 'u1' }, event);
    expect(callWS).toHaveBeenCalledWith({
      type: 'calendar/event/update',
      entity_id: 'calendar.ben',
      uid: 'u1',
      event,
    });
  });

  it.each([
    ['only this occurrence', '', ''],
    ['this and all later ones', 'THISANDFUTURE', 'THISANDFUTURE'],
    ['no range given, read as this one', undefined, ''],
  ] as const)('updates and deletes %s of a repeating event', async (_name, range, sent) => {
    const { hass: h, callWS } = hass();
    const target = { entityId: 'calendar.ben', uid: 'u1', recurrenceId: '20261103T160000Z', range };
    await updateEvent(h, target, event);
    await deleteEvent(h, target);
    expect(callWS.mock.calls).toEqual([
      [
        {
          type: 'calendar/event/update',
          entity_id: 'calendar.ben',
          uid: 'u1',
          recurrence_id: '20261103T160000Z',
          recurrence_range: sent,
          event,
        },
      ],
      [
        {
          type: 'calendar/event/delete',
          entity_id: 'calendar.ben',
          uid: 'u1',
          recurrence_id: '20261103T160000Z',
          recurrence_range: sent,
        },
      ],
    ]);
  });

  it('deletes a single event by its uid', async () => {
    const { hass: h, callWS } = hass();
    await deleteEvent(h, { entityId: 'calendar.ben', uid: 'u1' });
    expect(callWS).toHaveBeenCalledWith({
      type: 'calendar/event/delete',
      entity_id: 'calendar.ben',
      uid: 'u1',
    });
  });

  it('rejects where Home Assistant offers no WebSocket, and passes its errors on', async () => {
    await expect(
      createEvent({ states: {} } as unknown as Types.Hass, 'calendar.ben', event),
    ).rejects.toThrow();
    const failing = {
      states: {},
      callWS: vi.fn(async () =>
        Promise.reject({ code: 'failed', message: 'Calendar is read-only' }),
      ),
    } as unknown as Types.Hass;
    await expect(
      deleteEvent(failing, { entityId: 'calendar.ben', uid: 'u1' }),
    ).rejects.toMatchObject({ message: 'Calendar is read-only' });
  });
});

describe('writeErrorMessage', () => {
  it.each([
    [{ code: 'failed', message: 'Calendar is read-only' }, 'Calendar is read-only'],
    [new Error('Network down'), 'Network down'],
    ['plain', 'plain'],
    [{ code: 'x' }, undefined],
    [null, undefined],
    ['', undefined],
  ])('reads %j as %j', (error, message) => {
    expect(writeErrorMessage(error)).toBe(message);
  });
});

describe('calendarSupports', () => {
  it('reads the feature bits a calendar advertises', () => {
    const h = {
      states: {
        'calendar.ben': {
          entity_id: 'calendar.ben',
          state: 'off',
          attributes: { supported_features: 5 },
        },
      },
    } as unknown as Types.Hass;
    expect([1, 2, 4].map((bit) => calendarSupports(h, 'calendar.ben', bit))).toEqual([
      true,
      false,
      true,
    ]);
    expect(calendarSupports(h, 'calendar.unknown', 1)).toBe(false);
    expect(calendarSupports(null, 'calendar.ben', 1)).toBe(false);
  });
});
