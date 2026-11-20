/**
 * What the view switcher carries from one layout to the next, under every zone the suite runs in.
 *
 * The date in view goes with the switch: the first day of the window List, Columns and Grid show,
 * in time order whichever way a list reads, or the day a month has selected, else its own (today
 * where the month holds it, else its 1st). The next layout opens on it: Month on the month holding
 * it, with the day selected, and the others on the window starting that day. From home with
 * nothing selected the next layout opens on its own home, and Home returns each layout to its own.
 * So a round trip comes back to where it started, and Month always draws a calendar month.
 *
 * Every date is local, so each zone draws the same days. The main fixtures sit in November and
 * December, when every zone here is off UTC; the last block carries a day across each zone's own
 * clock change. Names are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { layOutMonthList } from './helpers/month-geometry';
import { memoryStorage } from './memory-storage';
import * as Constants from '../src/config/constants';
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

type Layout = 'list' | 'column' | 'grid' | 'month';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  readonly effectiveView: Layout;
  updateEvents(force?: boolean): Promise<void>;
}

/** Answers the resize observer the card starts, with any width a test reports. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];
  constructor(
    readonly callback: (
      entries: Array<{ target: Element; contentRect: { width: number; height: number } }>,
    ) => void,
  ) {
    RecordingResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** A day's local date, as `YYYY-MM-DD`. */
function key(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A local date and time, as Home Assistant writes it with its offset. */
function local(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  return (
    `${key(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:00` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

/** The first day of every window the card asked for, in order. */
let asked: string[] = [];

/** Anna has lunch every day, whatever window is asked for. */
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
      const from = new Date(Date.parse(params.get('start')!));
      const to = Date.parse(params.get('end')!);
      asked.push(key(from));
      const lunches: Array<{ summary: string; start: object; end: object }> = [];
      for (
        let day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
        day.getTime() < to;
        day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      ) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
        const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 13);
        if (end.getTime() > from.getTime() && start.getTime() < to) {
          lunches.push({
            summary: `Lunch ${key(day)}`,
            start: { dateTime: local(start) },
            end: { dateTime: local(end) },
          });
        }
      }
      return Promise.resolve(lunches);
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

const TOOLBAR = {
  show: true,
  navigation: true,
  view_switcher: true,
  add_event: false,
  reset: false,
  refresh: false,
  search: false,
  legend: false,
};

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
}

/** A card that opens as `view`, seven days, every day drawn, at a width (1,100 px by default). */
async function mount(config: Record<string, unknown>, width = 1100): Promise<CardUnderTest> {
  // Only this card's observers answer, each as the card's own box, and no card before it in the
  // same test left a view choice behind.
  RecordingResizeObserver.instances = [];
  vi.stubGlobal('localStorage', memoryStorage());
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({
    entities: [ANNA],
    days_to_show: 7,
    show_empty_days: true,
    first_day_of_week: 'monday',
    toolbar: TOOLBAR,
    ...config,
  });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await settle(card);
  for (const observer of RecordingResizeObserver.instances) {
    observer.callback([{ target: card, contentRect: { width, height: 0 } }]);
  }
  // The layout follows a width once it has held still.
  vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
  await settle(card);
  return card;
}

/** Reports a new width to the card, and lets the layout follow it. */
async function resize(card: CardUnderTest, width: number): Promise<void> {
  for (const observer of RecordingResizeObserver.instances) {
    observer.callback([{ target: card, contentRect: { width, height: 0 } }]);
  }
  vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
  await settle(card);
}

const root = (card: CardUnderTest) => card.shadowRoot!;
const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function press(card: CardUnderTest, which: 'previous' | 'home' | 'next'): Promise<void> {
  root(card)
    .querySelectorAll<HTMLButtonElement>('.date-navigation-segment')
    [{ previous: 0, home: 1, next: 2 }[which]].click();
  await settle(card);
}

async function switchTo(card: CardUnderTest, view: Layout): Promise<void> {
  root(card)
    .querySelector<HTMLButtonElement>(`.view-switcher-segment[data-view="${view}"]`)!
    .click();
  await settle(card);
  expect(card.effectiveView).toBe(view);
}

const cellDay = (cell: Element): string =>
  key(new Date((cell as unknown as { calendarCardMonthCell: number }).calendarCardMonthCell));

/**
 * What the card shows: for a month its heading and its six weeks, and on the compact form the
 * day its list names; for any other layout its first and last day, from the days it stamps.
 */
