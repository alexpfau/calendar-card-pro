/**
 * A month's day list and its selected day in zones whose days are not all 24 hours long.
 *
 * The day model lists each day from local midnight to local midnight, and the selected day
 * follows today past midnight when today was selected; both are local-calendar arithmetic that
 * UTC cannot get wrong. Run under every DST project: Berlin and Sydney, either hemisphere's change;
 * New York, behind UTC; and the Azores, whose spring day has no 00:00. Each has its own change
 * inside the six weeks of March 2026 (February 23 to April 5, Mondays first), and the events
 * below cross it in local wall-clock time, built with `new Date(y, m, d, h, mi)`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as EventUtils from '../src/utils/events';
import * as MonthDay from '../src/utils/month-day';
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

/** A local wall-clock moment, as an ISO instant. */
const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month, day, hour, minute).toISOString();

/** The changes of clock inside March 2026's six weeks, by local date. */
const NIGHTS: Array<[number, number]> = [
  [2, 8], // New York, forward
  [2, 29], // Berlin and the Azores, forward; the Azores at midnight
  [3, 5], // Sydney, back
];

interface RawEvent {
  summary: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

/** Overnight across each change, an all-day event across each, and one inside each day. */
const EVENTS: RawEvent[] = NIGHTS.flatMap(([month, day]) => {
  const key = (offset: number) => {
    const date = new Date(2026, month, day + offset);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  return [
    {
      summary: `Night ${day}`,
      start: { dateTime: at(month, day - 1, 22) },
      end: { dateTime: at(month, day, 6) },
    },
    { summary: `Away ${day}`, start: { date: key(-1) }, end: { date: key(1) } },
    {
      summary: `Lunch ${day}`,
      start: { dateTime: at(month, day, 12) },
      end: { dateTime: at(month, day, 13) },
    },
  ];
});

describe('the zone', () => {
  it('moves its offset between January and July, or this file proves nothing', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });
});

describe('the day model across a change of clock', () => {
  const config = ViewConfig.resolveEffectiveConfig(
    buildConfig({ view: 'month', entities: [ANNA], first_day_of_week: 'monday' }),
    'month',
  );
  const events = EventUtils.processEvents(
    EVENTS.map((event) => ({ ...event, _entityId: ANNA })),
    config,
  );
  const start = ViewConfig.monthRowsStart(new Date(2026, 2, 1), 1);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 10));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists each event on the local days it touches', () => {
    expect(start).toEqual(new Date(2026, 1, 23));
    const weeks = MonthDay.monthDayLists(events, config, start, 42, 'en');
    const daysOf = (summary: string) =>
      weeks.flatMap((list, index) => {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        return list.some((event) => event.summary === summary)
          ? [`${date.getMonth() + 1}/${date.getDate()}`]
          : [];
      });
    for (const [month, day] of NIGHTS) {
      const date = (offset: number) => {
        const value = new Date(2026, month, day + offset);
        return `${value.getMonth() + 1}/${value.getDate()}`;
      };
      expect(daysOf(`Night ${day}`)).toEqual([date(-1), date(0)]);
      expect(daysOf(`Away ${day}`)).toEqual([date(-1), date(0)]);
      expect(daysOf(`Lunch ${day}`)).toEqual([date(0)]);
    }
  });

  it('holds the same events for each day listed alone as among the six weeks', () => {
    const weeks = MonthDay.monthDayLists(events, config, start, 42, 'en');
    const alone = weeks.map((_, index) =>
      MonthDay.monthDayEvents(
        events,
        config,
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
        'en',
      ),
    );
    const titles = (lists: Types.CalendarEventData[][]) =>
      lists.map((list) => list.map((event) => event.summary));
    expect(titles(weeks).flat()).toHaveLength(15);
    expect(titles(alone)).toEqual(titles(weeks));
  });
});

//-----------------------------------------------------------------------------
// THE SELECTED DAY AT MIDNIGHT
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
    states: { [ANNA]: { entity_id: ANNA, state: 'off', attributes: { friendly_name: 'Anna' } } },
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
    callApi: vi.fn().mockResolvedValue(EVENTS.map((event) => ({ ...event }))),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

/** The selected day's number, and the day its list names. */
function selection(card: CardUnderTest): [string[], string] {
  const root = card.shadowRoot!;
  const text = (element: Element | null) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return [
    [...root.querySelectorAll('.month-narrow .month-day.month-selected .month-date')].map(text),
    text(root.querySelector('.month-day-list-name')),
  ];
}

describe('the selected day at midnight', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', memoryStorage());
    RecordingResizeObserver.instances = [];
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    document.body.replaceChildren();
    globalThis.ResizeObserver = originalResizeObserver;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function mountAt(now: Date): Promise<CardUnderTest> {
    vi.setSystemTime(now);
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ view: 'month', entities: [ANNA], first_day_of_week: 'monday' });
    card.hass = hass();
    document.body.appendChild(card);
    await card.updateEvents(true);
    await card.updateComplete;
    for (const observer of RecordingResizeObserver.instances) {
      observer.callback([{ contentRect: { width: 375 } }]);
    }
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    return card;
  }

  /** Runs the clock past the next local midnight, and lets the card draw. */
  async function pastMidnight(card: CardUnderTest, now: Date): Promise<void> {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    await vi.advanceTimersByTimeAsync(next.getTime() - now.getTime());
    await card.updateComplete;
  }

  // The last evening of each change's eve: past midnight is the day the clocks change, which in
  // the Azores starts at 01:00.
  it.each(NIGHTS)('follows today into the day of the change on %i/%i', async (month, day) => {
    const evening = new Date(2026, month, day - 1, 23, 59, 30);
    const card = await mountAt(evening);
    const today = (date: Date) =>
      date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    expect(selection(card)).toEqual([[String(evening.getDate())], today(evening)]);

    await pastMidnight(card, evening);
    const next = new Date(2026, month, day);
    expect(selection(card)).toEqual([[String(next.getDate())], today(next)]);
  });

  it('stays on another day someone selected', async () => {
    const evening = new Date(2026, 2, 28, 23, 59, 30);
    const card = await mountAt(evening);
    const tenth = [
      ...card.shadowRoot!.querySelectorAll<HTMLElement>('.month-narrow .month-day'),
    ][15];
    for (const type of ['pointerdown', 'pointerup']) {
      tenth.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true, composed: true }), {
          pointerId: 1,
          button: 0,
          isPrimary: true,
          pointerType: 'touch',
          clientX: 0,
          clientY: 0,
        }),
      );
    }
    await card.updateComplete;
    expect(selection(card)[0]).toEqual(['10']);

    await pastMidnight(card, evening);
    expect(selection(card)).toEqual([['10'], 'Tuesday, March 10, 2026']);
  });
});
