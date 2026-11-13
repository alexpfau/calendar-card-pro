/**
 * Core's answers to the visibility conditions only it can judge (`src/utils/core-conditions.ts`).
 *
 * A fake connection stands in for Home Assistant's: it records every `subscribe_condition`, lets
 * a test push answers and errors, refuse the command as an older Home Assistant does, drop and
 * restore the connection, and counts unsubscribes. Pinned here: one subscription per question
 * however often it is asked; answers reported only when they change; an error read as `error`;
 * a refused command read as no answer, said once and asked again when the connection is back;
 * and unsubscribing only once a push since the connection last came back shows it is safe, as
 * `utils/live-calendars.ts` does for the same websocket library.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import { CoreConditions } from '../src/utils/core-conditions';
import * as Logger from '../src/utils/logger';

interface Subscription {
  readonly message: { type: string; condition: unknown };
  readonly push: (payload: unknown) => void;
  unsubscribed: number;
}

/** A connection that answers `subscribe_condition` as a test tells it to. */
function fakeConnection() {
  const subscriptions: Subscription[] = [];
  const ready: Array<() => void> = [];
  let refusal: string | undefined;
  const connection = {
    connected: true,
    subscribeEvents: vi.fn(),
    subscribeMessage: vi.fn(
      (push: (payload: unknown) => void, message: Subscription['message']) => {
        const subscription: Subscription = { message, push, unsubscribed: 0 };
        subscriptions.push(subscription);
        if (refusal) return Promise.reject({ code: refusal, message: 'refused' });
        return Promise.resolve(() => {
          subscription.unsubscribed += 1;
        });
      },
    ),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'ready') ready.push(listener);
    }),
  };
  return {
    connection,
    subscriptions,
    hass: { states: {}, connection } as unknown as Types.Hass,
    refuse: (code: string | undefined) => {
      refusal = code;
    },
    /** The connection drops and comes back, as Home Assistant restarting does. */
    reconnect: () => {
      for (const listener of ready) listener();
    },
  };
}

const TEMPLATE = { condition: 'template', value_template: '{{ true }}' };
const SUN = { condition: 'sun', after: 'sunset' };

const wanted = (...entries: Array<[string, object]>) =>
  new Map<string, Record<string, unknown>>(entries as Array<[string, Record<string, unknown>]>);