function shown(card: CardUnderTest): {
  heading?: string;
  days: [string, string];
  listed?: string;
} {
  const cells = [...root(card).querySelectorAll('.month-container .month-day')];
  if (cells.length > 0) {
    const list = root(card).querySelector('.month-day-list-name');
    return {
      heading: text(root(card).querySelector('.toolbar-month-text')),
      days: [cellDay(cells[0]), cellDay(cells[cells.length - 1])],
      ...(list ? { listed: text(list) } : {}),
    };
  }
  const days = new Set<number>();
  for (const node of root(card).querySelectorAll('*')) {
    const slot = (node as unknown as { calendarCardDaySlot?: { timestamp?: number } })
      .calendarCardDaySlot;
    if (typeof slot?.timestamp === 'number') days.add(slot.timestamp);
  }
  const sorted = [...days].sort((a, b) => a - b);
  return { days: [key(new Date(sorted[0])), key(new Date(sorted[sorted.length - 1]))] };
}

/** Taps a day of a compact month, by its date, as a user selects it. */
async function select(card: CardUnderTest, date: string): Promise<void> {
  const cell = [...root(card).querySelectorAll('.month-compact .month-day')].find(
    (each) => cellDay(each) === date,
  ) as HTMLElement;
  cell.click();
  await settle(card);
}

const originalResizeObserver = globalThis.ResizeObserver;
let unlayOut: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', memoryStorage());
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  unlayOut = layOutMonthList({ room: 400 });
  asked = [];
  // Wednesday 18 November 2026: List's home is 18 – 24 November, Month's is November.
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

describe('a page of List, Columns or Grid, switched to Month', () => {
  it.each([
    // One page forward: 25 November – 1 December. Its first day is in November, Month's home.
    ['one page forward', ['next'], undefined, 'November 2026', ['2026-10-26', '2026-12-06']],
    // Two pages forward: 2 – 8 December.
    [
      'two pages forward',
      ['next', 'next'],
      undefined,
      'December 2026',
      ['2026-11-30', '2027-01-10'],
    ],
    // One page back: 11 – 17 November.
    ['one page back', ['previous'], undefined, 'November 2026', ['2026-10-26', '2026-12-06']],
    // A fixed date in January, a page forward: 22 – 28 January.
    ['a later fixed date', ['next'], '2027-01-15', 'January 2027', ['2026-12-28', '2027-02-07']],
  ] as const)(
    'draws the calendar month holding its first day, %s',
    async (_name, moves, start_date, heading, days) => {
      for (const view of ['list', 'column', 'grid'] as const) {
        const card = await mount({ view, ...(start_date ? { start_date } : {}) });
        for (const move of moves) await press(card, move);
        await switchTo(card, 'month');
        expect(shown(card), view).toMatchObject({ heading, days });
        document.body.replaceChildren();
      }
    },
  );

  it('comes back to the same page, fetching nothing on the way', async () => {
    for (const moves of [['next'], ['next', 'next'], ['previous']] as const) {
      const card = await mount({ view: 'list' });
      for (const move of moves) await press(card, move);
      const page = shown(card).days;
      const fetched = asked.length;
      await switchTo(card, 'month');
      await switchTo(card, 'list');
      expect(shown(card).days, moves.join('+')).toEqual(page);
      expect(asked.slice(fetched), moves.join('+')).toEqual([]);
      document.body.replaceChildren();
    }
  });

  it('selects the page’s first day, on a compact month and as the wide month’s tab stop', async () => {
    const compact = await mount({ view: 'list' }, 360);
    await press(compact, 'next');
    await press(compact, 'next');
    await switchTo(compact, 'month');
    expect(shown(compact)).toMatchObject({
      heading: 'December 2026',
      listed: expect.stringContaining('December 2'),
    });
    document.body.replaceChildren();

    const wide = await mount({ view: 'list' });
    await press(wide, 'next');
    await switchTo(wide, 'month');
    const stop = root(wide).querySelector('.month-container .month-day[tabindex="0"]')!;
    expect(cellDay(stop)).toBe('2026-11-25');
  });

  it('opens a list read latest first on the month of its first day, and comes back to it', async () => {
    const card = await mount({ view: 'list', event_order: 'latest_first' }, 360);
    // 25 November – 1 December, read from 1 December down: its first day is still 25 November,
    // so List, Columns and Grid switch among themselves on the same days.
    await press(card, 'next');
    expect(shown(card).days).toEqual(['2026-11-25', '2026-12-01']);
    await switchTo(card, 'month');
    expect(shown(card)).toMatchObject({
      heading: 'November 2026',
      listed: expect.stringContaining('November 25'),
    });
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-11-25', '2026-12-01']);
  });
});

