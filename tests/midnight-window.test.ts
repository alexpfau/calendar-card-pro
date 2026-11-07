/**
 * A card whose window follows today, at midnight.
 *
 * The days a card draws are worked out at render, from the current date, but its events
 * belong to the window they were fetched for. At midnight a card with no start date, or a
 * relative one, draws tomorrow's window from today's events, so its new last day reads
 * "No events" even when it has some, until the next scheduled refresh: up to
 * `refresh_interval`, 30 minutes by default. The midnight timer asks for a cache load then,
 * which fetches only because the window moved.
 *
 * Everything here is a real mount, with Home Assistant answering for the window it is asked
 * about, so a card that drew the right days from the wrong request would fail too. The paths
 * that already handled midnight are pinned beside the fix: a grid with its now line also loads
 * from the line's own tick, and must not now fetch twice; a card on fixed dates must not start
 * fetching at midnight. Column and grid cards that shed day columns are pinned in
 * `column-count-render.test.ts`, and their request counts below.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import '../src/calendar-card-pro';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  _midnightTimerId: number | null;
  _columnCount: number;
  requestUpdate(): void;
  readonly updateComplete: Promise<boolean>;
}

/** Ten minutes before midnight on Wednesday, June 17, 2026; the unit project runs on UTC. */
const BEFORE_MIDNIGHT = new Date('2026-06-17T23:50:00.000Z');

const timed = (summary: string, day: string): Types.CalendarEventData => ({
  summary,
  start: { dateTime: `${day}T09:00:00.000Z` },
  end: { dateTime: `${day}T10:00:00.000Z` },
});

/** One event on each of the four days around midnight. */
const EVENTS = [
  timed('Swim', '2026-06-17'),
  timed('Dentist', '2026-06-18'),
  timed('Piano', '2026-06-19'),
  timed('Bakery', '2026-06-20'),
];

/** A test sets this to answer with nothing for every window starting at it or later. */
let emptyFrom = Infinity;

/** Answers for the window asked about, as Home Assistant does: what overlaps it. */
const callApi = vi.fn(async (_method: string, path: string) => {
  const query = new URLSearchParams(path.split('?')[1]);
  const from = Date.parse(query.get('start')!);
  const to = Date.parse(query.get('end')!);
  if (from >= emptyFrom) return [];
  return EVENTS.filter(
    (event) => Date.parse(event.start.dateTime!) < to && Date.parse(event.end.dateTime!) > from,
  ).map((event) => ({ ...event }));
});

/** A `localStorage` that holds nothing and refuses every write, as a full or blocked one does. */
function refusingStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;
}

function hass(): Record<string, unknown> {
  return {
    states: {
      'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} },
    },
    locale: { language: 'en', time_format: '24' },
    callApi,
    localize: (key: string) => key,
  };
}

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
}

async function mount(overrides: Partial<Types.Config>): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(
    buildConfig({
      entities: ['calendar.anna'],
      days_to_show: 2,
      show_past_events: true,
      ...overrides,
    }),
  );
  card.hass = hass();
  document.body.appendChild(card);
  await settle(card);
  return card;
}

/** Which of the fixture's events the card draws. */
function drawn(card: CardUnderTest): string[] {
  const text = card.shadowRoot!.textContent ?? '';
  return EVENTS.map((event) => event.summary!).filter((summary) => text.includes(summary));
}

