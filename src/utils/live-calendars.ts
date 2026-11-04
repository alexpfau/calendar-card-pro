/**
 * Live calendar updates through Home Assistant's `calendar/event/subscribe` (Home Assistant
 * 2026.5 and later).
 *
 * Home Assistant pushes a calendar's events for a date range once on subscribing, and again,
 * debounced, every time the calendar entity writes its state: on a sync, an edit, or an event
 * starting or ending. One subscription per calendar and range is shared by every card and
 * request on the page, reference counted, so a dashboard of cards showing the same days asks
 * once, and Home Assistant reads each range once per change for all of them.
 *
 * Nothing here writes the cache or draws. A load asks `load` before it asks the REST API, and a
 * card told of a change (`listen`) runs an ordinary load, which this module then answers without
 * a request. So every path to the screen stays the one the card already guards: one request at
 * a time per card, superseded ones discarded, failures and the cache handled as for REST.
 *
 * Module state, one registry per Home Assistant connection.
 */

import * as Logger from './logger';
import * as Constants from '../config/constants';
import * as Types from '../config/types';

/**
 * Where a subscription stands.
 *
 * - `pending` — sent, no push yet.
 * - `live` — its last push carried events; they are current.
 * - `failed` — its last push was `null`: the calendar's integration could not read the events.
 * - `refused` — Home Assistant answered the subscription with an error (the calendar is not
 *   loaded, or the user may not read it). Not sent again while held; a load tries again.
 */
export type LiveState = 'pending' | 'live' | 'failed' | 'refused';

/**
 * What a load waits for a new subscription's first push before asking REST instead: as long as
 * it would wait for REST. Home Assistant reads the calendar for the push as it would for REST, so
 * a slow calendar is no faster by REST, and giving up sooner would read it twice.
 */
export const FIRST_PUSH_TIMEOUT = Constants.TIMING.CALENDAR_FETCH_TIMEOUT;

/**
 * How long Home Assistant may take to answer a subscription before it counts as refused. The
 * websocket library Home Assistant shipped up to 2026.10 never sends a command made while the
 * connection is down, nor reports an error to one it sends again after, so an unanswered
 * subscription could otherwise hold every load for `FIRST_PUSH_TIMEOUT`.
 */
export const ANSWER_TIMEOUT = 5_000;

/**
 * How long a subscription may stay silent after its calendar's state changed before it counts as
 * lost. Home Assistant pushes after every state write, but a subscription stays bound to the
 * entity it was made for, and reloading the calendar's integration (its Reload button, an options
 * change, signing in to the calendar again) replaces that entity without a word.
 */
export const STATE_PUSH_TIMEOUT = 30_000;

/**
 * How long before a state change a push may come and still count as the push for it, and how
 * recently the card must have seen the calendar's state for a change to be timed at all.
 */
const STATE_PUSH_GRACE = 5_000;

/**
 * How long after Home Assistant answered `unknown_command` the next load asks again. The command
 * is also unknown while the calendar integration is still loading, at a restart.
 */
export const PROBE_AGAIN_AFTER = 30 * 60_000;

/** How long a subscription a request opened stays open after it, for the card to take over. */
export const REQUEST_LINGER = 5_000;

/**
 * How long a subscription stays open after the card holding it left the page: a dashboard view
 * switched away and back, or the editor building a new card for each edit, costs nothing within
 * it.
 */
export const DISCONNECT_LINGER = 60_000;

/**
 * How long, after the connection to Home Assistant came back, a subscription may stay silent
 * before it is taken for lost. The websocket library subscribes again by itself, and Home
 * Assistant answers each with a push; but a subscription that fails then fails silently, as
 * after a restart before the calendar has loaded, and would otherwise read as live for good.
 */
export const RECONNECT_TIMEOUT = 30_000;

type Connection = NonNullable<Types.Hass['connection']>;

