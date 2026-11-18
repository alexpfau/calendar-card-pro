/**
 * A month for the keyboard and assistive technology, a search's pick on it, and the repaint at an
 * event's end.
 *
 * The month is one grid in either form: a header row of weekdays named in full, six rows of seven
 * day cells, each named for its day and its events, and one tab stop among them that the arrows,
 * Home, End and the page keys move, paging where they leave the rows drawn. Enter and Space open a
 * wide day's panel or select a compact day. The events drawn in a wide day are owned by its cell
 * and out of the Tab order, since the panel lists them. A pick from search pages to its month and
 * rings the event where the month discloses it: in the weeks, in a compact day's list, or in its
 * day's panel behind "+N more". And an event that ends dims, or goes, with no `hass` traffic at
 * all. Zones that move the arithmetic are in `month-keyboard.dst.test.ts`; the wheel and the
 * finger in `month-week-scroll.test.ts`.
 *
 * Wednesday, November 18, 2026, 10:00 UTC; Mondays first, so home's six weeks run from Monday,
 * October 26 to Sunday, December 6. Names are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import { DAY_PANEL_TAG, type DayPanelParams } from '../src/rendering/day-panel';
import * as MonthRender from '../src/rendering/month';
import { cardStyles } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';
import type * as Search from '../src/utils/search';
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

interface RawEvent {
  summary: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  calendar: string;
}

const timed = (
  calendar: string,
  summary: string,
  date: string,
  from: string,
  to: string,
  toDate = date,
): RawEvent => ({
  calendar,
  summary,
  start: { dateTime: `${date}T${from}:00Z` },
  end: { dateTime: `${toDate}T${to}:00Z` },
});

const allDay = (calendar: string, summary: string, from: string, until: string): RawEvent => ({
  calendar,
  summary,
  start: { date: from },
  end: { date: until },
});

let EVENTS: RawEvent[] = [];

const BASE_EVENTS: RawEvent[] = [
  // Five on Tuesday the 10th: three lines and "+2 more" at the default capacity of four.
  timed(ANNA, 'Standup', '2026-11-10', '08:00', '08:15'),
  timed(BEN, 'Review', '2026-11-10', '10:00', '11:00'),
  timed(ANNA, 'Lunch with Ben', '2026-11-10', '12:00', '13:00'),
  timed(BEN, 'Planning', '2026-11-10', '14:00', '15:00'),
  timed(ANNA, 'Gym', '2026-11-10', '18:00', '19:00'),
  timed(ANNA, 'Dentist', '2026-11-12', '14:00', '15:00'),
  timed(BEN, 'Football', '2026-11-12', '17:30', '19:00'),
  timed(ANNA, 'Late show', '2026-11-13', '22:30', '01:30', '2026-11-14'),
  // Today: one under way, ending at 10:20, and one to come.
  timed(ANNA, 'Call', '2026-11-18', '09:30', '10:20'),
  timed(BEN, 'Piano', '2026-11-18', '16:00', '17:00'),
  allDay(BEN, 'Trip', '2026-11-20', '2026-11-25'),
  // December: a page away.
  timed(ANNA, 'Concert', '2026-12-09', '19:00', '21:00'),
];

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  requestUpdate(): void;
}

/** The card's search pick, and its moment after the panel has gone, as the search calls them. */
interface Picking {
  _pickSearchResult(row: Pick<Search.SearchRow, 'day' | 'target'>): void;
  _searchGone(): void;
  _searchPanelGone: boolean;
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
  /** Every element any observer was asked to watch. */
  static observed: Element[] = [];
  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    RecordingResizeObserver.observed.push(target);
  }
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
    localize: (key: string) => key,
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
  entities: [ANNA, BEN],
  first_day_of_week: 'monday',
  time_24h: true,
  toolbar: { show: true, navigation: true },
};

/** Every dialog the card asked Home Assistant to open. */
let dialogs: Array<{ dialogTag: string; dialogParams: unknown }> = [];
/** The day panel the dialog manager's stand-in made, once it has made one. */
let panel: PanelUnderTest | null = null;

/** The element focus is on, through every shadow root. */
function deepActive(): HTMLElement | null {
  let active = document.activeElement as HTMLElement | null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
  return active;
}

/**
 * Home Assistant's dialog manager, as far as `show-dialog` goes, for the day panel: made once,
 * handed `hass` and shown, and focus put back where it was a frame after it says it has closed.
 */
function manager(event: Event): void {
  const detail = (event as CustomEvent<{ dialogTag: string; dialogParams: DayPanelParams }>).detail;
  dialogs.push(detail);
  if (detail.dialogTag !== DAY_PANEL_TAG) return;
  const returnTo = deepActive();
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
}

