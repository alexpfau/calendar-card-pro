/**
 * The month Month opens on, the home button that returns to it, and what follows from it, under
 * every zone the suite runs in.
 *
 * Month's home is today's month for every start date that follows today, and a fixed date's own
 * month otherwise (`ViewConfig.monthHomeDay`). The other layouts keep starting on the resolved
 * start date, so a card that switches between them has two homes, and both are pinned here: the
 * cases sit on a month's first and last days, where a relative start date falls in another
 * month than today, and where the old rule opened the wrong one. Every date is local, so each
 * zone draws the same days; the fixtures sit in November and December, when every zone here is
 * off UTC. Names are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { layOutMonthList } from './helpers/month-geometry';
import { memoryStorage } from './memory-storage';
import type * as Types from '../src/config/types';
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

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

/** Answers the resize observer the card starts, with any width a test reports. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];
  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** A local date and time, as Home Assistant writes it with its offset. */
function local(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

/** A day's local date, as `YYYY-MM-DD`. */
function key(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

interface Fixture {
  summary: string;
  start: Date;
  end: Date;
}

/** The events Home Assistant holds for Anna; a test sets its own. */
let events: Fixture[] = [];
/** The first day of every window the card asked for, in order. */
let asked: string[] = [];

function hass(): Types.Hass {
  return {
    states: {
      [ANNA]: {
        entity_id: ANNA,
        state: 'off',
        attributes: { friendly_name: 'Anna', supported_features: 7 },
      },
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
    localize: (name: string) =>
      ({ 'ui.common.previous': 'Previous', 'ui.common.next': 'Next' })[name] ?? name,
    formatEntityState: (_stateObj: unknown, value?: string) => String(value ?? ''),
    callApi: vi.fn((_method: string, path: string) => {
      const params = new URLSearchParams(path.split('?')[1]);
      const from = Date.parse(params.get('start')!);
      const to = Date.parse(params.get('end')!);
      asked.push(key(new Date(from)));
      return Promise.resolve(
        events
          .filter((event) => event.start.getTime() < to && event.end.getTime() > from)
          .map((event) => ({
            summary: event.summary,
            start: { dateTime: local(event.start) },
            end: { dateTime: local(event.end) },
          })),
      );
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

/** The date navigation alone, or with the switcher between List and Month. */
const NAVIGATION = {
  show: true,
  navigation: true,
  view_switcher: false,
  add_event: false,
  reset: false,
  refresh: false,
  search: false,
  legend: false,
};
const SWITCHER = { ...NAVIGATION, view_switcher: true, view_switcher_layouts: ['list', 'month'] };

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
}

async function mount(config: Record<string, unknown>, width?: number): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({
    view: 'month',
    entities: [ANNA],
    first_day_of_week: 'monday',
    toolbar: NAVIGATION,
    ...config,
  });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await settle(card);
  if (width !== undefined) {
    for (const observer of RecordingResizeObserver.instances) {
      observer.callback([{ contentRect: { width } }]);
    }
    await settle(card);
  }
  return card;
}

const root = (card: CardUnderTest) => card.shadowRoot!;
const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** What a Month card shows: its heading, its six weeks, and what its home button is called. */
function month(card: CardUnderTest): { heading: string; rows: [string, string]; home: string } {
  const cells = [...root(card).querySelectorAll<HTMLElement>('.month-container .month-day')];
  const day = (cell: HTMLElement | undefined) =>
    key(new Date((cell as unknown as { calendarCardMonthCell: number }).calendarCardMonthCell));
  return {
    heading: text(root(card).querySelector('.toolbar-month-text')),
    rows: [day(cells[0]), day(cells[cells.length - 1])],
    home: homeButton(card).getAttribute('aria-label') ?? '',
  };
}

function homeButton(card: CardUnderTest): HTMLButtonElement {
  return root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[1];
}

async function press(card: CardUnderTest, which: 'previous' | 'home' | 'next'): Promise<void> {
  root(card)
    .querySelectorAll<HTMLButtonElement>('.date-navigation-segment')
    [{ previous: 0, home: 1, next: 2 }[which]].click();
  await settle(card);
}

async function switchTo(card: CardUnderTest, view: 'list' | 'month'): Promise<void> {
  root(card)
    .querySelector<HTMLButtonElement>(`.view-switcher-segment[data-view="${view}"]`)!
    .click();
  await settle(card);
}

/** The first and last day a List card draws, from its day tables. */
function listDays(card: CardUnderTest): [string, string] {
  const days = [...root(card).querySelectorAll('table.day-table')]
    .map((table) => table as unknown as { calendarCardDaySlot?: { timestamp?: number } })
    .map((table) => table.calendarCardDaySlot?.timestamp)
    .filter((timestamp): timestamp is number => typeof timestamp === 'number');
  return [key(new Date(Math.min(...days))), key(new Date(Math.max(...days)))];
}

const originalResizeObserver = globalThis.ResizeObserver;
let unlayOut: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', memoryStorage());
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  unlayOut = layOutMonthList({ room: 400 });
  events = [];
  asked = [];
});

afterEach(() => {
  unlayOut();
  document.body.replaceChildren();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the zone these tests run under', () => {
  // Sanity: these tests only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2025, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2025, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
  });
});

describe('the month Month opens on', () => {
  it.each([
    // Wednesday 18 November: every start date that falls in November.
    ['unset, mid-month', new Date(2026, 10, 18, 10), undefined, 'November 2026'],
    // Tuesday 1 December: the week began on Monday 30 November, in the month before.
    [
      'the start of the week on a month’s 1st',
      new Date(2026, 11, 1, 10),
      'start_of_week',
      'December 2026',
    ],
    // Thursday 3 December, three days back is 30 November.
    ['three days back early in a month', new Date(2026, 11, 3, 10), 'today-3', 'December 2026'],
    // Monday 30 November: tomorrow is 1 December, in the month after.
    ['tomorrow on a month’s last day', new Date(2026, 10, 30, 10), 'today+1', 'November 2026'],
    // A log of the last 30 days, mid-month: 29 days back is 20 October.
    ['29 days back', new Date(2026, 10, 18, 10), 'today-29', 'November 2026'],
    ['30 days ahead', new Date(2026, 10, 18, 10), 'today+30', 'November 2026'],
    ['a weekday', new Date(2026, 10, 30, 10), 'friday', 'November 2026'],
  ] as const)('is today’s for %s', async (_name, now, start_date, heading) => {
    vi.setSystemTime(now);
    const card = await mount(start_date === undefined ? {} : { start_date });
    expect(month(card).heading).toBe(heading);
    // Today is in the month the heading names, and the button home is called Today.
    expect(month(card).home).toBe('Today');
    const today = root(card).querySelector('.month-container .month-day.today');
    expect(today).not.toBeNull();
    expect(today!.classList.contains('other-month')).toBe(false);
  });

  it.each([
    ['in a later month', '2027-01-15', 'January 2027', ['2026-12-28', '2027-02-07']],
    ['in an earlier month', '2026-09-10', 'September 2026', ['2026-08-31', '2026-10-11']],
  ] as const)('is a fixed date’s own month, %s', async (_name, start_date, heading, rows) => {
    vi.setSystemTime(new Date(2026, 10, 18, 10));
    const card = await mount({ start_date });
    // The home button names the month it goes to, not the first row's first day.
    expect(month(card)).toEqual({ heading, rows, home: heading });
    expect(asked).toEqual([rows[0]]);
  });

  it('names its month even where today is drawn among its last days', async () => {
    // Thursday 3 December, a fixed date in November: November's last row holds today, dimmed.
    vi.setSystemTime(new Date(2026, 11, 3, 10));
    const card = await mount({ start_date: '2026-11-10' });
    expect(month(card)).toEqual({
      heading: 'November 2026',
      rows: ['2026-10-26', '2026-12-06'],
      home: 'November 2026',
    });
    expect(root(card).querySelector('.month-day.today')!.classList.contains('other-month')).toBe(
      true,
    );
  });

  it('pages a month at a time from it, and goes back to it', async () => {
    vi.setSystemTime(new Date(2026, 11, 3, 10));
    const card = await mount({ start_date: 'start_of_week' });
    expect(month(card).heading).toBe('December 2026');
    await press(card, 'previous');
    expect(month(card)).toMatchObject({ heading: 'November 2026', home: 'Today' });
    await press(card, 'home');
    expect(month(card).heading).toBe('December 2026');
    await press(card, 'next');
    expect(month(card).heading).toBe('January 2027');
  });

  it('moves to the new month at midnight for a start date that follows today', async () => {
    // Monday 30 November, 23:59, Start of Week: the week began today and does not move at
    // midnight, but the month does.
    vi.setSystemTime(new Date(2026, 10, 30, 23, 59));
    const card = await mount({ start_date: 'start_of_week' });
    expect(month(card).heading).toBe('November 2026');
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await settle(card);
    expect(month(card)).toMatchObject({ heading: 'December 2026', home: 'Today' });
    expect(asked[asked.length - 1]).toBe('2026-11-30');
  });

  it('selects today in the compact form, in the month it opens', async () => {
    vi.setSystemTime(new Date(2026, 11, 3, 10));
    const card = await mount({ start_date: 'start_of_week' }, 360);
    expect(root(card).querySelector('.month-compact')).not.toBeNull();
    expect(text(root(card).querySelector('.month-day-list-name'))).toContain('December 3');
  });
});

describe('the two homes of a card that switches between List and Month', () => {
  it('keeps List on its start date while Month opens today’s month', async () => {
    // Monday 30 November, Tomorrow: List starts on 1 December, Month opens November.
    vi.setSystemTime(new Date(2026, 10, 30, 10));
    const card = await mount({
      view: 'list',
      days_to_show: 7,
      show_empty_days: true,
      start_date: 'today+1',
      toolbar: SWITCHER,
    });
    expect(listDays(card)).toEqual(['2026-12-01', '2026-12-07']);
    await switchTo(card, 'month');
    expect(month(card)).toMatchObject({ heading: 'November 2026', home: 'Today' });
    // One load held both homes, so switching fetched nothing.
    expect(asked).toEqual(['2026-10-26']);
    await switchTo(card, 'list');
    expect(listDays(card)).toEqual(['2026-12-01', '2026-12-07']);
  });

  it('goes to List’s own home from the Month page that holds it', async () => {
    // Wednesday 18 November, 30 days ahead: List's home is 18 December, Month's is November.
    vi.setSystemTime(new Date(2026, 10, 18, 10));
    const card = await mount({
      view: 'month',
      days_to_show: 7,
      show_empty_days: true,
      start_date: 'today+30',
      toolbar: SWITCHER,
    });
    expect(month(card).heading).toBe('November 2026');
    await press(card, 'next');
    expect(month(card).heading).toBe('December 2026');
    await switchTo(card, 'list');
    expect(listDays(card)).toEqual(['2026-12-18', '2026-12-24']);
    await press(card, 'home');
    expect(listDays(card)).toEqual(['2026-12-18', '2026-12-24']);
  });
});

describe('hide_when_empty on Month', () => {
  it.each([
    // Tomorrow, and the only event later today, which Month draws: the card stays.
    ['an event later today, with Tomorrow', 'today+1', [new Date(2026, 10, 18, 15)], false],
    // 30 days ahead, and the only event next week, in the month shown: the card stays.
    ['an event next week, 30 days ahead', 'today+30', [new Date(2026, 10, 25, 9)], false],
    // Start of Week, and the only event on Monday, before today: the card hides.
    [
      'an event earlier this week, with Start of Week',
      'start_of_week',
      [new Date(2026, 10, 16, 9)],
      true,
    ],
    // A fixed date counts from itself: an event before it hides the card, one after keeps it.
    ['an event before a fixed date', '2026-11-25', [new Date(2026, 10, 20, 9)], true],
    ['an event after a fixed date', '2026-11-25', [new Date(2026, 10, 26, 9)], false],
  ] as const)('counts from today or a fixed date: %s', async (_name, start_date, starts, hides) => {
    vi.setSystemTime(new Date(2026, 10, 18, 10));
    events = starts.map((start) => ({
      summary: 'Swim',
      start,
      end: new Date(start.getTime() + 60 * 60 * 1000),
    }));
    const card = await mount({ start_date, hide_when_empty: true, toolbar: { show: false } });
    expect(card.hidden).toBe(hides);
  });
});
