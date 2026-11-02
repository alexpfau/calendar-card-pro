/**
 * The calendar filter's hidden calendars, kept in step across the tabs of one browser.
 *
 * Every tab shares the one `localStorage` entry, but a tab holds its hidden set in memory and
 * writes the whole set on every press. So a tab that missed a reset made in another wrote the
 * reset-away calendars straight back the next time someone pressed a chip in it, and the reset
 * tab came back from a reload with them hidden again. A card now takes up another tab's write
 * as it happens (`storage`), and reads the entry again whenever it may have missed one: when it
 * is attached again, and when its tab comes back.
 *
 * happy-dom delivers a dispatched `StorageEvent` but, like a browser, fires none for a write in
 * its own window, so the other tab is played here by writing the entry and dispatching the event
 * a browser would deliver.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import {
  type ChoiceStorage,
  VIEW_CHOICE_STORAGE_KEY,
  configFingerprint,
  forgetChoice,
  hiddenCalendarsChange,
  readHiddenCalendars,
  readStoredHiddenCalendars,
  writeHiddenCalendars,
  writeViewChoice,
} from '../src/utils/view-choice';
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

const NOW = new Date(Date.UTC(2026, 5, 17, 10, 0));

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

const HELD: Record<string, Types.CalendarEventData[]> = {
  [ANNA]: [
    {
      summary: 'Dentist',
      uid: 'dentist',
      start: { dateTime: '2026-06-17T15:00:00.000Z' },
      end: { dateTime: '2026-06-17T16:00:00.000Z' },
    },
  ],
  [BEN]: [
    {
      summary: 'Football',
      uid: 'football',
      start: { dateTime: '2026-06-17T18:00:00.000Z' },
      end: { dateTime: '2026-06-17T19:00:00.000Z' },
    },
  ],
};

const CONFIG = buildConfig({
  entities: [ANNA, BEN],
  days_to_show: 3,
  toolbar: {
    show: true,
    legend: 'chips',
    navigation: false,
    reset: false,
    view_switcher: false,
    add_event: false,
    refresh: false,
  },
});

const FINGERPRINT = configFingerprint(CONFIG);

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  readonly updateComplete: Promise<boolean>;
}

class NoResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const originalResizeObserver = globalThis.ResizeObserver;

const callApi = vi.fn(async (_method: string, path: string) => {
  return HELD[path.split('?')[0].replace('calendars/', '')] ?? [];
});

const HASS = {
  states: Object.fromEntries(
    [ANNA, BEN].map((id) => [
      id,
      { entity_id: id, state: 'off', attributes: { supported_features: 7 } },
    ]),
  ),
  locale: { language: 'en' },
  callApi,
  localize: (key: string) => key,
};

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(CONFIG);
  card.hass = HASS;
  document.body.appendChild(card);
  await settle(card);
  return card;
}

/** The calendars a card draws as hidden, by the chips' pressed state. */
function hiddenOn(card: CardUnderTest): string[] {
  return Array.from(card.shadowRoot!.querySelectorAll<HTMLButtonElement>('.legend-chip'))
    .filter((chip) => chip.getAttribute('aria-pressed') === 'false')
    .map((chip) => chip.dataset.calendar!);
}

function titles(card: CardUnderTest): string[] {
  return Array.from(card.shadowRoot!.querySelectorAll('.content-container .event-title')).map(
    (title) => title.textContent!.trim(),
  );
}

async function press(card: CardUnderTest, id: string): Promise<void> {
  card.shadowRoot!.querySelector<HTMLButtonElement>(`.legend-chip[data-calendar="${id}"]`)!.click();
  await settle(card);
}

/** Makes a write as another tab would, and delivers the event a browser sends this one. */
function inAnotherTab(write: () => void): void {
  const oldValue = localStorage.getItem(VIEW_CHOICE_STORAGE_KEY);
  write();
  const newValue = localStorage.getItem(VIEW_CHOICE_STORAGE_KEY);
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: VIEW_CHOICE_STORAGE_KEY,
      oldValue,
      newValue,
      storageArea: localStorage,
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  callApi.mockClear();
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
  globalThis.ResizeObserver = NoResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
});

