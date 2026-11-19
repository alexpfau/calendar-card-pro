/**
 * A month's keyboard in zones whose days are not all 24 hours long.
 *
 * Every step here is a count of local calendar days: a day, a week, a month, and a row's first and
 * last day. UTC cannot get any of them wrong. Run under every DST project: Berlin and Sydney,
 * either hemisphere's change; New York, behind UTC; and the Azores, whose spring day has no 00:00.
 * Each has its own change inside the six weeks of March 2026 (February 23 to April 5, Mondays
 * first): New York's on Sunday the 8th, Berlin's and the Azores' on the 29th, Sydney's on April 5.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const ANNA = 'calendar.anna';

describe('the zone', () => {
  it('moves its offset between January and July, or this file proves nothing', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });
});

//-----------------------------------------------------------------------------
// THE CARD
//-----------------------------------------------------------------------------

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];
  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function hass(): Types.Hass {
  return {
    states: {
      [ANNA]: { entity_id: ANNA, state: 'off', attributes: { friendly_name: 'Anna' } },
    },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
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
    callApi: vi.fn().mockResolvedValue([]),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

async function settle(card: CardUnderTest): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
}

async function mount(): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({
    view: 'month',
    entities: [ANNA],
    first_day_of_week: 'monday',
    toolbar: { show: true, navigation: true },
  });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  for (const observer of RecordingResizeObserver.instances) {
    observer.callback([{ contentRect: { width: 900 } }]);
  }
  await settle(card);
  return card;
}

const root = (card: CardUnderTest) => card.shadowRoot!;
const cells = (card: CardUnderTest) => [
  ...root(card).querySelectorAll<HTMLElement>('.month-container [role="gridcell"]'),
];
const dayOf = (element: Element | null | undefined) =>
  element?.getAttribute('aria-label')?.split(', ').slice(0, 3).join(', ');

/** The element focus is on, through the card's shadow root. */
const focused = (card: CardUnderTest) => root(card).activeElement;

async function press(card: CardUnderTest, key: string): Promise<void> {
  focused(card)!.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }),
  );
  await settle(card);
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 2, 15, 10));
  vi.stubGlobal('localStorage', memoryStorage());
  EventUtils.clearPageStore();
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.replaceChildren();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a month’s keyboard across the changes of clock', () => {
  it('names forty-two days, each on its own weekday, and keys move by local days', async () => {
    const card = await mount();
    const names = cells(card).map(dayOf);
    expect(names[0]).toBe('Monday, February 23, 2026');
    expect(names[41]).toBe('Sunday, April 5, 2026');
    expect(new Set(names).size).toBe(42);
    expect(
      names.every((name, index) =>
        name!.startsWith(
          ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][index % 7],
        ),
      ),
    ).toBe(true);

    const visit = async (from: string, keys: string[]) => {
      cells(card)
        .find((element) => dayOf(element) === from)!
        .focus();
      const seen: Array<string | undefined> = [];
      for (const key of keys) {
        await press(card, key);
        seen.push(dayOf(focused(card)));
      }
      return seen;
    };
    // New York's change, the Azores' and Berlin's, and Sydney's, each crossed by a week and a day.
    expect(
      await visit('Saturday, March 7, 2026', ['ArrowDown', 'ArrowRight', 'ArrowLeft']),
    ).toEqual(['Saturday, March 14, 2026', 'Sunday, March 15, 2026', 'Saturday, March 14, 2026']);
    expect(await visit('Monday, March 23, 2026', ['End', 'ArrowRight', 'Home'])).toEqual([
      'Sunday, March 29, 2026',
      'Monday, March 30, 2026',
      'Monday, March 30, 2026',
    ]);
    // April 5 is drawn on March's rows, so Page Down pages to April on the same date, then to May.
    expect(await visit('Sunday, March 29, 2026', ['ArrowDown', 'PageDown', 'PageDown'])).toEqual([
      'Sunday, April 5, 2026',
      'Sunday, April 5, 2026',
      'Tuesday, May 5, 2026',
    ]);
    expect(root(card).querySelector('.month-container')!.getAttribute('aria-label')).toBe(
      'May 2026',
    );
  });
});
