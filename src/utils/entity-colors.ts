/**
 * Calendar colors Home Assistant holds in its own entity registry.
 *
 * Home Assistant 2026.2 stores a per-calendar color at `options.calendar.color`. It is
 * reachable only over the WebSocket — the compressed display registry behind
 * `hass.entities` carries no `options` — so this module fetches it once per page, keeps a
 * synchronous map for the render path, and refreshes when the registry changes.
 */

import * as Logger from './logger';
import * as Constants from '../config/constants';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// GRAMMAR
//-----------------------------------------------------------------------------

/**
 * The `accent_color` value meaning "use the color Home Assistant holds for this calendar".
 *
 * Spelled for the place it is read rather than the place it is written: `entity` would sit
 * two lines under `entity: calendar.work` meaning something else entirely. Hyphenated
 * lowercase also matches the vocabulary beside it — `deep-purple`, `light-grey`.
 */
export const ENTITY_COLOR_SENTINEL = 'home-assistant';

/**
 * Whether a configured color defers to Home Assistant.
 *
 * @param value - Configured `accent_color`, at either level
 * @returns `true` when the value is the sentinel
 */
export function isEntityColorSentinel(value: unknown): boolean {
  return value === ENTITY_COLOR_SENTINEL;
}

/**
 * The text-color value meaning "this event's own calendar accent".
 *
 * A sentinel rather than a mode flag, for the same reason as the one above: the fields it
 * governs stay real and independently settable, so `time_color: accent` alone is a
 * meaningful thing to write. A literal color could not express it at all — one literal is
 * one color, and this needs one per calendar — and a flag that grayed the fields out would
 * leave five controls looking editable and doing nothing.
 *
 * The spelling is not new vocabulary. `allday_badge_color` has shipped accepting `accent`
 * in exactly this sense since v4 — "each calendar's own, rather than a color you pick" —
 * so this reuses a word the config already means that by.
 *
 * 🚨 `accent` is also a member of {@link THEME_COLOR_TOKENS}, where it names Home
 * Assistant's own theme accent. The two never meet: that set is only ever consulted by
 * {@link resolveRegistryColor}, which by its own docblock runs on values read from the
 * entity registry and never on the card's configured colors. A governed option's value is
 * read here and nowhere near there.
 */
export const ACCENT_TEXT_SENTINEL = 'accent';

/**
 * Whether a configured color defers to the event's own calendar accent.
 *
 * @param value - Configured value of a governed color option
 * @returns `true` when the value is the sentinel
 */
export function isAccentTextSentinel(value: unknown): boolean {
  return value === ACCENT_TEXT_SENTINEL;
}

/**
 * Whether any part of a configuration asks for Home Assistant's colors.
 *
 * Everything else in this module is gated on this. Nothing is fetched, subscribed or
 * re-rendered for a card that never opted in, so the feature costs existing cards nothing.
 *
 * @param config - Card configuration
 * @returns `true` when the card or one of its calendars uses the sentinel
 */
export function usesEntityColor(config: Readonly<Types.Config>): boolean {
  if (isEntityColorSentinel(config.accent_color)) {
    return true;
  }

  return (config.entities ?? []).some(
    (entry) =>
      typeof entry === 'object' && entry !== null && isEntityColorSentinel(entry.accent_color),
  );
}

//-----------------------------------------------------------------------------
// TOKEN RESOLUTION
//-----------------------------------------------------------------------------

/**
 * Home Assistant's theme color tokens, mirroring `computeCssColor` in its frontend.
 *
 * The registry stores whatever the settings dialog produced. That dialog is an
 * `ha-color-picker` whose options are the token names themselves, and Home Assistant
 * validates the user-update path as `vol.Any(None, dict)` — no color validation at all — so
 * `red` is as likely a stored value as `#ff0000`. Only `initial_color`, the seed an
 * integration supplies, is held to hex by `cv.color_hex`.
 *
 * The last three are Home Assistant's YAML-only tokens. Its own `isValidColorString` does
 * not accept them, so they cannot arrive through a validated path; they are here as cheap
 * insurance rather than as a live case.
 *
 * Exported so a test can pin the membership by value. Walking it to assert something about
 * each entry would not notice one leaving — the loop would simply run one fewer time, and a
 * dropped token means a calendar rendering the literal string `deep-purple`.
 */