interface Subscription {
  readonly key: string;
  readonly entityId: string;
  state: LiveState;
  /** The last push's events, in the REST API's shape. */
  events: Types.CalendarEventData[];
  /** `fingerprintEvents` of `events`. */
  fingerprint: string;
  /** The page-wide `sequence` of its events' last change (`changeCount`). */
  version: number;
  /** The last push as sent, to drop an identical one before any work. */
  raw: string | undefined;
  refs: number;
  closed: boolean;
  /** When it last pushed, and its calendar's state as last seen, and when (`observeStates`). */
  pushedAt: number;
  seenState: unknown;
  seenAt: number;
  /** Set while a state change waits for its push. */
  stateTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Set when the connection came back, until it pushes again: its events may be from before the
   * connection dropped, so a load waits for its next push rather than using them.
   */
  reconnecting: boolean;
  closeTimer: ReturnType<typeof setTimeout> | undefined;
  silenceTimer: ReturnType<typeof setTimeout> | undefined;
  /** Told once, on the next push or when the subscription is refused or closed. */
  waiters: Set<() => void>;
  /** Resolves to the unsubscribe function, or null where none was made. */
  unsubscribe: Promise<(() => void) | null>;
}

interface Registry {
  connection: Connection;
  /** Whether Home Assistant knows the command: `unknown` until the first answer. */
  support: 'unknown' | 'yes' | 'no';
  /** When it last answered `unknown_command`. */
  unsupportedAt: number;
  /** The first subscription while support is unknown; every other waits for it. */
  probe: Promise<void> | null;
  subscriptions: Map<string, Subscription>;
  listeners: Set<(entityId: string) => void>;
}

const registries = new WeakMap<Connection, Registry>();

/** Counts changes to any subscription's events on the page, so every change has its own number. */
let sequence = 0;

/**
 * The number of the latest change to any subscription's events on the page. A request started
 * before a change may have read the events from before it.
 *
 * @returns Changes so far
 */
export function changeCount(): number {
  return sequence;
}

interface LivePush {
  events?: unknown;
}

/**
 * The subscribable connection of a `hass`, or null where there is none.
 *
 * @param hass Home Assistant instance
 * @returns The connection
 */
function connectionOf(hass: Types.Hass | undefined): Connection | null {
  const connection = hass?.connection;
  return connection && typeof connection.subscribeMessage === 'function' ? connection : null;
}

/**
 * The registry of a connection, made on first use.
 *
 * @param connection Home Assistant connection
 * @returns Its registry
 */
function registryOf(connection: Connection): Registry {
  let registry = registries.get(connection);
  if (registry) return registry;

  const created: Registry = {
    connection,
    support: 'unknown',
    unsupportedAt: 0,
    probe: null,
    subscriptions: new Map(),
    listeners: new Set(),
  };
  registry = created;
  registries.set(connection, created);
  connection.addEventListener?.('ready', () => {
    // Home Assistant may have been upgraded, or restarted with the integration loaded since:
    // what it refused is asked again, by the cards holding it. Every card is told, so one that
    // could not subscribe while the connection was down subscribes now.
    if (created.support === 'no') created.support = 'unknown';
    notify(created, '*');
    for (const subscription of [...created.subscriptions.values()]) {
      if (subscription.state === 'refused') {
        close(created, subscription);
        notify(created, subscription.entityId);
        continue;
      }
      subscription.reconnecting = true;
      // One timer per subscription, cleared by its next push, so an earlier reconnect's
      // timer can never close it.
      clearTimeout(subscription.silenceTimer);
      subscription.silenceTimer = setTimeout(() => {
        Logger.warn(`No live update for ${subscription.entityId} since reconnecting`);
        close(created, subscription);
        notify(created, subscription.entityId);
      }, RECONNECT_TIMEOUT);
    }
  });
  return created;
}

/**
 * The key of a calendar's subscription for a window.
 *
 * @param entityId Calendar entity id
 * @param window The window, as the request asks for it
 * @returns The key
 */
function keyOf(entityId: string, window: { start: Date; end: Date }): string {
  return `${entityId}|${window.start.toISOString()}|${window.end.toISOString()}`;
}

