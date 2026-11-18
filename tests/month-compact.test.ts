/**
 * A month's day list, the panel "+N more" opens on it, and the compact form a narrow card draws.
 *
 * The day model is pure (`utils/month-day.ts`) and is pinned on its own first: what a day lists,
 * in what order, which of List's rules it keeps and which it drops. The compact form's switch and
 * the selected day are pure too, and pinned at their thresholds. Then the card itself, from a
 * fake Home Assistant: the form at the widths a resize observer reports, each day's capsule, the
 * selected day's list and every rule that moves it, adding on it, and the day panel through a
 * stand-in for Home Assistant's dialog manager. Zones that move the arithmetic are in
 * `month-compact.dst.test.ts`.
 *
 * Wednesday, November 18, 2026, 10:00 UTC; Mondays first, so home's six weeks run from Monday,
 * October 26 to Sunday, December 6. Names are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { declarations } from './helpers/css-declarations';
import { memoryStorage } from './memory-storage';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import type { PopoverParams } from '../src/interaction/popover-model';
import { DAY_PANEL_TAG, type DayPanelParams } from '../src/rendering/day-panel';
import { EVENT_POPOVER_TAG } from '../src/rendering/event-popover';
import { cardStyles } from '../src/rendering/styles';
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

const NOW = new Date('2026-11-18T10:00:00Z');
const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const BLUE = '#3b82f6';
const GREEN = '#16a34a';

/** A day of November 2026 at local midnight; the unit project runs on UTC. */
const nov = (day: number) => new Date(2026, 10, day);

interface RawEvent {
  summary: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  location?: string;
  calendar: string;
}

const timed = (
  calendar: string,
  summary: string,
  date: string,
  from: string,
  to: string,
  toDate = date,
  location?: string,
): RawEvent => ({
  calendar,
  summary,
  start: { dateTime: `${date}T${from}:00Z` },
  end: { dateTime: `${toDate}T${to}:00Z` },
  ...(location ? { location } : {}),
});

const allDay = (calendar: string, summary: string, from: string, until: string): RawEvent => ({
  calendar,
  summary,
  start: { date: from },
  end: { date: until },
});

const EVENTS: RawEvent[] = [
  // Five on Tuesday the 10th: a capsule of four, and "+2 more" under three lines.
  timed(ANNA, 'Standup', '2026-11-10', '08:00', '08:15'),
  timed(BEN, 'Review', '2026-11-10', '10:00', '11:00'),
  timed(ANNA, 'Lunch with Ben', '2026-11-10', '12:00', '13:00'),
  timed(BEN, 'Planning', '2026-11-10', '14:00', '15:00'),
  timed(ANNA, 'Gym', '2026-11-10', '18:00', '19:00'),
  // Three on the 11th.
  timed(ANNA, 'Swim', '2026-11-11', '07:00', '08:00'),
  timed(BEN, 'Piano', '2026-11-11', '16:00', '17:00'),
  timed(ANNA, 'Book club', '2026-11-11', '19:00', '21:00'),
  // Two on the 12th, one of each.
  timed(ANNA, 'Dentist', '2026-11-12', '14:00', '15:00'),
  timed(BEN, 'Football', '2026-11-12', '17:30', '19:00'),
  // Overnight: the 13th's only event, and the 14th's.
  timed(ANNA, 'Late show', '2026-11-13', '22:30', '01:30', '2026-11-14'),
  // Today: an all-day one, one that has ended, and two to come.
  allDay(BEN, 'Holiday', '2026-11-18', '2026-11-19'),
  timed(ANNA, 'Swim', '2026-11-18', '07:00', '08:00'),
  timed(BEN, 'Standup', '2026-11-18', '09:00', '09:15'),
  timed(ANNA, 'Lunch', '2026-11-18', '12:00', '13:00', '2026-11-18', 'Cafe Anna'),
  // Friday to Tuesday, across the break between the fourth and fifth rows.
  allDay(BEN, 'Trip', '2026-11-20', '2026-11-25'),
];

//-----------------------------------------------------------------------------
// THE DAY MODEL
//-----------------------------------------------------------------------------