export const THEME_COLOR_TOKENS: ReadonlySet<string> = new Set([
  'primary',
  'accent',
  'red',
  'pink',
  'purple',
  'deep-purple',
  'indigo',
  'blue',
  'light-blue',
  'cyan',
  'teal',
  'green',
  'light-green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'deep-orange',
  'brown',
  'light-grey',
  'grey',
  'dark-grey',
  'blue-grey',
  'black',
  'white',
  'primary-text',
  'secondary-text',
  'disabled',
]);

/**
 * Resolve one color **read from the entity registry** to something CSS can use.
 *
 * 🚨 Registry values only. Sixteen of these tokens — `red`, `blue`, `green` and friends —
 * are also valid CSS color names, and `styles.ts` writes the user's own `accent_color`
 * straight into a custom property. Running a configured `accent_color: red` through here
 * would silently repaint it from CSS red to Home Assistant's Material red on upgrade, with
 * nothing to error and nothing to notice. The card's own colors stay untouched strings.
 *
 * @param value - Color as the registry stores it
 * @returns A CSS color: a theme token becomes its custom property, anything else is passed
 *   through unchanged
 */
export function resolveRegistryColor(value: string): string {
  return THEME_COLOR_TOKENS.has(value) ? `var(--${value}-color)` : value;
}

//-----------------------------------------------------------------------------
// REGISTRY CACHE
//-----------------------------------------------------------------------------

/** Resolved colors by calendar entity id. Page-scoped, shared by every card on it. */
let colors: Map<string, string> = new Map();

let loaded = false;
let inFlight: Promise<void> | undefined;
let unsubscribe: (() => void) | undefined;
let subscribeGeneration = 0;
let reportedUnavailable = false;

/**
 * Bumped when the last card leaves, so a read still on its way when it does is ignored when
 * it lands. Without it, that late answer set `loaded` behind the next card's back, and a card
 * returning to the page kept whatever colors the registry held before it left.
 */
let readGeneration = 0;

/** Consecutive failed reads, which decide how long the next retry waits. */
let failures = 0;

/**
 * The retry a failed read is waiting for, and the `hass` it will read with — the newest one
 * a card handed over, so the timer never pins a stale object.
 */
let retry: { timer: ReturnType<typeof setTimeout>; hass: Types.Hass } | undefined;

/**
 * Connections already asked to cut a retry short when they come back.
 *
 * Deliberately never cleared, by teardown or by {@link resetEntityColors}: the listener on a
 * connection stays, so forgetting the connection would only add a second one. A `WeakSet`
 * holds no connection alive.
 */
const watchedConnections = new WeakSet<object>();

/**
 * First retry after a failed read, then doubling per further failure up to the cap.
 *
 * The calendar fetch's default schedule: the same first wait, capped at the default refresh
 * interval rather than at a card's own `refresh_interval`, because this cache is shared by
 * every card on the page and no one card's interval is the page's. A reconnect does not wait
 * for it at all; see {@link watchReconnects}.
 */
const RETRY_FIRST_MS = Constants.CACHE.RETRY_INITIAL_SECONDS * 1000;
const RETRY_MAX_MS = Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES * 60 * 1000;

/** Cards waiting to be told the registry moved. */
const listeners = new Set<() => void>();

/**
 * The colors Home Assistant currently holds, keyed by calendar entity id.
 *
 * Empty until the first fetch lands, which is why the render path treats a miss as "no
 * color configured" rather than waiting: a cold cache renders today's colors and repaints
 * once, instead of rendering nothing.
 *
 * @returns The color map, resolved and ready for CSS
 */
export function entityColors(): ReadonlyMap<string, string> {
  return colors;
}

function sendCommand<T>(hass: Types.Hass, message: Types.WebSocketMessage): Promise<T> | undefined {
  if (typeof hass.callWS === 'function') {
    return hass.callWS<T>(message);
  }

  const connection = hass.connection;
  if (connection && typeof connection.sendMessagePromise === 'function') {
    return connection.sendMessagePromise<T>(message);
  }

  return undefined;
}

/**
 * Reduce a registry listing to the calendar colors in it.
 *
 * Every entity in the instance comes back on this command, so everything that is not a
 * calendar carrying a color is dropped here rather than retained.
 *
 * @param entries - Registry entries as Home Assistant returned them
 * @returns Resolved colors by entity id
 */