/**
 * Tell every listener of a registry that a calendar's live state or events changed.
 *
 * @param registry The registry
 * @param entityId The calendar
 */
function notify(registry: Registry, entityId: string): void {
  for (const listener of [...registry.listeners]) listener(entityId);
}

/**
 * Wake whatever waits for a subscription's next step.
 *
 * @param subscription The subscription
 */
function wake(subscription: Subscription): void {
  const waiters = [...subscription.waiters];
  subscription.waiters.clear();
  for (const waiter of waiters) waiter();
}

/**
 * Close a subscription: unsubscribe, and forget it.
 *
 * @param registry Its registry
 * @param subscription The subscription
 */
function close(registry: Registry, subscription: Subscription): void {
  if (subscription.closed) return;
  subscription.closed = true;
  clearTimeout(subscription.closeTimer);
  clearTimeout(subscription.silenceTimer);
  clearTimeout(subscription.stateTimer);
  if (registry.subscriptions.get(subscription.key) === subscription) {
    registry.subscriptions.delete(subscription.key);
  }
  // The websocket library Home Assistant shipped up to 2026.10 sends an unsubscribe made while
  // the connection is down nowhere, keeps one the connection dropped before it was answered, and
  // subscribes both again once it is back; and one made after a reconnect, before the
  // subscription pushed, goes out with the id it had on the old connection, which by then names
  // some other subscription. So it waits for a push, which shows the library holds its current
  // id, and any push of a closed subscription unsubscribes it again (`receive`).
  if (registry.connection.connected !== false && !subscription.reconnecting) {
    void subscription.unsubscribe.then((unsubscribe) => unsubscribe?.());
  }
  wake(subscription);
}

/**
 * Record Home Assistant's answer to a subscription it refused.
 *
 * @param registry Its registry
 * @param subscription The subscription
 */
function refuse(registry: Registry, subscription: Subscription): void {
  if (subscription.closed) return;
  subscription.state = 'refused';
  wake(subscription);
  notify(registry, subscription.entityId);
}

/**
 * Take in a push: any push proves the subscription alive, before anything else is compared.
 *
 * @param registry Its registry
 * @param subscription The subscription
 * @param message The push
 * @param timeZone Home Assistant's time zone, for the event times
 */
function receive(
  registry: Registry,
  subscription: Subscription,
  message: LivePush | undefined,
  timeZone: string | undefined,
): void {
  if (subscription.closed) {
    // In a task of its own: after a reconnect the library takes the new id only once the answer
    // it is still processing has been handled.
    setTimeout(() => void subscription.unsubscribe.then((unsubscribe) => unsubscribe?.()), 0);
    return;
  }
  clearTimeout(subscription.silenceTimer);
  subscription.silenceTimer = undefined;
  subscription.reconnecting = false;
  clearTimeout(subscription.stateTimer);
  subscription.stateTimer = undefined;
  subscription.pushedAt = Date.now();

  const events = message?.events;
  let changed = false;
  if (!Array.isArray(events)) {
    changed = subscription.state !== 'failed';
    subscription.state = 'failed';
    subscription.raw = undefined;
  } else {
    const raw = JSON.stringify(events);
    if (subscription.state !== 'live' || raw !== subscription.raw) {
      const normalized = events.flatMap((event) => normalizeEvent(event, timeZone) ?? []);
      const fingerprint = fingerprintEvents(normalized);
      changed = subscription.state !== 'live' || fingerprint !== subscription.fingerprint;
      // Numbered whenever it becomes live, too: a new subscription's first push, empty or not,
      // never shares a number with any other's.
      if (changed) subscription.version = ++sequence;
      subscription.state = 'live';
      subscription.raw = raw;
      subscription.events = normalized;
      subscription.fingerprint = fingerprint;
    }
  }

  wake(subscription);
  if (changed) notify(registry, subscription.entityId);
}

