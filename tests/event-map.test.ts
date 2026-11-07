import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type * as Types from '../src/config/types';
import {
  GEOCODING_URL,
  MAP_ZOOM,
  PLACES_RULE,
  PLACES_STORAGE_KEY,
  lookupLanguages,
  mapTiles,
  mapTilesToken,
  mapsSearchUrl,
  pickPlace,
  placeCoordinates,
  placeQuery,
  resetMapTilesToken,
  resolveLocation,
  zoneCoordinates,
  zoneZoom,
} from '../src/interaction/event-map';

/**
 * The popover's map: which locations get one, the tiles that draw it from Home Assistant's own
 * proxy, and where a press on it leads.
 */

const zone = (id: string, name: string | undefined, latitude: unknown, longitude: unknown) => ({
  [id]: { entity_id: id, state: '0', attributes: { friendly_name: name, latitude, longitude } },
});

const hass = (states: object, callWS?: Types.Hass['callWS']) =>
  ({ states, callWS }) as unknown as Types.Hass;

afterEach(() => resetMapTilesToken());

describe('zoneCoordinates', () => {
  const states = {
    ...zone('zone.home', 'Home', 52.52, 13.4),
    ...zone('zone.swim_club', 'Riverside Pool', 52.5, 13.45),
    ...zone('zone.broken', 'Broken', 'north', 13),
    'person.anna': {
      entity_id: 'person.anna',
      state: 'home',
      attributes: { friendly_name: 'Pool', latitude: 1, longitude: 1 },
    },
  };

  it.each([
    ['Home', { latitude: 52.52, longitude: 13.4 }],
    ['  riverside   POOL ', { latitude: 52.5, longitude: 13.45 }],
    ['swim club', { latitude: 52.5, longitude: 13.45 }],
  ])('finds the zone %j names', (location, point) => {
    expect(zoneCoordinates(location, hass(states))).toEqual(point);
  });

  it.each([
    ['an address no zone is called', '12 Mill Road, Springfield'],
    ['a person, not a zone', 'Pool'],
    ['a zone without a position', 'Broken'],
    ['nothing', '  '],
  ])('finds nothing for %s', (_name, location) => {
    expect(zoneCoordinates(location, hass(states))).toBeUndefined();
  });

  it('places a zone without asking anyone, a neighborhood around it', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    expect(await resolveLocation('Riverside Pool', hass(states), 312)).toEqual({
      latitude: 52.5,
      longitude: 13.45,
      zoom: MAP_ZOOM,
      source: 'zone',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(zoneCoordinates('Home', null)).toBeUndefined();
  });
});

describe('zoneZoom', () => {
  // The popover's map is 312 pixels wide.
  const at = (latitude: number, radius?: number) => ({ latitude, longitude: 10, radius });

  it('shows a zone around a city whole, fitting its circle to the map width', () => {
    // 26 km across Hannover fits at zoom 10 (29 km), not 11 (15 km).
    expect(zoneZoom(at(52.37, 13000), 312)).toBe(10);
    // 16 km across Rosenheim fits at zoom 11, just.
    expect(zoneZoom(at(47.86, 8000), 312)).toBe(11);
    expect(zoneZoom(at(47.86, 8100), 312)).toBe(10);
  });

  it('comes no closer than a neighborhood for a zone around a single spot', () => {
    expect(zoneZoom(at(52.37, 100), 312)).toBe(MAP_ZOOM);
    expect(zoneZoom(at(52.37, 1), 312)).toBe(MAP_ZOOM);
  });

  it('goes out further far from the equator, where the map stretches the ground', () => {
    // Web Mercator draws a kilometer larger toward the poles, so a zone needs a wider view.
    expect(zoneZoom(at(0, 13000), 312)).toBe(10);
    expect(zoneZoom(at(70, 13000), 312)).toBe(9);
    expect(zoneZoom(at(-70, 13000), 312)).toBe(9);
  });

  it('shows the neighborhood for a zone without a radius, and stops short of the world', () => {
    expect(zoneZoom(at(52.37), 312)).toBe(MAP_ZOOM);
    expect(zoneZoom(at(52.37, 13000), 0)).toBe(MAP_ZOOM);
    expect(zoneZoom(at(52.37, 5_000_000), 312)).toBe(5);
  });

  it('reads the radius Home Assistant gives a zone, and fits the map to it', async () => {
    const withRadius = (id: string, name: string, latitude: number, radius: number) => ({
      [id]: {
        entity_id: id,
        state: '0',
        attributes: { friendly_name: name, latitude, longitude: 9.73, radius },
      },
    });
    const zones = {
      ...withRadius('zone.hannover', 'Hannover', 52.37, 13000),
      ...withRadius('zone.home', 'Home', 52.5, 100),
      ...withRadius('zone.broken', 'Broken', 52.5, Number.NaN),
    };
    expect(zoneCoordinates('Hannover', hass(zones))).toEqual({
      latitude: 52.37,
      longitude: 9.73,
      radius: 13000,
    });
    expect(await resolveLocation('Hannover', hass(zones), 312)).toMatchObject({ zoom: 10 });
    expect(await resolveLocation('Home', hass(zones), 312)).toMatchObject({ zoom: MAP_ZOOM });
    expect(zoneCoordinates('Broken', hass(zones))).toEqual({ latitude: 52.5, longitude: 9.73 });
  });
});

describe('placeQuery', () => {
  it.each([
    ['Berlin', 'Berlin'],
    ['  Paris,   France ', 'Paris, France'],
    ['Los Angeles, CA', 'Los Angeles, CA'],
    ['Frankfurt am Main', 'Frankfurt am Main'],
  ])('asks for the place name %j', (location, query) => {
    expect(placeQuery(location)).toBe(query);
  });

  it.each([
    ['a street address', '12 Mill Road, Springfield'],
    ['a postal code', '83022 Rosenheim'],
    ['a house number alone', 'Hauptstraße 5'],
    ['a link', 'https://meet.example.com/swim'],
    ['an email address', 'anna@example.com'],
    ['a name and a place and a region', 'Café Central, Wien, Austria'],
    ['five words before a comma', 'Dentist Dr. Müller near the station'],
    ['a single letter', 'A'],
    ['too long', 'x'.repeat(61)],
  ])('sends nothing for %s', (_name, location) => {
    expect(placeQuery(location)).toBeUndefined();
  });
});

describe('pickPlace', () => {
  // As Open-Meteo answers, trimmed to what is read.
  const town = (
    name: string,
    country_code: string,
    feature_code: string,
    population: number | undefined,
    latitude = 1,
  ) => ({ name, latitude, longitude: 2, country_code, feature_code, population });
  const BERLIN = town('Berlin', 'DE', 'PPLC', 3426354, 52.52);
  const BERLIN_NH = town('Berlin', 'US', 'PPL', 9367, 44.47);

  it('takes only a place whose name is the one asked for, diacritics aside', () => {
    // The search is fuzzy: "Gym" finds Guaymas, "Pool" finds Poole.
    expect(pickPlace('Gym', [town('Guaymas', 'MX', 'PPLA2', 117253)], 'MX')).toBeUndefined();
    expect(pickPlace('Pool', [town('Poole', 'GB', 'PPL', 151500)], 'GB')).toBeUndefined();
    expect(pickPlace('berlin', [BERLIN], null)).toMatchObject({ latitude: 52.52 });
    expect(pickPlace('Zürich', [town('Zurich', 'CH', 'PPLA', 415367, 47.37)], 'CH')).toMatchObject({
      latitude: 47.37,
    });
  });

  it('takes a town or a city, never a district, a peak or a park', () => {
    expect(pickPlace('Airport', [town('Airport', 'US', 'PPLX', 28916)], 'US')).toBeUndefined();
    expect(pickPlace('Kirche', [town('Kirche', 'DE', 'PK', undefined)], 'DE')).toBeUndefined();
    expect(pickPlace('Stadium', [town('Stadium', 'US', 'PRK', 50000)], 'US')).toBeUndefined();
    for (const code of ['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG']) {
      expect(pickPlace('Town', [town('Town', 'DE', code, 5000)], 'DE')).toBeDefined();
    }
  });

  it('takes a town of 5,000 at home, so a word that names a hamlet draws nothing', () => {
    expect(pickPlace('Beach', [town('Beach', 'US', 'PPLA2', 1115)], 'US')).toBeUndefined();
    expect(pickPlace('Church', [town('Church', 'GB', 'PPL', 4077)], 'GB')).toBeUndefined();
    expect(pickPlace('Park', [town('Park', 'US', 'PPL', undefined)], 'US')).toBeUndefined();
    expect(pickPlace('Aschau', [town('Aschau', 'DE', 'PPL', 4999)], 'de')).toBeUndefined();
    expect(pickPlace('Aschau', [town('Aschau', 'DE', 'PPL', 5000)], 'de')).toBeDefined();
  });

  it('takes a place abroad only when it is a city of a million, or a capital of 100,000', () => {
    // "Kita", a daycare in German, is a ward of Tokyo.
    expect(pickPlace('Kita', [town('Kita', 'JP', 'PPLA2', 332140)], 'DE')).toBeUndefined();
    expect(pickPlace('Salzburg', [town('Salzburg', 'AT', 'PPLA', 157245)], 'DE')).toBeUndefined();
    expect(pickPlace('Munich', [town('Munich', 'DE', 'PPLA', 999999)], 'US')).toBeUndefined();
    expect(pickPlace('Munich', [town('Munich', 'DE', 'PPLA', 1000000)], 'US')).toBeDefined();
    expect(pickPlace('Bern', [town('Bern', 'CH', 'PPLC', 99999)], 'DE')).toBeUndefined();
    expect(pickPlace('Bern', [town('Bern', 'CH', 'PPLC', 100000)], 'DE')).toBeDefined();
    // Without a home country, everywhere is abroad.
    expect(pickPlace('Rosenheim', [town('Rosenheim', 'DE', 'PPLA3', 60167)], null)).toBeUndefined();
  });

  it('takes a town of 5,000 anywhere when the location names its country or region', () => {
    expect(
      pickPlace('Salzburg, Österreich', [town('Salzburg', 'AT', 'PPLA', 157245, 47.8)], 'DE'),
    ).toMatchObject({ latitude: 47.8 });
    expect(
      pickPlace('Paris, Texas', [town('Paris', 'US', 'PPLA2', 24782, 33.66)], null),
    ).toMatchObject({ latitude: 33.66 });
    expect(pickPlace('Hope, Alaska', [town('Hope', 'US', 'PPL', 92)], null)).toBeUndefined();
  });

  it('prefers a place near home, else the first', () => {
    const PARIS = town('Paris', 'FR', 'PPLC', 2138551, 48.85);
    const PARIS_TX = { ...town('Paris', 'US', 'PPLA2', 24782, 33.66), longitude: -95.56 };
    // Some 45 km from Paris, Texas.
    const NEARBY = { latitude: 33.4, longitude: -95.2 };
    const DENVER = { latitude: 39.74, longitude: -104.99 };
    // Both are towns this home would mean; the one an hour away wins.
    expect(pickPlace('Paris', [PARIS, PARIS_TX], 'US', NEARBY)).toMatchObject({ latitude: 33.66 });
    expect(pickPlace('Paris', [PARIS, PARIS_TX], 'US', DENVER)).toMatchObject({ latitude: 48.85 });
    expect(pickPlace('Paris', [PARIS, PARIS_TX], 'US')).toMatchObject({ latitude: 48.85 });
    expect(pickPlace('Berlin', [BERLIN, BERLIN_NH], 'FR')).toMatchObject({ latitude: 52.52 });
    expect(pickPlace('Berlin, Germany', [BERLIN], null)).toMatchObject({ latitude: 52.52 });
  });

  it('takes a town of 5,000 across a border when it is within 100 km of home', () => {
    const SALZBURG = { ...town('Salzburg', 'AT', 'PPLA', 157245, 47.8), longitude: 13.04 };
    const ROSENHEIM = { latitude: 47.86, longitude: 12.12 };
    const HAMBURG = { latitude: 53.55, longitude: 9.99 };
    expect(pickPlace('Salzburg', [SALZBURG], 'DE', ROSENHEIM)).toMatchObject({ latitude: 47.8 });
    expect(pickPlace('Salzburg', [SALZBURG], 'DE', HAMBURG)).toBeUndefined();
    expect(pickPlace('Salzburg', [SALZBURG], 'DE', { latitude: 47.86 })).toBeUndefined();
  });

  it('shows a city whole enough to know it, and a town closer', () => {
    expect(pickPlace('Berlin', [BERLIN], null)).toEqual({
      latitude: 52.52,
      longitude: 2,
      zoom: 11,
      source: 'open-meteo',
    });
    expect(pickPlace('Berlin', [{ ...BERLIN, population: 200000 }], 'DE')?.zoom).toBe(12);
    expect(pickPlace('Berlin', [BERLIN_NH], 'US')?.zoom).toBe(13);
  });
});

describe('lookupLanguages', () => {
  const at = (language: string | undefined, country: string | undefined) =>
    ({ locale: language && { language }, config: { country } }) as unknown as Types.Hass;

  it("asks in Home Assistant's language, then the home country's, then English", () => {
    expect(lookupLanguages(at('en-US', 'DE'))).toEqual(['en', 'de']);
    expect(lookupLanguages(at('de', 'DE'))).toEqual(['de', 'en']);
    expect(lookupLanguages(at('nl', 'FR'))).toEqual(['nl', 'fr', 'en']);
    expect(lookupLanguages(at('fr', undefined))).toEqual(['fr', 'en']);
    expect(lookupLanguages(at(undefined, 'XX'))).toEqual(['en']);
    expect(lookupLanguages(null)).toEqual(['en']);
  });
});

describe('placeCoordinates', () => {
  const ok = (results: unknown[]) =>
    vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ results }) }));
  const HASS = {
    states: {},
    locale: { language: 'de-DE' },
    config: { country: 'DE' },
  } as unknown as Types.Hass;
  const BERLIN = {
    name: 'Berlin',
    latitude: 52.52,
    longitude: 13.41,
    country_code: 'DE',
    feature_code: 'PPLC',
    population: 3426354,
  };
  const DAY = 24 * 60 * 60 * 1000;

  afterEach(() => localStorage.removeItem(PLACES_STORAGE_KEY));

  it("asks Open-Meteo once for a place name, in Home Assistant's language, and keeps it", async () => {
    const request = ok([BERLIN]);
    const place = await placeCoordinates('Berlin', HASS, 0, request as unknown as typeof fetch);
    expect(place).toMatchObject({ latitude: 52.52, source: 'open-meteo' });
    expect(request).toHaveBeenCalledWith(
      `${GEOCODING_URL}?name=Berlin&count=10&language=de&format=json`,
    );
    // Kept for weeks, by the name however it is written.
    expect(
      await placeCoordinates(' berlin ', HASS, 29 * DAY, request as unknown as typeof fetch),
    ).toEqual(place);
    expect(request).toHaveBeenCalledTimes(1);
    await placeCoordinates('Berlin', HASS, 31 * DAY, request as unknown as typeof fetch);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('asks again for a name kept under another version of the rule', async () => {
    localStorage.setItem(
      PLACES_STORAGE_KEY,
      JSON.stringify({
        // A miss kept by an older rule, and one kept before the rule had a version at all.
        berlin: { at: 0, for: 7 * DAY, rule: PLACES_RULE - 1 },
        paris: { at: 0, for: 7 * DAY },
      }),
    );
    const request = ok([BERLIN, { ...BERLIN, name: 'Paris', latitude: 48.85 }]);
    expect(
      await placeCoordinates('Berlin', HASS, 1, request as unknown as typeof fetch),
    ).toMatchObject({ latitude: 52.52 });
    expect(
      await placeCoordinates('Paris', HASS, 1, request as unknown as typeof fetch),
    ).toMatchObject({ latitude: 48.85 });
    expect(request).toHaveBeenCalledTimes(2);
    // Kept again under this one, so it is not asked a third time.
    await placeCoordinates('Berlin', HASS, 2, request as unknown as typeof fetch);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('asks nothing for what is no place name', async () => {
    const request = ok([BERLIN]);
    expect(
      await placeCoordinates('12 Mill Road', HASS, 0, request as unknown as typeof fetch),
    ).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps a name that found nothing for a week, and asks again after', async () => {
    const request = ok([{ name: 'Guaymas', latitude: 1, longitude: 2, feature_code: 'PPLA2' }]);
    expect(
      await placeCoordinates('Gym', HASS, 0, request as unknown as typeof fetch),
    ).toBeUndefined();
    // Once in German, once in English.
    expect(request).toHaveBeenCalledTimes(2);
    await placeCoordinates('Gym', HASS, 6 * DAY, request as unknown as typeof fetch);
    expect(request).toHaveBeenCalledTimes(2);
    await placeCoordinates('Gym', HASS, 8 * DAY, request as unknown as typeof fetch);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('asks in the next language when one finds nothing, and stops at the first that does', async () => {
    // Asked in English, Open-Meteo calls Hannover "Hanover", and the only Hannover it names is
    // a hamlet in the United States; asked in German, it is the city.
    const hanover = { ...BERLIN, name: 'Hanover', population: 515140, feature_code: 'PPLA' };
    const hamlet = { ...BERLIN, name: 'Hannover', country_code: 'US', population: undefined };
    const city = { ...hanover, name: 'Hannover', latitude: 52.37 };
    const request = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ results: url.includes('language=en') ? [hanover, hamlet] : [city] }),
    }));
    const english = { ...HASS, locale: { language: 'en' } } as unknown as Types.Hass;
    expect(
      await placeCoordinates('Hannover', english, 0, request as unknown as typeof fetch),
    ).toMatchObject({ latitude: 52.37, zoom: 12 });
    expect(request.mock.calls.map(([url]) => new URL(url).searchParams.get('language'))).toEqual([
      'en',
      'de',
    ]);
  });

  it('reads an answer it cannot read as nothing found, not as a failure to ask again soon', async () => {
    const odd = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: 7 }) }));
    expect(
      await placeCoordinates('Berlin', HASS, 0, odd as unknown as typeof fetch),
    ).toBeUndefined();
    expect(odd).toHaveBeenCalledTimes(2);
    await placeCoordinates('Berlin', HASS, 2 * 60 * 60 * 1000, odd as unknown as typeof fetch);
    expect(odd).toHaveBeenCalledTimes(2);
  });

  it("weighs a place by the home's position Home Assistant knows", async () => {
    const salzburg = { ...BERLIN, name: 'Salzburg', country_code: 'AT', feature_code: 'PPLA' };
    const at = (latitude: number, longitude: number) =>
      ({ ...HASS, config: { country: 'DE', latitude, longitude } }) as unknown as Types.Hass;
    const request = ok([{ ...salzburg, latitude: 47.8, longitude: 13.04, population: 157245 }]);
    // From Rosenheim, an hour away, it is meant; from Hamburg, it needs its country.
    expect(
      await placeCoordinates('Salzburg', at(47.86, 12.12), 0, request as unknown as typeof fetch),
    ).toMatchObject({ latitude: 47.8 });
    localStorage.removeItem(PLACES_STORAGE_KEY);
    expect(
      await placeCoordinates('Salzburg', at(53.55, 9.99), 0, request as unknown as typeof fetch),
    ).toBeUndefined();
  });

  it('draws nothing when Open-Meteo cannot be reached, and waits an hour to ask again', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(
      await placeCoordinates('Berlin', HASS, 0, down as unknown as typeof fetch),
    ).toBeUndefined();
    const refused = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    expect(
      await placeCoordinates('Berlin', HASS, 30 * 60 * 1000, refused as unknown as typeof fetch),
    ).toBeUndefined();
    expect(refused).not.toHaveBeenCalled();
    expect(
      await placeCoordinates('Berlin', HASS, 61 * 60 * 1000, refused as unknown as typeof fetch),
    ).toBeUndefined();
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('asks once for a name two popovers want at the same time', async () => {
    const request = ok([BERLIN]);
    const [a, b] = await Promise.all([
      placeCoordinates('Berlin', HASS, 0, request as unknown as typeof fetch),
      placeCoordinates('Berlin', HASS, 0, request as unknown as typeof fetch),
    ]);
    expect(a).toEqual(b);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps at most 300 names, giving up the oldest', async () => {
    const request = ok([]);
    for (let i = 0; i < 302; i++) {
      await placeCoordinates(
        `Place ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
        HASS,
        i,
        request as unknown as typeof fetch,
      );
    }
    const kept = JSON.parse(localStorage.getItem(PLACES_STORAGE_KEY)!);
    expect(Object.keys(kept)).toHaveLength(300);
    expect(kept).not.toHaveProperty('place aa');
  });
});

describe('mapTiles', () => {
  it('covers the preview with tiles placed around the point', () => {
    const { tiles, tileSize } = mapTiles(
      { latitude: 48.13, longitude: 11.5829 },
      { width: 312, height: 120 },
      'tok&en',
    );
    expect(tileSize).toBe(256);
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    expect(tiles.every((tile) => tile.url.startsWith(`/api/map_tiles/raster/${MAP_ZOOM}/`))).toBe(
      true,
    );
    expect(tiles.every((tile) => tile.url.endsWith('.png?token=tok%26en'))).toBe(true);
    // Every pixel of the preview lies on some tile.
    for (const [x, y] of [
      [0, 0],
      [311, 0],
      [0, 119],
      [311, 119],
      [156, 60],
    ]) {
      expect(
        tiles.some((t) => x >= t.left && x < t.left + 256 && y >= t.top && y < t.top + 256),
      ).toBe(true);
    }
  });

  it('starts at a neighborhood, not a few buildings', () => {
    expect(MAP_ZOOM).toBe(15);
  });

  it('draws the point at the preview center', () => {
    // 0°/0° is the top-left corner of the tile in the middle of the world, 2^(zoom-1) across.
    const { tiles } = mapTiles({ latitude: 0, longitude: 0 }, { width: 200, height: 100 }, 't');
    const middle = 2 ** (MAP_ZOOM - 1);
    const corner = tiles.find((t) => t.url.includes(`/${MAP_ZOOM}/${middle}/${middle}.png`))!;
    expect(corner).toMatchObject({ left: 100, top: 50 });
  });

  it('draws a sharper map one zoom finer at half size on a dense screen', () => {
    const { tiles, tileSize } = mapTiles(
      { latitude: 0, longitude: 0 },
      { width: 200, height: 100 },
      't',
      2,
    );
    expect(tileSize).toBe(128);
    const middle = 2 ** MAP_ZOOM;
    expect(
      tiles.find((t) => t.url.includes(`/${MAP_ZOOM + 1}/${middle}/${middle}.png`)),
    ).toMatchObject({
      left: 100,
      top: 50,
    });
  });

  it('wraps around the date line and leaves out rows past the poles', () => {
    const { tiles } = mapTiles(
      { latitude: 85, longitude: 179.999 },
      { width: 600, height: 600 },
      't',
    );
    const limit = 2 ** MAP_ZOOM;
    for (const tile of tiles) {
      const [, x, y] = /\/(\d+)\/(\d+)\.png/.exec(tile.url)!.map(Number) as number[];
      expect(x).toBeLessThan(limit);
      expect(y).toBeGreaterThanOrEqual(0);
    }
    expect(tiles.some((t) => t.url.includes('/0/'))).toBe(true);
  });
});

describe('mapTilesToken', () => {
  it('asks Home Assistant for its token once in a while, not for every popover', async () => {
    const callWS = vi.fn(async () => ({ token: 'abc' }));
    const h = hass({}, callWS as unknown as Types.Hass['callWS']);
    expect(await mapTilesToken(h, 0)).toBe('abc');
    expect(await mapTilesToken(h, 19 * 60 * 1000)).toBe('abc');
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS).toHaveBeenCalledWith({ type: 'map_tiles/access_token' });
    await mapTilesToken(h, 21 * 60 * 1000);
    expect(callWS).toHaveBeenCalledTimes(2);
  });

  it('gives no token where Home Assistant has no tile proxy, so no map is drawn', async () => {
    const failing = vi.fn(async () => {
      throw { code: 'unknown_command' };
    });
    expect(
      await mapTilesToken(hass({}, failing as unknown as Types.Hass['callWS'])),
    ).toBeUndefined();
    expect(await mapTilesToken(hass({}))).toBeUndefined();
    expect(
      await mapTilesToken(hass({}, (async () => ({})) as Types.Hass['callWS'])),
    ).toBeUndefined();
  });
});

describe('mapsSearchUrl', () => {
  it('searches Google Maps for the location as written, encoded', () => {
    expect(mapsSearchUrl(' Riverside Pool, 12 Mill Road & Co ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Riverside%20Pool%2C%2012%20Mill%20Road%20%26%20Co',
    );
  });
});
