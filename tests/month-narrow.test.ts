/**
 * A month's day list, the panel "+N more" opens on it, and the narrow form a narrow card draws.
 *
 * The day model is pure (`utils/month-day.ts`) and is pinned on its own first: what a day lists,
 * in what order, which of List's rules it keeps and which it drops. The narrow form's switch and
 * the selected day are pure too, and pinned at their thresholds. Then the card itself, from a
 * fake Home Assistant: the form at the widths a resize observer reports, each day's capsule, the
 * selected day's list and every rule that moves it, adding on it, and the day panel through a
 * stand-in for Home Assistant's dialog manager. happy-dom lays nothing out, so the list is laid out
 * by `helpers/month-geometry.ts`, which a few tests change or take away. Zones that move the
 * arithmetic are in `month-narrow.dst.test.ts`.
 *
 * Wednesday, November 18, 2026, 10:00 UTC; Mondays first, so home's six weeks run from Monday,
 * October 26 to Sunday, December 6. Names are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { declarations } from './helpers/css-declarations';
import { type MonthListBoxes, layOutMonthList } from './helpers/month-geometry';
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

describe('the narrow form’s threshold', () => {
  const band = Constants.UI.MONTH_NARROW_HYSTERESIS;

  it('measures a day from the card’s width, less its border, padding and gutter', () => {
    expect(MonthDay.monthDayWidth(594, false)).toBe(80);
    expect(MonthDay.monthDayWidth(594 + Constants.UI.MONTH_WEEK_GUTTER, true)).toBe(80);
  });

  it('turns narrow below min_day_width, and wide again only past the band', () => {
    expect(MonthDay.monthNarrowAt(79.99, 80, false)).toBe(true);
    expect(MonthDay.monthNarrowAt(80, 80, false)).toBe(false);
    expect(MonthDay.monthNarrowAt(80, 80, true)).toBe(true);
    expect(MonthDay.monthNarrowAt(80 + band - 0.01, 80, true)).toBe(true);
    expect(MonthDay.monthNarrowAt(80 + band, 80, true)).toBe(false);
  });

  it('keeps a band wider than a page scroll bar takes from a day', () => {
    // A classic scroll bar is about 17px of the card's width, a seventh of it per day.
    expect(band).toBeGreaterThanOrEqual(17 / 7);
  });

  it('keeps the gutter the stylesheet draws', () => {
    const gutter = declarations(cardStyles.cssText).find(
      (d) =>
        d.property === '--calendar-card-month-week-gutter' &&
        d.selectors.includes('.month-container.month-narrow'),
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
  /** What it watches, until it is disconnected. */
  readonly targets: Element[] = [];
  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  unobserve(): void {}
  disconnect(): void {
    this.targets.length = 0;
  }
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
        [...EVENTS, ...extraEvents]
          .filter((event) => event.calendar === id && at(event.start) < to && at(event.end) > from)
          .map(({ calendar: _calendar, ...event }) => ({ ...event })),
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
/** Events a test adds to the fixture's, for the days it alone reads. */
let extraEvents: RawEvent[] = [];
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
const narrowForm = (card: CardUnderTest) => root(card).querySelector<HTMLElement>('.month-narrow');
const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The narrow days, first row first. */
function days(card: CardUnderTest): HTMLElement[] {
  return [...root(card).querySelectorAll<HTMLElement>('.month-narrow .month-day')];
}

/** A narrow day of home's six weeks, by its date in November (or after, as 31 and on). */
function day(card: CardUnderTest, date: number): HTMLElement {
  // October 26 is index 0, so November `date` is index date + 5.
  return days(card)[date + 5];
}

/** The day the narrow form shows as selected, by its number. */
const selected = (card: CardUnderTest) =>
  [...root(card).querySelectorAll('.month-narrow .month-day.month-selected')].map((element) =>
    text(element.querySelector('.month-date')),
  );

/** The list under the weeks: its name, and its rows' titles. */
function dayList(card: CardUnderTest): { name: string; rows: string[] } {
  const list = root(card).querySelector('.month-day-list');
  return {
    name: text(list?.querySelector('.month-day-list-name')),
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

/** Puts happy-dom's measuring back, from the list's layout this test runs with. */
let unlayOut: () => void = () => {};

/**
 * Lays the list out at other boxes from now on.
 *
 * @param boxes - The room and the rows, or none to lay nothing out, as a card off screen
 */
function layOut(boxes?: MonthListBoxes): void {
  unlayOut();
  unlayOut = boxes ? layOutMonthList(boxes) : () => {};
}

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
  extraEvents = [];
  hassActions = [];
  document.addEventListener('show-dialog', record);
  // Room for eight rows, so a test that reads a day's rows reads them all.
  layOut({ room: 400 });
});