/**
 * Send a subscription, after the probe where support is not known yet.
 *
 * @param registry Its registry
 * @param connection The connection
 * @param subscription The subscription
 * @param window The window it is for
 * @param timeZone Home Assistant's time zone
 */
function open(
  registry: Registry,
  connection: Connection,
  subscription: Subscription,
  window: { start: Date; end: Date },
  timeZone: string | undefined,
): void {
  let probed: (() => void) | undefined;
  const send = (): Promise<(() => void) | null> => {
    if (subscription.closed) return Promise.resolve(null);
    if (registry.support === 'no' || connection.connected === false) {
      refuse(registry, subscription);
      probed?.();
      return Promise.resolve(null);
    }
    const unanswered = setTimeout(() => {
      if (subscription.state === 'pending') {
        Logger.warn(`No answer to the live subscription for ${subscription.entityId}`);
        refuse(registry, subscription);
      }
      probed?.();
    }, ANSWER_TIMEOUT);
    return connection
      .subscribeMessage<LivePush>((message) => receive(registry, subscription, message, timeZone), {
        type: 'calendar/event/subscribe',
        entity_id: subscription.entityId,
        start: window.start.toISOString(),
        end: window.end.toISOString(),
      })
      .then(
        (unsubscribe) => {
          registry.support = 'yes';
          const safe = (): void => {
            void Promise.resolve()
              .then(unsubscribe)
              .catch(() => undefined);
          };
          if (subscription.closed) {
            safe();
            return null;
          }
          return safe;
        },
        (error: { code?: unknown } | undefined) => {
          const code = typeof error?.code === 'string' ? error.code : undefined;
          if (code === 'unknown_command') {
            registry.support = 'no';
            registry.unsupportedAt = Date.now();
            Logger.info('Home Assistant cannot push calendar changes; polling instead');
          } else if (code) {
            registry.support = 'yes';
            Logger.warn(`Live updates refused for ${subscription.entityId}: ${code}`);
          }
          refuse(registry, subscription);
          return null;
        },
      )
      .finally(() => {
        // After the answer is recorded, so what waits on the probe reads it.
        clearTimeout(unanswered);
        probed?.();
      });
  };

  if (registry.support !== 'unknown') {
    subscription.unsubscribe = send();
  } else if (registry.probe) {
    subscription.unsubscribe = registry.probe.then(send);
  } else {
    // The probe: every other subscription waits until it is answered, or counts as unanswered.
    const gate = new Promise<void>((resolve) => {
      probed = () => {
        if (registry.probe === gate) registry.probe = null;
        resolve();
      };
    });
    registry.probe = gate;
    subscription.unsubscribe = send();
  }
}

/**
 * Hold a subscription, opening it where none is open or the last was closed.
 *
 * @param hass Home Assistant instance
 * @param entityId Calendar entity id
 * @param window The window, as the request asks for it
 * @returns The subscription and its release, or null where Home Assistant cannot push
 */
function acquire(
  hass: Types.Hass,
  entityId: string,
  window: { start: Date; end: Date },
): { subscription: Subscription; release: (linger: number) => void } | null {
  const connection = connectionOf(hass);
  if (!connection) return null;
  const registry = registryOf(connection);
  if (registry.support === 'no' && Date.now() - registry.unsupportedAt >= PROBE_AGAIN_AFTER) {
    registry.support = 'unknown';
  }
  if (registry.support === 'no') return null;

  const key = keyOf(entityId, window);
  let subscription = registry.subscriptions.get(key);
  if (!subscription) {
    // Never sent while the connection is down: it would not be sent once it is back either.
    if (connection.connected === false) return null;
    subscription = {
      key,
      entityId,
      state: 'pending',
      events: [],
      fingerprint: '',
      version: 0,
      raw: undefined,
      refs: 0,
      closed: false,
      pushedAt: 0,
      seenState: undefined,
      seenAt: 0,
      stateTimer: undefined,
      reconnecting: false,
      closeTimer: undefined,
      silenceTimer: undefined,
      waiters: new Set(),
      unsubscribe: Promise.resolve(null),
    };
    registry.subscriptions.set(key, subscription);
    open(registry, connection, subscription, window, hass.config?.time_zone);
  }

  const held = subscription;
  held.refs += 1;
  clearTimeout(held.closeTimer);
  held.closeTimer = undefined;

  let released = false;
  return {
    subscription: held,
    release: (linger) => {
      if (released) return;
      released = true;
      held.refs -= 1;
      if (held.refs > 0 || held.closed) return;
      if (linger <= 0) close(registry, held);
      else held.closeTimer = setTimeout(() => close(registry, held), linger);
    },
  };
}