async function settle(card: CardUnderTest): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await card.updateComplete;
  await panel?.updateComplete;
}

async function mount(config: Record<string, unknown> = {}, width?: number) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ ...BASE, ...config });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
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

/** The month's day cells, first row first. */
const cells = (card: CardUnderTest) => [
  ...root(card).querySelectorAll<HTMLElement>('.month-container [role="gridcell"]'),
];

/** A cell by the start of its name: "Tuesday, November 10". */
function cell(card: CardUnderTest, day: string): HTMLElement {
  const found = cells(card).find((element) => element.getAttribute('aria-label')!.startsWith(day));
  if (!found) throw new Error(`no cell for ${day}`);
  return found;
}

/** The names of the cells that are tab stops. */
const tabStops = (card: CardUnderTest) =>
  cells(card)
    .filter((element) => element.getAttribute('tabindex') === '0')
    .map((element) => element.getAttribute('aria-label'));

/** The name of the cell focus is on, the day alone. */
const focusedDay = () =>
  deepActive()?.getAttribute('aria-label')?.split(', ').slice(0, 3).join(', ');

/** The month the toolbar names. */
const heading = (card: CardUnderTest) => text(root(card).querySelector('.toolbar-month-text'));

/** Presses a key on the element focus is on, as a browser dispatches it, and lets the card draw. */
async function press(
  card: CardUnderTest,
  key: string,
  init: KeyboardEventInit = {},
  on: Element | null = deepActive(),
): Promise<KeyboardEvent> {
  const down = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  on!.dispatchEvent(down);
  on!.dispatchEvent(
    new KeyboardEvent('keyup', { key, bubbles: true, composed: true, cancelable: true, ...init }),
  );
  await settle(card);
  // A page the key asked for, and the focus that follows it.
  await vi.advanceTimersByTimeAsync(0);
  await settle(card);
  return down;
}

const originalResizeObserver = globalThis.ResizeObserver;
const activeElement = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'activeElement')!;

beforeEach(() => {
  // happy-dom's `ShadowRoot.activeElement` throws while focus is in another shadow tree, the
  // day panel's, where a browser answers null.
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
  EventUtils.clearPageStore();
  EVENTS = [...BASE_EVENTS];
  RecordingResizeObserver.instances = [];
  RecordingResizeObserver.observed = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
  dialogs = [];
  panel = null;
  document.addEventListener('show-dialog', manager);
});

