/**
 * The small map under an event's location in the popover, and where a press on it leads.
 *
 * The map is drawn from Home Assistant's own tile proxy (`/api/map_tiles/raster`, Home
 * Assistant 2026.10 and later), so the browser asks no map server itself. Home Assistant has no
 * address lookup, so a location is placed in one of two ways (`resolveLocation`). The name of
 * one of Home Assistant's zones places it where the zone is, and sends nothing anywhere. A
 * short place name, such as a town or a city with its country, is looked up in Open-Meteo's
 * geocoding service, whose terms allow personal home automation without a key
 * (open-meteo.com/en/terms). That sends the name, and the browser's IP address, to Open-Meteo,
 * as the docs on maps say. Nothing with a digit in it is sent, so no street address or house
 * number leaves the house, and each name is asked once and kept in the browser for weeks. Every
 * other location gets a button to search for it in Google Maps instead.
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

/** Where a location is, how close the map starts on it, and who placed it there. */
export interface MapPlace extends Coordinates {
  zoom: number;
  /** A zone of Home Assistant's, or a place Open-Meteo knows, whose credit the map then shows. */
  source: 'zone' | 'open-meteo';
}

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

/** Open-Meteo's geocoding service, which finds towns and cities by name. */
export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** Where looked-up places are kept, in the browser's local storage. */
export const PLACES_STORAGE_KEY = 'calendar-card-pro-places';

/**
 * How long a place found is kept, and how long a name nothing was found for is not asked again.
 * Towns do not move; a name that found nothing rarely starts to.
 */
const FOUND_FOR_MS = 30 * 24 * 60 * 60 * 1000;
const MISSED_FOR_MS = 7 * 24 * 60 * 60 * 1000;
/** After a failed request, how long before the same name is asked again. */
const FAILED_FOR_MS = 60 * 60 * 1000;
/** How many names are kept, the oldest given up first. */
const PLACES_KEPT = 300;

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

/**
 * A location folded further, for comparing it with a place's name: diacritics dropped too, so
 * "munchen" and "München" match.
 *
 * @param text - A name or a location
 * @returns The folded text
 */