/**
 * Hold a calendar's subscription for a window, for as long as a card shows it.
 *
 * Holding a subscription Home Assistant refused does not send it again; a load does.
 *
 * @param hass Home Assistant instance
 * @param entityId Calendar entity id
 * @param window The window, as the request asks for it
 * @returns Its release, taking how long to keep it open once nothing holds it; null where Home
 *   Assistant cannot push
 */
export function hold(
  hass: Types.Hass,
  entityId: string,
  window: { start: Date; end: Date },
): ((linger: number) => void) | null {
  return acquire(hass, entityId, window)?.release ?? null;
}

/**
 * A calendar's events from its subscription, in the REST API's shape, for a load to use in
 * place of a request.
 *
 * Answers at once while the subscription is live, and waits for the first push of a new one, or
 * the next push of one the connection dropped, up to `FIRST_PUSH_TIMEOUT`. A request leases its
 * calendars first (`lease`), which sends a refused subscription again.
 *
 * @param hass Home Assistant instance
 * @param entityId Calendar entity id
 * @param window The window, as the request asks for it
 * @returns The events, or undefined where they must be asked for by REST: Home Assistant cannot
 *   push, refused, failed to read the calendar, or did not answer in time
 */
export async function load(
  hass: Types.Hass,
  entityId: string,
  window: { start: Date; end: Date },
): Promise<Types.CalendarEventData[] | undefined> {
  const held = acquire(hass, entityId, window);
  if (!held) return undefined;
  const { subscription, release } = held;
  try {
    if (subscription.state === 'pending' || subscription.reconnecting) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, FIRST_PUSH_TIMEOUT);
        function done(): void {
          clearTimeout(timer);
          subscription.waiters.delete(done);
          resolve();
        }
        subscription.waiters.add(done);
      });
    }
    // Still silent after a reconnect, its events may be from before the connection dropped.
    return subscription.state === 'live' && !subscription.closed && !subscription.reconnecting
      ? subscription.events
      : undefined;
  } finally {
    release(REQUEST_LINGER);
  }
}

/**
 * Hold the subscriptions of a request's calendars for as long as it lasts, sending again any
 * Home Assistant refused.
 *
 * @param hass Home Assistant instance
 * @param entityIds The request's calendars
 * @param window Its window
 * @returns Releases them all, or null where Home Assistant cannot push
 */
export function lease(
  hass: Types.Hass,
  entityIds: readonly string[],
  window: { start: Date; end: Date },
): ((linger: number) => void) | null {
  const connection = connectionOf(hass);
  if (!connection) return null;
  const registry = registryOf(connection);
  for (const entityId of entityIds) {
    const refused = registry.subscriptions.get(keyOf(entityId, window));
    if (refused?.state === 'refused') close(registry, refused);
  }
  const releases = entityIds.flatMap((entityId) => hold(hass, entityId, window) ?? []);
  if (releases.length === 0) return null;
  return (linger) => {
    for (const release of releases) release(linger);
  };
}

/**
 * Close every subscription of some calendars, whatever its window, before they are asked for
 * again by REST: after a write, or a refresh someone asked for. A push already on its way from
 * before is not delivered, and the next subscription's first push is newer than the answer.
 *
 * @param hass Home Assistant instance
 * @param entityIds The calendars
 */