afterEach(() => {
  layOut();
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
  it('is wide until the card is measured, and narrow below min_day_width a day', async () => {
    const card = await mount();
    expect(narrowForm(card)).toBeNull();
    expect(root(card).querySelectorAll('.month-week')).toHaveLength(6);

    await setWidth(card, 593);
    expect(narrowForm(card)).not.toBeNull();
    expect(days(card)).toHaveLength(42);
    expect(root(card).querySelectorAll('.month-narrow > .month-week')).toHaveLength(6);
    // The wide form's bars, lines and "+N more" are gone, and the list is under the weeks.
    expect(root(card).querySelector('.month-bar, .month-line, .month-more')).toBeNull();
    expect(narrowForm(card)!.nextElementSibling!.classList.contains('month-day-list')).toBe(true);
  });

  it('keeps its form inside the band either side of the threshold', async () => {
    const card = await mount({}, 600);
    const forms: string[] = [];
    for (const width of [593, 600, 621, 622, 600, 594, 593.9]) {
      await setWidth(card, width);
      forms.push(`${width}:${narrowForm(card) ? 'narrow' : 'wide'}`);
    }
    expect(forms).toEqual([
      '593:narrow',
      '600:narrow',
      '621:narrow',
      '622:wide',
      '600:wide',
      '594:wide',
      '593.9:narrow',
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
    expect(narrowForm(numbered)).not.toBeNull();
    await setWidth(numbered, 650);
    expect(narrowForm(numbered)).toBeNull();

    const narrow = await mount({ month: { min_day_width: 40 } }, 375);
    expect(narrowForm(narrow)).toBeNull();
    await setWidth(narrow, 300);
    expect(narrowForm(narrow)).not.toBeNull();
  });
});

describe('a narrow day', () => {
  /** A day's capsule, as its segments' colors. */
  const capsule = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLElement>('.month-narrow-marks > .month-narrow-mark')].map(
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
    expect(day(card, 19).querySelector('.month-narrow-marks')).not.toBeNull();
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
    expect(rule('.month-narrow-marks')).toMatchObject({ height: '6px', 'border-radius': '999px' });
    expect(rule('.month-narrow-mark').width).toBe('6px');
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
    // Events that open nothing, as the snapshot was taken; the default's buttons are
    // `month-dom`'s to check.
    const card = await mount(
      { show_week_numbers: 'iso', event_tap_action: { action: 'none' } },
      375,
    );
    const markup = [narrowForm(card)!, root(card).querySelector('.month-day-list')!]
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

  it('dates the toolbar’s add on a wide month on the day the narrow form would select', async () => {
    const card = await mount({ toolbar: { show: true, add_event: true } });
    expect(root(card).querySelector('.month-narrow')).toBeNull();
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

describe('the time beside the title', () => {
  /** The list's markup, as a snapshot reads it. */
  const listMarkup = (card: CardUnderTest) =>
    root(card)
      .querySelector('.month-day-list')!
      .outerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '')
      .replace(/<!---->/g, '');

  it('ends every row’s title line, whatever time_position says', async () => {
    const below = await mount({ time_position: 'below' }, 375);
    const beside = await mount({ time_position: 'title' }, 375);
    const contents = [...root(below).querySelectorAll('.month-day-list td.event .event-content')];
    expect(contents).toHaveLength(4);
    expect(contents.every((content) => content.classList.contains('time-beside-title'))).toBe(true);
    // The time is in the title's line, with no clock and nothing under the title for it.
    expect(
      contents.map((content) =>
        text(content.querySelector(':scope > .summary-row > .title-aside .time')),
      ),
    ).toEqual(['All day', '7:00 - 8:00', '9:00 - 9:15', '12:00 - 13:00']);
    expect(root(below).querySelector('.month-day-list .time-location .time')).toBeNull();
    expect(listMarkup(below)).toBe(listMarkup(beside));
  });
});

describe('the list fitted to its room', () => {
  /** Nine on Saturday the 28th, more than a room of 200px holds. */
  const NINE = Array.from({ length: 9 }, (_, index) =>
    timed(
      index % 2 ? BEN : ANNA,
      `Errand ${index + 1}`,
      '2026-11-28',
      `${String(8 + index).padStart(2, '0')}:00`,
      `${String(8 + index).padStart(2, '0')}:30`,
      '2026-11-28',
      index === 0 ? 'A street name long enough to need a second line on a phone' : undefined,
    ),
  );
  const list = (card: CardUnderTest) => root(card).querySelector<HTMLElement>('.month-day-list')!;
  const rowsOf = (card: CardUnderTest) =>
    [...list(card).querySelectorAll('td.event .event-title')].map((title) => text(title));
  const moreOf = (card: CardUnderTest) =>
    list(card).querySelector<HTMLButtonElement>('.month-day-list-more');
  const staging = (card: CardUnderTest) =>
    root(card).querySelector<HTMLElement>('.month-day-list-probe');
  /** What could make the card one height or another: the height it writes, and the list's box. */
  const height = (card: CardUnderTest) => ({
    card: root(card).querySelector<HTMLElement>('ha-card')!.style.height,
    list: list(card).className,
    rows: list(card)
      .querySelector(':scope > .month-day-list-rows')
      ?.outerHTML.match(/^<[^>]*>/)?.[0],
  });
  /** Puts the browser's computed style back after a test that set the card's cap. */
  let restoreCap: (() => void) | null = null;
  afterEach(() => {
    restoreCap?.();
    restoreCap = null;
  });
  /**
   * Answers the card's computed `max-height` as a browser computes it, whatever happy-dom makes
   * of the value written, until the test ends; every other style as happy-dom computes it.
   */
  const capComputesAs = (cap: () => string): void => {
    const computed = window.getComputedStyle;
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const declared = computed.call(window, element, pseudo);
      if (element.localName !== 'ha-card') return declared;
      return new Proxy(declared, {
        get: (target, key) => {
          if (key === 'maxHeight') return cap();
          const value = Reflect.get(target, key) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    restoreCap = () => spy.mockRestore();
  };
  /** The list's resize observer: the one watching the staged rows. */
  const listWatch = () =>
    RecordingResizeObserver.instances.find((observer) =>
      observer.targets.some((target) => target.matches('.month-day-list-probe > .month-day-table')),
    );

  it('lists the rows that fit and "+N more" for the rest, and a tap never moves the card', async () => {
    extraEvents = NINE;
    layOut({ room: 200 });
    const card = await mount({ toolbar: { show: true, navigation: true } }, 375);
    const seen: Array<{ date: number; rows: string[]; more: string }> = [];
    const heights = new Set<string>();
    // Day to day, fifty times: 0, 1, 4 and 9 events, twelve rounds and two more taps.
    const dates = [19, 13, 18, 28];
    for (let tapped = 0; tapped < 50; tapped += 1) {
      const date = dates[tapped % dates.length];
      await tap(card, day(card, date));
      if (tapped < dates.length) seen.push({ date, rows: rowsOf(card), more: text(moreOf(card)) });
      heights.add(JSON.stringify(height(card)));
      // Every event either listed or counted in "+N more", never both.
      const total = { 19: 0, 13: 1, 18: 4, 28: 9 }[date]!;
      const counted = Number(/^\+(\d+)/.exec(text(moreOf(card)))?.[1] ?? 0);
      expect(rowsOf(card).length + counted).toBe(total);
    }
    expect(seen).toEqual([
      { date: 19, rows: [], more: '' },
      { date: 13, rows: ['Late show'], more: '' },
      { date: 18, rows: ['Holiday', 'Swim', 'Standup', 'Lunch'], more: '' },
      { date: 28, rows: ['Errand 1', 'Errand 2', 'Errand 3'], more: '+6 more' },
    ]);
    // One height, whatever the day holds: the card's, and a list whose rows take the room.
    expect([...heights].map((each) => JSON.parse(each))).toEqual([
      {
        card: '760px',
        list: 'month-day-list',
        rows: '<div class="month-day-list-rows" lang="en">',
      },
    ]);

    // Another month's day, fitted the same way.
    root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[2].click();
    await vi.waitFor(() => expect(dayList(card).name).toBe('Tuesday, December 1, 2026'));
    expect(JSON.stringify(height(card))).toBe([...heights][0]);
  });

  it('keeps its rows in order, a later shorter one never listed ahead of a taller one', async () => {
    extraEvents = NINE;
    // The second row is too tall to fit with "+N more" after it; the third would fit alone.
    layOut({ room: 200, rows: [40, 140, 40] });
    const card = await mount({}, 375);
    await tap(card, day(card, 28));
    expect(rowsOf(card)).toEqual(['Errand 1']);
    expect(text(moreOf(card))).toBe('+8 more');
    // The first row taller than the room: "+N more" alone.
    layOut({ room: 200, rows: 300 });
    card.requestUpdate();
    await settle(card);
    expect(rowsOf(card)).toEqual([]);
    expect(text(moreOf(card))).toBe('+9 more');
  });

  it('lists "+N more" alone until it has measured the day, and keeps its last fit off screen', async () => {
    extraEvents = NINE;
    layOut();
    const card = await mount({}, 375);
    await tap(card, day(card, 28));
    // Nothing laid out, as a card not yet on screen: the rows are staged, none is listed.
    expect(rowsOf(card)).toEqual([]);
    expect(text(moreOf(card))).toBe('+9 more');
    expect(staging(card)!.querySelectorAll('td.event')).toHaveLength(9);

    // Shown: its resize observer hears the staged rows take their size, and the list is fitted
    // before the next frame, without a render of its own to start it.
    layOut({ room: 200 });
    listWatch()!.callback([]);
    await settle(card);
    expect(rowsOf(card)).toEqual(['Errand 1', 'Errand 2', 'Errand 3']);

    // Hidden again, a render keeps the fit it had; a day it has not fitted waits for one.
    layOut();
    card.requestUpdate();
    await settle(card);
    expect(rowsOf(card)).toEqual(['Errand 1', 'Errand 2', 'Errand 3']);
    await tap(card, day(card, 18));
    expect(rowsOf(card)).toEqual([]);
    expect(text(moreOf(card))).toBe('+4 more');
  });

  it('lists every row while it grows under a cap that computes to none', async () => {
    extraEvents = NINE;
    // A cap a theme can take off: unset, the variable's fallback leaves the card none.
    const card = await mount({ month: { narrow_card_max_height: 'var(--unset-cap, none)' } }, 375);
    const style = root(card).querySelector<HTMLElement>('ha-card')!.style;
    expect([style.height, style.maxHeight]).toEqual(['auto', 'var(--unset-cap, none)']);
    capComputesAs(() => 'none');
    await tap(card, day(card, 28));
    // No room to run out of: the card grows with every row, none left for "+N more".
    expect(rowsOf(card)).toHaveLength(9);
    expect(moreOf(card)).toBeNull();
  });

  it('fits again when the card or the viewport resizes while it grows under a cap', async () => {
    extraEvents = NINE;
    // The rows' box takes no room of its own while the list grows: its room is the cap less the
    // list's 44px header, the only other box laid out, and the content's 1px bottom padding.
    layOut({ room: 0 });
    let cap = '250px';
    capComputesAs(() => cap);
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const resizes = (spy: typeof add) =>
      spy.mock.calls.filter(([type]) => type === 'resize').map(([, listener]) => listener);
    try {
      // A fixed room listens for no viewport: its rows' box is watched instead.
      const fixed = await mount({}, 375);
      expect(resizes(add)).toEqual([]);
      fixed.remove();

      const card = await mount({ month: { narrow_card_max_height: '40rem' } }, 375);
      await tap(card, day(card, 28));
      expect(rowsOf(card)).toEqual(['Errand 1', 'Errand 2', 'Errand 3']);
      const host = RecordingResizeObserver.instances.find((observer) =>
        observer.targets.includes(card),
      )!;

      // A cap that shrinks clamps the card, which its own resize observer hears.
      cap = '170px';
      host.callback([{ contentRect: { width: 375 } }]);
      await settle(card);
      expect(rowsOf(card)).toEqual(['Errand 1', 'Errand 2']);
      expect(text(moreOf(card))).toBe('+7 more');

      // A cap in a viewport unit grows with the viewport, which resizes nothing in the card.
      cap = '1000px';
      window.dispatchEvent(new Event('resize'));
      await settle(card);
      expect(rowsOf(card)).toHaveLength(9);
      expect(moreOf(card)).toBeNull();

      // Gone with the card: every viewport listener it added is taken off again.
      card.remove();
      expect(resizes(add)).toHaveLength(1);
      expect(resizes(remove)).toEqual(resizes(add));
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('fits again when its room changes size, heard by its resize observer', async () => {
    extraEvents = NINE;
    const card = await mount({}, 375);
    await tap(card, day(card, 28));
    expect(rowsOf(card)).toHaveLength(8);
    // The staged rows and the rows' box, so a font, a width or a card height reaches it.
    expect(listWatch()!.targets.map((target) => target.className)).toEqual([
      'month-day-table with-event-gap',
      'month-day-list-rows',
    ]);
    layOut({ room: 120 });
    listWatch()!.callback([]);
    await settle(card);
    expect(rowsOf(card)).toEqual(['Errand 1', 'Errand 2']);
    expect(text(moreOf(card))).toBe('+7 more');
  });

  it('moves focus to "+N more" when a new fit takes the focused row, else to the day', async () => {
    extraEvents = NINE;
    const moves: Array<{ to: HTMLElement; options?: FocusOptions }> = [];
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
      moves.push({ to: this, options });
      focus.call(this, options);
    };
    try {
      const card = await mount({ event_tap_action: { action: 'details' } }, 375);
      await tap(card, day(card, 28));
      const buttons = () => [...list(card).querySelectorAll<HTMLElement>('.event-button')];
      expect(buttons()).toHaveLength(8);
      buttons()[7].focus();
      moves.length = 0;

      layOut({ room: 200 });
      card.requestUpdate();
      await settle(card);
      expect(rowsOf(card)).toHaveLength(3);
      expect(deepActive()).toBe(moreOf(card));
      expect(moves.map(({ to, options }) => [to.className, options])).toEqual([
        ['month-day-list-more', { preventScroll: true }],
      ]);

      // All fit: "+N more" goes, and focus goes to the selected day.
      moves.length = 0;
      layOut({ room: 1000 });
      card.requestUpdate();
      await settle(card);
      expect(moreOf(card)).toBeNull();
      expect(deepActive()).toBe(day(card, 28));
      expect(moves.map(({ options }) => options)).toEqual([{ preventScroll: true }]);

      // A row the fit keeps keeps focus, and nothing else moves it.
      buttons()[0].focus();
      moves.length = 0;
      layOut({ room: 200 });
      card.requestUpdate();
      await settle(card);
      expect(deepActive()).toBe(buttons()[0]);
      expect(moves).toEqual([]);
    } finally {
      HTMLElement.prototype.focus = focus;
    }
  });

  it('names its day on one line, shortening the weekday before the date and keeping its number', async () => {
    const card = await mount({}, 375);
    await tap(card, day(card, 18));
    const date = list(card).querySelector('.month-day-list-date')!;
    // Read out in full; shown in the longest form that fits, which is not read out.
    expect(text(date.querySelector(':scope > .month-day-list-name'))).toBe(
      'Wednesday, November 18, 2026',
    );
    const fit = date.querySelector(':scope > .month-day-list-fit')!;
    expect(fit.getAttribute('aria-hidden')).toBe('true');
    // Each form in a box of its own, behind the box holding the shorter ones, the last one empty.
    const forms: string[] = [];
    for (
      let box: Element | null = fit;
      box;
      box = box.querySelector(':scope > .month-day-list-rest > .month-day-list-fit')
    ) {
      expect([...box.children].map((child) => child.className)).toEqual([
        'month-day-list-rest',
        'month-day-list-form',
      ]);
      forms.push(text(box.querySelector(':scope > .month-day-list-form')));
    }
    expect(forms).toEqual([
      'Wednesday, November 18, 2026',
      'Wed, November 18, 2026',
      'Wed, Nov 18, 2026',
      'Wed, Nov 18',
      'Nov 18',
      '18',
    ]);
    expect(fit.querySelectorAll('.month-day-list-rest:empty')).toHaveLength(1);
    // Every box one line tall, so a form that does not fit wraps out of sight rather than making
    // the list taller; of two on a line, the form takes the room to spare. Room for marks above
    // and below the line, given back, with the hidden lines past it.
    const rule = (selector: string) =>
      declarations(cardStyles.cssText)
        .filter((d) => d.at.length === 0 && d.selectors.length === 1 && d.selectors[0] === selector)
        .map((d) => `${d.property}: ${d.value}`);
    expect(rule('.month-day-list-date')).toContain('line-height: 1.2');
    expect(rule('.month-day-list-fit')).toEqual([
      'display: flex',
      'flex-wrap: wrap',
      'align-content: flex-start',
      'row-gap: 0.75em',
      'height: 1.2em',
      'padding-block: 0.375em',
      'margin-block: -0.375em',
      'overflow: hidden',
    ]);
    // The outermost on the header's line, as the name was, so a name that fits sits where it did.
    expect(rule('.month-day-list-date > .month-day-list-fit')).toEqual([
      'display: inline-flex',
      'width: 100%',
    ]);
    expect(rule('.month-day-list-rest')).toEqual([
      'flex: 1 0 0',
      'min-width: 0',
      'min-height: 1.2em',
    ]);
    // On its baseline, so the header's line places the form shown, not the box in front of it.
    expect(rule('.month-day-list-form')).toEqual([
      'flex: 1000000 0 auto',
      'align-self: baseline',
      'white-space: nowrap',
    ]);
  });

  it('takes what the weeks leave, its rows what its header leaves, with nothing to scroll', () => {
    const rule = (selector: string) =>
      declarations(cardStyles.cssText)
        .filter((d) => d.at.length === 0 && d.selectors.length === 1 && d.selectors[0] === selector)
        .map((d) => `${d.property}: ${d.value.replace(/\s+/g, ' ')}`);
    // Flexible with a basis of 0, so no day's events size either; at least what the card measures.
    expect(rule('.month-day-list')).toEqual([
      'box-sizing: border-box',
      'display: flex',
      'flex: var(--calendar-card-month-list-flex, 1 1 0)',
      'flex-direction: column',
      'min-height: var(--calendar-card-month-list-min, calc(2.4em + 40px))',
      'padding-block: 12px 4px',
    ]);
    expect(rule('.month-day-list-header')).toEqual([
      'flex: none',
      'padding-block: 2px 8px',
      'border-radius: 6px',
    ]);
    // The rows' box cuts at its foot as a guard, on every day, so a mark above the first row's
    // line still shows, and scrolls nothing.
    expect(rule('.month-day-list-rows')).toEqual([
      'flex: var(--calendar-card-month-list-flex, 1 1 0)',
      'min-height: 0',
      'clip-path: inset(-1em -1em 0 -1em)',
    ]);
    // The content shares the card's height, or takes its own under a cap with no height.
    expect(rule('.calendar-card-pro.month-view .content-container')).toContain(
      'flex: var(--calendar-card-month-content-flex, 1 1 0)',
    );
    // Nothing a month draws scrolls on its own, so the card's height scrolls the whole.
    const scrolls = declarations(cardStyles.cssText).filter(
      (d) =>
        d.selectors.some((selector) => selector.includes('month-day-list')) &&
        /^overflow/.test(d.property) &&
        /auto|scroll/.test(d.value),
    );
    expect(scrolls).toEqual([]);
    // The old room and its row are gone.
    expect(cardStyles.cssText).not.toContain('month-day-list-reserved');
    expect(cardStyles.cssText).not.toContain('--calendar-card-month-day-list-row');
  });

  it('writes the least it may be: its header and the taller of "+N more" and "No events"', async () => {
    extraEvents = NINE;
    layOut({ room: 200, chrome: 44, more: 28, empty: 33 });
    const card = await mount({}, 375);
    const least = () => list(card).style.getPropertyValue('--calendar-card-month-list-min');
    // Above the rows, 44; below them, the list's bottom padding as the stylesheet sets it.
    const below = Number.parseFloat(getComputedStyle(list(card)).paddingBottom) || 0;
    // Today's list stages "+N more".
    expect(least()).toBe(`${44 + below + 28}px`);
    // An empty day draws "No events", which is taller, and the least keeps the taller of the two,
    // whatever the list's own height: a list held at its least adds nothing to the next reading.
    await tap(card, day(card, 19));
    expect(least()).toBe(`${44 + below + 33}px`);
    await tap(card, day(card, 28));
    await tap(card, day(card, 19));
    expect(least()).toBe(`${44 + below + 33}px`);
  });

  it('keeps every part of a row to one line, the title beside its time', async () => {
    extraEvents = NINE;
    const card = await mount({ title_max_lines: 3, month: { location_max_lines: 2 } }, 375);
    await tap(card, day(card, 28));
    const style = list(card).style;
    expect(
      [
        '--calendar-card-title-max-lines',
        '--calendar-card-location-max-lines',
        '--calendar-card-description-max-lines',
        '--calendar-card-time-max-lines',
        '--calendar-card-weather-event-max-lines',
      ].map((property) => style.getPropertyValue(property)),
    ).toEqual(['1', '1', '1', '1', '1']);
    // The title is on one line beside its time, which ends it in "…" where it is too long.
    const first = list(card).querySelector('td.event .event-content')!;
    expect(first.querySelector(':scope > .summary-row > .summary.summary-scroll')).not.toBeNull();
    expect(first.querySelector(':scope > .summary-row > .title-aside .time')).not.toBeNull();
    expect(text(first.querySelector('.location'))).toBe(
      'A street name long enough to need a second line on a phone',
    );
    // Outside the list a month keeps no line limit at all, whatever the card or its block says
    // (`MONTH_PINNED`), so the panel, which reads the card's properties, lists the day in full.
    expect(
      root(card)
        .querySelector<HTMLElement>('ha-card')!
        .style.getPropertyValue('--calendar-card-title-max-lines'),
    ).toBe('none');
  });

  it('stages the day’s rows and "+N more" beside the list, out of sight and out of reach', async () => {
    extraEvents = NINE;
    const card = await mount(
      { show_description: true, event_tap_action: { action: 'details' } },
      375,
    );
    await tap(card, day(card, 28));
    const staged = staging(card)!;
    expect(list(card).nextElementSibling).toBe(staged);
    expect(staged.getAttribute('aria-hidden')).toBe('true');
    expect(staged.hasAttribute('inert')).toBe(true);
    // Every one of the day's rows, as the list draws them, and "+N more" at the day's count.
    expect(
      [...staged.querySelectorAll('td.event .event-title')].map((title) => text(title)),
    ).toEqual(NINE.map(({ summary }) => summary));
    // Each part of a row on one line, as in the list, which also carries the least it may be.
    const declared = (element: HTMLElement) =>
      (element.getAttribute('style') ?? '')
        .split(';')
        .map((declaration) => declaration.replace(/\s+/g, ''))
        .filter(
          (declaration) => declaration && !declaration.startsWith('--calendar-card-month-list-min'),
        );
    expect(declared(staged)).toEqual(declared(list(card)));
    expect(declared(staged)).toContain('--calendar-card-title-max-lines:1');
    const button = staged.querySelector(':scope > .month-day-table + .month-day-list-more')!;
    expect(text(button)).toBe('+9 more');
    // No ids, no tab stops, nothing to press.
    expect(
      staged.querySelector('[id], [tabindex], [role="button"], [aria-describedby]'),
    ).toBeNull();
    expect(button.hasAttribute('aria-label')).toBe(false);
    // An empty day stages nothing.
    await tap(card, day(card, 19));
    expect(staging(card)).toBeNull();
  });

  it('gives "+N more" the last row: a button in the Tab order, for its day and count', async () => {
    extraEvents = NINE;
    layOut({ room: 200 });
    const manager = playDialogManager();
    const card = await mount({}, 375);
    await tap(card, day(card, 28));
    expect(rowsOf(card)).toEqual(['Errand 1', 'Errand 2', 'Errand 3']);
    const more = moreOf(card)!;
    expect(more.tagName).toBe('BUTTON');
    expect(more.getAttribute('type')).toBe('button');
    expect(more.hasAttribute('tabindex')).toBe(false);
    expect(more.getAttribute('aria-label')).toBe('+6 more, Saturday, November 28');
    expect(text(more)).toBe('+6 more');
    // The narrow grid is still one stop, and Enter there selects.
    expect(
      [...root(card).querySelectorAll('.month-narrow .month-day')].filter(
        (cell) => cell.getAttribute('tabindex') === '0',
      ),
    ).toHaveLength(1);

    more.focus();
    more.click();
    await settle(card);
    await manager.panel()?.updateComplete;
    expect(
      dialogs.map(({ dialogTag, dialogParams }) => [
        dialogTag,
        (dialogParams as DayPanelParams).title,
      ]),
    ).toEqual([[DAY_PANEL_TAG, 'Saturday, November 28, 2026']]);
    const panel = manager.panel()!;
    expect(panel.shadowRoot!.querySelectorAll('.day-panel-rows td.event')).toHaveLength(9);
    // Its press is its own: no tap on the card, nor on the day beneath it.
    expect(hassActions).toEqual([]);
    // It stays open while the card draws again in the form it opened from.
    card.requestUpdate();
    await settle(card);
    expect(panel.shadowRoot!.querySelector('dialog')!.open).toBe(true);

    panel.closeDialog();
    await afterClose(card);
    expect(deepActive()).toBe(more);
  });

  it('opens its panel, and a row’s popover, beside its words, as a wide day’s does', async () => {
    extraEvents = NINE;
    layOut({ room: 200 });
    const manager = playDialogManager();
    const card = await mount({ event_tap_action: { action: 'details' } }, 375);
    await tap(card, day(card, 28));
    // happy-dom lays nothing out: the button is given the list's width, its words a box ending
    // at 90, as Chrome lays them out on a 375px card.
    const more = moreOf(card)!;
    more.getBoundingClientRect = () => new DOMRect(24, 472, 343, 29);
    const words = vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (
      this: Range,
    ) {
      const inMore = this.startContainer.parentElement?.closest('.month-day-list-more');
      return (inMore ? [new DOMRect(39, 479, 51, 14)] : []) as unknown as DOMRectList;
    });
    try {
      more.click();
      await settle(card);
      const panel = manager.panel()!;
      await panel.updateComplete;
      const anchor = (dialogs[0].dialogParams as DayPanelParams).anchor!;
      expect(anchor.rect).toEqual({ left: 24, top: 472, right: 90, bottom: 501 });

      [...panel.shadowRoot!.querySelectorAll<HTMLElement>('.event-button')]
        .find((button) => text(button).startsWith('Errand 5'))!
        .click();
      await afterClose(card);
      const opened = dialogs.filter(({ dialogTag }) => dialogTag === EVENT_POPOVER_TAG);
      expect((opened[0].dialogParams as PopoverParams).anchor?.rect).toEqual(anchor.rect);
    } finally {
      words.mockRestore();
    }
  });
});

describe('the gap between a day’s events', () => {
  const table = (card: CardUnderTest) =>
    root(card).querySelector<HTMLElement>('.month-day-list table.month-day-table')!;

  it('sets each event apart by 6px, with List’s row between two, unless month: says', async () => {
    const card = await mount({}, 375);
    expect(table(card).classList.contains('with-event-gap')).toBe(true);
    const rows = [...table(card).querySelectorAll('tr')];
    expect(rows.map((row) => (row.classList.contains('event-gap-row') ? 'gap' : 'event'))).toEqual([
      'event',
      'gap',
      'event',
      'gap',
      'event',
      'gap',
      'event',
    ]);
    expect(rows[1].getAttribute('aria-hidden')).toBe('true');
    const style = root(card).querySelector<HTMLElement>('ha-card')!.style;
    expect(style.getPropertyValue('--calendar-card-event-gap')).toBe('6px');

    // A card-wide gap is List's and Columns'; Month keeps its own until its block says.
    const shared = await mount({ event_gap: '0px' }, 375);
    expect(table(shared).classList.contains('with-event-gap')).toBe(true);
    const joined = await mount({ month: { event_gap: '0px' } }, 375);
    expect(table(joined).classList.contains('with-event-gap')).toBe(false);
    expect(table(joined).querySelector('.event-gap-row')).toBeNull();
    expect(
      root(joined)
        .querySelector<HTMLElement>('ha-card')!
        .style.getPropertyValue('--calendar-card-event-gap'),
    ).toBe('');
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
 * Home Assistant's dialog manager, as far as `show-dialog` goes, for the day panel and any other
 * dialog named: each made once, handed `hass` and shown, the element focus was on when it opened
 * noted, and focused again a frame after it says it has closed.
 *
 * @param tags - The dialogs it plays, the day panel alone unless others are named
 */
function playDialogManager(tags: readonly string[] = [DAY_PANEL_TAG]): {
  panel: () => PanelUnderTest | null;
  dialog: (tag: string) => PanelUnderTest | null;
} {
  const made = new Map<string, { element: PanelUnderTest; returnTo: HTMLElement | null }>();
  manager = (event) => {
    const detail = (event as CustomEvent<{ dialogTag: string; dialogParams: DayPanelParams }>)
      .detail;
    if (!tags.includes(detail.dialogTag)) return;
    const returnTo = deepActive();
    let shown = made.get(detail.dialogTag);
    if (!shown) {
      const element = document.createElement(detail.dialogTag) as PanelUnderTest;
      const entry = { element, returnTo };
      element.addEventListener('dialog-closed', () => {
        deepActive()?.blur();
        requestAnimationFrame(() => setTimeout(() => entry.returnTo?.focus()));
      });
      made.set(detail.dialogTag, entry);
      shown = entry;
    }
    shown.returnTo = returnTo;
    shown.element.hass = (event.target as CardUnderTest).hass;
    shown.element.showDialog(detail.dialogParams);
    if (!shown.element.isConnected) document.body.appendChild(shown.element);
  };
  document.addEventListener('show-dialog', manager);
  return {
    panel: () => made.get(DAY_PANEL_TAG)?.element ?? null,
    dialog: (tag) => made.get(tag)?.element ?? null,
  };
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

  it('gives focus back without the keyboard’s ring after a press closes it, not after a key', async () => {
    // Closing the modal and Home Assistant both put focus back as a script does, which Chrome
    // rings wherever a key has been pressed since a press last moved focus; a press on the
    // backdrop moves none where the panel held focus already. So a press puts focus back once
    // more, saying not to ring, and a key leaves it as it was. happy-dom draws no ring, so what is
    // pinned is the option on the focus that moved focus back, which is what a browser reads.
    const moves: Array<{ to: HTMLElement; options?: FocusOptions }> = [];
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
      if (deepActive() !== this) moves.push({ to: this, options });
      focus.call(this, options);
    };
    try {
      const { card, panel } = await open();
      const cell = root(card).querySelector<HTMLElement>(
        '.month-day[aria-label^="Tuesday, November 10, 2026"]',
      )!;
      const dialog = panel!.shadowRoot!.querySelector('dialog')!;
      const lastMoveTo = () => moves.filter(({ to }) => to === cell).pop();

      // A press that starts and ends on the backdrop, once the panel has been open a moment.
      vi.advanceTimersByTime(400);
      pointer(dialog, 'pointerdown');
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      await afterClose(card);
      expect(isOpen(panel)).toBe(false);
      expect(deepActive()).toBe(cell);
      expect(lastMoveTo()?.options).toEqual({ preventScroll: true, focusVisible: false });

      // Escape, after opening it again: focus goes back as it always has.
      more(card).click();
      await settle(card);
      await panel!.updateComplete;
      expect(isOpen(panel)).toBe(true);
      moves.length = 0;
      panel!
        .shadowRoot!.querySelector('.day-panel-close')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
        );
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      await afterClose(card);
      expect(isOpen(panel)).toBe(false);
      expect(deepActive()).toBe(cell);
      expect(lastMoveTo()).toBeDefined();
      expect(moves.some(({ options }) => options?.focusVisible !== undefined)).toBe(false);
    } finally {
      HTMLElement.prototype.focus = focus;
    }
  });

  it('gives focus back to the day after a row picked by key opens a popover, with less motion', async () => {
    // Closed at once, the panel has focus back on the day before Home Assistant's manager hears,
    // blurs it and puts it back a render later; the row's popover opens in between. It opened on
    // nothing then, so closing it gave focus back to nothing.
    const media = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(
        (query: string) =>
          ({ matches: query.includes('prefers-reduced-motion: reduce') }) as MediaQueryList,
      );
    try {
      const manager = playDialogManager([DAY_PANEL_TAG, EVENT_POPOVER_TAG]);
      const card = await mount({ event_tap_action: { action: 'details' } });
      const cell = root(card).querySelector<HTMLElement>(
        '.month-day[aria-label^="Tuesday, November 10, 2026"]',
      )!;
      more(card).click();
      await settle(card);
      const panel = manager.panel()!;
      await panel.updateComplete;
      const review = [...panel.shadowRoot!.querySelectorAll<HTMLElement>('.event-button')].find(
        (button) => text(button).startsWith('Review'),
      )!;
      review.focus();
      review.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
      );
      await afterClose(card);
      expect(isOpen(panel)).toBe(false);
      const popover = manager.dialog(EVENT_POPOVER_TAG)!;
      await popover.updateComplete;
      const dialog = popover.shadowRoot!.querySelector('dialog')!;
      expect(dialog.open).toBe(true);

      deepActive()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
      if (dialog.open) dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      await afterClose(card);
      expect(dialog.open).toBe(false);
      expect(deepActive()).toBe(cell);
    } finally {
      media.mockRestore();
    }
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

  it('opens a row’s popover where the panel opened, from its day’s "+N more"', async () => {
    // happy-dom lays nothing out, so "+N more" is given a box; the rows keep none.
    const manager = playDialogManager();
    const card = await mount({ event_tap_action: { action: 'details' } });
    more(card).getBoundingClientRect = () => new DOMRect(500, 300, 80, 20);
    more(card).click();
    await settle(card);
    const panel = manager.panel();
    await panel?.updateComplete;
    const anchor = (dialogs[0].dialogParams as DayPanelParams).anchor!;
    expect(anchor).toMatchObject({ x: 540, y: 310 });

    [...panel!.shadowRoot!.querySelectorAll<HTMLElement>('.event-button')]
      .find((button) => text(button).startsWith('Review'))!
      .click();
    await afterClose(card);
    const opened = dialogs.filter(({ dialogTag }) => dialogTag === EVENT_POPOVER_TAG);
    expect(opened).toHaveLength(1);
    // Without a pointer of the panel's own: the row's click has no events left to send.
    expect((opened[0].dialogParams as PopoverParams).anchor).toEqual({
      x: anchor.x,
      y: anchor.y,
      rect: anchor.rect,
    });
  });

  it('adds on its day from its title where day_tap_action adds, opened by a key on the day', async () => {
    // The keys open the day's panel whatever a press on the day runs, as that is how they reach
    // the day's events; where that press adds, the panel's title adds, as a narrow day's name does.
    const manager = playDialogManager();
    const card = await mount({ day_tap_action: { action: 'add-event' } });
    const cell = root(card).querySelector<HTMLElement>(
      '.month-day[aria-label^="Tuesday, November 10, 2026"]',
    )!;
    cell.focus();
    cell.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    await settle(card);
    const panel = manager.panel()!;
    await panel.updateComplete;
    expect(isOpen(panel)).toBe(true);
    const dialog = panel.shadowRoot!.querySelector('dialog')!;
    expect(text(panel.shadowRoot!.getElementById(dialog.getAttribute('aria-labelledby')!))).toBe(
      'Tuesday, November 10, 2026',
    );
    const add = panel.shadowRoot!.querySelector<HTMLButtonElement>('.day-panel-title button')!;
    expect(add.getAttribute('aria-label')).toBe('Add event');
    expect(text(panel.shadowRoot!.getElementById(add.getAttribute('aria-describedby')!))).toBe(
      'Tuesday, November 10, 2026',
    );
    const anchor = (dialogs[0].dialogParams as DayPanelParams).anchor!;

    add.click();
    await afterClose(card);
    expect(isOpen(panel)).toBe(false);
    const opened = dialogs.filter(({ dialogTag }) => dialogTag === EVENT_POPOVER_TAG);
    expect(opened).toHaveLength(1);
    const params = opened[0].dialogParams as PopoverParams;
    expect(params.entry).toBeUndefined();
    expect(params.times?.start).toEqual(new Date(2026, 10, 10, 10));
    expect(params.anchor?.rect).toEqual(anchor.rect);
  });

  it('keeps its title plain where a tap on a day adds nothing', async () => {
    const { panel } = await open({ tap_action: { action: 'more-info' } });
    expect(panel!.shadowRoot!.querySelector('.day-panel-title button')).toBeNull();
    expect(text(panel!.shadowRoot!.querySelector('.day-panel-title'))).toBe(
      'Tuesday, November 10, 2026',
    );
  });

  it('runs Home Assistant’s action for a row where event_tap_action names one', async () => {
    const { card, panel } = await open({ event_tap_action: { action: 'more-info' } });
    [...panel!.shadowRoot!.querySelectorAll<HTMLElement>('.event-button')]
      .find((button) => text(button).startsWith('Gym'))!
      .click();
    await afterClose(card);
    expect(hassActions.map(({ config }) => config.entity)).toEqual([ANNA]);
  });

  describe('a row held', () => {
    const NAVIGATE = { action: 'navigate', navigation_path: '/lovelace/family' };

    /** A press on a row that lasts a while, then lets go, and the click a browser derives. */
    async function press(card: CardUnderTest, panel: PanelUnderTest, ms: number) {
      const review = [...panel.shadowRoot!.querySelectorAll<HTMLElement>('.event-button')].find(
        (button) => text(button).startsWith('Review'),
      )!;
      pointer(review, 'pointerdown');
      vi.advanceTimersByTime(ms);
      pointer(review, 'pointerup');
      review.click();
      await afterClose(card);
    }

    const popovers = () => dialogs.filter(({ dialogTag }) => dialogTag === EVENT_POPOVER_TAG);

    it('runs event_hold_action, as a hold on the event in the card does', async () => {
      const { card, panel } = await open({
        event_tap_action: { action: 'details' },
        event_hold_action: NAVIGATE,
      });
      await press(card, panel!, 600);
      expect(isOpen(panel)).toBe(false);
      expect(popovers()).toEqual([]);
      expect(hassActions.map(({ action, config }) => [action, config.hold_action])).toEqual([
        ['hold', NAVIGATE],
      ]);
    });

    it('runs the card’s hold_action where the event has no hold of its own', async () => {
      const { card, panel } = await open({
        event_tap_action: { action: 'details' },
        hold_action: NAVIGATE,
      });
      await press(card, panel!, 600);
      expect(popovers()).toEqual([]);
      expect(hassActions.map(({ action }) => action)).toEqual(['hold']);
    });

    it('is a tap where it lets go before a hold, and where nothing holds', async () => {
      const short = await open({
        event_tap_action: { action: 'details' },
        event_hold_action: NAVIGATE,
      });
      await press(short.card, short.panel!, 200);
      expect(popovers()).toHaveLength(1);
      expect(hassActions).toEqual([]);

      document.body.replaceChildren();
      dialogs = [];
      const none = await open({ event_tap_action: { action: 'details' } });
      await press(none.card, none.panel!, 600);
      expect(popovers()).toHaveLength(1);
      expect(hassActions).toEqual([]);
    });
  });

  it('fits each row’s time beside its title, as the card fits its own rows', async () => {
    // happy-dom lays nothing out, so every box is given a width: a row with none is left with
    // its time under its title. The pictures are taken in Chromium.
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 320,
    });
    try {
      const { panel } = await open({ time_position: 'below' });
      const fitted = [
        ...panel!.shadowRoot!.querySelectorAll<HTMLElement>(
          '.day-panel-rows .time-beside-title > .summary-row.title-wrap',
        ),
      ];
      expect(fitted).toHaveLength(5);
      expect(fitted.map((row) => row.getAttribute('data-title-fit'))).toEqual(Array(5).fill('ltr'));
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
    }
  });

  it('is placed beside "+N more" at the height its fitted rows give it', async () => {
    // In Chrome a row not yet fitted wraps its title under a time it has no room beside, so a
    // panel measured before its rows are fitted is placed for a taller panel than it draws, and
    // keeps that top as it shrinks: centered above the "+N more" rather than on it. happy-dom
    // lays nothing out, so the panel is given the heights Chrome gives it, 500 px unfitted and
    // 300 px fitted, and "+N more" a box whose middle is at 410.
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!;
    const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 320,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.classList.contains('panel')) return 0;
        return this.querySelector('[data-title-fit]') ? 300 : 500;
      },
    });
    try {
      const manager = playDialogManager();
      const card = await mount({ time_position: 'below' });
      more(card).getBoundingClientRect = () => new DOMRect(100, 400, 60, 20);
      more(card).click();
      await settle(card);
      const panel = manager.panel()!;
      await panel.updateComplete;
      expect(
        panel.shadowRoot!.querySelectorAll('.day-panel-rows [data-title-fit]').length,
      ).toBeGreaterThan(0);
      const dialog = panel.shadowRoot!.querySelector('dialog')!;
      expect(dialog.style.top).toBe('260px');
      const arrow = panel.shadowRoot!.querySelector<HTMLElement>('.arrow')!;
      expect(arrow.style.top).toBe('150px');
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
    }
  });

  it('draws a title, a time and a location, and leaves the rest to the event’s details', async () => {
    // Every part Month leaves out turned on at the top level, in its block and on a calendar:
    // `MONTH_PINNED` keeps each at its shipped value, and a calendar's own description too.
    const on = {
      show_description: true,
      show_countdown: true,
      show_progress_bar: true,
      allday_badge: 'title',
    };
    extraEvents = [
      {
        ...timed(ANNA, 'Dentist', '2026-11-10', '20:00', '21:00', '2026-11-10', 'Market Street 5'),
        description: 'Bring the card',
      } as RawEvent,
      allDay(BEN, 'Fair', '2026-11-10', '2026-11-11'),
    ];
    const { panel } = await open({
      ...on,
      month: on,
      entities: [
        { entity: ANNA, accent_color: BLUE, show_description: true },
        { entity: BEN, accent_color: GREEN },
      ],
    });
    const rows = panel!.shadowRoot!.querySelector('.day-panel-rows')!;
    expect(rows.querySelectorAll('td.event').length).toBeGreaterThan(5);
    for (const part of ['.description', '.time-countdown', '.progress-bar', '.allday-badge']) {
      expect([part, rows.querySelectorAll(part).length]).toEqual([part, 0]);
    }
    // The control: the location is drawn, as Show Location's default says.
    expect(text(rows.querySelector('.location'))).toBe('Market Street 5');
  });

  const titleColor = (panel: PanelUnderTest | null) =>
    panel!.shadowRoot!.querySelector<HTMLElement>('.day-panel-title')!.style.color;

  it('writes its title in the weekday color the card sets, as the day list does', async () => {
    expect(titleColor((await open({ weekday_color: 'rgb(1, 2, 3)' })).panel)).toBe('rgb(1, 2, 3)');
  });

  it('writes its title in its own text color while the card sets no weekday color', async () => {
    expect(titleColor((await open()).panel)).toBe('');
  });

  it('sets its rows apart as the card’s day list does', async () => {
    const { panel } = await open();
    const rows = [...panel!.shadowRoot!.querySelectorAll('.day-panel-rows table tr')];
    expect(rows.filter((row) => row.classList.contains('event-gap-row'))).toHaveLength(4);
    expect(
      panel!
        .shadowRoot!.querySelector('.day-panel-rows table')!
        .classList.contains('with-event-gap'),
    ).toBe(true);
    const style = panel!.shadowRoot!.querySelector<HTMLElement>('.day-panel-rows')!.style;
    expect(style.getPropertyValue('--calendar-card-event-gap')).toBe('6px');
  });

  it('draws plain rows, which a tap leaves open, where events run nothing', async () => {
    const { card, panel } = await open({ event_tap_action: { action: 'none' } });
    expect(panel!.shadowRoot!.querySelector('.event-button')).toBeNull();
    panel!.shadowRoot!.querySelector<HTMLElement>('td.event')!.click();
    await afterClose(card);
    expect(isOpen(panel)).toBe(true);
    expect(dialogs.map(({ dialogTag }) => dialogTag)).toEqual([DAY_PANEL_TAG]);
  });
});

describe('the weeks’ lines and bars', () => {
  it('write a line’s title in its calendar’s own color, as a row’s is', async () => {
    const card = await mount({
      entities: [
        { entity: ANNA, accent_color: BLUE, color: 'rgb(1, 2, 3)' },
        { entity: BEN, accent_color: GREEN },
      ],
    });
    const titles = [...root(card).querySelectorAll<HTMLElement>('.month-line')].map((line) => [
      text(line.querySelector('.month-line-title')),
      line.querySelector<HTMLElement>('.month-line-title')!.style.color,
    ]);
    expect(titles).toContainEqual(['Standup', 'rgb(1, 2, 3)']);
    // The control: Ben sets none, so the card's event color reaches his titles through the
    // stylesheet.
    expect(titles).toContainEqual(['Review', '']);
  });

  it('write a bar’s times and length in the time color, as a line’s time is', () => {
    const rule = (selector: string) =>
      declarations(cardStyles.cssText)
        .filter((d) => d.at.length === 0 && d.selectors.includes(selector))
        .map((d) => [d.property, d.value]);
    for (const selector of ['.month-bar .grid-banner-time', '.month-bar .grid-banner-duration']) {
      expect(rule(selector), selector).toContainEqual(['color', 'var(--calendar-card-color-time)']);
    }
    expect(rule('.month-line-time')).toContainEqual(['color', 'var(--calendar-card-color-time)']);
  });
});

describe('today’s tile in the wide month', () => {
  const WIDE_TILE = '.month-container:not(.month-narrow) .month-date > .day.today-tile';
  const SELECTED_TODAY = '.month-narrow .month-day.month-selected.today .month-date > .day';
  const NARROW_DAY = '.month-narrow .month-date > .day';

  /** A rule's declarations outside any at-rule, by property. */
  const rule = (selector: string) =>
    Object.fromEntries(
      declarations(cardStyles.cssText)
        .filter((d) => d.at.length === 0 && d.selectors.includes(selector))
        .map((d) => [d.property, d.value]),
    );

  it('is filled in the indicator color with the light ink, as the narrow form’s selected today', () => {
    const wide = rule(WIDE_TILE);
    const selected = rule(SELECTED_TODAY);
    expect({
      background: wide.background,
      ink: wide['--calendar-card-today-indicator-ink'],
      weight: wide['font-weight'],
    }).toEqual({
      background: 'var(--calendar-card-today-indicator-color)',
      ink: 'var(--text-primary-color, #fff)',
      weight: '600',
    });
    // Drawn as the narrow form draws today while it is the selected day.
    expect([
      wide.background,
      wide['--calendar-card-today-indicator-ink'],
      wide['font-weight'],
    ]).toEqual([selected.background, selected.color, selected['font-weight']]);
  });

  it('rounds its corners as the narrow tile does, short of a pill, and leaves the list’s', () => {
    const SQUIRCLE = '@supports (corner-shape: squircle)';
    const radius = (selector: string, at: readonly string[]) =>
      declarations(cardStyles.cssText)
        .filter(
          (d) =>
            d.property === 'border-radius' &&
            d.selectors.includes(selector) &&
            d.at.join() === at.join(),
        )
        .map((d) => d.value);
    // With a squircle, the narrow tile's own corner; without one, its share of the side, since
    // its 0.6em would round a 1.2em tile's ends into a pill.
    const narrow = rule(NARROW_DAY)['border-radius'];
    expect(narrow).toBe('0.6em');
    expect(radius(WIDE_TILE, [SQUIRCLE])).toEqual([narrow]);
    expect(radius(WIDE_TILE, [])).toEqual(['0.41em']);
    // The control: the list's and the columns' tile keeps its corners.
    expect(radius('.day.today-tile', [])).toEqual(['0.27em']);
    expect(radius('.day.today-tile', [SQUIRCLE])).toEqual(['0.456em']);
  });

  it('reaches the wide month’s tile alone, whose digits take the ink it redefines', async () => {
    const card = await mount();
    const tile = root(card).querySelector<HTMLElement>('.month-container .day.today-tile')!;
    expect(tile.matches(WIDE_TILE)).toBe(true);
    // The digits read the ink inline, so the ink set on the tile is what colors them.
    expect(tile.style.color).toBe('var(--calendar-card-today-indicator-ink)');
    // A color named for them still wins, as on every tile.
    const named = await mount({ today_day_color: 'rgb(1, 2, 3)' });
    expect(root(named).querySelector<HTMLElement>('.day.today-tile')!.style.color).toBe(
      'rgb(1, 2, 3)',
    );
    // The control: the narrow form's tile and List's are not reached.
    const narrow = await mount({}, 375);
    expect(day(narrow, 18).querySelector('.day.today-tile')!.matches(WIDE_TILE)).toBe(false);
    const list = await mount({ view: 'list' });
    const listTile = root(list).querySelector('.day.today-tile');
    expect(listTile).not.toBeNull();
    expect(listTile!.matches(WIDE_TILE)).toBe(false);
  });
});
