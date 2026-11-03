import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import {
  MAP_ZOOM,
  mapTiles,
  mapTilesToken,
  mapsSearchUrl,
  resetMapTilesToken,
  resolveLocation,
  zoneCoordinates,
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

  it('is what the popover resolves locations with, so nothing is sent anywhere', () => {
    expect(resolveLocation).toBe(zoneCoordinates);
    expect(zoneCoordinates('Home', null)).toBeUndefined();
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