/** Move the clock on, then deliver a `hass` update, as any state change in HA would. */
async function passTime(card: CardUnderTest, ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  card.hass = hass();
  await settle(card);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_MIDNIGHT);
  vi.stubGlobal('localStorage', memoryStorage());
  EventUtils.clearPageStore();
  callApi.mockClear();
  emptyFrom = Infinity;
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a window that follows today, at midnight', () => {
  it.each([
    ['list', { view: 'list' }],
    ['column', { view: 'column' }],
    [
      'grid without its now line',
      { view: 'grid', time_grid: { show_now_line: false, show_past_events: true } },
    ],
  ] as const)(
    'a %s card draws the new last day from a new request, well before the refresh is due',
    async (_name, view) => {
      const card = await mount({ ...view, show_empty_days: true } as Partial<Types.Config>);
      expect(drawn(card)).toEqual(['Swim', 'Dentist']);
      expect(callApi).toHaveBeenCalledTimes(1);

      // Five minutes past midnight; the 30-minute refresh is not due for another 25.
      await passTime(card, 15 * 60_000);

      expect(drawn(card)).toEqual(['Dentist', 'Piano']);
      expect(card.shadowRoot!.textContent).not.toContain('No events');
      expect(callApi).toHaveBeenCalledTimes(2);
      const query = new URLSearchParams(String(callApi.mock.calls[1][1]).split('?')[1]);
      expect(query.get('start')).toBe('2026-06-18T00:00:00.000Z');
    },
  );

  it('does the same for a relative start date, and again the following night', async () => {
    // A ten-hour interval, so no scheduled refresh lands near either midnight.
    const card = await mount({ view: 'list', start_date: 'today-1', refresh_interval: 600 });
    expect(drawn(card)).toEqual(['Swim']);

    await passTime(card, 15 * 60_000);
    expect(drawn(card)).toEqual(['Swim', 'Dentist']);
    expect(callApi).toHaveBeenCalledTimes(2);

    // To 23:50 the next day, then over the second midnight.
    await passTime(card, (23 * 60 + 45) * 60_000);
    expect(drawn(card)).toEqual(['Swim', 'Dentist']);
    const before = callApi.mock.calls.length;
    await passTime(card, 15 * 60_000);
    expect(drawn(card)).toEqual(['Dentist', 'Piano']);
    expect(callApi.mock.calls.length).toBe(before + 1);
  });

  it('asks the cache at midnight, and fetches nothing when the window did not move', async () => {
    // Wednesday to Thursday leaves a week starting on Monday where it was.
    const card = await mount({
      view: 'list',
      start_date: 'start_of_week',
      first_day_of_week: 'monday',
      days_to_show: 7,
    });
    expect(card._midnightTimerId).not.toBeNull();
    expect(callApi).toHaveBeenCalledTimes(1);

    await passTime(card, 15 * 60_000);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(drawn(card)).toEqual(['Swim', 'Dentist', 'Piano', 'Bakery']);
  });
});

describe('which start dates follow today', () => {
  it.each([
    [undefined, true],
    ['', true],
    ['today', true],
    ['today+3', true],
    ['+2', true],
    ['start_of_week', true],
    ['monday', true],
    ['sat-1w', true],
    // Malformed values fall back to today, so they follow it too.
    ['next tuesday', true],
    ['2025-02-30', true],
    ['2026-06-17', false],
    ['2026-06-17T15:00:00', false],
  ] as const)('%j follows today: %s', (startDate, follows) => {
    expect(EventUtils.startDateFollowsToday(startDate)).toBe(follows);
  });
});

describe('the paths that already handled midnight', () => {
  it('holds no midnight timer for a card on fixed dates, which fetches nothing at midnight', async () => {
    const card = await mount({ view: 'list', start_date: '2026-06-17' });
    expect(card._midnightTimerId).toBeNull();

    await passTime(card, 15 * 60_000);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(drawn(card)).toEqual(['Swim', 'Dentist']);
  });

  it('holds a midnight timer for a grid with its now line too, and midnight costs one request', async () => {
    const card = await mount({ view: 'grid', time_grid: { show_past_events: true } });
    expect(card._midnightTimerId).not.toBeNull();

    await passTime(card, 15 * 60_000);

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(drawn(card)).toEqual(['Dentist', 'Piano']);
  });

  it('leaves nothing armed once the card is removed', async () => {
    const card = await mount({ view: 'list' });
    expect(card._midnightTimerId).not.toBeNull();

    card.remove();
    await vi.advanceTimersByTimeAsync(15 * 60_000);

    expect(card._midnightTimerId).toBeNull();
    expect(callApi).toHaveBeenCalledTimes(1);
  });
});

/**
 * A grid with its now line hears about midnight twice where its window moves then, because it
 * sheds day columns or follows today: from the midnight timer, which moves the window at once,
 * and from the line's own tick, up to a minute either side of it. Both load through the cache,
 * and record the day they loaded for, so whichever comes second asks for nothing.
 */