export function invalidate(hass: Types.Hass, entityIds: readonly string[]): void {
  const connection = connectionOf(hass);
  const registry = connection ? registries.get(connection) : undefined;
  if (!registry) return;
  const closed = new Set<string>();
  for (const subscription of [...registry.subscriptions.values()]) {
    if (!entityIds.includes(subscription.entityId)) continue;
    close(registry, subscription);
    closed.add(subscription.entityId);
  }
  for (const entityId of closed) notify(registry, entityId);
}

/**
 * Where a calendar's subscription for a window stands, without holding or opening it.
 *
 * @param hass Home Assistant instance
 * @param entityId Calendar entity id
 * @param window The window, as the request asks for it
 * @returns Its state, the fingerprint and version of its events, and whether it has pushed since
 *   the connection last came back; undefined where none is open
 */
export function peek(
  hass: Types.Hass,
  entityId: string,
  window: { start: Date; end: Date },
): { state: LiveState; fingerprint: string; version: number; reconnecting: boolean } | undefined {
  const connection = connectionOf(hass);
  const subscription = connection
    ? registries.get(connection)?.subscriptions.get(keyOf(entityId, window))
    : undefined;
  if (!subscription) return undefined;
  return {
    state: subscription.state,
    fingerprint: subscription.fingerprint,
    version: subscription.version,
    reconnecting: subscription.reconnecting,
  };
}

/**
 * Whether every one of some calendars is live for a window, so nothing needs polling. One
 * waiting for its push after a reconnect counts as live until `RECONNECT_TIMEOUT` decides.
 *
 * @param hass Home Assistant instance
 * @param entityIds Calendar entity ids
 * @param window The window, as the request asks for it
 * @returns False for none
 */
export function allLive(
  hass: Types.Hass,
  entityIds: readonly string[],
  window: { start: Date; end: Date },
): boolean {
  return (
    entityIds.length > 0 &&
    entityIds.every((entityId) => peek(hass, entityId, window)?.state === 'live')
  );
}

/**
 * Note the calendars' states in a new `hass`. A calendar whose state changed has written it, and
 * Home Assistant pushes after every write; a subscription silent for `STATE_PUSH_TIMEOUT` after
 * one is bound to an entity its integration replaced, and is closed so the cards holding it
 * subscribe again.
 *
 * @param hass Home Assistant instance
 */
export function observeStates(hass: Types.Hass): void {
  const connection = connectionOf(hass);
  const registry = connection ? registries.get(connection) : undefined;
  if (!registry) return;
  const now = Date.now();
  for (const subscription of registry.subscriptions.values()) {
    if (subscription.state !== 'live' && subscription.state !== 'failed') continue;
    const state = hass.states?.[subscription.entityId];
    const seen = subscription.seenState;
    const watching = now - subscription.seenAt <= STATE_PUSH_GRACE;
    subscription.seenState = state;
    subscription.seenAt = now;
    if (seen === undefined || state === seen || subscription.stateTimer) continue;
    // Unloading the integration marks the entity unavailable and restored, without a push: the
    // new entity's subscriptions are elsewhere. Any other change counts only where the card has
    // been watching, so its push cannot have come while it was not (another view shown).
    const replaced =
      !state || (state.state === 'unavailable' && state.attributes?.restored === true);
    if (!replaced && (!watching || now - subscription.pushedAt <= STATE_PUSH_GRACE)) continue;
    subscription.stateTimer = setTimeout(() => {
      subscription.stateTimer = undefined;
      Logger.warn(`No live update for ${subscription.entityId} after its state changed`);
      close(registry, subscription);
      notify(registry, subscription.entityId);
    }, STATE_PUSH_TIMEOUT);
  }
}

/**
 * Be told whenever a calendar's live state or events change on this connection.
 *
 * @param hass Home Assistant instance
 * @param listener Told the calendar's entity id, or `*` when the connection came back
 * @returns Stops telling it; a no-op where Home Assistant cannot push
 */
