/**
 * The card's query identity follows the first weekday it resolves to, not the setting as written.
 *
 * `_instanceId`, and a page's id beside it (`_instanceIdForPage`), name the query a card loads
 * and draws for. Each cache key, each shared in-flight request and each page store entry begins
 * with one, so two cards whose ids differ never share a load. The ids used to hash the raw
 * `first_day_of_week` string, while the window and the rest of the key took the resolved weekday:
 *
 * - `system` and `monday` are different strings that ask for the same window on a Monday
 *   profile, so two such cards split one load into two requests and two entries. So did any two
 *   settings whose window does not depend on the week at all, a page's included.
 * - A profile change under `system` moves a week-relative window while the setting stays
 *   `system`, so the id stayed where it was while the window moved. The new window's first load
 *   then counted its failures on from the old window's, deeper in the backoff, and kept the old
 *   window's events of a calendar that failed in it, which a configuration edit has never done.
 *
 * Cards are built in Home Assistant's order, `setConfig` before `hass`, then attached, because
 * an id resolved from the configuration alone reads `system` as Monday. The Sunday cases are the
 * ones that order can fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/** Wednesday, June 17, 2026; the unit project runs on UTC. */
const NOW = new Date('2026-06-17T10:00:00Z');

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  readonly _instanceId: string;
  _failureCountHint: number;
  _requestPage(page: string | null): void;
  _loadPage(): void;
}

const EVENTS = [
  {
    summary: 'Brunch',
    start: { dateTime: '2026-06-14T10:00:00Z' },
    end: { dateTime: '2026-06-14T11:00:00Z' },
  },
  {
    summary: 'Swim',
    start: { dateTime: '2026-06-17T15:00:00Z' },
    end: { dateTime: '2026-06-17T16:00:00Z' },
  },
  {
    summary: 'Picnic',
    start: { dateTime: '2026-06-23T12:00:00Z' },
    end: { dateTime: '2026-06-23T13:00:00Z' },
  },
];

const MONDAY = { language: 'en', first_weekday: 'monday' };
const SUNDAY = { language: 'en', first_weekday: 'sunday' };

/** The first day of every window Home Assistant was asked for, in order. */
let asked: string[] = [];
/** While true, every request fails, as it does while Home Assistant is unreachable. */
let unreachable = false;

function hass(locale: Record<string, string>): Types.Hass {
  return {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { friendly_name: 'Anna' },
      },
    },
    locale: { time_format: '24', ...locale },
    config: { country: 'DE' },
    themes: { darkMode: false },
    entities: {},
    connection: {
      subscribeMessage: vi.fn((_callback: unknown, message: { type: string }) =>
        message.type === 'calendar/event/subscribe'
          ? Promise.reject({ code: 'unknown_command' })
          : Promise.resolve(() => {}),
      ),
      subscribeEvents: vi.fn().mockResolvedValue(() => {}),
    },
    callWS: vi.fn().mockResolvedValue({}),
    localize: (key: string) => key,
    formatEntityState: (_stateObj: unknown, value?: string) => String(value ?? ''),
    callApi: vi.fn(async (_method: string, path: string) => {
      const query = new URLSearchParams(path.split('?')[1]);
      const from = Date.parse(query.get('start')!);
      const to = Date.parse(query.get('end')!);
      asked.push(new Date(from).toISOString().slice(0, 10));
      if (unreachable) throw new Error('Home Assistant is unreachable');
      return EVENTS.filter(
        (event) => Date.parse(event.start.dateTime) < to && Date.parse(event.end.dateTime) > from,
      ).map((event) => ({ ...event }));
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

/** Lets anything the card started settle, without reaching its first retry. */
async function settle(card: CardUnderTest): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await card.updateComplete;
  await vi.advanceTimersByTimeAsync(0);
  await card.updateComplete;
}

/**
 * A card built as Home Assistant builds one, then left to load: configured, handed `hass`,
 * attached. Its appear load reads the cache first, so a second card finding the first one's
 * entry asks for nothing.
 */
async function mount(
  config: Record<string, unknown>,
  locale: Record<string, string>,
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({
    entities: ['calendar.anna'],
    days_to_show: 7,
    show_past_events: true,
    ...config,
  });
  card.hass = hass(locale);
  document.body.appendChild(card);
  await settle(card);
  return card;
}

/** Hands the card a profile with another locale, then lets anything it starts settle. */
async function changeProfile(card: CardUnderTest, locale: Record<string, string>): Promise<void> {
  card.hass = { ...card.hass, locale: { time_format: '24', ...locale } } as Types.Hass;
  await card.updateComplete;
  await vi.advanceTimersByTimeAsync(1000);
  await card.updateComplete;
}

/** Every event-cache entry in storage, one per key. */
function stored(): Types.CacheEntry[] {
  const found: Types.CacheEntry[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)!;
    if (!key.startsWith(Constants.CACHE.EVENT_CACHE_KEY_PREFIX)) continue;
    const entry = EventUtils.readCacheEntry(key);
    if (entry) found.push(entry);
  }
  return found;
}

