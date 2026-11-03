/**
 * Cards on one key, in a browser that refuses to store.
 *
 * Every card keeps what it loads in `localStorage`, and that is how two cards on the same
 * calendars and window share one request: whichever loads second reads what the first stored.
 * A browser can refuse every write, because its storage is full, blocked in its settings, or a
 * private window allowing none, and then nothing settled was shared at all. Only a request
 * still in flight could be joined, so two cards whose loads landed more than a round trip apart
 * each asked: at midnight when their timers fired apart, and from then on at every refresh,
 * since each card's next refresh falls one interval after its own load and nothing brought the
 * two back together. The card now holds what storage refused in memory (`heldEntries`), read by
 * the same rules as a stored entry.
 *
 * Home Assistant answers after a round trip here, as it does in a browser. A mock answering in
 * microtasks settles the first request before a second timer due at the same instant runs, so
 * without held entries even the rows with both timers together asked twice, which no browser
 * does.
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
  _refreshAfterWrite(changed: { ids: string[] }): void;
  requestUpdate(): void;
  readonly updateComplete: Promise<boolean>;
}

/** Ten minutes before midnight on Wednesday, June 17, 2026; the unit project runs on UTC. */
const BEFORE_MIDNIGHT = new Date('2026-06-17T23:50:00.000Z');

/** How long Home Assistant takes to answer, in fake time. */
const ROUND_TRIP = 200;

const timed = (summary: string, day: string, calendar = 'calendar.anna') => ({
  calendar,
  event: {
    summary,
    start: { dateTime: `${day}T09:00:00.000Z` },
    end: { dateTime: `${day}T10:00:00.000Z` },
  },
});

const EVENTS = [
  timed('Swim', '2026-06-17'),
  timed('Dentist', '2026-06-18'),
  timed('Piano', '2026-06-19'),
  timed('Chess', '2026-06-17', 'calendar.ben'),
];

/** Answers for the calendar and window asked about, one round trip later. */
const callApi = vi.fn(
  (_method: string, path: string) =>
    new Promise((resolve) => {
      setTimeout(() => {
        const [base, search] = path.split('?');
        const query = new URLSearchParams(search);
        const from = Date.parse(query.get('start')!);
        const to = Date.parse(query.get('end')!);
        resolve(
          EVENTS.filter(
            ({ calendar, event }) =>
              base === `calendars/${calendar}` &&
              Date.parse(event.start.dateTime) < to &&
              Date.parse(event.end.dateTime) > from,
          ).map(({ event }) => ({ ...event })),
        );
      }, ROUND_TRIP);
    }),
);

const refused = (): never => {
  throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
};

/** Holds nothing and refuses every write. */
function refusingStorage(): Storage {
  return {
    getItem: () => null,
    setItem: refused,
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;
}

/** Throws on every call, as storage blocked in the browser's settings does. */
function blockedStorage(): Storage {
  const deny = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return {
    getItem: deny,
    setItem: deny,
    removeItem: deny,
    clear: deny,
    key: deny,
    get length(): number {
      return deny();
    },
  } as Storage;
}

/**
 * Took the cards' first load and refuses every write after it, as storage that fills up does.
 * What it took stays, so it holds the day before while the new day is held in memory.
 */
function fillingStorage(): Storage & { fill(): void } {
  const storage = memoryStorage();
  const setItem = storage.setItem.bind(storage);
  let full = false;
  return Object.assign(storage, {
    setItem: (key: string, value: string) => (full ? refused() : setItem(key, value)),
    fill: () => {
      full = true;
    },
  });
}

function hass(): Record<string, unknown> {
  return {
    states: {
      'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} },
      'calendar.ben': { entity_id: 'calendar.ben', state: 'off', attributes: {} },
    },
    locale: { language: 'en', time_format: '24' },
    callApi,
    callService: vi.fn(),
    localize: (key: string) => key,
  };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) await vi.advanceTimersByTimeAsync(0);
}

/** Let the requests under way be answered. */
async function answered(): Promise<void> {
  await settle();
  await vi.advanceTimersByTimeAsync(ROUND_TRIP + 1);
  await settle();
}

function card(overrides: Partial<Types.Config> = {}): CardUnderTest {
  const element = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  element.setConfig(
    buildConfig({
      entities: ['calendar.anna'],
      days_to_show: 2,
      show_past_events: true,
      view: 'list',
      ...overrides,
    }),
  );
  element.hass = hass();
  return element;
}

/** Move the clock to a wall time, then settle. */
async function until(iso: string): Promise<void> {
  await vi.advanceTimersByTimeAsync(Date.parse(iso) - Date.now());
  await settle();
}