/** The source events as the card holds them: matched to their entries by `processEvents`. */
function sourceEvents(config: Types.Config, raw: RawEvent[] = EVENTS): Types.CalendarEventData[] {
  return EventUtils.processEvents(
    raw.map(({ calendar, ...event }) => ({ ...event, _entityId: calendar })),
    config,
  );
}

function monthConfig(overrides: Partial<Types.Config> = {}): Types.Config {
  return ViewConfig.resolveEffectiveConfig(
    buildConfig({
      view: 'month',
      entities: [ANNA, BEN],
      first_day_of_week: 'monday',
      ...overrides,
    }),
    'month',
  );
}

/** A day's titles, as the day model lists them. */
function listed(day: Date, overrides: Partial<Types.Config> = {}, raw?: RawEvent[]): string[] {
  const config = monthConfig(overrides);
  return MonthDay.monthDayEvents(sourceEvents(config, raw), config, day, 'en').map(
    (event) => event.summary ?? '',
  );
}

describe('the day model', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists a day all-day events first, then timed ones by their start', () => {
    expect(listed(nov(18))).toEqual(['Holiday', 'Swim', 'Standup', 'Lunch']);
    expect(listed(nov(10))).toEqual(['Standup', 'Review', 'Lunch with Ben', 'Planning', 'Gym']);
    expect(listed(nov(19))).toEqual([]);
  });

  it('drops the rules that shape a list as a whole', () => {
    const shaped: Partial<Types.Config> = {
      skip_first_events: 2,
      compact_events_to_show: 1,
      compact_days_to_show: 1,
      event_order: 'latest_first',
      show_empty_days: true,
      show_empty_today: true,
      entities: [{ entity: ANNA, compact_events_to_show: 1 }, BEN],
    };
    expect(listed(nov(18), shaped)).toEqual(['Holiday', 'Swim', 'Standup', 'Lunch']);
    // No placeholder stands in for a day without events.
    expect(listed(nov(19), shaped)).toEqual([]);
  });

  it('draws with Month’s options, never List’s block', () => {
    const config = monthConfig({ list: { show_location: false } as Types.ListOverrides });
    const lunch = MonthDay.monthDayEvents(sourceEvents(config), config, nov(18), 'en').find(
      (event) => event.summary === 'Lunch',
    );
    expect(lunch?.location).toBe('Cafe Anna');
  });

  it('keeps the rules about each event: days_of_week, past events and duplicates', () => {
    expect(
      listed(nov(18), { entities: [ANNA, { entity: BEN, days_of_week: 'weekends' }] }),
    ).toEqual(['Swim', 'Lunch']);
    expect(listed(nov(18), { month: { show_past_events: false } })).toEqual(['Holiday', 'Lunch']);
    const twice = [...EVENTS, { ...EVENTS[14], calendar: BEN }];
    expect(listed(nov(18), {}, twice)).toEqual(['Holiday', 'Swim', 'Standup', 'Lunch', 'Lunch']);
    expect(listed(nov(18), { filter_duplicates: true }, twice)).toEqual([
      'Holiday',
      'Swim',
      'Standup',
      'Lunch',
    ]);
  });

  it('lists a multi-day event on every day it covers, whatever its calendar splits', () => {
    for (const entities of [
      [ANNA, BEN],
      [ANNA, { entity: BEN, split_multiday_events: false }],
    ]) {
      const days = [19, 20, 21, 22, 23, 24, 25].map((day) =>
        listed(nov(day), { entities, split_multiday_events: false }).includes('Trip'),
      );
      expect(days).toEqual([false, true, true, true, true, true, false]);
    }
    expect(listed(nov(13))).toEqual(['Late show']);
    expect(listed(nov(14))).toEqual(['Late show']);
  });

  it('holds the same events for a day listed alone as among the six weeks', () => {
    const config = monthConfig({ entities: [ANNA, { entity: BEN, split_multiday_events: false }] });
    const events = sourceEvents(config);
    const start = ViewConfig.monthHomeRowsStart(NOW, 1);
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
    expect(weeks).toHaveLength(42);
    expect(titles(weeks).flat()).toHaveLength(21);
    expect(titles(weeks)).toEqual(titles(alone));
  });
});