afterEach(() => {
  Object.defineProperty(ShadowRoot.prototype, 'activeElement', activeElement);
  document.removeEventListener('show-dialog', manager);
  document.body.replaceChildren();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

//-----------------------------------------------------------------------------
// THE GRID
//-----------------------------------------------------------------------------

describe('a month as a grid', () => {
  it.each([
    ['wide', undefined],
    ['compact', 375],
  ] as const)(
    'is one grid in its %s form: a header row and six rows of seven cells',
    async (_form, width) => {
      const card = await mount({ show_week_numbers: 'iso' }, width);
      const grid = root(card).querySelector('.month-container')!;
      expect(grid.getAttribute('role')).toBe('grid');
      expect(grid.getAttribute('aria-label')).toBe('November 2026');

      const rows = [...grid.querySelectorAll(':scope > [role="row"]')];
      expect(rows).toHaveLength(7);
      const headers = [...rows[0].querySelectorAll('[role="columnheader"]')];
      expect(headers.map((header) => header.getAttribute('aria-label'))).toEqual([
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ]);
      expect(rows.slice(1).map((row) => row.querySelectorAll('[role="gridcell"]').length)).toEqual([
        7, 7, 7, 7, 7, 7,
      ]);
      // Nothing else in a row is a thing of its own to assistive technology: the dates, the week
      // numbers and the compact gutter are hidden, and a wide day's events are its cell's.
      const owned = new Set(
        cells(card).flatMap((element) => (element.getAttribute('aria-owns') ?? '').split(' ')),
      );
      for (const row of rows) {
        for (const child of row.children) {
          const role = child.getAttribute('role');
          expect(
            role === 'gridcell' ||
              role === 'columnheader' ||
              child.getAttribute('aria-hidden') === 'true' ||
              owned.has(child.id),
            child.outerHTML.slice(0, 120),
          ).toBe(true);
        }
      }
    },
  );

  it.each([
    ['wide', undefined],
    ['compact', 375],
  ] as const)(
    'names each %s cell for its day in full and the events it holds',
    async (_form, width) => {
      const card = await mount({}, width);
      expect(
        [
          'Tuesday, November 10',
          'Thursday, November 12',
          'Friday, November 13',
          'Thursday, November 19',
        ].map((day) => cell(card, day).getAttribute('aria-label')),
      ).toEqual([
        'Tuesday, November 10, 2026, 5 events',
        'Thursday, November 12, 2026, 2 events',
        'Friday, November 13, 2026, 1 event',
        'Thursday, November 19, 2026, No events',
      ]);
      expect(cell(card, 'Wednesday, November 18').getAttribute('aria-current')).toBe('date');
    },
  );

  it('counts in the language’s own plural forms', () => {
    const count = (language: string, values: number[]) =>
      values.map((value) => MonthRender.eventCountText(value, language));
    expect(count('en', [0, 1, 2])).toEqual(['No events', '1 event', '2 events']);
    expect(count('pl', [1, 2, 5])).toEqual(['1 wydarzenie', 'Wydarzenia: 2', 'Wydarzenia: 5']);
    // Russian's "one" is 21 as well as 1.
    expect(count('ru', [21, 3])).toEqual(['21 событие', 'Событий: 3']);
    expect(count('ja', [1, 3])).toEqual(['1件の予定', '3件の予定']);
  });

  it('keeps one tab stop: today, else the header month’s 1st', async () => {
    const card = await mount();
    expect(tabStops(card)).toEqual(['Wednesday, November 18, 2026, 2 events']);

    root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[2].click();
    await settle(card);
    await vi.advanceTimersByTimeAsync(0);
    await settle(card);
    expect(heading(card)).toBe('December 2026');
    expect(tabStops(card)).toEqual(['Tuesday, December 1, 2026, No events']);
  });

  it('puts a compact month’s tab stop on its selected day, which it marks selected', async () => {
    const card = await mount({}, 375);
    expect(tabStops(card)).toEqual(['Wednesday, November 18, 2026, 2 events']);
    const selected = cells(card).filter(
      (element) => element.getAttribute('aria-selected') === 'true',
    );
    expect(selected.map((element) => element.getAttribute('aria-label'))).toEqual([
      'Wednesday, November 18, 2026, 2 events',
    ]);
    expect(cells(card).every((element) => element.hasAttribute('aria-selected'))).toBe(true);
  });

  it('keeps a wide day’s events and its "+N more" out of the Tab order, each owned by its day', async () => {
    const card = await mount({ event_tap_action: { action: 'details' } });
    const drawn = [
      ...root(card).querySelectorAll<HTMLElement>('.month-line, .month-bar, .month-more'),
    ];
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.map((element) => element.getAttribute('tabindex'))).toEqual(drawn.map(() => '-1'));
    expect(root(card).querySelectorAll('.month-week [tabindex="0"]')).toHaveLength(1);

    // Every item is owned once, by the cell of the day it starts on, and every id owned exists.
    const owners = new Map<string, string[]>();
    for (const element of cells(card)) {
      for (const id of (element.getAttribute('aria-owns') ?? '').split(' ').filter(Boolean)) {
        expect(root(card).getElementById(id), id).not.toBeNull();
        owners.set(id, [...(owners.get(id) ?? []), element.getAttribute('aria-label')!]);
      }
    }
    expect(drawn.map((element) => owners.get(element.id)?.length)).toEqual(drawn.map(() => 1));
    expect(cell(card, 'Tuesday, November 10').getAttribute('aria-owns')!.split(' ')).toEqual([
      'month-item-2026-11-10-0',
      'month-item-2026-11-10-1',
      'month-item-2026-11-10-2',
      'month-item-2026-11-10-more',
    ]);
    // The trip's bar starts on Friday and carries on into the next row, where Monday owns it.
    expect(owners.get('month-item-2026-11-20-0')).toEqual(['Friday, November 20, 2026, 1 event']);
    expect(owners.get('month-item-2026-11-23-0')).toEqual(['Monday, November 23, 2026, 1 event']);
  });

  it('is a host of controls of its own, so the card is no button around it', async () => {
    const card = await mount({ tap_action: { action: 'more-info' } });
    const haCard = root(card).querySelector('ha-card')!;
    expect(haCard.getAttribute('role')).toBeNull();
    expect(haCard.querySelector(':scope > .card-tap-control')).not.toBeNull();
  });
});

//-----------------------------------------------------------------------------
// THE KEYBOARD
//-----------------------------------------------------------------------------

describe('the keyboard on a month', () => {
  async function focusOn(card: CardUnderTest, day: string): Promise<void> {
    cell(card, day).focus();
    await settle(card);
  }

  it('moves a day with the arrows across, a week up and down, and to the week’s ends', async () => {
    const card = await mount();
    await focusOn(card, 'Wednesday, November 18');
    const visits: Array<string | undefined> = [];
    for (const key of [
      'ArrowRight',
      'ArrowLeft',
      'ArrowLeft',
      'ArrowDown',
      'ArrowUp',
      'ArrowUp',
      'Home',
      'End',
    ]) {
      const down = await press(card, key);
      expect(down.defaultPrevented).toBe(true);
      visits.push(focusedDay());
    }
    expect(visits).toEqual([
      'Thursday, November 19, 2026',
      'Wednesday, November 18, 2026',
      'Tuesday, November 17, 2026',
      'Tuesday, November 24, 2026',
      'Tuesday, November 17, 2026',
      'Tuesday, November 10, 2026',
      'Monday, November 9, 2026',
      'Sunday, November 15, 2026',
    ]);
    // The tab stop goes with focus, and stays one.
    expect(tabStops(card)).toEqual(['Sunday, November 15, 2026, No events']);
  });

  it('pages where an arrow leaves the rows, and focus follows onto the new page', async () => {
    const card = await mount();
    await focusOn(card, 'Sunday, December 6');
    await press(card, 'ArrowRight');
    expect(heading(card)).toBe('December 2026');
    expect(focusedDay()).toBe('Monday, December 7, 2026');

    // December's rows start on November 30, so the day before it pages back to November's.
    await focusOn(card, 'Monday, November 30');
    await press(card, 'ArrowLeft');
    expect(heading(card)).toBe('November 2026');
    expect(focusedDay()).toBe('Sunday, November 29, 2026');
    for (let week = 0; week < 4; week += 1) await press(card, 'ArrowUp');
    expect(heading(card)).toBe('November 2026');
    expect(focusedDay()).toBe('Sunday, November 1, 2026');
    await press(card, 'ArrowUp');
    expect(heading(card)).toBe('October 2026');
    expect(focusedDay()).toBe('Sunday, October 25, 2026');
  });

  it('pages a month with Page Up and Page Down, to the same date or the month’s last', async () => {
    const card = await mount();
    await focusOn(card, 'Wednesday, November 18');
    await press(card, 'PageDown');
    expect([heading(card), focusedDay()]).toEqual(['December 2026', 'Friday, December 18, 2026']);
    await press(card, 'PageUp');
    await press(card, 'PageUp');
    expect([heading(card), focusedDay()]).toEqual(['October 2026', 'Sunday, October 18, 2026']);
    // October 31 has no date in November: its last day.
    await focusOn(card, 'Saturday, October 31');
    await press(card, 'PageDown');
    expect([heading(card), focusedDay()]).toEqual(['November 2026', 'Monday, November 30, 2026']);
  });

  it('pages from the month the heading names, even where the date a month away is drawn', async () => {
    // November's rows run from October 26 to December 6, so December 3 is drawn beside it.
    const card = await mount();
    await focusOn(card, 'Tuesday, November 3');
    await press(card, 'PageDown');
    expect([heading(card), focusedDay()]).toEqual(['December 2026', 'Thursday, December 3, 2026']);
    await press(card, 'PageDown');
    expect([heading(card), focusedDay()]).toEqual(['January 2027', 'Sunday, January 3, 2027']);

    // A day of the next month drawn dimmed pages to that month, not past it, and a date the month
    // has no day for lands on its last.
    await focusOn(card, 'Monday, February 1');
    await press(card, 'PageDown');
    expect([heading(card), focusedDay()]).toEqual(['February 2027', 'Monday, February 1, 2027']);
    await press(card, 'PageUp');
    await focusOn(card, 'Sunday, January 31');
    await press(card, 'PageDown');
    expect([heading(card), focusedDay()]).toEqual(['February 2027', 'Sunday, February 28, 2027']);
  });

  it.each([
    ['Thursday, November 26', 'Monday, October 26, 2026'],
    ['Friday, November 27', 'Tuesday, October 27, 2026'],
    ['Saturday, November 28', 'Wednesday, October 28, 2026'],
    ['Sunday, November 29', 'Thursday, October 29, 2026'],
    ['Monday, November 30', 'Friday, October 30, 2026'],
  ])('pages back to October from %s, whose date in October November draws', async (from, to) => {
    const card = await mount();
    await focusOn(card, from);
    await press(card, 'PageUp');
    expect([heading(card), focusedDay()]).toEqual(['October 2026', to]);
  });

  it('stays on the rows drawn where the card does not page', async () => {
    const card = await mount({ toolbar: { show: false } });
    await focusOn(card, 'Sunday, December 6');
    await press(card, 'ArrowRight');
    await press(card, 'PageDown');
    expect(focusedDay()).toBe('Sunday, December 6, 2026');
    expect(root(card).querySelector('.month-container')!.getAttribute('aria-label')).toBe(
      'November 2026',
    );
  });

  it('opens a wide day’s panel with Enter, and with Space only as it comes up', async () => {
    const card = await mount();
    await focusOn(card, 'Tuesday, November 10');
    await press(card, 'Enter');
    const opened = () =>
      dialogs
        .filter(({ dialogTag }) => dialogTag === DAY_PANEL_TAG)
        .map(({ dialogParams }) => (dialogParams as DayPanelParams).title);
    expect(opened()).toEqual(['Tuesday, November 10, 2026']);

    panel!.closeDialog();
    await settle(card);
    vi.advanceTimersByTime(400);
    for (let frame = 0; frame < 3; frame += 1) {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersByTime(1);
      await settle(card);
    }
    expect(focusedDay()).toBe('Tuesday, November 10, 2026');

    // Space down on one cell and up on another opens nothing; down and up on one opens it.
    const first = cell(card, 'Thursday, November 12');
    const second = cell(card, 'Friday, November 13');
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, composed: true, cancelable: true }),
    );
    second.dispatchEvent(
      new KeyboardEvent('keyup', { key: ' ', bubbles: true, composed: true, cancelable: true }),
    );
    await settle(card);
    expect(opened()).toHaveLength(1);
    second.focus();
    await press(card, ' ');
    expect(opened()).toEqual(['Tuesday, November 10, 2026', 'Friday, November 13, 2026']);
  });

  it('selects a compact day with Enter or Space, and lists it', async () => {
    const card = await mount({}, 375);
    await focusOn(card, 'Wednesday, November 18');
    await press(card, 'ArrowLeft');
    await press(card, 'ArrowUp');
    // Moving selects nothing: the list still shows today.
    expect(text(root(card).querySelector('.month-day-list-name'))).toBe(
      'Wednesday, November 18, 2026',
    );
    await press(card, 'Enter');
    expect(text(root(card).querySelector('.month-day-list-name'))).toBe(
      'Tuesday, November 10, 2026',
    );
    expect(deepActive()?.getAttribute('aria-selected')).toBe('true');
    await press(card, 'ArrowRight');
    await press(card, 'ArrowRight');
    await press(card, ' ');
    expect(text(root(card).querySelector('.month-day-list-name'))).toBe(
      'Thursday, November 12, 2026',
    );
    expect(dialogs).toEqual([]);
  });

  it('leaves Home Assistant every key it does not use, and every key off the cells', async () => {
    const card = await mount();
    await focusOn(card, 'Wednesday, November 18');
    for (const [key, init] of [
      ['e', {}],
      ['ArrowDown', { altKey: true }],
      ['ArrowRight', { ctrlKey: true }],
      ['PageDown', { metaKey: true }],
      ['Tab', {}],
    ] as const) {
      const down = await press(card, key, init);
      expect([key, down.defaultPrevented]).toEqual([key, false]);
    }
    expect(focusedDay()).toBe('Wednesday, November 18, 2026');

    const toolbarButton = root(card).querySelector<HTMLElement>('.date-navigation-segment')!;
    const down = await press(card, 'ArrowDown', {}, toolbarButton);
    expect(down.defaultPrevented).toBe(false);
  });

  it('mirrors the arrows reading right to left', async () => {
    // happy-dom computes no direction from a dir attribute, so the card is told it the way a
    // browser would answer, for its own element alone.
    const realStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = realStyle(element, pseudo);
      return element.localName === 'ha-card'
        ? ({ ...style, direction: 'rtl' } as CSSStyleDeclaration)
        : style;
    });
    const card = await mount();
    await focusOn(card, 'Wednesday, November 18');
    await press(card, 'ArrowRight');
    expect(focusedDay()).toBe('Tuesday, November 17, 2026');
    await press(card, 'ArrowLeft');
    await press(card, 'ArrowLeft');
    expect(focusedDay()).toBe('Thursday, November 19, 2026');
    // Home and End are the week's start and end whichever side they are drawn on.
    await press(card, 'Home');
    expect(focusedDay()).toBe('Monday, November 16, 2026');
  });

  it('opens a wide day’s panel for assistive technology’s click, and not for a mouse’s', async () => {
    const card = await mount();
    const day = cell(card, 'Thursday, November 12');
    day.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
    await settle(card);
    expect(dialogs).toEqual([]);
    day.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 0 }));
    await settle(card);
    expect(dialogs.map(({ dialogTag }) => dialogTag)).toEqual([DAY_PANEL_TAG]);
  });
});