describe('a grid with its now line, at midnight', () => {
  /**
   * Mount at an offset into the minute, which decides when the line ticks: its interval starts
   * at the mount, and the midnight timer fires a second past midnight.
   */
  async function mountAt(offsetMs: number, overrides: Partial<Types.Config>) {
    vi.setSystemTime(BEFORE_MIDNIGHT.getTime() + offsetMs);
    return mount({ view: 'grid', time_grid: { show_past_events: true }, ...overrides });
  }

  /** Keep one of the two day columns, as a narrow card does, so the grid sheds the other. */
  async function shed(card: CardUnderTest): Promise<void> {
    card._columnCount = 1;
    card.requestUpdate();
    await settle(card);
    expect(card._midnightTimerId).not.toBeNull();
  }

  /**
   * What is stored for the new window once it is fetched. The cache alone shares one request
   * only in the first case: a window with no events is kept for 15 seconds, and a browser that
   * refuses to store keeps nothing.
   */
  const STORED = {
    'its events': { arrange: () => {}, drawn: ['Dentist'] },
    'no events': {
      arrange: () => {
        emptyFrom = Date.parse('2026-06-18T00:00:00.000Z');
      },
      drawn: [],
    },
    'nothing, the browser refusing to store': {
      arrange: () => vi.stubGlobal('localStorage', refusingStorage()),
      drawn: ['Dentist'],
    },
  } as const;
  const STORED_CASES = Object.keys(STORED) as Array<keyof typeof STORED>;

  it.each(
    (['after', 'before'] as const).flatMap((order) =>
      STORED_CASES.map((stored) => [order, stored] as const),
    ),
  )(
    'asks once while it sheds columns, its line ticking %s the midnight timer, storing %s',
    async (order, stored) => {
      STORED[stored].arrange();
      const card = await mountAt(order === 'after' ? 30_000 : 500, {});
      await shed(card);
      expect(callApi).toHaveBeenCalledTimes(1);

      await passTime(card, 15 * 60_000);

      expect(callApi).toHaveBeenCalledTimes(2);
      const query = new URLSearchParams(String(callApi.mock.calls[1][1]).split('?')[1]);
      expect(query.get('start')).toBe('2026-06-18T00:00:00.000Z');
      expect(drawn(card)).toEqual(STORED[stored].drawn);
    },
  );

  it.each(
    (['after', 'before'] as const).flatMap((order) =>
      STORED_CASES.map((stored) => [order, stored] as const),
    ),
  )(
    'moves to the new day at midnight when its window follows today, asking once, its line ticking %s the midnight timer, storing %s',
    async (order, stored) => {
      // It draws every one of its days, so only the window following today moves it. Without a
      // timer of its own it kept the old day until the line's tick, here half a minute later.
      STORED[stored].arrange();
      // Both of its days, where the shedding card above keeps one.
      const expected = stored === 'no events' ? [] : ['Dentist', 'Piano'];
      const offset = order === 'after' ? 30_000 : 500;
      const card = await mountAt(offset, {});
      expect(card._midnightTimerId).not.toBeNull();
      expect(callApi).toHaveBeenCalledTimes(1);

      // Two seconds past midnight, with no update from Home Assistant to repaint the card.
      await vi.advanceTimersByTimeAsync(10 * 60_000 - offset + 2_000);
      await settle(card);

      expect(drawn(card)).toEqual(expected);
      expect(callApi).toHaveBeenCalledTimes(2);
      const query = new URLSearchParams(String(callApi.mock.calls[1][1]).split('?')[1]);
      expect(query.get('start')).toBe('2026-06-18T00:00:00.000Z');

      await passTime(card, 15 * 60_000);

      expect(callApi).toHaveBeenCalledTimes(2);
      expect(drawn(card)).toEqual(expected);
    },
  );

  it('shares the one request with a list card on the same calendars', async () => {
    // Both cards keep their events under one key, and both midnight timers fire a second past
    // midnight. The list card's, armed first, fetches the new window; the grid's finds that
    // request under way or its answer stored, and its line's tick, half a minute later, finds
    // the day already loaded.
    const list = await mountAt(30_000, { view: 'list' });
    const grid = await mount({ view: 'grid', time_grid: { show_past_events: true } });
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(grid._midnightTimerId).not.toBeNull();

    await passTime(list, 15 * 60_000);
    grid.hass = hass();
    await settle(grid);

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(drawn(list)).toEqual(['Dentist', 'Piano']);
    expect(drawn(grid)).toEqual(['Dentist', 'Piano']);
  });

  it.each(STORED_CASES)(
    'asks nothing more when its tab comes back after the midnight timer fetched, storing %s',
    async (stored) => {
      // The midnight timer runs in a hidden tab and the line's does not, so on the way back the
      // line sees a new day. The tab comes back three minutes past midnight, inside the five
      // minutes after a load in which its return asks for nothing of its own, which would
      // otherwise take the line's load's place.
      STORED[stored].arrange();
      const card = await mountAt(30_000, {});
      await shed(card);
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      try {
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(12.5 * 60_000);
        await settle(card);
        expect(callApi).toHaveBeenCalledTimes(2);

        visibility.mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));
        await settle(card);

        expect(callApi).toHaveBeenCalledTimes(2);
        expect(drawn(card)).toEqual(STORED[stored].drawn);
      } finally {
        visibility.mockRestore();
      }
    },
  );

  it('fetches nothing on fixed dates, as no card on fixed dates does', async () => {
    const card = await mountAt(30_000, { start_date: '2026-06-17' });
    expect(callApi).toHaveBeenCalledTimes(1);

    await passTime(card, 15 * 60_000);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(drawn(card)).toEqual(['Swim', 'Dentist']);
  });
});