/** Which of the fixture's events a card draws. */
function drawn(element: CardUnderTest): string[] {
  const text = element.shadowRoot!.textContent ?? '';
  return EVENTS.map(({ event }) => event.summary).filter((summary) => text.includes(summary));
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

describe('two cards on one key, at midnight', () => {
  const STORAGE = {
    'storing, as a control': () => memoryStorage(),
    'refusing every write': () => refusingStorage(),
    'blocked in its settings': () => blockedStorage(),
    'full after the first load, holding the day before': () => fillingStorage(),
  } as const;
  const STORAGE_CASES = Object.keys(STORAGE) as Array<keyof typeof STORAGE>;

  it.each(
    ([0, 30_000] as const).flatMap((apart) => STORAGE_CASES.map((name) => [apart, name] as const)),
  )(
    'with their timers %i ms apart, ask once for the new day and share every refresh after it, the browser %s',
    async (apart, name) => {
      const storage = STORAGE[name]();
      vi.stubGlobal('localStorage', storage);

      // Appended in one task, as a dashboard appends its cards, so their loads join.
      const first = card();
      const second = card();
      document.body.append(first, second);
      await answered();
      expect(callApi).toHaveBeenCalledTimes(1);
      if ('fill' in storage) storage.fill();

      if (apart > 0) {
        // The second card's timer is armed again after the wall clock steps forward: the
        // first card's keeps its remaining delay, so it fires `apart` after the second's.
        clearTimeout(second._midnightTimerId!);
        second._midnightTimerId = null;
        vi.setSystemTime(Date.now() + apart);
        second.requestUpdate();
        await settle();
        expect(second._midnightTimerId).not.toBeNull();
      }

      await until('2026-06-18T00:02:00.000Z');

      expect(callApi).toHaveBeenCalledTimes(2);
      const query = new URLSearchParams(String(callApi.mock.calls[1][1]).split('?')[1]);
      expect(query.get('start')).toBe('2026-06-18T00:00:00.000Z');
      expect(drawn(first)).toEqual(['Dentist', 'Piano']);
      expect(drawn(second)).toEqual(['Dentist', 'Piano']);

      // One request per 30-minute refresh, shared, rather than one for each card.
      await until('2026-06-18T01:00:00.000Z');
      const before = callApi.mock.calls.length;
      await until('2026-06-18T03:00:00.000Z');
      expect(callApi.mock.calls.length - before).toBe(4);
    },
  );
});

describe('a window held in memory', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', refusingStorage());
    vi.setSystemTime(new Date('2026-06-17T10:00:00.000Z'));
  });

  it('is drawn by a card that mounts later, which asks for nothing under refresh_on_navigate off', async () => {
    document.body.append(card({ refresh_on_navigate: false }));
    await answered();
    await vi.advanceTimersByTimeAsync(60_000);

    const later = card({ refresh_on_navigate: false });
    document.body.append(later);
    await settle();

    expect(drawn(later)).toEqual(['Swim', 'Dentist']);
    await answered();
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['holding it', ['calendar.anna'], 1],
    // The write generation says that a calendar changed, not which: a window of another
    // calendar is loaded again as well, as nothing held would have been. Stored windows are
    // expired by calendar instead (`expireStoredCalendars`).
    ['holding another calendar', ['calendar.ben'], 1],
  ] as const)(
    'is loaded again after a calendar write, when the card %s comes back',
    async (_name, entities, requests) => {
      // Three days, so its window is not the one the writing card refreshes.
      const away = card({ refresh_on_navigate: false, days_to_show: 3, entities: [...entities] });
      document.body.append(away);
      await answered();
      away.remove();

      const writer = card({ refresh_on_navigate: false });
      document.body.append(writer);
      await answered();
      writer._refreshAfterWrite({ ids: ['calendar.anna'] });
      await answered();

      const before = callApi.mock.calls.length;
      document.body.append(away);
      await answered();
      expect(callApi.mock.calls.length - before).toBe(requests);
    },
  );

  it('is read as due after a write made through another copy of the card', async () => {
    // A development build beside a release: two copies of the module, one page.
    vi.resetModules();
    const dev = await import('../src/utils/events');
    vi.resetModules();
    const release = await import('../src/utils/events');
    expect(dev).not.toBe(release);

    const config = buildConfig({ entities: ['calendar.anna'], days_to_show: 2 });
    const loading = dev.fetchEventData(hass() as unknown as Types.Hass, config, 'copies');
    await vi.advanceTimersByTimeAsync(ROUND_TRIP + 1);
    await loading;
    expect(dev.readEventSnapshot(hass() as unknown as Types.Hass, config, 'copies')?.due).toBe(
      false,
    );

    // What the release's card does once its dialog saved a change to Anna's calendar.
    release.expireStoredCalendars((ids) => ids.includes('calendar.anna'));
    release.advanceWriteGeneration();

    expect(dev.readEventSnapshot(hass() as unknown as Types.Hass, config, 'copies')?.due).toBe(
      true,
    );
  });

  /** Load a window under its own key, as a card with its own configuration does. */
  async function load(instanceId: string, config = buildConfig({ entities: ['calendar.anna'] })) {
    const loading = EventUtils.fetchEventData(hass() as unknown as Types.Hass, config, instanceId);
    await vi.advanceTimersByTimeAsync(ROUND_TRIP + 1);
    await loading;
  }

  const held = (instanceId: string, config = buildConfig({ entities: ['calendar.anna'] })) =>
    EventUtils.readEventSnapshot(hass() as unknown as Types.Hass, config, instanceId) !== null;

  it('is not drawn once it is a day old, as a stored one is not', async () => {
    const config = buildConfig({ entities: ['calendar.anna'], start_date: '2026-06-17' });
    await load('day-old', config);
    const snapshot = EventUtils.readEventSnapshot(
      hass() as unknown as Types.Hass,
      config,
      'day-old',
    );
    expect(snapshot).not.toBeNull();
    const day = 24 * 60 * 60_000;

    vi.setSystemTime(snapshot!.fetchedAt + day - 1);
    expect(held('day-old', config)).toBe(true);
    vi.setSystemTime(snapshot!.fetchedAt + day);
    expect(held('day-old', config)).toBe(false);
  });

  it('is one of the 16 used last, as many as the page store keeps', async () => {
    for (let index = 0; index < 16; index += 1) await load(`window-${index}`);
    // Read, so it is used more recently than every other.
    expect(held('window-0')).toBe(true);

    await load('window-16');

    expect(held('window-0')).toBe(true);
    expect(held('window-1')).toBe(false);
    expect(held('window-2')).toBe(true);
    expect(held('window-16')).toBe(true);
  });
});