describe('Month, switched to another layout', () => {
  it('carries the day selected on a compact month, and selects it again on the way back', async () => {
    const card = await mount({ view: 'month' }, 360);
    await select(card, '2026-11-25');
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-11-25', '2026-12-01']);
    await switchTo(card, 'month');
    expect(shown(card)).toMatchObject({
      heading: 'November 2026',
      listed: expect.stringContaining('November 25'),
    });
  });

  it.each([
    // A month away without today: its 1st.
    ['a month without today', undefined, new Date(2026, 10, 18, 10), ['2026-12-01', '2026-12-07']],
    // A fixed date in November, today 3 December: December is a page, and holds today.
    [
      'a month away that holds today',
      '2026-11-10',
      new Date(2026, 11, 3, 10),
      ['2026-12-03', '2026-12-09'],
    ],
    // 30 days ahead: List's home is 18 December, yet December's page opens on its 1st.
    [
      'a month holding List’s home',
      'today+30',
      new Date(2026, 10, 18, 10),
      ['2026-12-01', '2026-12-07'],
    ],
  ] as const)(
    'opens on the month’s own day from %s, and comes back to the month',
    async (_name, start_date, now, days) => {
      vi.setSystemTime(now);
      for (const view of ['list', 'column', 'grid'] as const) {
        const card = await mount({ view: 'month', ...(start_date ? { start_date } : {}) });
        await press(card, 'next');
        expect(shown(card).heading).toBe('December 2026');
        const fetched = asked.length;
        await switchTo(card, view);
        expect(shown(card).days, view).toEqual(days);
        await switchTo(card, 'month');
        expect(shown(card), view).toMatchObject({
          heading: 'December 2026',
          days: ['2026-11-30', '2027-01-10'],
        });
        expect(asked.slice(fetched), view).toEqual([]);
        document.body.replaceChildren();
      }
    },
  );
});

describe('home', () => {
  it.each([
    ['no start date', undefined, ['2026-11-18', '2026-11-24']],
    ['Tomorrow', 'today+1', ['2026-11-19', '2026-11-25']],
    ['a fixed date', '2026-11-10', ['2026-11-10', '2026-11-16']],
  ] as const)(
    'opens each layout on its own home from home, with %s',
    async (_name, start_date, days) => {
      const card = await mount({ view: 'list', ...(start_date ? { start_date } : {}) });
      expect(shown(card).days).toEqual(days);
      const fetched = asked.length;
      await switchTo(card, 'month');
      expect(shown(card)).toMatchObject({ heading: 'November 2026' });
      await switchTo(card, 'grid');
      expect(shown(card).days).toEqual(days);
      await switchTo(card, 'month');
      await switchTo(card, 'list');
      expect(shown(card).days).toEqual(days);
      expect(asked.slice(fetched)).toEqual([]);
    },
  );

  it('returns each layout to its own home after a carry', async () => {
    const card = await mount({ view: 'list', start_date: 'today+1' }, 360);
    await press(card, 'next');
    await press(card, 'next');
    await switchTo(card, 'month');
    expect(shown(card).heading).toBe('December 2026');
    await press(card, 'home');
    expect(shown(card)).toMatchObject({
      heading: 'November 2026',
      listed: expect.stringContaining('November 18'),
    });
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-11-19', '2026-11-25']);
  });
});