//-----------------------------------------------------------------------------
// THE FORM AND THE SELECTED DAY, AS NUMBERS
//-----------------------------------------------------------------------------

describe('the compact form’s threshold', () => {
  const band = Constants.UI.MONTH_COMPACT_HYSTERESIS;

  it('measures a day from the card’s width, less its border, padding and gutter', () => {
    expect(MonthDay.monthDayWidth(594, false)).toBe(80);
    expect(MonthDay.monthDayWidth(594 + Constants.UI.MONTH_WEEK_GUTTER, true)).toBe(80);
  });

  it('turns compact below min_day_width, and wide again only past the band', () => {
    expect(MonthDay.monthCompactAt(79.99, 80, false)).toBe(true);
    expect(MonthDay.monthCompactAt(80, 80, false)).toBe(false);
    expect(MonthDay.monthCompactAt(80, 80, true)).toBe(true);
    expect(MonthDay.monthCompactAt(80 + band - 0.01, 80, true)).toBe(true);
    expect(MonthDay.monthCompactAt(80 + band, 80, true)).toBe(false);
  });

  it('keeps a band wider than a page scroll bar takes from a day', () => {
    // A classic scroll bar is about 17px of the card's width, a seventh of it per day.
    expect(band).toBeGreaterThanOrEqual(17 / 7);
  });

  it('keeps the gutter the stylesheet draws', () => {
    const gutter = declarations(cardStyles.cssText).find(
      (d) =>
        d.property === '--calendar-card-month-week-gutter' &&
        d.selectors.includes('.month-container.month-compact'),
    );
    expect(gutter?.value).toBe(`${Constants.UI.MONTH_WEEK_GUTTER}px`);
  });
});