/** The first day of each stored entry's window, once per entry, so two keys for one window show. */
const windows = (): string[] =>
  stored()
    .map((entry) => entry.window?.start.slice(0, 10) ?? '')
    .sort();

/** The stored entry for the window starting on a day. */
const entryFor = (day: string): Types.CacheEntry | undefined =>
  stored().find((entry) => entry.window?.start.startsWith(day));

const drawn = (card: CardUnderTest): string => card.shadowRoot!.textContent ?? '';

beforeEach(() => {
  asked = [];
  unreachable = false;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
  EventUtils.clearPageStore();
});

afterEach(() => {
  document.body.replaceChildren();
  EventUtils.clearPageStore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('cards that ask for the same window share one load', () => {
  it('shares it between system and monday on a profile that starts on Monday', async () => {
    const a = await mount({ start_date: 'start_of_week', first_day_of_week: 'system' }, MONDAY);
    const b = await mount({ start_date: 'start_of_week', first_day_of_week: 'monday' }, MONDAY);

    expect({
      sameId: a._instanceId === b._instanceId,
      asked,
      entries: windows(),
      swim: drawn(b).includes('Swim'),
    }).toEqual({ sameId: true, asked: ['2026-06-15'], entries: ['2026-06-15'], swim: true });
  });

  it('shares it between system and sunday on a profile that starts on Sunday', async () => {
    // Resolving `system` before `hass` arrives reads it as Monday, which the Monday case above
    // cannot tell from the profile's own answer.
    const a = await mount({ start_date: 'start_of_week', first_day_of_week: 'system' }, SUNDAY);
    const b = await mount({ start_date: 'start_of_week', first_day_of_week: 'sunday' }, SUNDAY);

    expect({
      sameId: a._instanceId === b._instanceId,
      asked,
      entries: windows(),
      brunch: drawn(b).includes('Brunch'),
    }).toEqual({ sameId: true, asked: ['2026-06-14'], entries: ['2026-06-14'], brunch: true });
  });

  it('keeps two windows apart when the weekdays differ', async () => {
    // The control: `system` on a Sunday profile and `monday` are two windows, and sharing them
    // would draw one card's week with the other's events.
    const a = await mount({ start_date: 'start_of_week', first_day_of_week: 'system' }, SUNDAY);
    const b = await mount({ start_date: 'start_of_week', first_day_of_week: 'monday' }, SUNDAY);

    expect({
      sameId: a._instanceId === b._instanceId,
      asked,
      entries: windows(),
      brunch: [drawn(a).includes('Brunch'), drawn(b).includes('Brunch')],
    }).toEqual({
      sameId: false,
      asked: ['2026-06-14', '2026-06-15'],
      entries: ['2026-06-14', '2026-06-15'],
      brunch: [true, false],
    });
  });

  it('shares it between any two weekdays when the start date does not depend on the week', async () => {
    const a = await mount({ first_day_of_week: 'sunday' }, MONDAY);
    const b = await mount({ first_day_of_week: 'monday' }, MONDAY);

    expect({
      sameId: a._instanceId === b._instanceId,
      asked,
      entries: windows(),
    }).toEqual({ sameId: true, asked: ['2026-06-17'], entries: ['2026-06-17'] });
  });

  it('shares a page, whose first day is a date, between system and monday', async () => {
    const toolbar = { show: true, navigation: true };
    const a = await mount({ toolbar, first_day_of_week: 'system' }, SUNDAY);
    const b = await mount({ toolbar, first_day_of_week: 'monday' }, SUNDAY);
    asked = [];

    for (const card of [a, b]) {
      card._requestPage('2026-06-22');
      card._loadPage();
      await settle(card);
    }

    expect({ asked, picnic: drawn(b).includes('Picnic') }).toEqual({
      asked: ['2026-06-22'],
      picnic: true,
    });
  });
});

describe('a profile change that moves the window starts a new query', () => {
  /**
   * A `system` card on a Monday profile whose calendar has failed twice: once on appearing and
   * once at the first retry, a minute later.
   */
  async function failingTwice(): Promise<CardUnderTest> {
    unreachable = true;
    const card = await mount({ start_date: 'start_of_week' }, MONDAY);
    await vi.advanceTimersByTimeAsync(60_000);
    await settle(card);
    return card;
  }

  it('counts the new window from its first attempt', async () => {
    const card = await failingTwice();
    const before = {
      count: card._failureCountHint,
      attempts: entryFor('2026-06-15')?.failureCount,
    };

    await changeProfile(card, SUNDAY);
    const sunday = entryFor('2026-06-14');

    expect({
      before,
      asked: asked[asked.length - 1],
      count: card._failureCountHint,
      attempts: sunday?.failureCount,
      retryInMs: sunday && sunday.retryAt! - sunday.timestamp,
    }).toEqual({
      before: { count: 2, attempts: 2 },
      asked: '2026-06-14',
      count: 1,
      attempts: 1,
      retryInMs: Constants.CACHE.RETRY_INITIAL_SECONDS * 1000,
    });
  });

  it('keeps counting while the window stays where it was', async () => {
    // The control for the case above: the harness does count on, so a 1 there is the new
    // window's own count and not a count that never grew.
    const card = await failingTwice();
    await vi.advanceTimersByTimeAsync(120_000);
    await settle(card);

    expect({
      asked,
      count: card._failureCountHint,
      attempts: entryFor('2026-06-15')?.failureCount,
    }).toEqual({ asked: ['2026-06-15', '2026-06-15', '2026-06-15'], count: 3, attempts: 3 });
  });

  it('keeps counting through a profile change that leaves the window where it was', async () => {
    // A new `hass` arrives with every state change; only a weekday that moves the window may
    // start the count again.
    const card = await failingTwice();
    await changeProfile(card, { language: 'de', first_weekday: 'monday' });
    await vi.advanceTimersByTimeAsync(120_000);
    await settle(card);

    expect({
      count: card._failureCountHint,
      attempts: entryFor('2026-06-15')?.failureCount,
    }).toEqual({ count: 3, attempts: 3 });
  });

  it('does not draw the old window events of a calendar that fails in the new one', async () => {
    // As a configuration edit that moves the window already does: those events were loaded for
    // another week, and never for the day the week gained.
    const card = await mount({ start_date: 'start_of_week' }, MONDAY);
    expect(drawn(card).includes('Swim')).toBe(true);

    unreachable = true;
    await changeProfile(card, SUNDAY);

    expect({ asked: asked[asked.length - 1], swim: drawn(card).includes('Swim') }).toEqual({
      asked: '2026-06-14',
      swim: false,
    });
  });
});
