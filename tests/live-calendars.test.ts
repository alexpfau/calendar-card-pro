/**
 * The live-update registry (`src/utils/live-calendars.ts`) on its own: the push format, the
 * fingerprint that decides whether a push says anything new, and the subscriptions' lifecycle
 * against a connection that answers as Home Assistant does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import * as Live from '../src/utils/live-calendars';

const WINDOW = { start: new Date('2026-06-17T00:00:00Z'), end: new Date('2026-06-18T00:00:00Z') };

interface FakeSub {
  message: { type: string; entity_id: string; start: string; end: string };
  callback: (message: unknown) => void;
  unsubscribed: boolean;
}

/**
 * A connection that answers `calendar/event/subscribe` the way `answer` says; `never` models the
 * websocket library that never sends, nor settles, a command made while the socket was down.
 */
function connection(answer: 'accept' | 'unknown_command' | 'not_found' | 'never' = 'accept') {
  const subs: FakeSub[] = [];
  const ready = new Set<() => void>();
  const conn = {
    connected: true,
    subscribeMessage: vi.fn((callback: (message: unknown) => void, message: FakeSub['message']) => {
      if (answer === 'never') return new Promise<() => void>(() => undefined);
      if (answer !== 'accept') return Promise.reject({ code: answer, message: answer });
      const sub: FakeSub = { message, callback, unsubscribed: false };
      subs.push(sub);
      return Promise.resolve(() => {
        sub.unsubscribed = true;
      });
    }),
    subscribeEvents: vi.fn(),
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'ready') ready.add(listener);
    },
  };
  const hass = {
    states: {},
    config: { time_zone: 'Europe/Berlin' },
    connection: conn,
  } as unknown as Types.Hass;
  return {
    hass,
    conn,
    subs,
    calendarSubscribes: () =>
      conn.subscribeMessage.mock.calls.filter(([, m]) => m.type === 'calendar/event/subscribe')
        .length,
    push: (entityId: string, events: unknown) => {
      for (const sub of subs) {
        if (!sub.unsubscribed && sub.message.entity_id === entityId) sub.callback({ events });
      }
    },
    reconnect: () => {
      for (const listener of ready) listener();
    },
  };
}

const SWIM = {
  start: '2026-06-17T11:00:00-04:00',
  end: '2026-06-17T12:00:00-04:00',
  summary: 'Anna swim',
  all_day: false,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-17T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the push format', () => {
  it("writes a pushed time the way the REST API does, in Home Assistant's zone", () => {
    // Summer and winter offsets of one zone, from an event written in another.
    expect(Live.inZone('2026-06-17T11:00:00-04:00', 'Europe/Berlin')).toBe(
      '2026-06-17T17:00:00+02:00',
    );
    expect(Live.inZone('2026-01-14T11:00:00-05:00', 'Europe/Berlin')).toBe(
      '2026-01-14T17:00:00+01:00',
    );
    expect(Live.inZone('2026-06-17T15:00:00Z', 'UTC')).toBe('2026-06-17T15:00:00+00:00');
    expect(Live.inZone('2026-06-17T15:00:00+00:00', 'Asia/Kolkata')).toBe(
      '2026-06-17T20:30:00+05:30',
    );
  });

  it('writes the hour a clock change skips or repeats with the offset in force then', () => {
    // Berlin goes from +01:00 to +02:00 at 01:00 UTC on 29 March 2026, and back on 25 October.
    expect(Live.inZone('2026-03-29T00:30:00Z', 'Europe/Berlin')).toBe('2026-03-29T01:30:00+01:00');
    expect(Live.inZone('2026-03-29T01:30:00Z', 'Europe/Berlin')).toBe('2026-03-29T03:30:00+02:00');
    expect(Live.inZone('2026-10-25T00:30:00Z', 'Europe/Berlin')).toBe('2026-10-25T02:30:00+02:00');
    expect(Live.inZone('2026-10-25T01:30:00Z', 'Europe/Berlin')).toBe('2026-10-25T02:30:00+01:00');
  });

  it('keeps a time it cannot convert as it was sent', () => {
    expect(Live.inZone('2026-06-17T11:00:00.250000-04:00', 'Europe/Berlin')).toBe(
      '2026-06-17T11:00:00.250000-04:00',
    );
    expect(Live.inZone('2026-06-17T11:00:00-04:00', 'Not/AZone')).toBe('2026-06-17T11:00:00-04:00');
    expect(Live.inZone('2026-06-17T11:00:00-04:00', undefined)).toBe('2026-06-17T11:00:00-04:00');
  });

  it('turns a pushed event into the REST shape', () => {
    expect(Live.normalizeEvent(SWIM, 'Europe/Berlin')).toEqual({
      summary: 'Anna swim',
      start: { dateTime: '2026-06-17T17:00:00+02:00' },
      end: { dateTime: '2026-06-17T18:00:00+02:00' },
    });
    expect(
      Live.normalizeEvent(
        { start: '2026-06-17', end: '2026-06-18', summary: 'Ben trip', all_day: true },
        'Europe/Berlin',
      ),
    ).toEqual({ summary: 'Ben trip', start: { date: '2026-06-17' }, end: { date: '2026-06-18' } });
    expect(Live.normalizeEvent({ summary: 'no times' }, 'Europe/Berlin')).toBeNull();
  });
});

