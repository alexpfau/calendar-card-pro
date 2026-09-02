/**
 * Calendar colors Home Assistant holds in its own entity registry.
 *
 * Home Assistant 2026.2 stores a per-calendar color at `options.calendar.color`. It is
 * reachable only over the WebSocket — the compressed display registry behind
 * `hass.entities` carries no `options` — so this module fetches it once per page, keeps a
 * synchronous map for the render path, and refreshes when the registry changes.
 */

import * as Logger from './logger';
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

function fetchColors(hass: Types.Hass): Promise<void> | undefined {
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

  return request
    .then((entries) => {
      colors = extractColors(entries);
      loaded = true;
      Logger.debug(`Loaded ${colors.size} calendar colors from the entity registry`);
    })
    .catch((error) => {
      Logger.debug('Could not read calendar colors from the entity registry', error);
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
      const refresh = fetchColors(hass);
      if (refresh) {
        refresh.then(notifyListeners);
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
 */
function teardown(): void {
  subscribeGeneration++;

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = undefined;
  }

  loaded = false;
}

/**
 * Make sure Home Assistant's calendar colors are on their way, and keep them current.
 *
 * Safe to call on every update: the fetch happens once per page and the subscription once
 * per connection.
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

  if (loaded || inFlight) {
    return;
  }

  const request = fetchColors(hass);
  if (!request) {
    return;
  }

  inFlight = request.then(() => {
    inFlight = undefined;
    notifyListeners();
  });
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
  inFlight = undefined;
  reportedUnavailable = false;
  listeners.clear();

  teardown();
}