describe('the selected day', () => {
  const home = ViewConfig.monthHomeRowsStart(NOW, 1);
  const december = ViewConfig.monthHomeRowsStart(new Date(2026, 11, 1), 1);

  it('is today where the header’s month holds it, else that month’s first day', () => {
    expect(MonthDay.defaultMonthDay(home, NOW)).toEqual(nov(18));
    // December's rows start on November 30, but the header names December.
    expect(december).toEqual(nov(30));
    expect(MonthDay.defaultMonthDay(december, NOW)).toEqual(new Date(2026, 11, 1));
  });

  it('is the day selected on the page shown, while the page holds it', () => {
    const selection = MonthDay.monthSelectionOf(nov(12), null, NOW);
    expect(selection).toEqual({ page: null, day: '2026-11-12' });
    expect(MonthDay.selectedMonthDay(selection, null, home, NOW)).toEqual(nov(12));
    // On another page, its own day.
    expect(MonthDay.selectedMonthDay(selection, '2026-11-30', december, NOW)).toEqual(
      new Date(2026, 11, 1),
    );
    // Off the page's six weeks, its own day too.
    const far = { page: null, day: '2026-12-20' };
    expect(MonthDay.selectedMonthDay(far, null, home, NOW)).toEqual(nov(18));
  });

  it('follows today when today was selected', () => {
    const selection = MonthDay.monthSelectionOf(nov(18), null, NOW);
    expect(selection.day).toBe(MonthDay.SELECTED_TODAY);
    const tomorrow = new Date('2026-11-19T00:00:01Z');
    expect(MonthDay.selectedMonthDay(selection, null, home, tomorrow)).toEqual(nov(19));
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
  requestUpdate(): void;
}

interface PanelUnderTest extends HTMLElement {
  hass?: Types.Hass;
  showDialog(params: DayPanelParams): void;
  closeDialog(): boolean;
  readonly updateComplete: Promise<boolean>;
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

function hass(): Types.Hass {
  const state = (id: string, name: string) => ({
    entity_id: id,
    state: 'off',
    attributes: { friendly_name: name, supported_features: 7 },
  });
  return {
    states: { [ANNA]: state(ANNA, 'Anna'), [BEN]: state(BEN, 'Ben') },
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
    localize: (key: string) => (key === 'ui.components.calendar.event.add' ? 'Add event' : key),
    formatEntityState: (_stateObj: unknown, value?: string) => String(value ?? ''),
    callApi: vi.fn((_method: string, path: string) => {
      const [, id, query] = /^calendars\/([^?]+)\?(.*)$/.exec(path)!;
      const params = new URLSearchParams(query);
      const from = Date.parse(params.get('start')!);
      const to = Date.parse(params.get('end')!);
      const at = (point: { date?: string; dateTime?: string }) =>
        Date.parse(point.dateTime ?? `${point.date}T00:00:00Z`);
      return Promise.resolve(
        EVENTS.filter(
          (event) => event.calendar === id && at(event.start) < to && at(event.end) > from,
        ).map(({ calendar: _calendar, ...event }) => ({ ...event })),
      );
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

const BASE = {
  view: 'month',
  entities: [
    { entity: ANNA, accent_color: BLUE },
    { entity: BEN, accent_color: GREEN },
  ],
  first_day_of_week: 'monday',
  time_24h: true,
};

/** Every dialog the card asked Home Assistant to open, by tag. */
let dialogs: Array<{ dialogTag: string; dialogParams: unknown }> = [];
/** The dialog manager's stand-in, while a test plays one (`playDialogManager`). */
let manager: ((event: Event) => void) | null = null;
let hassActions: Array<{ action: string; config: Record<string, unknown> }> = [];

async function settle(card: CardUnderTest): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await card.updateComplete;
}

async function mount(config: Record<string, unknown> = {}, width?: number) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ ...BASE, ...config });
  card.hass = hass();
  card.addEventListener('hass-action', (ev) =>
    hassActions.push((ev as CustomEvent).detail as (typeof hassActions)[number]),
  );
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  if (width !== undefined) await setWidth(card, width);
  return card;
}

/** Reports a card width, as the card's resize observer would. */
async function setWidth(card: CardUnderTest, width: number): Promise<void> {
  for (const observer of RecordingResizeObserver.instances) {
    observer.callback([{ contentRect: { width } }]);
  }
  await settle(card);
}

const root = (card: CardUnderTest) => card.shadowRoot!;
const compact = (card: CardUnderTest) => root(card).querySelector<HTMLElement>('.month-compact');
const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The compact days, first row first. */
function days(card: CardUnderTest): HTMLElement[] {
  return [...root(card).querySelectorAll<HTMLElement>('.month-compact .month-day')];
}

/** A compact day of home's six weeks, by its date in November (or after, as 31 and on). */
function day(card: CardUnderTest, date: number): HTMLElement {
  // October 26 is index 0, so November `date` is index date + 5.
  return days(card)[date + 5];
}

/** The day the compact form shows as selected, by its number. */
const selected = (card: CardUnderTest) =>
  [...root(card).querySelectorAll('.month-compact .month-day.month-selected')].map((element) =>
    text(element.querySelector('.month-date')),
  );

/** The list under the weeks: its name, and its rows' titles. */
function dayList(card: CardUnderTest): { name: string; rows: string[] } {
  const list = root(card).querySelector('.month-day-list');
  return {
    name: text(list?.querySelector('.month-day-list-date')),
    rows: [...(list?.querySelectorAll('td.event .event-title') ?? [])].map((title) => text(title)),
  };
}

function pointer(target: Element, type: string): void {
  const ev = new Event(type, { bubbles: true, composed: true });
  target.dispatchEvent(
    Object.assign(ev, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    }),
  );
}

/** A tap where it started, and the click a browser derives from it. */
async function tap(card: CardUnderTest, target: Element): Promise<void> {
  pointer(target, 'pointerdown');
  pointer(target, 'pointerup');
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  await settle(card);
}

const originalResizeObserver = globalThis.ResizeObserver;

/**
 * happy-dom's `ShadowRoot.activeElement` throws while focus is in another shadow tree, here the
 * panel's close button, where a browser answers null; the card and the panel both read it.
 */
const activeElement = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'activeElement')!;

const record = (event: Event) =>
  dialogs.push((event as CustomEvent).detail as (typeof dialogs)[number]);

beforeEach(() => {
  Object.defineProperty(ShadowRoot.prototype, 'activeElement', {
    ...activeElement,
    get(this: ShadowRoot) {
      try {
        return activeElement.get!.call(this);
      } catch {
        return null;
      }
    },
  });
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  dialogs = [];
  hassActions = [];
  document.addEventListener('show-dialog', record);
});

afterEach(() => {
  Object.defineProperty(ShadowRoot.prototype, 'activeElement', activeElement);
  document.removeEventListener('show-dialog', record);
  if (manager) document.removeEventListener('show-dialog', manager);
  manager = null;
  document.body.replaceChildren();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the form a card draws', () => {
  it('is wide until the card is measured, and compact below min_day_width a day', async () => {
    const card = await mount();
    expect(compact(card)).toBeNull();
    expect(root(card).querySelectorAll('.month-week')).toHaveLength(6);

    await setWidth(card, 593);
    expect(compact(card)).not.toBeNull();
    expect(days(card)).toHaveLength(42);
    expect(root(card).querySelectorAll('.month-compact > .month-week')).toHaveLength(6);
    // The wide form's bars, lines and "+N more" are gone, and the list is under the weeks.
    expect(root(card).querySelector('.month-bar, .month-line, .month-more')).toBeNull();
    expect(compact(card)!.nextElementSibling!.classList.contains('month-day-list')).toBe(true);
  });

  it('keeps its form inside the band either side of the threshold', async () => {
    const card = await mount({}, 600);
    const forms: string[] = [];
    for (const width of [593, 600, 621, 622, 600, 594, 593.9]) {
      await setWidth(card, width);
      forms.push(`${width}:${compact(card) ? 'compact' : 'wide'}`);
    }
    expect(forms).toEqual([
      '593:compact',
      '600:compact',
      '621:compact',
      '622:wide',
      '600:wide',
      '594:wide',
      '593.9:compact',
    ]);
  });

  it('counts its days among the controls the card hosts, so the card is no button', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } }, 375);
    const haCard = root(card).querySelector('ha-card')!;
    expect(haCard.getAttribute('role')).toBeNull();
    expect(haCard.querySelector(':scope > .card-tap-control')).not.toBeNull();
  });

  it('counts the week numbers’ gutter, and follows min_day_width', async () => {
    const numbered = await mount({ show_week_numbers: 'iso' }, 615);
    expect(compact(numbered)).not.toBeNull();
    await setWidth(numbered, 650);
    expect(compact(numbered)).toBeNull();

    const narrow = await mount({ month: { min_day_width: 40 } }, 375);
    expect(compact(narrow)).toBeNull();
    await setWidth(narrow, 300);
    expect(compact(narrow)).not.toBeNull();
  });
});