describe('a carry that lands on a layout’s home', () => {
  it('keeps the day for the way back where a Grid drawing fewer columns starts home on it', async () => {
    // A week back as List's seven days, a fortnight in Grid, which draws a few of them from
    // today. A page forward starts today, which is Grid's home.
    const card = await mount(
      { view: 'list', start_date: 'today-7', time_grid: { days_to_show: 14 } },
      400,
    );
    expect(shown(card).days).toEqual(['2026-11-11', '2026-11-17']);
    await press(card, 'next');
    await switchTo(card, 'grid');
    expect(shown(card).days[0]).toBe('2026-11-18');
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-11-18', '2026-11-24']);
    // Home lets go of it.
    await switchTo(card, 'grid');
    await press(card, 'home');
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-11-11', '2026-11-17']);
  });

  it('keeps the day as the page’s first where the width changes the layout under it', async () => {
    const card = await mount(
      { view: 'list', start_date: 'today-7', time_grid: { days_to_show: 14 } },
      400,
    );
    await press(card, 'next');
    await switchTo(card, 'grid');
    expect(shown(card).days[0]).toBe('2026-11-18');
    // Wide enough for all fourteen days: home would start a week back, the carried day does not.
    await resize(card, 1800);
    expect(card.effectiveView).toBe('grid');
    expect(shown(card).days[0]).toBe('2026-11-18');
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-11-18', '2026-11-24']);
  });

  it('lets go of a day selected at home with a configuration change or editing', async () => {
    const config = { view: 'month', start_date: 'today+7' };
    for (const leave of ['configuration', 'editing'] as const) {
      const card = await mount(config, 360);
      await select(card, '2026-11-20');
      if (leave === 'configuration') {
        card.setConfig({
          entities: [ANNA],
          days_to_show: 7,
          show_empty_days: true,
          first_day_of_week: 'monday',
          toolbar: TOOLBAR,
          ...config,
          title: 'Family',
        });
      } else {
        (card as unknown as { editMode: boolean }).editMode = true;
        await settle(card);
        (card as unknown as { editMode: boolean }).editMode = false;
      }
      await settle(card);
      expect(shown(card).listed, leave).toContain('November 18');
      await switchTo(card, 'list');
      expect(shown(card).days, leave).toEqual(['2026-11-25', '2026-12-01']);
      document.body.replaceChildren();
    }
  });

  it('keeps the day for the way back where it is List’s home', async () => {
    // Monday 30 November, Tomorrow: List's home starts on 1 December, Month's is November.
    vi.setSystemTime(new Date(2026, 10, 30, 10));
    const card = await mount({ view: 'month', start_date: 'today+1' });
    await press(card, 'next');
    expect(shown(card).heading).toBe('December 2026');
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-12-01', '2026-12-07']);
    await switchTo(card, 'month');
    expect(shown(card).heading).toBe('December 2026');
  });

  it('comes back to a page starting today, which is the day Month selects by itself', async () => {
    // A week ahead: List's home is 25 November – 1 December, a page back starts today.
    const card = await mount({ view: 'list', start_date: 'today+7' }, 360);
    await press(card, 'previous');
    expect(shown(card).days).toEqual(['2026-11-18', '2026-11-24']);
    await switchTo(card, 'month');
    expect(shown(card)).toMatchObject({
      heading: 'November 2026',
      listed: expect.stringContaining('November 18'),
    });
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-11-18', '2026-11-24']);
  });

  it('carries a day tapped on a compact month, even the one it selects by itself', async () => {
    const card = await mount({ view: 'month', start_date: 'today+7' }, 360);
    await select(card, '2026-11-18');
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-11-18', '2026-11-24']);
  });

  it('keeps a carried day a date past midnight, as the page it came from is', async () => {
    // A fixed start on Wednesday 4 November: two pages forward start today.
    const card = await mount({ view: 'list', start_date: '2026-11-04' }, 360);
    await press(card, 'next');
    await press(card, 'next');
    expect(shown(card).days).toEqual(['2026-11-18', '2026-11-24']);
    await switchTo(card, 'month');
    vi.setSystemTime(new Date(2026, 10, 19, 0, 30));
    await settle(card);
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2026-11-18', '2026-11-24']);
  });
});

describe('a carry across a clock change', () => {
  /**
   * Sunday 28 March 2027 is the spring change in Berlin and the Azores, whose day has no
   * midnight; Sydney's autumn change is on Sunday 4 April; New York's spring change was on
   * Sunday 14 March, in the same month's weeks.
   */
  it('keeps the date from a page starting on the change, in every zone', async () => {
    // Sunday 21 March 2027: a page forward is 28 March – 3 April.
    vi.setSystemTime(new Date(2027, 2, 21, 10));
    for (const view of ['list', 'column', 'grid'] as const) {
      const card = await mount({ view });
      await press(card, 'next');
      expect(shown(card).days, view).toEqual(['2027-03-28', '2027-04-03']);
      await switchTo(card, 'month');
      expect(shown(card), view).toMatchObject({
        heading: 'March 2027',
        days: ['2027-03-01', '2027-04-11'],
      });
      const stop = root(card).querySelector('.month-container .month-day[tabindex="0"]')!;
      expect(cellDay(stop), view).toBe('2027-03-28');
      await switchTo(card, view);
      expect(shown(card).days, view).toEqual(['2027-03-28', '2027-04-03']);
      document.body.replaceChildren();
    }
  });

  it('opens List on the 1st of a month whose weeks start on the change, and comes back', async () => {
    // Monday 1 March 2027, Sundays first: April's weeks start on Sunday 28 March, the Azores'
    // day without a midnight. Month pages to April; List opens on 1 April; Month comes back.
    vi.setSystemTime(new Date(2027, 2, 1, 10));
    const card = await mount({ view: 'month', first_day_of_week: 'sunday' });
    await press(card, 'next');
    expect(shown(card)).toMatchObject({
      heading: 'April 2027',
      days: ['2027-03-28', '2027-05-08'],
    });
    await switchTo(card, 'list');
    expect(shown(card).days).toEqual(['2027-04-01', '2027-04-07']);
    await switchTo(card, 'month');
    expect(shown(card)).toMatchObject({
      heading: 'April 2027',
      days: ['2027-03-28', '2027-05-08'],
    });
  });
});