function extractColors(
  entries: ReadonlyArray<Types.EntityRegistryEntry> | undefined,
): Map<string, string> {
  const found = new Map<string, string>();

  for (const entry of entries ?? []) {
    const id = entry?.entity_id;
    if (typeof id !== 'string' || !id.startsWith('calendar.')) {
      continue;
    }

    const color = entry.options?.calendar?.color;
    if (typeof color === 'string' && color !== '') {
      found.set(id, resolveRegistryColor(color));
    }
  }

  return found;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Read the registry once, and keep its colors if the answer still counts.
 *
 * @param hass - Home Assistant instance
 * @returns Whether the colors were read and kept, or `undefined` when there is no WebSocket
 *   command API to ask
 */
function fetchColors(hass: Types.Hass): Promise<boolean> | undefined {
  const request = sendCommand<Types.EntityRegistryEntry[]>(hass, {
    type: 'config/entity_registry/list',
  });

  if (!request) {
    if (!reportedUnavailable) {
      reportedUnavailable = true;
      Logger.debug(
        'This instance exposes no WebSocket command API, so Home Assistant calendar colors ' +
          'are unavailable; configured colors are used instead',
      );
    }
    return undefined;
  }

  const generation = readGeneration;
  return request
    .then((entries) => {
      if (generation !== readGeneration) {
        return false;
      }

      colors = extractColors(entries);
      loaded = true;
      failures = 0;
      clearRetry();
      Logger.debug(`Loaded ${colors.size} calendar colors from the entity registry`);
      return true;
    })
    .catch((error) => {
      Logger.debug('Could not read calendar colors from the entity registry', error);
      return false;
    });
}

/**
 * Read the registry for the cards, tell them when the colors land, and wait if it fails.
 *
 * 🚨 A failed read notifies nobody. It used to, and that was a loop: the card repaints on
 * notification, its `updated()` calls {@link ensureEntityColors} again, and with nothing
 * loaded and nothing in flight that reads again. A rejection that arrives at once — every
 * command home-assistant-js-websocket is asked to send while its socket is down — turned it
 * into a microtask loop that froze the tab, reconnect timer included, so the page never came
 * back on its own. Nothing a card draws changed on a failure, so there is nothing to repaint.
 *
 * @param hass - Home Assistant instance
 */
function read(hass: Types.Hass): void {
  const request = fetchColors(hass);
  if (!request) {
    return;
  }

  const generation = readGeneration;
  inFlight = request.then((succeeded) => {
    if (generation !== readGeneration) {
      return;
    }

    inFlight = undefined;
    if (succeeded) {
      notifyListeners();
    } else {
      scheduleRetry(hass);
    }
  });
}

/**
 * Try a failed read again later, rather than on the card's next render.
 *
 * @param hass - Home Assistant instance the failed read used
 */
function scheduleRetry(hass: Types.Hass): void {
  if (loaded || retry || listeners.size === 0) {
    return;
  }

  failures += 1;
  const delay = Math.min(RETRY_FIRST_MS * 2 ** Math.min(failures - 1, 20), RETRY_MAX_MS);
  retry = { timer: setTimeout(() => retryNow(false), delay), hass };
}

function clearRetry(): void {
  if (!retry) {
    return;
  }

  clearTimeout(retry.timer);
  retry = undefined;
}

/**
 * Stop waiting and read now.
 *
 * @param reconnected - Whether the connection just came back, which starts the backoff over:
 *   the failures it counted were the outage's
 */
function retryNow(reconnected: boolean): void {
  const target = retry?.hass;
  clearRetry();

  if (reconnected) {
    failures = 0;
  }

  if (target && !loaded && !inFlight && listeners.size > 0) {
    read(target);
  }
}

/**
 * Cut a retry short when the connection comes back, which is when an outage's failed read can
 * first succeed.
 *
 * One listener per connection, added once and never removed, as `live-calendars.ts` does it,
 * and a no-op unless a retry is owed. 🚨 Removing it is not the tidier alternative it looks:
 * home-assistant-js-websocket's `fireEvent` walks its listener array with `forEach`, and
 * `removeEventListener` splices that same array, so a listener removing itself while `ready`
 * is dispatched makes the next one — another card's, or Home Assistant's own — be skipped.
 *
 * @param hass - Home Assistant instance
 */
function watchReconnects(hass: Types.Hass): void {
  const connection = hass.connection;
  if (
    !connection ||
    typeof connection.addEventListener !== 'function' ||
    watchedConnections.has(connection)
  ) {
    return;
  }

  watchedConnections.add(connection);
  connection.addEventListener('ready', () => {
    if (retry?.hass.connection === connection) {
      retryNow(true);
    }
  });
}

/**
 * Watch the registry so a color changed in Home Assistant reaches the card.
 *
 * Home Assistant sends no payload worth patching in — its own frontend re-reads the whole
 * list — so this does the same, and only while at least one card is listening.
 * {@link releaseEntityColors} is what enforces that second clause; it used to be a
 * statement of intent here with nothing behind it.
 *
 * @param hass - Home Assistant instance
 */
function subscribe(hass: Types.Hass): void {
  const connection = hass.connection;
  if (unsubscribe || !connection || typeof connection.subscribeEvents !== 'function') {
    return;
  }

  // Claim the slot before awaiting, so two cards connecting in the same tick cannot both
  // pass the guard above and open a second subscription.
  unsubscribe = () => {};
  const generation = ++subscribeGeneration;

  connection
    .subscribeEvents(() => {
      // Closing a subscription is only acknowledged later, so an event can still arrive
      // after the last card left — and read the registry for nobody, behind the next
      // card's back.
      if (generation !== subscribeGeneration) {
        return;
      }

      const refresh = fetchColors(hass);
      if (refresh) {
        refresh.then((succeeded) => {
          if (succeeded) {
            notifyListeners();
          }
        });
      }
    }, 'entity_registry_updated')
    .then((off) => {
      // The last card can leave while this is still in flight, and the placeholder it
      // tore down cannot close a subscription that did not exist yet. Closing it here is
      // the only remaining chance — storing it would leave a live subscription that
      // nothing holds a handle to.
      if (generation !== subscribeGeneration) {
        off();
        return;
      }

      unsubscribe = off;
    })
    .catch(() => {
      if (generation === subscribeGeneration) {
        unsubscribe = undefined;
      }
    });
}

/**
 * Stop watching the registry, and forget that it was ever read.
 *
 * Invalidating is half the job and the easier half to miss. The registry can move while
 * nobody is subscribed, so leaving `loaded` set would let the next card read a map frozen
 * at the moment the last one left — a regression the untorn-down subscription was
 * accidentally preventing. `colors` itself is kept: a stale color repainted once beats
 * rendering no color at all, which is the trade {@link entityColors} already documents for
 * a cold cache.
 *
 * Anything still on its way is disowned rather than awaited, and a pending retry is dropped
 * with its backoff, so the next card to arrive reads at once.
 */
function teardown(): void {
  subscribeGeneration++;
  readGeneration++;

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = undefined;
  }

  loaded = false;
  inFlight = undefined;
  failures = 0;
  clearRetry();
}