//-----------------------------------------------------------------------------
// A SEARCH PICK
//-----------------------------------------------------------------------------

describe('a search pick on a month', () => {
  /** What the search hands the card for a result: its day, and how to find it again. */
  function row(summary: string): Pick<Search.SearchRow, 'day' | 'target'> {
    const event = EVENTS.find((candidate) => candidate.summary === summary)!;
    const start = event.start.dateTime
      ? new Date(event.start.dateTime).toISOString()
      : event.start.date!;
    return {
      day: (event.start.dateTime ?? event.start.date!).slice(0, 10),
      target: { entityId: event.calendar, start, summary },
    };
  }

  async function pick(card: CardUnderTest, summary: string): Promise<void> {
    (card as unknown as Picking)._pickSearchResult(row(summary));
    await settle(card);
    await vi.advanceTimersByTimeAsync(0);
    await settle(card);
  }

  const ringed = (from: ParentNode) =>
    [...from.querySelectorAll('.search-ring')].map((element) => text(element));

  it('pages to the month, and rings the event where the weeks draw it', async () => {
    const card = await mount({ event_tap_action: { action: 'details' } });
    root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[2].click();
    await settle(card);
    await pick(card, 'Dentist');

    expect(heading(card)).toBe('November 2026');
    expect(ringed(root(card))).toEqual(['Dentist 14:00']);
    expect(root(card).querySelector('.month-line.search-ring')).not.toBeNull();
    // A target of its own, focus goes to it, and the day's cell is the tab stop after it.
    expect(deepActive()?.classList.contains('search-ring')).toBe(true);
    expect(tabStops(card)).toEqual(['Thursday, November 12, 2026, 2 events']);
    expect(dialogs).toEqual([]);

    vi.advanceTimersByTime(Constants.TIMING.SEARCH_RING);
    await settle(card);
    expect(ringed(root(card))).toEqual([]);
  });

  it('opens the day’s panel and rings the row there where "+N more" hides the event', async () => {
    const card = await mount({ event_tap_action: { action: 'details' } });
    await pick(card, 'Gym');

    expect(ringed(root(card))).toEqual([]);
    expect(
      dialogs.map(({ dialogTag, dialogParams }) => [
        dialogTag,
        (dialogParams as DayPanelParams).title,
      ]),
    ).toEqual([[DAY_PANEL_TAG, 'Tuesday, November 10, 2026']]);
    expect(ringed(panel!.shadowRoot!)).toEqual([expect.stringContaining('Gym')]);
    // Focus starts on the rung row, a button, rather than on Close.
    expect(deepActive()?.closest('.search-ring')).not.toBeNull();
    expect(deepActive()?.getAttribute('role')).toBe('button');

    vi.advanceTimersByTime(Constants.TIMING.SEARCH_RING);
    await settle(card);
    expect(ringed(panel!.shadowRoot!)).toEqual([]);
  });

  it('waits for the search panel to have gone before it opens the day’s', async () => {
    const card = await mount();
    const picking = card as unknown as Picking;
    picking._searchPanelGone = false;
    await pick(card, 'Gym');
    expect(dialogs).toEqual([]);

    picking._searchGone();
    for (let frame = 0; frame < 3; frame += 1) {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersByTime(1);
      await settle(card);
    }
    expect(dialogs.map(({ dialogTag }) => dialogTag)).toEqual([DAY_PANEL_TAG]);
    expect(ringed(panel!.shadowRoot!)).toEqual([expect.stringContaining('Gym')]);
  });

  it('selects a compact month’s day, and rings the event in its list', async () => {
    const card = await mount({ event_tap_action: { action: 'details' } }, 375);
    await pick(card, 'Football');
    expect(text(root(card).querySelector('.month-day-list-name'))).toBe(
      'Thursday, November 12, 2026',
    );
    expect(ringed(root(card))).toEqual([expect.stringContaining('Football')]);
    expect(root(card).querySelector('.month-day-list td.event.search-ring')).not.toBeNull();
    expect(deepActive()?.closest('.search-ring')).not.toBeNull();
    expect(dialogs).toEqual([]);
  });

  it('opens a compact day’s panel from its list’s "+N more" where the list hides the event', async () => {
    const card = await mount({ event_tap_action: { action: 'details' } }, 375);
    await pick(card, 'Gym');
    // The 10th's list keeps room for four: three rows and "+2 more", with Gym behind it.
    expect(text(root(card).querySelector('.month-day-list-name'))).toBe(
      'Tuesday, November 10, 2026',
    );
    expect(ringed(root(card))).toEqual([]);
    const more = root(card).querySelector<HTMLButtonElement>('.month-day-list-more')!;
    expect(text(more)).toBe('+2 more');
    expect(
      dialogs.map(({ dialogTag, dialogParams }) => [
        dialogTag,
        (dialogParams as DayPanelParams).title,
      ]),
    ).toEqual([[DAY_PANEL_TAG, 'Tuesday, November 10, 2026']]);
    expect(ringed(panel!.shadowRoot!)).toEqual([expect.stringContaining('Gym')]);
    expect(deepActive()?.closest('.search-ring')).not.toBeNull();

    // Closed, focus goes back to the "+N more" it opened from, a stop of its own.
    panel!.closeDialog();
    await settle(card);
    vi.advanceTimersByTime(400);
    for (let frame = 0; frame < 3; frame += 1) {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersByTime(1);
      await settle(card);
    }
    expect(deepActive()).toBe(more);
  });

  it('selects and rings on another month’s page', async () => {
    const card = await mount({}, 375);
    await pick(card, 'Concert');
    expect(heading(card)).toBe('December 2026');
    expect(text(root(card).querySelector('.month-day-list-name'))).toBe(
      'Wednesday, December 9, 2026',
    );
    expect(ringed(root(card))).toEqual([expect.stringContaining('Concert')]);
    expect(tabStops(card)).toEqual(['Wednesday, December 9, 2026, 1 event']);
  });
});

