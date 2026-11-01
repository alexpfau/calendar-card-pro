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
 * that already handled midnight are pinned beside the fix: a grid with its now line refetches
 * from the line's own tick, and must not now fetch twice; a card on fixed dates must not start
 * fetching at midnight. Column and grid cards that shed day columns are pinned in
 * `column-count-render.test.ts`.
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

/** Answers for the window asked about, as Home Assistant does: what overlaps it. */
const callApi = vi.fn(async (_method: string, path: string) => {
  const query = new URLSearchParams(path.split('?')[1]);
  const from = Date.parse(query.get('start')!);
  const to = Date.parse(query.get('end')!);
  return EVENTS.filter(
    (event) => Date.parse(event.start.dateTime!) < to && Date.parse(event.end.dateTime!) > from,
  ).map((event) => ({ ...event }));
});

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

  it('leaves a grid with its now line to the line, so midnight costs one request', async () => {
    const card = await mount({ view: 'grid', time_grid: { show_past_events: true } });
    expect(card._midnightTimerId).toBeNull();

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