describe('a card and the same card in another tab', () => {
  /** The reported case: the other tab's reset, then a press here. */
  it('keeps a reset made in another tab when a calendar is hidden here next', async () => {
    writeHiddenCalendars(FINGERPRINT, [ANNA]);
    const card = await mount();
    expect(hiddenOn(card)).toEqual([ANNA]);

    inAnotherTab(() => forgetChoice(FINGERPRINT));
    await settle(card);
    expect(hiddenOn(card)).toEqual([]);
    expect(titles(card)).toContain('Dentist');

    await press(card, BEN);
    expect(readHiddenCalendars(FINGERPRINT)).toEqual([BEN]);
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it('hides a calendar another tab hides, and shows it when that tab does', async () => {
    const card = await mount();

    inAnotherTab(() => writeHiddenCalendars(FINGERPRINT, [BEN]));
    await settle(card);
    expect(hiddenOn(card)).toEqual([BEN]);
    expect(titles(card)).not.toContain('Football');

    inAnotherTab(() => writeHiddenCalendars(FINGERPRINT, []));
    await settle(card);
    expect(hiddenOn(card)).toEqual([]);
  });

  it('ignores a write for another configuration, the view alone, or another storage', async () => {
    writeHiddenCalendars(FINGERPRINT, [ANNA]);
    const card = await mount();

    inAnotherTab(() => writeHiddenCalendars('another-card', [ANNA, BEN]));
    inAnotherTab(() => writeViewChoice(FINGERPRINT, 'column'));
    localStorage.removeItem(VIEW_CHOICE_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: sessionStorage }));
    await settle(card);

    expect(hiddenOn(card)).toEqual([ANNA]);
  });

  it('shows every calendar when another tab clears the storage', async () => {
    writeHiddenCalendars(FINGERPRINT, [ANNA]);
    const card = await mount();

    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    await settle(card);

    expect(hiddenOn(card)).toEqual([]);
  });

  it('catches up when attached again, having heard nothing while detached', async () => {
    writeHiddenCalendars(FINGERPRINT, [ANNA]);
    const card = await mount();
    card.remove();

    inAnotherTab(() => forgetChoice(FINGERPRINT));
    document.body.appendChild(card);
    await settle(card);
    expect(hiddenOn(card)).toEqual([]);

    await press(card, BEN);
    expect(readHiddenCalendars(FINGERPRINT)).toEqual([BEN]);
  });

  it('catches up when its tab comes back, for a write no event reached', async () => {
    writeHiddenCalendars(FINGERPRINT, [ANNA]);
    const card = await mount();

    forgetChoice(FINGERPRINT);
    await settle(card);
    expect(hiddenOn(card)).toEqual([ANNA]);

    document.dispatchEvent(new Event('visibilitychange'));
    await settle(card);
    expect(hiddenOn(card)).toEqual([]);
  });

  /** A same-page card takes up whether the set was stored along with the set itself. */
  it('keeps a refused set on a second card of the same configuration too', async () => {
    const first = await mount();
    const second = await mount();
    const real = localStorage;
    const refusing = {
      getItem: (key: string) => real.getItem(key),
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    vi.stubGlobal('localStorage', refusing);

    await press(first, ANNA);
    expect(hiddenOn(second)).toEqual([ANNA]);

    second.remove();
    document.body.appendChild(second);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(second);
    expect(hiddenOn(second)).toEqual([ANNA]);

    // Once the storage takes a press again, both catch up with it again.
    vi.stubGlobal('localStorage', real);
    await press(first, BEN);
    expect(readHiddenCalendars(FINGERPRINT)).toEqual([ANNA, BEN]);
    second.remove();
    inAnotherTab(() => forgetChoice(FINGERPRINT));
    document.body.appendChild(second);
    await settle(second);
    expect(hiddenOn(second)).toEqual([]);
  });

  it('keeps a set the storage refused, through a reattach and a return', async () => {
    const card = await mount();
    const real = localStorage;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => real.getItem(key),
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });

    await press(card, ANNA);
    expect(hiddenOn(card)).toEqual([ANNA]);
    expect(readHiddenCalendars(FINGERPRINT)).toEqual([]);

    card.remove();
    document.body.appendChild(card);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(card);
    expect(hiddenOn(card)).toEqual([ANNA]);
  });
});

