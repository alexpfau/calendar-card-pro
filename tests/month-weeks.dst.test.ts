/**
 * Month from the start date's week (`month → start: week`), under every zone the suite runs in.
 *
 * The first row is the week holding Month's home day, the resolved start date or today, as a
 * calendar month's is the week of the 1st, and `month → weeks` rows follow it. The page is the
 * coming weeks rather than a month, so it pages by its own weeks as the other layouts page by their
 * days, dims no day as another month's, and its home button is named as theirs is. Every date is
 * local, so each zone draws the same days; the fixtures sit in November to January, when every
 * zone here is off UTC. Names are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { layOutMonthList } from './helpers/month-geometry';
import { memoryStorage } from './memory-storage';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { MONTH_ROWS_PROPERTY } from '../src/rendering/month';
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
      // Home Assistant before 2026.5, so every calendar loads by REST at once.
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

/** The coming four weeks, the shape the request for this asked for. */
const FOUR_WEEKS = { start: 'week', weeks: 4 };

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
    month: FOUR_WEEKS,
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

const cellDay = (cell: Element) =>
  key(new Date((cell as unknown as { calendarCardMonthCell: number }).calendarCardMonthCell));

/** What a Month card shows: its heading, its first and last day, its weeks and its home button. */
function month(card: CardUnderTest): {
  heading: string;
  rows: [string, string];
  weeks: number;
  home: string;
} {
  const cells = [...root(card).querySelectorAll<HTMLElement>('.month-container .month-day')];
  return {
    heading: text(root(card).querySelector('.toolbar-month-text')),
    rows: [cellDay(cells[0]), cellDay(cells[cells.length - 1])],
    weeks: root(card).querySelectorAll('.month-container > .month-week').length,
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

/** Picks a day in the heading's date picker, as the browser reports it. */
async function pick(card: CardUnderTest, day: string): Promise<void> {
  const input = root(card).querySelector<HTMLInputElement>('.toolbar-date-input')!;
  input.value = day;
  input.dispatchEvent(new Event('change'));
  await settle(card);
}

async function switchTo(card: CardUnderTest, view: 'list' | 'month'): Promise<void> {
  // Whichever form the switcher draws: a card not measured draws it collapsed, a menu of views.
  const segment = root(card).querySelector<HTMLButtonElement>(
    `.view-switcher-segment[data-view="${view}"]`,
  );
  if (segment) {
    segment.click();
  } else {
    root(card).querySelector<HTMLButtonElement>('.view-switcher-pill')!.click();
    root(card).querySelector<HTMLButtonElement>(`.layout-menu-row[data-view="${view}"]`)!.click();
  }
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

/** Presses a key on a month day's cell, as a browser dispatches it, and lets the card draw. */
async function pressKey(card: CardUnderTest, day: string, keyName: string): Promise<void> {
  const cell = [...root(card).querySelectorAll<HTMLElement>('.month-container .month-day')].find(
    (each) => cellDay(each) === day,
  )!;
  cell.focus();
  cell.dispatchEvent(
    new KeyboardEvent('keydown', { key: keyName, bubbles: true, composed: true, cancelable: true }),
  );
  await settle(card);
  await vi.advanceTimersByTimeAsync(0);
  await settle(card);
}

/** The day whose cell is the month's tab stop. */
const tabStop = (card: CardUnderTest) =>
  cellDay(root(card).querySelector('.month-container .month-day[tabindex="0"]')!);

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
  // Wednesday 18 November: the week runs Monday 16 to Sunday 22.
  vi.setSystemTime(new Date(2026, 10, 18, 10));
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

describe('the weeks Month opens on', () => {
  it('starts at today’s week and draws the weeks asked for, no more', async () => {
    const card = await mount({});
    // The heading names the month of the first day shown, top left.
    expect(month(card)).toEqual({
      heading: 'November 2026',
      rows: ['2026-11-16', '2026-12-13'],
      weeks: 4,
      home: 'Today',
    });
    // A Month card alone loads its four weeks, and nothing else.
    expect(asked).toEqual(['2026-11-16']);
    const container = root(card).querySelector<HTMLElement>('.month-container')!;
    expect(container.style.getPropertyValue(MONTH_ROWS_PROPERTY)).toBe('4');
  });

  it('draws six weeks where `weeks` is unset, and writes no row count for them', async () => {
    const card = await mount({ month: { start: 'week' } });
    expect(month(card)).toMatchObject({ rows: ['2026-11-16', '2026-12-27'], weeks: 6 });
    const container = root(card).querySelector<HTMLElement>('.month-container')!;
    expect(container.style.getPropertyValue(MONTH_ROWS_PROPERTY)).toBe('');
  });

  it('dims no day as another month’s, and names each 1st’s month', async () => {
    const card = await mount({});
    expect(root(card).querySelectorAll('.month-day').length).toBe(28);
    expect(root(card).querySelectorAll('.month-day.other-month')).toHaveLength(0);
    expect(
      [...root(card).querySelectorAll('.month-date-month')].map((element) => text(element)),
    ).toEqual(['Dec']);
    // Control: a calendar month on the same day dims the days either side of November.
    const calendar = await mount({ month: {} });
    expect(calendar.shadowRoot!.querySelectorAll('.month-day.other-month').length).toBeGreaterThan(
      0,
    );
  });

  it('names its grid by the dates it spans, as the heading’s tooltip does', async () => {
    const card = await mount({});
    const tooltip = root(card).querySelector('.toolbar-month-button')!.getAttribute('title');
    expect(tooltip).toMatch(/Nov 16.*Dec 13/);
    expect(root(card).querySelector('.month-container')!.getAttribute('aria-label')).toBe(tooltip);
  });

  it.each([
    // Wednesday 25 November: four weeks from Monday 23 hold eight November days and twenty of
    // December's.
    ['four weeks mostly in the next month', new Date(2026, 10, 25, 10), 4, '2026-11-23'],
    // Wednesday 2 December: one week from Monday 30 November holds one November day.
    ['one week starting on a month’s last day', new Date(2026, 11, 2, 10), 1, '2026-11-30'],
  ] as const)(
    'names the month of the first day shown, not the one with most days: %s',
    async (_name, now, weeks, first) => {
      vi.setSystemTime(now);
      const card = await mount({ month: { start: 'week', weeks } });
      expect(month(card)).toMatchObject({
        heading: 'November 2026',
        rows: [first, expect.any(String)],
      });
      expect(root(card).querySelector<HTMLInputElement>('.toolbar-date-input')!.value).toBe(first);
      await press(card, 'next');
      expect(month(card).heading).toBe('December 2026');
    },
  );

  it.each([
    // A fixed date opens its own week, named by its first day: it holds no today.
    ['a fixed date', '2027-01-15', ['2027-01-11', '2027-02-07'], 'Mon, Jan 11, 2027'],
    // 30 days ahead is Friday 18 December.
    ['30 days ahead', 'today+30', ['2026-12-14', '2027-01-10'], 'Mon, Dec 14'],
    // 3 days back is Sunday 15 November, the week before today's.
    ['3 days back', 'today-3', ['2026-11-09', '2026-12-06'], 'Today'],
    ['the start of the week', 'start_of_week', ['2026-11-16', '2026-12-13'], 'Today'],
  ] as const)('starts at the week holding %s', async (_name, start_date, rows, home) => {
    const card = await mount({ start_date });
    expect(month(card)).toMatchObject({ rows, home });
    expect(asked).toEqual([rows[0]]);
  });

  it('opens today’s week for Tomorrow on a week’s last day, as Month reads Tomorrow', async () => {
    // Sunday 22 November: tomorrow is Monday 23, in the week after. Month reads Tomorrow as today.
    vi.setSystemTime(new Date(2026, 10, 22, 10));
    const card = await mount({ start_date: 'today+1' });
    expect(month(card)).toMatchObject({ rows: ['2026-11-16', '2026-12-13'], home: 'Today' });
  });

  it('moves to the new week at midnight, and loads it', async () => {
    // Sunday 22 November, 23:59: Monday's week is the next one.
    vi.setSystemTime(new Date(2026, 10, 22, 23, 59));
    const card = await mount({});
    expect(month(card).rows[0]).toBe('2026-11-16');
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await settle(card);
    expect(month(card)).toMatchObject({ rows: ['2026-11-23', '2026-12-20'], home: 'Today' });
    expect(asked[asked.length - 1]).toBe('2026-11-23');
  });
});

describe('paging the weeks', () => {
  it('moves a whole page at a time, and goes back home', async () => {
    const card = await mount({});
    await press(card, 'next');
    expect(month(card)).toEqual({
      heading: 'December 2026',
      rows: ['2026-12-14', '2027-01-10'],
      weeks: 4,
      home: 'Today',
    });
    await press(card, 'previous');
    await press(card, 'previous');
    expect(month(card).rows).toEqual(['2026-10-19', '2026-11-15']);
    await press(card, 'home');
    expect(month(card).rows).toEqual(['2026-11-16', '2026-12-13']);
  });

  it('opens the page holding a picked day, lined up with home', async () => {
    const card = await mount({});
    // The picker opens on the page's first day.
    expect(root(card).querySelector<HTMLInputElement>('.toolbar-date-input')!.value).toBe(
      '2026-11-16',
    );
    await pick(card, '2026-12-25');
    expect(month(card).rows).toEqual(['2026-12-14', '2027-01-10']);
    // 107 days past home's first: three whole pages on, from Monday 8 February.
    await pick(card, '2027-03-03');
    expect(month(card).rows).toEqual(['2027-02-08', '2027-03-07']);
    expect(root(card).querySelector<HTMLInputElement>('.toolbar-date-input')!.value).toBe(
      '2027-02-08',
    );
    // A day home holds is home.
    await pick(card, '2026-12-01');
    expect(month(card).rows).toEqual(['2026-11-16', '2026-12-13']);
  });

  it('pages by Page Down and past the last row, to the same weekday in the same row', async () => {
    const card = await mount({});
    await pressKey(card, '2026-11-18', 'PageDown');
    expect(month(card).rows).toEqual(['2026-12-14', '2027-01-10']);
    expect(tabStop(card)).toBe('2026-12-16');
    // Down from the last row opens the next page, with the day in its first row.
    await pressKey(card, '2027-01-06', 'ArrowDown');
    expect(month(card).rows).toEqual(['2027-01-11', '2027-02-07']);
    expect(tabStop(card)).toBe('2027-01-13');
    await pressKey(card, '2027-01-13', 'PageUp');
    expect(month(card).rows).toEqual(['2026-12-14', '2027-01-10']);
    expect(tabStop(card)).toBe('2026-12-16');
  });
});

describe('switching between List and Month', () => {
  it('carries the day in view to the week it is in, on the same load', async () => {
    const card = await mount({
      view: 'list',
      days_to_show: 7,
      show_empty_days: true,
      toolbar: SWITCHER,
    });
    expect(listDays(card)).toEqual(['2026-11-18', '2026-11-24']);
    await press(card, 'next');
    expect(listDays(card)).toEqual(['2026-11-25', '2026-12-01']);
    const fetched = asked.length;

    // Into Month: the week holding Wednesday 25 November is the first row.
    await switchTo(card, 'month');
    expect(month(card).rows).toEqual(['2026-11-23', '2026-12-20']);
    expect(asked).toHaveLength(fetched);

    // Back to List on the day carried.
    await switchTo(card, 'list');
    expect(listDays(card)).toEqual(['2026-11-25', '2026-12-01']);

    // A page on in Month, which holds no today, carries its first day.
    await switchTo(card, 'month');
    await press(card, 'next');
    expect(month(card).rows).toEqual(['2026-12-21', '2027-01-17']);
    await switchTo(card, 'list');
    expect(listDays(card)).toEqual(['2026-12-21', '2026-12-27']);
  });
});

describe('the narrow form', () => {
  /** The day the narrow form lists under its weeks, as its list names it. */
  const listed = (card: CardUnderTest) => text(root(card).querySelector('.month-day-list-name'));

  it('draws the weeks asked for, dims none, and lists today at home', async () => {
    const card = await mount({}, 360);
    expect(root(card).querySelector('.month-narrow')).not.toBeNull();
    expect(root(card).querySelectorAll('.month-narrow > .month-week')).toHaveLength(4);
    expect(root(card).querySelectorAll('.month-narrow .month-day.other-month')).toHaveLength(0);
    expect(listed(card)).toContain('November 18');
  });

  it('lists a page’s first day where the page holds no today', async () => {
    const card = await mount({}, 360);
    await press(card, 'next');
    expect(listed(card)).toContain('December 14');
    await press(card, 'previous');
    expect(listed(card)).toContain('November 18');
  });
});

describe('hide_when_empty', () => {
  it.each([
    ['an event earlier today’s week', new Date(2026, 10, 17, 9), true],
    ['an event later in the weeks', new Date(2026, 10, 25, 9), false],
    ['an event past the weeks', new Date(2026, 11, 5, 9), true],
  ] as const)('counts from today to the end of its weeks: %s', async (_name, start, hides) => {
    events = [{ summary: 'Swim', start, end: new Date(start.getTime() + 60 * 60 * 1000) }];
    const card = await mount({
      month: { start: 'week', weeks: 2 },
      hide_when_empty: true,
      toolbar: { show: false },
    });
    expect(card.hidden).toBe(hides);
  });
});

describe('the load’s identity', () => {
  const now = new Date(2026, 10, 18, 10);
  const identity = (month: Record<string, unknown>) =>
    ViewConfig.loadIdentity(
      ViewConfig.loadConfig(
        { ...DEFAULT_CONFIG, entities: [ANNA], view: 'month', month } as Types.Config,
        1,
        true,
        now,
      ),
    );

  it('names the weeks, so a calendar month and each count keep their own cache entries', () => {
    expect(identity({}).variant).toBe('_monthonly1');
    expect(identity({ start: 'week' }).variant).toBe('_monthonly1_weeks6');
    expect(identity(FOUR_WEEKS)).toEqual({
      startDate: undefined,
      days: 28,
      variant: '_monthonly1_weeks4',
    });
  });
});