export function listen(hass: Types.Hass, listener: (entityId: string) => void): () => void {
  const connection = connectionOf(hass);
  if (!connection) return () => undefined;
  const registry = registryOf(connection);
  registry.listeners.add(listener);
  return () => registry.listeners.delete(listener);
}

//-----------------------------------------------------------------------------
// THE PUSH FORMAT
//-----------------------------------------------------------------------------

const ZONE_FORMATS = new Map<string, Intl.DateTimeFormat>();

/** An ISO date-time to whole seconds, as Python's `isoformat()` writes one. */
const WHOLE_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

/** A plain date. */
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date-time as Home Assistant's REST API writes it: in Home Assistant's time zone
 * (`as_local().isoformat()`). A push writes it in the event's own zone, so the same event would
 * otherwise reach `{start}` and the event popover in two spellings, by source.
 *
 * @param value An ISO date-time as pushed
 * @param timeZone Home Assistant's time zone
 * @returns The same instant in that zone, or the value as given where it cannot convert
 */
export function inZone(value: string, timeZone: string | undefined): string {
  if (!timeZone || !WHOLE_SECONDS.test(value)) return value;
  const instant = Date.parse(value);
  if (Number.isNaN(instant)) return value;

  let format = ZONE_FORMATS.get(timeZone);
  try {
    if (!format) {
      format = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      ZONE_FORMATS.set(timeZone, format);
    }
  } catch {
    return value;
  }

  const part: Record<string, string> = {};
  for (const { type, value: text } of format.formatToParts(instant)) part[type] = text;
  const wall = Date.UTC(
    Number(part.year),
    Number(part.month) - 1,
    Number(part.day),
    Number(part.hour),
    Number(part.minute),
    Number(part.second),
  );
  const offset = Math.round((wall - instant) / 60_000);
  if (!Number.isFinite(offset)) return value;
  const sign = offset < 0 ? '-' : '+';
  const pad = (n: number): string => String(n).padStart(2, '0');
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}:${part.second}${sign}${hours}:${minutes}`;
}

/**
 * One pushed event in the REST API's shape: times as `{ dateTime }` or `{ date }`, without the
 * push's `all_day`.
 *
 * @param event An event as pushed (`CalendarEvent.as_dict`)
 * @param timeZone Home Assistant's time zone
 * @returns The event, or null where it has no start and end
 */
export function normalizeEvent(
  event: unknown,
  timeZone: string | undefined,
): Types.CalendarEventData | null {
  if (!event || typeof event !== 'object') return null;
  const { start, end, all_day: allDay, ...fields } = event as Record<string, unknown>;
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  const dated = allDay === true || (allDay === undefined && PLAIN_DATE.test(start));
  const at = (value: string): { date: string } | { dateTime: string } =>
    dated ? { date: value } : { dateTime: inZone(value, timeZone) };
  return { ...fields, start: at(start), end: at(end) } as Types.CalendarEventData;
}

/**
 * Whether two sets of events say the same thing, as a string to compare: every field but the
 * card's own (`_`), absent, null and empty alike, times as instants and dates as dates, in any
 * order. A push and a REST answer for the same events compare equal, whatever offset each writes
 * a time in.
 *
 * @param events Events of one calendar, in the REST API's shape
 * @returns The fingerprint
 */
export function fingerprintEvents(events: readonly Types.CalendarEventData[]): string {
  const when = (at: Types.CalendarEventData['start'] | undefined): string =>
    at?.date ? `d${at.date}` : at?.dateTime ? `t${Date.parse(at.dateTime)}` : '';
  return events
    .map((event) => {
      const record = event as unknown as Record<string, unknown>;
      const fields = Object.keys(record)
        .filter((name) => name !== 'start' && name !== 'end' && !name.startsWith('_'))
        .sort()
        .flatMap((name) => {
          const value = record[name];
          if (value === null || value === undefined || value === '') return [];
          return [name, typeof value === 'string' ? value : JSON.stringify(value)];
        });
      return JSON.stringify([when(event.start), when(event.end), fields]);
    })
    .sort()
    .join('\n');
}