describe('the fingerprint', () => {
  // As the REST API writes it, with null for every field the event does not have.
  const rest = {
    summary: 'Anna swim',
    start: { dateTime: '2026-06-17T17:00:00+02:00' },
    end: { dateTime: '2026-06-17T18:00:00+02:00' },
    description: null,
    location: null,
    uid: null,
  } as unknown as Types.CalendarEventData;

  it('is the same for a REST answer and a push of the same event', () => {
    const pushed = Live.normalizeEvent(SWIM, undefined)!;
    expect(pushed.start.dateTime).toBe('2026-06-17T11:00:00-04:00');
    expect(Live.fingerprintEvents([rest])).toBe(Live.fingerprintEvents([pushed]));
  });

  it("ignores order and the card's own fields, and counts duplicates", () => {
    const other = { ...rest, summary: 'Ben piano' };
    expect(Live.fingerprintEvents([rest, other])).toBe(
      Live.fingerprintEvents([{ ...other, _entityId: 'calendar.ben' }, rest]),
    );
    expect(Live.fingerprintEvents([rest, rest])).not.toBe(Live.fingerprintEvents([rest]));
  });

  it('changes with any field of an event', () => {
    const base = Live.fingerprintEvents([rest]);
    expect(Live.fingerprintEvents([{ ...rest, summary: 'Anna swim!' }])).not.toBe(base);
    expect(Live.fingerprintEvents([{ ...rest, location: 'Pool' }])).not.toBe(base);
    expect(
      Live.fingerprintEvents([{ ...rest, end: { dateTime: '2026-06-17T18:30:00+02:00' } }]),
    ).not.toBe(base);
    expect(Live.fingerprintEvents([{ ...rest, start: { date: '2026-06-17' } }])).not.toBe(base);
  });
});

