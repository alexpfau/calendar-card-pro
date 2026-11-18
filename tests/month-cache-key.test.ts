/**
 * Home's cache entry keeps one key while its configuration stands, whether Month is reachable or
 * not.
 *
 * Home's query identity and its cache key name the configured window: `start_date` as written and
 * the days loaded. Where that is a relative start, today by default, the key stays put as the days
 * pass, and the window it stands for moving is caught where a stored entry's window is compared
 * with the one asked for (`isEntryDue`), which refetches into the same entry. Month's load starts at
 * its grid's first row and spans the other views' days too, so its concrete first day moves every
 * month, and its length can move every day. Keying on those wrote a new six-week entry to
 * `localStorage` each time and left the old one there, on a dashboard nobody reloads, until the
 * quota ran out. The key names the configured window and what else shapes the month's (that Month
 * is reachable, and the first weekday) instead.
 *
 * Cards are built as Home Assistant builds one and walked through a year a day at a time, each day
 * loading as the midnight reload does, so the keys counted are the ones the card really writes.
 * Pinned to UTC like the rest of the unit project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';

/** Friday, January 1, 2027, mid-morning. */
const NOW = new Date('2027-01-01T10:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  config: Types.Config;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(mode?: string): Promise<void>;
  _instanceIdForPage(page: string | null): string;
}

/** The first day of every window Home Assistant was asked for, in order. */
let asked: string[] = [];

function hass(firstWeekday: string): Types.Hass {
  return {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { friendly_name: 'Anna' },
      },
    },
    locale: { language: 'en', time_format: '24', first_weekday: firstWeekday },
    config: { country: 'DE' },
    themes: { darkMode: false },
    entities: {},
    connection: {
      subscribeMessage: vi.fn(() => Promise.reject({ code: 'unknown_command' })),
      subscribeEvents: vi.fn().mockResolvedValue(() => {}),
    },
    callWS: vi.fn().mockResolvedValue({}),
    localize: (key: string) => key,
    formatEntityState: (_stateObj: unknown, value?: string) => String(value ?? ''),
    // One event a window, at its first moment, so every answer is stored as an entry with events.
    callApi: vi.fn(async (_method: string, path: string) => {
      const start = new URLSearchParams(path.split('?')[1]).get('start')!;
      asked.push(start.slice(0, 10));
      const end = new Date(Date.parse(start) + 60 * 60 * 1000).toISOString();
      return [{ summary: 'Swim', start: { dateTime: start }, end: { dateTime: end } }];
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

async function mount(
  config: Record<string, unknown>,
  firstWeekday = 'monday',
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.anna'], view: 'list', toolbar: { show: true }, ...config });
  card.hass = hass(firstWeekday);
  document.body.appendChild(card);
  await vi.advanceTimersByTimeAsync(0);
  await card.updateComplete;
  return card;
}

/** The persistent cache entries the card has written. */
function storedKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)!;
    if (key.startsWith(Constants.CACHE.EVENT_CACHE_KEY_PREFIX)) keys.push(key);
  }
  return keys;
}

/** Walks the card through a year from `NOW`, loading each day as the midnight reload does. */
async function walkAYear(card: CardUnderTest): Promise<void> {
  for (let day = 1; day < 365; day++) {
    vi.setSystemTime(new Date(NOW.getTime() + day * DAY_MS));
    await card.updateEvents('cache');
    await card.updateComplete;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
  asked = [];
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('home’s cache entry over a year', () => {
  it.each([3, 7, 14, 30])(
    'keeps one key where Month is reachable, at days_to_show %i',
    async (days) => {
      const card = await mount({ days_to_show: days });
      expect(ViewConfig.reachesMonth(card.config)).toBe(true);
      const id = card._instanceIdForPage(null);

      await walkAYear(card);

      expect(storedKeys()).toHaveLength(1);
      expect(card._instanceIdForPage(null)).toBe(id);
      // The window still moved with the months, and each move was loaded for: a load opens on the
      // first row of the month holding today, so a year asks from at least twelve first days.
      expect(new Set(asked).size).toBeGreaterThanOrEqual(12);
    },
  );

  it('keeps one key where Month is not reachable, as it always did', async () => {
    const card = await mount({ days_to_show: 7, toolbar: { show: true, view_switcher: false } });
    expect(ViewConfig.reachesMonth(card.config)).toBe(false);

    await walkAYear(card);

    expect(storedKeys()).toHaveLength(1);
    expect(new Set(asked).size).toBe(365);
  });
});

describe('what home’s key tells apart', () => {
  it('names another entry where Month’s reachability or the first weekday moves the window', async () => {
    const keyOf = async (config: Record<string, unknown>, firstWeekday: string) => {
      vi.stubGlobal('localStorage', memoryStorage());
      const card = await mount({ days_to_show: 7, ...config }, firstWeekday);
      const keys = storedKeys();
      card.remove();
      expect(keys).toHaveLength(1);
      return keys[0];
    };

    const monday = await keyOf({}, 'monday');
    const sunday = await keyOf({}, 'sunday');
    const noMonth = await keyOf({ toolbar: { show: true, view_switcher: false } }, 'monday');
    const noMonthSunday = await keyOf({ toolbar: { show: true, view_switcher: false } }, 'sunday');

    expect(new Set([monday, sunday, noMonth]).size).toBe(3);
    // Without Month and with a start that is not week-relative, the weekday moves nothing.
    expect(noMonthSunday).toBe(noMonth);

    // Month alone draws its six weeks; beside a list of as many days it loads to the list's end,
    // which on January 1 runs four days past the grid.
    const monthAlone = await keyOf(
      { view: 'month', days_to_show: 42, toolbar: { show: true, view_switcher: ['month'] } },
      'monday',
    );
    const monthAndList = await keyOf(
      {
        view: 'month',
        days_to_show: 42,
        toolbar: { show: true, view_switcher: ['list', 'month'] },
      },
      'monday',
    );
    expect(monthAlone).not.toBe(monthAndList);
  });

  it('leaves the keys of a card that cannot show Month as they were', async () => {
    const card = await mount({ days_to_show: 7, toolbar: { show: true, view_switcher: false } });
    expect(storedKeys()).toEqual([PINNED.noMonthHome]);
    expect(card._instanceIdForPage('2027-02-01')).toBe(PINNED.noMonthPage);
  });

  it('leaves a page’s identity, which is already a date, as it was', async () => {
    const card = await mount({ days_to_show: 7 });
    expect(card._instanceIdForPage('2027-02-01')).toBe(PINNED.monthPage);
  });
});

/** Values the keys had before home's key stopped naming the month's concrete window. */
const PINNED = {
  noMonthHome: 'cache_data_jdvnyf_calendar.anna_7vPLACEHOLDER',
  noMonthPage: 'xszsrq',
  monthPage: '2qzixf',
};