describe('reading another tab’s write', () => {
  const entry = (choices: Record<string, { view?: string; hidden?: string[] }>) =>
    JSON.stringify({
      version: 1,
      choices: Object.fromEntries(
        Object.entries(choices).map(([fingerprint, choice]) => [fingerprint, { ...choice, at: 1 }]),
      ),
    });

  it('names the set now hidden when this configuration’s set changed', () => {
    const change = (oldValue: string | null, newValue: string | null) =>
      hiddenCalendarsChange({ key: VIEW_CHOICE_STORAGE_KEY, oldValue, newValue }, 'card');

    expect(change(null, entry({ card: { hidden: [ANNA] } }))).toEqual([ANNA]);
    expect(change(entry({ card: { hidden: [ANNA] } }), entry({ card: { hidden: [BEN] } }))).toEqual(
      [BEN],
    );
    expect(change(entry({ card: { hidden: [ANNA] } }), null)).toEqual([]);
    expect(change(entry({ card: { hidden: [ANNA] } }), entry({ card: { view: 'grid' } }))).toEqual(
      [],
    );
  });

  it('names nothing when this configuration’s set did not change', () => {
    const change = (oldValue: string | null, newValue: string | null) =>
      hiddenCalendarsChange({ key: VIEW_CHOICE_STORAGE_KEY, oldValue, newValue }, 'card');

    expect(change(null, entry({ other: { hidden: [ANNA] } }))).toBeUndefined();
    expect(
      change(
        entry({ card: { hidden: [ANNA] } }),
        entry({ card: { hidden: [ANNA], view: 'grid' } }),
      ),
    ).toBeUndefined();
    expect(
      change(entry({ card: { hidden: [ANNA, BEN] } }), entry({ card: { hidden: [BEN, ANNA] } })),
    ).toBeUndefined();
    expect(hiddenCalendarsChange({ key: 'other', oldValue: null, newValue: '1' }, 'card')).toBe(
      undefined,
    );
  });

  it('reads a cleared storage as every calendar shown', () => {
    expect(hiddenCalendarsChange({ key: null, oldValue: null, newValue: null }, 'card')).toEqual(
      [],
    );
  });
});

describe('what the storage holds, and whether it took a write', () => {
  const refusing: ChoiceStorage = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('full', 'QuotaExceededError');
    },
    removeItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
  };

  const unreadable: ChoiceStorage = {
    getItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
    setItem: () => {},
    removeItem: () => {},
  };

  it('tells an unreadable storage from one holding nothing', () => {
    expect(readStoredHiddenCalendars('card', null)).toBeUndefined();
    expect(readStoredHiddenCalendars('card', unreadable)).toBeUndefined();
    expect(readStoredHiddenCalendars('card', localStorage)).toEqual([]);

    writeHiddenCalendars('card', [ANNA], localStorage);
    expect(readStoredHiddenCalendars('card', localStorage)).toEqual([ANNA]);
  });

  it('reports whether a write was kept', () => {
    expect(writeHiddenCalendars('card', [ANNA], localStorage)).toBe(true);
    expect(forgetChoice('card', localStorage)).toBe(true);
    expect(forgetChoice('card', localStorage)).toBe(true);

    expect(writeHiddenCalendars('card', [ANNA], refusing)).toBe(false);
    expect(writeHiddenCalendars('card', [ANNA], null)).toBe(false);
    expect(forgetChoice('card', null)).toBe(false);
  });
});