/** Lets the subscriptions' promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('asking', () => {
  it('asks each question once, however often it is wanted', async () => {
    const fake = fakeConnection();
    const watch = new CoreConditions(() => undefined);

    watch.sync(fake.hass, wanted(['t', TEMPLATE], ['s', SUN]));
    watch.sync(fake.hass, wanted(['t', TEMPLATE], ['s', SUN]));
    await settle();

    expect(fake.subscriptions.map(({ message }) => message)).toEqual([
      { type: 'subscribe_condition', condition: TEMPLATE },
      { type: 'subscribe_condition', condition: SUN },
    ]);
  });

  it('reports an answer only when it changes, and reads an error as one', async () => {
    const fake = fakeConnection();
    const changed = vi.fn();
    const watch = new CoreConditions(changed);
    vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

    watch.sync(fake.hass, wanted(['t', TEMPLATE]));
    await settle();
    expect(watch.answer('t')).toBeUndefined();

    const [template] = fake.subscriptions;
    template.push({ result: true });
    template.push({ result: true });
    expect([watch.answer('t'), changed.mock.calls.length]).toEqual([true, 1]);

    template.push({ result: false, template_errors: ['x is undefined'] });
    expect([watch.answer('t'), changed.mock.calls.length]).toEqual([false, 2]);

    template.push({ error: 'In state: unknown entity' });
    expect([watch.answer('t'), changed.mock.calls.length]).toEqual(['error', 3]);

    // A result that is no answer, as core sends for a condition its template switched off.
    template.push({ result: null });
    expect([watch.answer('t'), changed.mock.calls.length]).toEqual(['error', 3]);
  });

  it('reads a condition core cannot parse as an error, and says so', async () => {
    const fake = fakeConnection();
    const changed = vi.fn();
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    fake.refuse('invalid_format');

    new CoreConditions(changed).sync(fake.hass, wanted(['t', TEMPLATE]));
    await settle();

    expect(changed).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('asks nothing, and listens to nothing, for a card with no question', () => {
    const fake = fakeConnection();

    new CoreConditions(() => undefined).sync(fake.hass, wanted());

    expect(fake.connection.subscribeMessage).not.toHaveBeenCalled();
    expect(fake.connection.addEventListener).not.toHaveBeenCalled();
  });
});

describe('an older Home Assistant', () => {
  it.each(['unknown_command', 'unauthorized'])(
    'gives no answer for %s, says so once, and asks again when the connection is back',
    async (code) => {
      const fake = fakeConnection();
      const changed = vi.fn();
      const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      const watch = new CoreConditions(changed);
      fake.refuse(code);

      watch.sync(fake.hass, wanted(['t', TEMPLATE]));
      await settle();
      watch.sync(fake.hass, wanted(['t', TEMPLATE], ['s', SUN]));
      await settle();

      // Refused once; the second question is not even sent.
      expect(fake.subscriptions).toHaveLength(1);
      expect([watch.answer('t'), watch.answer('s')]).toEqual([undefined, undefined]);
      expect(changed).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain(code);

      // Upgraded meanwhile: the card is asked to sync, and asks both.
      fake.refuse(undefined);
      fake.reconnect();
      expect(changed).toHaveBeenCalledTimes(1);
      watch.sync(fake.hass, wanted(['t', TEMPLATE], ['s', SUN]));
      await settle();
      expect(fake.subscriptions).toHaveLength(3);
    },
  );
});

describe('unsubscribing', () => {
  it('unsubscribes a question no longer wanted once it has pushed', async () => {
    const fake = fakeConnection();
    const watch = new CoreConditions(() => undefined);

    watch.sync(fake.hass, wanted(['t', TEMPLATE], ['s', SUN]));
    await settle();
    fake.subscriptions[0].push({ result: true });
    watch.sync(fake.hass, wanted(['s', SUN]));
    await settle();

    expect(fake.subscriptions.map(({ unsubscribed }) => unsubscribed)).toEqual([1, 0]);
    expect(watch.answer('t')).toBeUndefined();
  });

  it('waits for the first push before unsubscribing, and forgets its answer at once', async () => {
    const fake = fakeConnection();
    const changed = vi.fn();
    const watch = new CoreConditions(changed);

    watch.sync(fake.hass, wanted(['t', TEMPLATE]));
    await settle();
    watch.sync(fake.hass, wanted());
    await settle();
    expect(fake.subscriptions[0].unsubscribed).toBe(0);

    fake.subscriptions[0].push({ result: true });
    await settle();
    expect(fake.subscriptions[0].unsubscribed).toBe(1);
    expect(changed).not.toHaveBeenCalled();
  });

  it('waits for a push after the connection came back, never sending one into the gap', async () => {
    const fake = fakeConnection();
    const watch = new CoreConditions(() => undefined);

    watch.sync(fake.hass, wanted(['t', TEMPLATE]));
    await settle();
    fake.subscriptions[0].push({ result: true });

    // Down: nothing is sent.
    fake.connection.connected = false;
    watch.sync(fake.hass, wanted());
    await settle();
    expect(fake.subscriptions[0].unsubscribed).toBe(0);

    // Back, but not yet resubscribed by the library: still nothing.
    fake.connection.connected = true;
    fake.reconnect();
    await settle();
    expect(fake.subscriptions[0].unsubscribed).toBe(0);

    // Resubscribed: core pushes, and the push carries the unsubscribe.
    fake.subscriptions[0].push({ result: true });
    await settle();
    expect(fake.subscriptions[0].unsubscribed).toBe(1);
  });

  it('closes everything on stop, and reports nothing after', async () => {
    const fake = fakeConnection();
    const changed = vi.fn();
    const watch = new CoreConditions(changed);

    watch.sync(fake.hass, wanted(['t', TEMPLATE], ['s', SUN]));
    await settle();
    fake.subscriptions[0].push({ result: true });
    changed.mockClear();
    watch.stop();
    fake.subscriptions[1].push({ result: true });
    await settle();

    expect(fake.subscriptions.map(({ unsubscribed }) => unsubscribed)).toEqual([1, 1]);
    expect(changed).not.toHaveBeenCalled();
    fake.reconnect();
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('the connection', () => {
  it('asks a question again once a connection that was down comes back', async () => {
    const fake = fakeConnection();
    const changed = vi.fn();
    const watch = new CoreConditions(changed);

    fake.connection.connected = false;
    watch.sync(fake.hass, wanted(['t', TEMPLATE]));
    await settle();
    expect(fake.subscriptions).toHaveLength(0);

    fake.connection.connected = true;
    fake.reconnect();
    expect(changed).toHaveBeenCalledTimes(1);
    watch.sync(fake.hass, wanted(['t', TEMPLATE]));
    expect(fake.subscriptions).toHaveLength(1);
  });

  it('asks everything again on a new connection, and closes the old', async () => {
    const first = fakeConnection();
    const second = fakeConnection();
    const watch = new CoreConditions(() => undefined);

    watch.sync(first.hass, wanted(['t', TEMPLATE]));
    await settle();
    first.subscriptions[0].push({ result: true });
    watch.sync(second.hass, wanted(['t', TEMPLATE]));
    await settle();

    expect(first.subscriptions[0].unsubscribed).toBe(1);
    expect(second.subscriptions).toHaveLength(1);
    expect(watch.answer('t')).toBeUndefined();
  });
});
