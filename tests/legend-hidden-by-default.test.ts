/**
 * A calendar hidden by default (`hidden_by_default`, backlog item 425), on the real card.
 *
 * The option is the calendar filter's starting state: a device that has chosen nothing for the
 * card starts with the calendar hidden, and anyone can show it there. So this file pins the start
 * itself, that a choice away from it is remembered and a choice back to it is not, that reset and
 * another card or tab bring it back, and every place it does nothing: a calendar the filter
 * leaves out, a card without a filter, and a card being edited. The storage half has its own
 * cases in `view-choice.test.ts`; the rest of the filter is `legend.test.ts`'s.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import {
  VIEW_CHOICE_STORAGE_KEY,
  configFingerprint,
  readStoredHiddenCalendars,
  writeHiddenCalendars,
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

/** Wednesday, June 17, 2026, mid-morning; the unit project runs on UTC. */
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
      summary: 'Sprinkler',
      uid: 'sprinkler',
      start: { dateTime: '2026-06-17T18:00:00.000Z' },
      end: { dateTime: '2026-06-17T18:30:00.000Z' },
    },
  ],
};

/** What an emptied card draws: only the empty day's placeholder. */
const EMPTIED = ['✓ No events'];

/** The filter's chips and the reset button, and nothing else of the toolbar. */
const TOOLBAR: Types.ToolbarConfig = {
  show: true,
  legend: 'chips',
  navigation: false,
  reset: true,
  view_switcher: false,
  add_event: false,
  refresh: false,
  search: false,
};

/** Ben's calendar drives an automation: it starts hidden. */
const BEN_HIDDEN: Partial<Types.Config> = {
  entities: [ANNA, { entity: BEN, hidden_by_default: true }],
  days_to_show: 2,
  toolbar: TOOLBAR,
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  preview: boolean;
  hidden: boolean;
  readonly updateComplete: Promise<boolean>;
}

class NoResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const callApi = vi.fn();
const originalResizeObserver = globalThis.ResizeObserver;

function hass(): Record<string, unknown> {
  return {
    states: Object.fromEntries(
      [ANNA, BEN].map((id) => [
        id,
        {
          entity_id: id,
          state: 'off',
          attributes: { supported_features: 7, friendly_name: id === ANNA ? 'Anna' : 'Ben' },
        },
      ]),
    ),
    locale: { language: 'en' },
    callApi,
    localize: (key: string) => (key === 'ui.common.reset' ? 'Reset' : key),
  };
}

function configFor(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ ...BEN_HIDDEN, ...overrides });
}

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(
  overrides: Partial<Types.Config> = {},
  flag?: 'preview',
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(configFor(overrides));
  if (flag) card[flag] = true;
  card.hass = hass();
  document.body.appendChild(card);
  await settle(card);
  return card;
}

const root = (card: CardUnderTest): ShadowRoot => card.shadowRoot!;

/** The titles of the events drawn, in order. */
function titles(card: CardUnderTest): string[] {
  return Array.from(root(card).querySelectorAll('.content-container .event-title')).map((title) =>
    title.textContent!.trim(),
  );
}

/** Each chip by calendar, and whether it shows that calendar's events. */
function chips(card: CardUnderTest): Record<string, string | null> {
  return Object.fromEntries(
    Array.from(root(card).querySelectorAll<HTMLButtonElement>('.legend-chip')).map((chip) => [
      chip.dataset.calendar!,
      chip.getAttribute('aria-pressed'),
    ]),
  );
}

async function press(card: CardUnderTest, id: string): Promise<void> {
  root(card).querySelector<HTMLButtonElement>(`.legend-chip[data-calendar="${id}"]`)!.click();
  await settle(card);
}

/** Whether the reset button is on offer: drawn, and neither hidden nor showing its check. */
function resetLit(card: CardUnderTest): boolean {
  const button = root(card).querySelector<HTMLButtonElement>('.reset-button');
  if (!button) throw new Error('no reset button');
  return button.getAttribute('aria-disabled') !== 'true';
}

async function pressReset(card: CardUnderTest): Promise<void> {
  root(card).querySelector<HTMLButtonElement>('.reset-button')!.click();
  await settle(card);
}

/** What the device stores for this card, `null` for nothing. */
function stored(): string[] | null {
  const text = localStorage.getItem(VIEW_CHOICE_STORAGE_KEY);
  if (text === null) return null;
  const choice = JSON.parse(text).choices[configFingerprint(configFor())];
  return choice?.hidden ?? null;
}