function foldName(text: string): string {
  return fold(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * The name to look up for a location, or nothing where it should not leave the house. Only a
 * short place name is asked for: up to four words, with one comma at most for a country or
 * region after it ("Paris, France"). Nothing with a digit, so no street address, house number
 * or postal code, nor an address or a link.
 *
 * @param location - An event's location
 * @returns The name to ask for, or undefined
 */
export function placeQuery(location: string): string | undefined {
  const query = location.trim().replace(/\s+/g, ' ');
  if (query.length < 2 || query.length > 60) return undefined;
  if (/[\d@/:]/.test(query)) return undefined;
  const parts = query.split(',').map((part) => part.trim());
  if (parts.length > 2 || parts.some((part) => !part)) return undefined;
  if (parts[0].split(' ').length > 4) return undefined;
  return query;
}

/** A place as Open-Meteo's geocoding service returns it. Only what is read is declared. */
interface GeocodingResult {
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  country_code?: unknown;
  feature_code?: unknown;
  population?: unknown;
}

/**
 * The GeoNames feature codes of a town or a city: a populated place, a seat of government at
 * any level, or a capital. A district of a city (`PPLX`) is left out, because one called
 * Airport, in California, would put the word on the map; so are abandoned, destroyed and
 * historical places.
 */
const TOWN_CODES: ReadonlySet<string> = new Set([
  'PPL',
  'PPLA',
  'PPLA2',
  'PPLA3',
  'PPLA4',
  'PPLA5',
  'PPLC',
  'PPLG',
]);

/**
 * How many people a town needs in the home's country, or in the country or region a location
 * names after its comma. Ordinary words are the names of hamlets somewhere (School, Park,
 * Beach, Church), and none of those has this many.
 */
const NEAR_POPULATION = 5_000;
/**
 * How many people a place abroad needs when the location does not say where it is: a city
 * everyone means by its name, or a capital. "Kita", German for a daycare, is a ward of Tokyo
 * with a third of a million, and is not drawn.
 */
const FAR_POPULATION = 1_000_000;
const FAR_CAPITAL_POPULATION = 100_000;
/**
 * How far from home a place counts as near, whatever its country: a town across a border an
 * hour's drive away is meant as surely as one at home, and of two towns of one name, the near
 * one is meant.
 */
const NEAR_KM = 100;

/**
 * Roughly how far apart two points are, in kilometers; close enough for telling a town an
 * hour away from one across a continent.
 *
 * @param a - One point
 * @param b - The other
 * @returns The distance in kilometers
 */
function kmBetween(a: Coordinates, b: Coordinates): number {
  const latitude = (((a.latitude + b.latitude) / 2) * Math.PI) / 180;
  const x = (b.longitude - a.longitude) * Math.cos(latitude) * 111.32;
  const y = (b.latitude - a.latitude) * 110.57;
  return Math.hypot(x, y);
}

/**
 * The place a name finds among Open-Meteo's results, or none. Its search is fuzzy, so "Gym"
 * finds Guaymas; only a place whose name is the name asked for counts, diacritics aside. Then
 * it must be a town or a city (`TOWN_CODES`). A near one, in the home's country, within
 * `NEAR_KM` of home, or in the country or region the location names after its comma, needs
 * `NEAR_POPULATION`; any other needs `FAR_POPULATION`, or `FAR_CAPITAL_POPULATION` for a
 * capital. A word that names no such place draws no map rather than a wrong one. A place
 * within `NEAR_KM` of home comes first, else the first, which Open-Meteo ranks by population.
 *
 * @param query - The name asked for
 * @param results - Open-Meteo's results
 * @param country - The home's country, ISO 3166-1 alpha-2, when set
 * @param home - Where the home is, when set
 * @returns The place, or undefined
 */
export function pickPlace(
  query: string,
  results: readonly GeocodingResult[],
  country: string | null | undefined,
  home?: Partial<Coordinates>,
): MapPlace | undefined {
  const [head, region] = query.split(',');
  const wanted = foldName(head);
  const homeCountry = country?.toUpperCase();
  const homePoint =
    typeof home?.latitude === 'number' && typeof home.longitude === 'number'
      ? { latitude: home.latitude, longitude: home.longitude }
      : undefined;
  const nearHome = (result: GeocodingResult) =>
    !!homePoint &&
    kmBetween(homePoint, {
      latitude: result.latitude as number,
      longitude: result.longitude as number,
    }) <= NEAR_KM;

  const towns = results.filter((result) => {
    if (typeof result.name !== 'string' || foldName(result.name) !== wanted) return false;
    if (typeof result.feature_code !== 'string' || !TOWN_CODES.has(result.feature_code)) {
      return false;
    }
    if (typeof result.latitude !== 'number' || typeof result.longitude !== 'number') return false;
    const population = Number(result.population) || 0;
    if (
      region !== undefined ||
      (homeCountry && result.country_code === homeCountry) ||
      nearHome(result)
    ) {
      return population >= NEAR_POPULATION;
    }
    return (
      population >= FAR_POPULATION ||
      (result.feature_code === 'PPLC' && population >= FAR_CAPITAL_POPULATION)
    );
  });
  const place = towns.find(nearHome) ?? towns[0];
  if (!place) return undefined;
  const population = Number(place.population) || 0;
  return {
    latitude: place.latitude as number,
    longitude: place.longitude as number,
    // A city is shown whole enough to know it, a town closer.
    zoom: population >= 1_000_000 ? 11 : population >= 100_000 ? 12 : 13,
    source: 'open-meteo',
  };
}

/**
 * The languages a name is looked up in, in turn: Home Assistant's, the home country's, then
 * English. Open-Meteo answers with each place's name in the language asked for, so "Köln" is
 * Cologne in English and "Munich" is München in German; a name typed in any of the three is
 * found under its own spelling.
 *
 * @param hass - Home Assistant instance
 * @returns Two-letter language codes, without repeats
 */
export function lookupLanguages(hass: Types.Hass | null | undefined): string[] {
  const own = (hass?.locale?.language ?? 'en').slice(0, 2).toLowerCase();
  let home: string | undefined;
  try {
    const country = hass?.config?.country;
    home = country ? new Intl.Locale(`und-${country}`).maximize().language : undefined;
  } catch {
    home = undefined;
  }
  return [...new Set([own, home, 'en'].filter((language): language is string => !!language))];
}

/** A name looked up, kept: when, the place it found, if any, and for how long it holds. */
interface KeptPlace {
  at: number;
  place?: MapPlace;
  for: number;
}

function readKept(): Record<string, KeptPlace> {
  try {
    const raw = globalThis.localStorage?.getItem(PLACES_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, KeptPlace>) : {};
  } catch {
    return {};
  }
}

function keep(name: string, entry: KeptPlace): void {
  try {
    const kept = readKept();
    kept[name] = entry;
    const names = Object.keys(kept);
    if (names.length > PLACES_KEPT) {
      names
        .sort((a, b) => kept[a].at - kept[b].at)
        .slice(0, names.length - PLACES_KEPT)
        .forEach((old) => delete kept[old]);
    }
    globalThis.localStorage?.setItem(PLACES_STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // A browser that keeps nothing asks again next time.
  }
}

/** Lookups under way, so two popovers asking for one name ask once. */
const asking = new Map<string, Promise<MapPlace | undefined>>();

/**
 * Where a place name is, from Open-Meteo, or from what an earlier lookup kept. The name is
 * asked in each of `lookupLanguages` in turn, until one finds the place.
 *
 * @param location - An event's location
 * @param hass - Home Assistant instance, for its language and the home's country
 * @param now - The current time
 * @param request - The fetch to ask with
 * @returns The place, or undefined for a location not asked about, not found, or not reachable
 */
export async function placeCoordinates(
  location: string,
  hass: Types.Hass | null | undefined,
  now: number = Date.now(),
  request: typeof fetch | undefined = globalThis.fetch?.bind(globalThis),
): Promise<MapPlace | undefined> {
  const query = placeQuery(location);
  if (!query || !request) return undefined;
  const name = foldName(query);

  const kept = readKept()[name];
  if (kept && now - kept.at < kept.for) return kept.place;
  const pending = asking.get(name);
  if (pending) return pending;

  const lookup = (async () => {
    try {
      let place: MapPlace | undefined;
      for (const language of lookupLanguages(hass)) {
        const url =
          `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=10` +
          `&language=${encodeURIComponent(language)}&format=json`;
        const response = await request(url);
        if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
        const body = (await response.json()) as { results?: unknown };
        const results = Array.isArray(body?.results) ? (body.results as GeocodingResult[]) : [];
        place = pickPlace(query, results, hass?.config?.country, hass?.config);
        if (place) break;
      }
      keep(name, { at: now, place, for: place ? FOUND_FOR_MS : MISSED_FOR_MS });
      return place;
    } catch {
      keep(name, { at: now, for: FAILED_FOR_MS });
      return undefined;
    } finally {
      asking.delete(name);
    }
  })();
  asking.set(name, lookup);
  return lookup;
}

/**
 * Where a location is: a zone of Home Assistant's of that name, else a place name Open-Meteo
 * knows (`placeCoordinates`).
 *
 * @param location - An event's location
 * @param hass - Home Assistant instance
 * @returns The place, or undefined when the location is neither
 */
export async function resolveLocation(
  location: string,
  hass: Types.Hass | null | undefined,
): Promise<MapPlace | undefined> {
  const zone = zoneCoordinates(location, hass);
  if (zone) return { ...zone, zoom: MAP_ZOOM, source: 'zone' };
  return placeCoordinates(location, hass);
}

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
 * @param baseZoom - How close the map is, before a high-density screen's step
 * @returns The tiles, and the size each is drawn at
 */
export function mapTiles(
  coordinates: Coordinates,
  size: { width: number; height: number },
  token: string,
  density: 1 | 2 = 1,
  baseZoom: number = MAP_ZOOM,
): { tiles: MapTile[]; tileSize: number } {
  const zoom = baseZoom + (density === 2 ? 1 : 0);
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