/**
 * Make sure Home Assistant's calendar colors are on their way, and keep them current.
 *
 * Safe to call on every update: the fetch happens once per page, the subscription once per
 * connection, and a failed fetch is retried on its own schedule rather than by the call.
 *
 * @param hass - Home Assistant instance, if one is available
 * @param onChange - Called when the colors change, so the caller can re-render
 */
export function ensureEntityColors(
  hass: Types.Hass | null | undefined,
  onChange: () => void,
): void {
  if (!hass) {
    return;
  }

  listeners.add(onChange);
  subscribe(hass);
  watchReconnects(hass);

  if (retry) {
    retry.hass = hass;
    return;
  }

  if (loaded || inFlight) {
    return;
  }

  read(hass);
}

/**
 * Stop telling a card about registry changes.
 *
 * The last card out closes the subscription. Without that, one card that opted in once
 * left the page re-reading the whole entity registry on every `entity_registry_updated`
 * for as long as the tab stayed open, notifying nobody and holding its `hass` — which is
 * the opposite of what {@link subscribe} says it does.
 *
 * @param onChange - The callback given to {@link ensureEntityColors}
 */
export function releaseEntityColors(onChange: () => void): void {
  listeners.delete(onChange);

  if (listeners.size === 0) {
    teardown();
  }
}

/**
 * Forget everything, so one test cannot leak into the next.
 */
export function resetEntityColors(): void {
  colors = new Map();
  reportedUnavailable = false;
  listeners.clear();

  teardown();
}