describe('a subscription', () => {
  it('answers a load from its first push, and later loads at once', async () => {
    const c = connection();
    const first = Live.load(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    c.push('calendar.anna', [SWIM]);

    expect((await first)?.map((e) => e.summary)).toEqual(['Anna swim']);
    expect(await Live.load(c.hass, 'calendar.anna', WINDOW)).toHaveLength(1);
    expect(c.calendarSubscribes()).toBe(1);
  });

  it('tells its listeners of a change, not of the same events again', async () => {
    const c = connection();
    const told = vi.fn();
    Live.listen(c.hass, told);
    Live.hold(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(0);

    c.push('calendar.anna', [SWIM]);
    expect(told).toHaveBeenCalledTimes(1);
    const first = Live.peek(c.hass, 'calendar.anna', WINDOW)!.version;
    c.push('calendar.anna', [SWIM]);
    // Sent differently, the same events: nothing new.
    c.push('calendar.anna', [{ ...SWIM, start: '2026-06-17T15:00:00+00:00' }]);
    expect(told).toHaveBeenCalledTimes(1);

    c.push('calendar.anna', [{ ...SWIM, summary: 'Anna swim, lane 3' }]);
    expect(told).toHaveBeenCalledTimes(2);
    // Numbered page-wide, so no later subscription's change can reuse it.
    expect(Live.peek(c.hass, 'calendar.anna', WINDOW)!.version).toBe(first + 1);
    expect(Live.changeCount()).toBe(first + 1);
  });

  it('sends nothing to a load once Home Assistant could not read the calendar', async () => {
    const c = connection();
    Live.hold(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    c.push('calendar.anna', null);

    expect(Live.peek(c.hass, 'calendar.anna', WINDOW)?.state).toBe('failed');
    expect(await Live.load(c.hass, 'calendar.anna', WINDOW)).toBeUndefined();
    expect(Live.allLive(c.hass, ['calendar.anna'], WINDOW)).toBe(false);
  });

  it('waits no longer than its timeout for a first push', async () => {
    const c = connection();
    const pending = Live.load(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(Live.FIRST_PUSH_TIMEOUT);
    expect(await pending).toBeUndefined();
  });

  it('closes once nothing holds it, after the linger it was released with', async () => {
    const c = connection();
    const release = Live.hold(c.hass, 'calendar.anna', WINDOW)!;
    await vi.advanceTimersByTimeAsync(0);
    release(Live.DISCONNECT_LINGER);
    await vi.advanceTimersByTimeAsync(Live.DISCONNECT_LINGER - 1);
    expect(c.subs[0].unsubscribed).toBe(false);

    // Held again in time: the same subscription.
    const again = Live.hold(c.hass, 'calendar.anna', WINDOW)!;
    await vi.advanceTimersByTimeAsync(Live.DISCONNECT_LINGER);
    expect(c.subs[0].unsubscribed).toBe(false);

    again(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.subs[0].unsubscribed).toBe(true);
    expect(c.calendarSubscribes()).toBe(1);
  });

  it('is closed by invalidate, in every window, and its listeners are told', async () => {
    const c = connection();
    const told = vi.fn();
    Live.listen(c.hass, told);
    const later = { start: WINDOW.end, end: new Date('2026-06-19T00:00:00Z') };
    Live.hold(c.hass, 'calendar.anna', WINDOW);
    Live.hold(c.hass, 'calendar.anna', later);
    Live.hold(c.hass, 'calendar.ben', WINDOW);
    await vi.advanceTimersByTimeAsync(0);

    Live.invalidate(c.hass, ['calendar.anna']);
    await vi.advanceTimersByTimeAsync(0);

    expect(c.subs.map((s) => s.unsubscribed)).toEqual([true, true, false]);
    expect(told).toHaveBeenCalledWith('calendar.anna');
    expect(Live.peek(c.hass, 'calendar.anna', WINDOW)).toBeUndefined();
  });
});

describe('Home Assistant before 2026.5', () => {
  it('is asked once per connection, however many calendars subscribe at once', async () => {
    const c = connection('unknown_command');
    const loads = ['calendar.anna', 'calendar.ben', 'calendar.leo'].map((id) =>
      Live.load(c.hass, id, WINDOW),
    );
    expect(await Promise.all(loads)).toEqual([undefined, undefined, undefined]);
    expect(c.calendarSubscribes()).toBe(1);

    expect(Live.hold(c.hass, 'calendar.anna', WINDOW)).toBeNull();
    expect(c.calendarSubscribes()).toBe(1);
  });

  it('is asked again after a while, and after the connection comes back', async () => {
    const c = connection('unknown_command');
    await Live.load(c.hass, 'calendar.anna', WINDOW);
    expect(Live.hold(c.hass, 'calendar.anna', WINDOW)).toBeNull();

    await vi.advanceTimersByTimeAsync(Live.PROBE_AGAIN_AFTER);
    await Live.load(c.hass, 'calendar.anna', WINDOW);
    expect(c.calendarSubscribes()).toBe(2);

    // Upgraded, or restarted with the integration loaded: asked at once.
    c.reconnect();
    expect(Live.hold(c.hass, 'calendar.anna', WINDOW)).not.toBeNull();
    expect(c.calendarSubscribes()).toBe(3);
  });
});

describe('a refused subscription', () => {
  it('is not sent again by a hold, and is by the next lease', async () => {
    const c = connection('not_found');
    expect(await Live.load(c.hass, 'calendar.gone', WINDOW)).toBeUndefined();
    expect(Live.peek(c.hass, 'calendar.gone', WINDOW)?.state).toBe('refused');

    Live.hold(c.hass, 'calendar.gone', WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.calendarSubscribes()).toBe(1);

    Live.lease(c.hass, ['calendar.gone'], WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.calendarSubscribes()).toBe(2);
  });
});

describe('a reconnect', () => {
  it('keeps a subscription that pushes again, the same events included', async () => {
    const c = connection();
    const told = vi.fn();
    Live.listen(c.hass, told);
    Live.hold(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    c.push('calendar.anna', [SWIM]);

    c.reconnect();
    expect(Live.peek(c.hass, 'calendar.anna', WINDOW)?.reconnecting).toBe(true);
    // Counted as live while it has time to push, so polling does not start at once.
    expect(Live.allLive(c.hass, ['calendar.anna'], WINDOW)).toBe(true);

    c.push('calendar.anna', [SWIM]);
    await vi.advanceTimersByTimeAsync(Live.RECONNECT_TIMEOUT);

    expect(Live.peek(c.hass, 'calendar.anna', WINDOW)?.reconnecting).toBe(false);
    expect(c.subs[0].unsubscribed).toBe(false);
    // Told of the reconnect, not of the same events again.
    expect(told.mock.calls).toEqual([['calendar.anna'], ['*']]);
  });

  it('closes a subscription that stays silent after it, and tells its listeners', async () => {
    const c = connection();
    const told = vi.fn();
    Live.listen(c.hass, told);
    Live.hold(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    c.push('calendar.anna', [SWIM]);

    c.reconnect();
    const load = Live.load(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(Live.RECONNECT_TIMEOUT);

    // Its events may be from before the connection dropped: not used.
    expect(await load).toBeUndefined();
    expect(c.subs[0].unsubscribed).toBe(true);
    expect(Live.peek(c.hass, 'calendar.anna', WINDOW)).toBeUndefined();
    expect(told).toHaveBeenLastCalledWith('calendar.anna');
  });
});

describe('a subscription Home Assistant does not answer', () => {
  it('counts as refused after a short while, and does not hold back the next', async () => {
    const c = connection('never');
    const first = Live.load(c.hass, 'calendar.anna', WINDOW);
    const second = Live.load(c.hass, 'calendar.ben', WINDOW);
    await vi.advanceTimersByTimeAsync(Live.ANSWER_TIMEOUT);
    expect(await first).toBeUndefined();
    // The probe went unanswered, so the other is sent once it timed out, and times out itself.
    expect(c.calendarSubscribes()).toBe(2);

    await vi.advanceTimersByTimeAsync(Live.ANSWER_TIMEOUT);
    expect(await second).toBeUndefined();
  });
});

describe('a connection that is down', () => {
  it('opens no subscription, and keeps those it has', async () => {
    const c = connection();
    Live.hold(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    c.push('calendar.anna', [SWIM]);

    c.conn.connected = false;
    expect(Live.hold(c.hass, 'calendar.ben', WINDOW)).toBeNull();
    expect(await Live.load(c.hass, 'calendar.ben', WINDOW)).toBeUndefined();
    expect(Live.hold(c.hass, 'calendar.anna', WINDOW)).not.toBeNull();
    expect(c.calendarSubscribes()).toBe(1);

    // Back: its listeners are told, to subscribe what they could not.
    const told = vi.fn();
    Live.listen(c.hass, told);
    c.conn.connected = true;
    c.reconnect();
    expect(told).toHaveBeenCalledWith('*');
  });
});

describe('a load during a second reconnect', () => {
  it('does not take events from before the connection dropped', async () => {
    // The second reconnect moves the close later than the load waits.
    const c = connection();
    Live.hold(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    c.push('calendar.anna', [SWIM]);

    c.reconnect();
    await vi.advanceTimersByTimeAsync(5_000);
    const load = Live.load(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(15_000);
    c.reconnect();
    await vi.advanceTimersByTimeAsync(Live.FIRST_PUSH_TIMEOUT);

    expect(await load).toBeUndefined();
  });
});

describe('a first push with no events', () => {
  it('has a number no other subscription of the calendar had', async () => {
    const c = connection();
    const release = Live.hold(c.hass, 'calendar.anna', WINDOW)!;
    await vi.advanceTimersByTimeAsync(0);
    c.push('calendar.anna', []);
    const first = Live.peek(c.hass, 'calendar.anna', WINDOW)!.version;
    release(0);

    Live.hold(c.hass, 'calendar.anna', WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    c.push('calendar.anna', []);

    expect(Live.peek(c.hass, 'calendar.anna', WINDOW)!.version).toBeGreaterThan(first);
  });
});