/** A write another tab makes, heard as the `storage` event this tab gets for it. */
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
  callApi.mockReset();
  callApi.mockImplementation(
    async (_method: string, path: string) => HELD[path.split('?')[0].replace('calendars/', '')],
  );
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
  globalThis.ResizeObserver = NoResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
});

describe('a calendar hidden by default', () => {
  it('starts hidden on a device that has chosen nothing, and stores nothing for it', async () => {
    const card = await mount();

    expect(titles(card)).toEqual(['Dentist']);
    expect(chips(card)).toEqual({ [ANNA]: 'true', [BEN]: 'false' });
    expect(resetLit(card)).toBe(false);
    expect(stored()).toBeNull();
  });

  it('shows on a press, and the device remembers it for the next visit', async () => {
    const card = await mount();
    await press(card, BEN);

    expect(titles(card)).toEqual(['Dentist', 'Sprinkler']);
    // Every calendar shown, which differs from the start, so it is stored as an empty list.
    expect(stored()).toEqual([]);
    expect(resetLit(card)).toBe(true);

    card.remove();
    const again = await mount();
    expect(titles(again)).toEqual(['Dentist', 'Sprinkler']);
  });

  it('forgets the choice once a press brings it back to the start', async () => {
    const card = await mount();
    await press(card, BEN);
    await press(card, BEN);

    expect(titles(card)).toEqual(['Dentist']);
    expect(stored()).toBeNull();
    expect(resetLit(card)).toBe(false);
  });

  it('remembers a calendar hidden beside it, and Reset brings back the start', async () => {
    const card = await mount();
    await press(card, ANNA);
    expect(stored()).toEqual([BEN, ANNA]);
    expect(titles(card)).toEqual(EMPTIED);

    await press(card, BEN);
    await press(card, ANNA);
    expect(titles(card)).toEqual(['Dentist', 'Sprinkler']);
    expect(resetLit(card)).toBe(true);

    await pressReset(card);
    expect(titles(card)).toEqual(['Dentist']);
    expect(chips(card)).toEqual({ [ANNA]: 'true', [BEN]: 'false' });
    expect(stored()).toBeNull();
  });

  it('starts every device again after a configuration change, like any other choice', async () => {
    writeHiddenCalendars(configFingerprint(configFor()), []);
    const shown = await mount();
    expect(titles(shown)).toEqual(['Dentist', 'Sprinkler']);

    shown.remove();
    const edited = await mount({ title: 'Family' });
    expect(titles(edited)).toEqual(['Dentist']);
  });

  it('follows another card with the same configuration, and another tab', async () => {
    const first = await mount();
    const second = await mount();

    await press(first, BEN);
    expect(titles(second)).toEqual(['Dentist', 'Sprinkler']);

    // Another tab presses Reset: its entry goes, which reads as the start here.
    inAnotherTab(() => localStorage.removeItem(VIEW_CHOICE_STORAGE_KEY));
    await settle(first);
    await settle(second);
    expect(titles(first)).toEqual(['Dentist']);
    expect(titles(second)).toEqual(['Dentist']);
    expect(readStoredHiddenCalendars(configFingerprint(configFor()), localStorage, [BEN])).toEqual([
      BEN,
    ]);
  });

  it.each([
    [
      'a calendar the filter leaves out',
      {
        entities: [ANNA, { entity: BEN, hidden_by_default: true, show_in_legend: false }],
      },
    ],
    ['a card whose toolbar shows no filter', { toolbar: { ...TOOLBAR, legend: false as const } }],
    ['a card without a toolbar', { toolbar: { ...TOOLBAR, show: false } }],
  ])('does nothing for %s, where nothing could show it again', async (_name, overrides) => {
    const card = await mount(overrides as Partial<Types.Config>);
    expect(titles(card)).toEqual(['Dentist', 'Sprinkler']);
  });

  it('is set aside while the card is being edited, which shows every calendar', async () => {
    const card = await mount({}, 'preview');
    expect(titles(card)).toEqual(['Dentist', 'Sprinkler']);
  });

  it('keeps a card with hide_when_empty, so the filter that shows it stays in reach', async () => {
    callApi.mockImplementation(async (_method: string, path: string) =>
      path.startsWith(`calendars/${BEN}`) ? HELD[BEN] : [],
    );
    const card = await mount({ hide_when_empty: true });

    expect(titles(card)).toEqual(EMPTIED);
    expect(card.hidden).toBe(false);
  });
});
