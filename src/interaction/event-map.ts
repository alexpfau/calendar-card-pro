/**
 * The small map under an event's location in the popover, and where a press on it leads.
 *
 * The map is drawn from Home Assistant's own tile proxy (`/api/map_tiles/raster`, Home
 * Assistant 2026.10 and later), so the browser asks no map server itself. Turning a location
 * into a point is the open question: Home Assistant has no address lookup, and the outside
 * services that have one come with conditions for its owner to weigh. Until then the only
 * places a map is drawn for are Home Assistant's zones, matched by name (`resolveLocation`),
 * which sends nothing anywhere. Every other location gets a button to search for it in Google
 * Maps instead.
 */

import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** A point on the map. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Finds where a location is, or nothing. The one place an address lookup would plug in.
 *
 * @param location - An event's location as stored
 * @param hass - Home Assistant instance
 * @returns The point, or undefined when the location is not one the resolver knows
 */
export type LocationResolver = (
  location: string,
  hass: Types.Hass | null | undefined,
) => Coordinates | undefined | Promise<Coordinates | undefined>;

/** One tile of the map, and where its top-left corner sits in the preview. */
export interface MapTile {
  url: string;
  left: number;
  top: number;
}

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * How close in the preview starts: a neighborhood around the point, some 900 meters across the
 * preview at central European latitudes. One step closer showed only a few buildings.
 */
export const MAP_ZOOM = 15;

/** Home Assistant's raster tiles are 256 pixels square. */
const TILE_SIZE = 256;

/** How long a tile token is reused. Home Assistant rotates it every 30 minutes and accepts the last two. */
const TOKEN_REUSE_MS = 20 * 60 * 1000;

//-----------------------------------------------------------------------------
// WHERE A LOCATION IS
//-----------------------------------------------------------------------------

/**
 * Text folded for matching: trimmed, lowercased, inner whitespace collapsed.
 *
 * @param text - A name or a location
 * @returns The folded text
 */
function fold(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The Home Assistant zone a location names, matched by the zone's name or its entity id's
 * object id with underscores as spaces, ignoring case: an event at "Home" or "Office" finds
 * the zones of those names.
 *
 * @param location - An event's location
 * @param hass - Home Assistant instance
 * @returns The zone's point, or undefined
 */
export function zoneCoordinates(
  location: string,
  hass: Types.Hass | null | undefined,
): Coordinates | undefined {
  const wanted = fold(location);
  if (!wanted || !hass?.states) return undefined;

  for (const [entityId, state] of Object.entries(hass.states)) {
    if (!entityId.startsWith('zone.')) continue;
    const names = [
      String(state.attributes?.friendly_name ?? ''),
      entityId.slice(5).replace(/_/g, ' '),
    ];
    if (!names.some((name) => name && fold(name) === wanted)) continue;

    const latitude = Number(state.attributes?.latitude);
    const longitude = Number(state.attributes?.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
  }
  return undefined;
}

/** How the popover finds where a location is: Home Assistant's zones only, for now. */
export const resolveLocation: LocationResolver = zoneCoordinates;

//-----------------------------------------------------------------------------
// THE MAP
//-----------------------------------------------------------------------------

/**
 * The Web Mercator tile coordinates of a point, fractional.
 *
 * @param coordinates - The point
 * @param zoom - The zoom level
 * @returns Tile x and y, with the position inside the tile as the fraction
 */
function tilePosition(coordinates: Coordinates, zoom: number): { x: number; y: number } {
  const scale = 2 ** zoom;
  const latitude = Math.max(-85.0511, Math.min(85.0511, coordinates.latitude));
  const radians = (latitude * Math.PI) / 180;
  return {
    x: ((coordinates.longitude + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * scale,
  };
}

/**
 * The tiles that cover a preview centered on a point, each placed in the preview's pixels.
 *
 * `density` draws tiles one zoom level finer at half size, so a high-density screen gets a
 * sharp map at the same scale.
 *
 * @param coordinates - The point the preview is centered on
 * @param size - The preview's width and height in CSS pixels
 * @param token - Home Assistant's tile token
 * @param density - 2 for a high-density screen, else 1
 * @returns The tiles, and the size each is drawn at
 */
export function mapTiles(
  coordinates: Coordinates,
  size: { width: number; height: number },
  token: string,
  density: 1 | 2 = 1,
): { tiles: MapTile[]; tileSize: number } {
  const zoom = MAP_ZOOM + (density === 2 ? 1 : 0);
  const tileSize = TILE_SIZE / density;
  const center = tilePosition(coordinates, zoom);
  const left = center.x * tileSize - size.width / 2;
  const top = center.y * tileSize - size.height / 2;
  const limit = 2 ** zoom;

  const tiles: MapTile[] = [];
  for (let x = Math.floor(left / tileSize); x <= Math.floor((left + size.width) / tileSize); x++) {
    for (let y = Math.floor(top / tileSize); y <= Math.floor((top + size.height) / tileSize); y++) {
      if (y < 0 || y >= limit) continue;
      const wrapped = ((x % limit) + limit) % limit;
      tiles.push({
        url: `/api/map_tiles/raster/${zoom}/${wrapped}/${y}.png?token=${encodeURIComponent(token)}`,
        left: x * tileSize - left,
        top: y * tileSize - top,
      });
    }
  }
  return { tiles, tileSize };
}

let cachedToken: { hass: object; token: string; at: number } | undefined;

/**
 * Home Assistant's current tile token, or undefined where it has no tile proxy.
 *
 * Reused for a while, since every popover with a map asks for one; a Home Assistant before
 * 2026.10 does not know the command and the popover draws no map.
 *
 * @param hass - Home Assistant instance
 * @param now - The current time
 * @returns The token, or undefined
 */
export async function mapTilesToken(
  hass: Types.Hass | null | undefined,
  now: number = Date.now(),
): Promise<string | undefined> {
  if (!hass || typeof hass.callWS !== 'function') return undefined;
  const connection = (hass as { connection?: object }).connection ?? hass;
  if (cachedToken && cachedToken.hass === connection && now - cachedToken.at < TOKEN_REUSE_MS) {
    return cachedToken.token;
  }
  try {
    const result = await hass.callWS<{ token?: unknown }>({ type: 'map_tiles/access_token' });
    if (typeof result?.token !== 'string' || !result.token) return undefined;
    cachedToken = { hass: connection, token: result.token, at: now };
    return result.token;
  } catch {
    return undefined;
  }
}

/** Forgets the cached tile token, for tests. */
export function resetMapTilesToken(): void {
  cachedToken = undefined;
}

/**
 * Where a press on the map, or on the pin beside a location, leads: a Google Maps search for
 * the location as written, which opens the Maps app where one is installed.
 *
 * @param location - The location
 * @returns The search URL
 */
export function mapsSearchUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
}