describe('a compact day', () => {
  /** A day's capsule, as its segments' colors. */
  const capsule = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLElement>('.month-compact-marks > .month-compact-mark')].map(
      (mark) => mark.style.backgroundColor,
    );

  it('draws one segment per event in its calendar’s color, four at most', async () => {
    const card = await mount({}, 375);
    const [blue, green] = [BLUE, GREEN];
    expect(capsule(day(card, 13))).toEqual([blue]);
    expect(capsule(day(card, 12))).toEqual([blue, green]);
    expect(capsule(day(card, 11))).toEqual([blue, green, blue]);
    expect(capsule(day(card, 10))).toEqual([blue, green, blue, green]);
    expect(capsule(day(card, 18))).toEqual([green, blue, green, blue]);
    // A day without events keeps an empty capsule, so every day is as tall.
    expect(capsule(day(card, 19))).toEqual([]);
    expect(day(card, 19).querySelector('.month-compact-marks')).not.toBeNull();
    // The days the trip covers, each a dot.
    expect([20, 21, 22, 23, 24, 25].map((date) => capsule(day(card, date)).length)).toEqual([
      1, 1, 1, 1, 1, 0,
    ]);
  });

  it('draws a single event as a dot: a segment as wide as the capsule is tall, rounded', () => {
    const rule = (selector: string) =>
      Object.fromEntries(
        declarations(cardStyles.cssText)
          .filter(
            (d) => d.at.length === 0 && d.selectors.length === 1 && d.selectors[0] === selector,
          )
          .map((d) => [d.property, d.value]),
      );
    expect(rule('.month-compact-marks')).toMatchObject({ height: '6px', 'border-radius': '999px' });
    expect(rule('.month-compact-mark').width).toBe('6px');
  });

  it('marks today, the weekend and the other months’ days', async () => {
    const card = await mount({}, 375);
    expect(day(card, 18).getAttribute('aria-current')).toBe('date');
    expect(day(card, 18).querySelector('.day.today-tile')).not.toBeNull();
    expect(day(card, 21).classList.contains('weekend')).toBe(true);
    expect(day(card, 21).querySelector<HTMLElement>('.day')!.style.color).toBe(
      'var(--secondary-text-color)',
    );
    const other = days(card).filter((element) => element.classList.contains('other-month'));
    expect(other.map((element) => text(element.querySelector('.month-date')))).toEqual([
      '26',
      '27',
      '28',
      '29',
      '30',
      '31',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    // Other months' days keep their capsules.
    expect(capsule(days(card)[0])).toEqual([]);
  });

  it('matches its snapshot', async () => {
    const card = await mount({ show_week_numbers: 'iso' }, 375);
    const markup = [compact(card)!, root(card).querySelector('.month-day-list')!]
      .map((element) =>
        element.outerHTML
          .replace(/<!--\?lit\$[0-9]+\$-->/g, '')
          .replace(/<!---->/g, '')
          .replace(/>\s+</g, '>\n<')
          .trim(),
      )
      .join('\n');
    expect(markup).toMatchSnapshot();
  });
});

describe('the selected day', () => {
  it('starts on today, and lists it under the weeks', async () => {
    const card = await mount({}, 375);
    expect(selected(card)).toEqual(['18']);
    expect(dayList(card)).toEqual({
      name: 'Wednesday, November 18, 2026',
      rows: ['Holiday', 'Swim', 'Standup', 'Lunch'],
    });
    // List's rows, past ones dimmed.
    const rows = [...root(card).querySelectorAll('.month-day-list td.event')];
    expect(rows.map((row) => row.classList.contains('past-event'))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it('moves with a tap on a day, which never adds on it or runs anything else', async () => {
    const card = await mount(
      {
        day_tap_action: { action: 'add-event' },
        tap_action: { action: 'more-info' },
      },
      375,
    );
    await tap(card, day(card, 12));
    expect(selected(card)).toEqual(['12']);
    expect(dayList(card)).toEqual({
      name: 'Thursday, November 12, 2026',
      rows: ['Dentist', 'Football'],
    });
    expect(dialogs).toEqual([]);
    expect(hassActions).toEqual([]);
  });

  it('lists the page’s own day on another page, and today again back home', async () => {
    const card = await mount({ toolbar: { show: true, navigation: true } }, 375);
    const [previous, home, next] = root(card).querySelectorAll<HTMLButtonElement>(
      '.date-navigation-segment',
    );
    await tap(card, day(card, 12));
    next.click();
    await vi.waitFor(() => expect(dayList(card).name).toBe('Tuesday, December 1, 2026'));
    previous.click();
    await vi.waitFor(() => expect(selected(card)).toEqual(['18']));

    await tap(card, day(card, 12));
    expect(selected(card)).toEqual(['12']);
    home.click();
    await settle(card);
    expect(selected(card)).toEqual(['18']);
  });

  it('is what Reset brings back, and counts as something to reset', async () => {
    const card = await mount({ toolbar: { show: true, reset: true } }, 375);
    const reset = () => root(card).querySelector<HTMLButtonElement>('.reset-button')!;
    expect(reset().getAttribute('aria-disabled')).toBe('true');
    await tap(card, day(card, 12));
    expect(reset().getAttribute('aria-disabled')).toBeNull();
    reset().click();
    await settle(card);
    expect(selected(card)).toEqual(['18']);
    expect(reset().getAttribute('aria-disabled')).toBe('true');
    // Selecting today is no change from what the card shows by itself.
    await tap(card, day(card, 18));
    expect(reset().getAttribute('aria-disabled')).toBe('true');
  });

  it('is the day the toolbar’s add dates a new event on', async () => {
    const card = await mount({ toolbar: { show: true, add_event: true } }, 375);
    await tap(card, day(card, 12));
    root(card).querySelector<HTMLButtonElement>('.add-event-button')!.click();
    await settle(card);
    const added = dialogs
      .filter(({ dialogTag }) => dialogTag === EVENT_POPOVER_TAG)
      .map(({ dialogParams }) => (dialogParams as PopoverParams).times);
    expect(added).toEqual([
      { allDay: false, start: new Date(2026, 10, 12, 10), end: new Date(2026, 10, 12, 11) },
    ]);
  });

  it('dates the toolbar’s add on a wide month on the day the compact form would select', async () => {
    const card = await mount({ toolbar: { show: true, add_event: true } });
    expect(root(card).querySelector('.month-compact')).toBeNull();
    const add = async () => {
      root(card).querySelector<HTMLButtonElement>('.add-event-button')!.click();
      await settle(card);
    };
    await add();
    // December's rows open on November 30, drawn dimmed: its new event starts on December 1.
    root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[2].click();
    await settle(card);
    expect(root(card).querySelector('.month-container')!.getAttribute('aria-label')).toBe(
      'December 2026',
    );
    await add();
    const starts = dialogs
      .filter(({ dialogTag }) => dialogTag === EVENT_POPOVER_TAG)
      .map(({ dialogParams }) => (dialogParams as PopoverParams).times?.start);
    expect(starts).toEqual([new Date(2026, 10, 18, 10), new Date(2026, 11, 1)]);
  });

  it('adds on its day from the list, where day_tap_action adds', async () => {
    const card = await mount({ day_tap_action: { action: 'add-event' } }, 375);
    await tap(card, day(card, 19));
    expect(dayList(card).rows).toEqual([]);
    expect(text(root(card).querySelector('.month-day-list-empty'))).toBe('No events');

    const header = root(card).querySelector<HTMLElement>('.month-day-list-header')!;
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-label')).toBe('Add event');
    await tap(card, header);
    await tap(card, root(card).querySelector('.month-day-list-empty')!);
    const starts = dialogs
      .filter(({ dialogTag }) => dialogTag === EVENT_POPOVER_TAG)
      .map(({ dialogParams }) => (dialogParams as PopoverParams).times?.start);
    expect(starts).toEqual([new Date(2026, 10, 19, 10), new Date(2026, 10, 19, 10)]);
  });
});

//-----------------------------------------------------------------------------
// THE DAY PANEL
//-----------------------------------------------------------------------------

/** The element focus is on, through every shadow root. */
function deepActive(): HTMLElement | null {
  let active = document.activeElement as HTMLElement | null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
  return active;
}

/**
 * Home Assistant's dialog manager, as far as `show-dialog` goes, for the day panel: made once,
 * handed `hass` and shown, the element focus was on when it opened noted, and focused again a
 * frame after the panel says it has closed.
 */
function playDialogManager(): { panel: () => PanelUnderTest | null } {
  let panel: PanelUnderTest | null = null;
  let returnTo: HTMLElement | null = null;
  manager = (event) => {
    const detail = (event as CustomEvent<{ dialogTag: string; dialogParams: DayPanelParams }>)
      .detail;
    if (detail.dialogTag !== DAY_PANEL_TAG) return;
    returnTo = deepActive();
    if (!panel) {
      panel = document.createElement(DAY_PANEL_TAG) as PanelUnderTest;
      panel.addEventListener('dialog-closed', () => {
        deepActive()?.blur();
        requestAnimationFrame(() => setTimeout(() => returnTo?.focus()));
      });
    }
    panel.hass = (event.target as CardUnderTest).hass;
    panel.showDialog(detail.dialogParams);
    if (!panel.isConnected) document.body.appendChild(panel);
  };
  document.addEventListener('show-dialog', manager);
  return { panel: () => panel };
}

/** Let a closing panel play its way out, and the frames after it pass. */
async function afterClose(card: CardUnderTest): Promise<void> {
  await settle(card);
  vi.advanceTimersByTime(400);
  for (let frame = 0; frame < 3; frame += 1) {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersByTime(1);
    await settle(card);
  }
}

describe('the day panel', () => {
  const more = (card: CardUnderTest) =>
    root(card).querySelector<HTMLButtonElement>('.month-more[aria-label*="November 10"]')!;
  const isOpen = (panel: PanelUnderTest | null) =>
    panel?.shadowRoot?.querySelector('dialog')?.open === true;
  const rows = (panel: PanelUnderTest | null) =>
    [...(panel?.shadowRoot?.querySelectorAll('.day-panel-rows td.event .event-title') ?? [])].map(
      (title) => text(title),
    );

  async function open(config: Record<string, unknown> = {}) {
    const manager = playDialogManager();
    const card = await mount(config);
    more(card).click();
    await settle(card);
    await manager.panel()?.updateComplete;
    return { card, panel: manager.panel() };
  }

  it('opens from "+N more" on the day, listing what the day hides and what it shows', async () => {
    const { card, panel } = await open();
    expect(dialogs.map(({ dialogTag }) => dialogTag)).toEqual([DAY_PANEL_TAG]);
    expect(isOpen(panel)).toBe(true);
    expect(text(panel!.shadowRoot!.querySelector('.day-panel-title'))).toBe(
      'Tuesday, November 10, 2026',
    );
    // Three lines drawn and "+2 more": five rows.
    const week = root(card).querySelectorAll('.month-week')[2];
    const shown = [...week.querySelectorAll<HTMLElement>('.month-line')].filter(
      (line) => line.style.gridColumn === '2',
    ).length;
    expect(text(more(card))).toBe('+2 more');
    expect(rows(panel)).toHaveLength(shown + 2);
    expect(rows(panel)).toEqual(['Standup', 'Review', 'Lunch with Ben', 'Planning', 'Gym']);
  });

  it('gives focus back to its day’s cell, the month’s tab stop, once it closes', async () => {
    const { card, panel } = await open();
    // "+N more" is out of the Tab order, so focus comes back to the cell Enter opens it from.
    const cell = root(card).querySelector<HTMLElement>(
      '.month-day[aria-label^="Tuesday, November 10, 2026"]',
    )!;
    expect(more(card).getAttribute('tabindex')).toBe('-1');
    panel!.closeDialog();
    await afterClose(card);
    expect(isOpen(panel)).toBe(false);
    expect(deepActive()).toBe(cell);
    expect(cell.getAttribute('tabindex')).toBe('0');
  });

  it('closes on a row, and runs what a tap on the event runs on the card', async () => {
    const { card, panel } = await open({ event_tap_action: { action: 'details' } });
    const review = [...panel!.shadowRoot!.querySelectorAll<HTMLElement>('.event-button')].find(
      (button) => text(button).startsWith('Review'),
    )!;
    review.click();
    await afterClose(card);
    expect(isOpen(panel)).toBe(false);
    const opened = dialogs.filter(({ dialogTag }) => dialogTag === EVENT_POPOVER_TAG);
    expect(
      opened.map(({ dialogParams }) => (dialogParams as PopoverParams).entry?.summary),
    ).toEqual(['Review']);
    expect((opened[0].dialogParams as PopoverParams).calendarId).toBe(BEN);
  });

  it('runs Home Assistant’s action for a row where event_tap_action names one', async () => {
    const { card, panel } = await open({ event_tap_action: { action: 'more-info' } });
    [...panel!.shadowRoot!.querySelectorAll<HTMLElement>('.event-button')]
      .find((button) => text(button).startsWith('Gym'))!
      .click();
    await afterClose(card);
    expect(hassActions.map(({ config }) => config.entity)).toEqual([ANNA]);
  });

  it('draws plain rows, which a tap leaves open, where events run nothing', async () => {
    const { card, panel } = await open();
    expect(panel!.shadowRoot!.querySelector('.event-button')).toBeNull();
    panel!.shadowRoot!.querySelector<HTMLElement>('td.event')!.click();
    await afterClose(card);
    expect(isOpen(panel)).toBe(true);
    expect(dialogs.map(({ dialogTag }) => dialogTag)).toEqual([DAY_PANEL_TAG]);
  });
});