//-----------------------------------------------------------------------------
// THE BOUNDARY REPAINT
//-----------------------------------------------------------------------------

describe('a month at an event’s end, with no hass traffic', () => {
  /** Today's line for "Call", or null where none is drawn. */
  const call = (card: CardUnderTest) =>
    [...root(card).querySelectorAll<HTMLElement>('.month-line')].find((line) =>
      text(line).startsWith('Call'),
    ) ?? null;

  // Nothing below hands the card a `hass` after it is mounted: only time passes.
  it('dims the line once its event has ended', async () => {
    const card = await mount();
    expect(call(card)!.classList.contains('past-event')).toBe(false);

    await vi.advanceTimersByTimeAsync(21 * 60_000);
    await card.updateComplete;
    expect(call(card)!.classList.contains('past-event')).toBe(true);
  });

  it('drops it under show_past_events: false in the month block', async () => {
    const card = await mount({ month: { show_past_events: false } });
    expect(call(card)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(21 * 60_000);
    await card.updateComplete;
    expect(call(card)).toBeNull();
  });

  it('draws what ended while the tab was hidden as soon as it shows again', async () => {
    // Hidden for less than the five minutes after which coming back loads again, which would
    // draw anew by itself.
    vi.setSystemTime(new Date('2026-11-18T10:16:00Z'));
    const card = await mount();
    let visibility: DocumentVisibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(4.5 * 60_000);
    await card.updateComplete;
    // Hidden, nothing ran: the line is as it was drawn.
    expect(call(card)!.classList.contains('past-event')).toBe(false);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await card.updateComplete;
    expect(call(card)!.classList.contains('past-event')).toBe(true);
  });
});

//-----------------------------------------------------------------------------
// THE MEASURING PASSES
//-----------------------------------------------------------------------------

describe('the passes that measure titles, on a month', () => {
  /** Options that make List measure its titles: moving ones, ones beside the time, capped ones. */
  const MEASURED = { scroll_long_titles: true, time_position: 'title', title_max_lines: 2 };

  /** What the card's observers watch besides the card itself, by class. */
  const watched = (card: CardUnderTest) =>
    RecordingResizeObserver.observed
      .filter((element) => element !== card)
      .map((element) => element.className.toString().trim());

  it('find nothing to measure in a wide month’s weeks, so watch nothing there', async () => {
    const card = await mount(MEASURED);
    expect(root(card).querySelectorAll('.month-line').length).toBeGreaterThan(0);
    expect(root(card).querySelector('.event-title, .summary-row, .summary')).toBeNull();
    // Only the three probes the floors and the line capacity are read from, which the card
    // watches for a font loading (`_watchMonthProbes`), not any title pass.
    expect(watched(card)).toEqual(['month-probe', 'month-probe', 'month-probe']);
  });

  it('measure a compact month’s list as they measure List’s rows, and nothing in its weeks', async () => {
    const card = await mount(MEASURED, 375);
    // The wide form's probes aside, which the card watched while it drew that form before it
    // knew its width (`_watchMonthProbes`).
    const inWeeks = RecordingResizeObserver.observed.filter(
      (element) =>
        element.closest('.month-container') &&
        !element.classList.contains(MonthRender.MONTH_PROBE_CLASS),
    );
    expect(inWeeks).toEqual([]);
    const inList = RecordingResizeObserver.observed.filter((element) =>
      element.closest('.month-day-list'),
    );
    expect(inList.length).toBeGreaterThan(0);
    expect(watched(card).some((name) => name.split(' ').includes('event-title'))).toBe(true);
  });
});

//-----------------------------------------------------------------------------
// RIGHT TO LEFT
//-----------------------------------------------------------------------------

describe('a month read right to left', () => {
  // happy-dom lays nothing out, so this reads the stylesheet; the pictures are taken in a browser.
  const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, prelude, body]) => ({
    selector: prelude.replace(/\s+/g, ' ').trim(),
    declarations: body
      .split(';')
      .map((declaration) => declaration.replace(/\s+/g, ' ').trim())
      .filter((declaration) => declaration.includes(':')),
  }));

  it('mirrors by itself: no rule of a month names a physical side', () => {
    const physical =
      /^(left|right|float|clear|(margin|padding|border|inset)-(left|right)[\w-]*|border-(top|bottom)-(left|right)-radius)\s*:|:\s*(left|right)\b/;
    // The control: the card's other rules do name physical sides, so the pattern finds them.
    expect(
      RULES.some(({ declarations }) =>
        declarations.some((declaration) => physical.test(declaration)),
      ),
    ).toBe(true);
    const month = RULES.filter(({ selector }) => /\.month-/.test(selector));
    expect(month.length).toBeGreaterThan(40);
    expect(
      month.flatMap(({ selector, declarations }) =>
        declarations
          .filter((declaration) => physical.test(declaration))
          .map((d) => `${selector} { ${d} }`),
      ),
    ).toEqual([]);
  });

  it('points a bar’s marks the way its event carries on, as Grid’s banner, which it is', () => {
    const declared = (selector: string) =>
      RULES.filter((rule) => rule.selector === selector).flatMap((rule) => rule.declarations);
    // One rule for both: a bar carries the banner's class, so it needs none of its own.
    expect(declared('.month-bar:dir(rtl)')).toEqual([]);
    expect(declared('.grid-banner:dir(rtl)')).toEqual([
      "--calendar-card-banner-carry-before: '\\25B8\\00A0'",
      "--calendar-card-banner-carry-after: '\\00A0\\25C2'",
    ]);
    // Every mark the banner draws reads them, its own left-to-right glyph the fallback.
    const marks = RULES.flatMap(({ declarations }) =>
      declarations.filter((declaration) => /^content: .*25(C2|B8)/.test(declaration)),
    );
    expect(marks).toEqual([
      "content: var(--calendar-card-banner-carry-before, '\\25C2\\00A0')",
      ...Array.from(
        { length: 5 },
        () => "content: var(--calendar-card-banner-carry-after, '\\00A0\\25B8')",
      ),
    ]);
  });
});

describe('a day’s cell under what is drawn on it', () => {
  // A positioned box is painted, and hit, after every unpositioned sibling, so a positioned cell
  // took the presses meant for the all-day bars and the "+N more" drawn after it: measured in
  // Chromium with elementFromPoint, which happy-dom cannot answer, so the stylesheet is read.
  const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, prelude, body]) => ({
    selectors: prelude.split(',').map((selector) => selector.replace(/\s+/g, ' ').trim()),
    body,
  }));

  it('is never positioned, and rings its focus on itself', () => {
    const cellRules = rules.filter(({ selectors }) =>
      selectors.some((selector) => /\.month-day(?![\w-])/.test(selector)),
    );
    expect(cellRules.length).toBeGreaterThan(5);
    expect(
      cellRules
        .filter(({ body }) => /(^|;)\s*(position|z-index)\s*:/.test(body))
        .map(({ selectors }) => selectors.join(', ')),
    ).toEqual([]);
    const ring = rules.find(({ selectors }) => selectors.includes('.month-day:focus-visible'));
    expect(ring?.body.replace(/\s+/g, ' ').trim()).toBe(
      'outline: 2px solid var(--calendar-card-line-color-vertical); outline-offset: -2px;',
    );
  });
});
