/**
 * `days_to_show` per view, on the real card.
 *
 * The rules are pinned in `view-days-to-show.test.ts`; this file pins how the card joins
 * them: one load as long as the longest view the card can show, a view switch that draws a
 * different number of days without fetching, paging by the days on screen, the list fallback
 * drawing list's own count, `hide_when_empty` across every reachable view, and the add
 * button's suggested day.
 *
 * Every case gives the views *different* counts. With equal ones each assertion here would
 * pass against a card that ignored the per-view value entirely.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
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

/** Wednesday, June 17, 2026, mid-morning; the unit project runs on UTC. */
const NOW = new Date(2026, 5, 17, 10, 0);

/** `Intl`'s range separator: an en dash between thin spaces. */
const TO = '\u2009–\u2009';

/** List 14 days, Columns 5, Grid 7, from Monday June 15, with every toolbar control asked for. */
const BASE: Partial<Types.Config> = {
  entities: ['calendar.anna'],
  days_to_show: 14,
  start_date: 'start_of_week',
  first_day_of_week: 'monday',
  show_past_events: true,
  column: { days_to_show: 5 },
  time_grid: { days_to_show: 7, show_past_events: true },
  toolbar: { show: true, navigation: true, view_switcher: true, add_event: false },
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  hidden: boolean;
  events: Types.CalendarEventData[];
  readonly effectiveView: Types.EffectiveView;
  _columnCount: number;
  _midnightTimerId: number | null;
  _newEventDate(): Date;
  updateEvents(load?: string): Promise<void>;
  readonly updateComplete: Promise<boolean>;
}

/** Records what the card asks of `ResizeObserver`, and hands back its callback. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];

  readonly observed: Element[] = [];

  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(): void {}

  disconnect(): void {}
}

/** One event a day at 09:00, named for its day, on the days listed or every day by default. */
function eventsBetween(
  start: Date,
  end: Date,
  only?: ReadonlySet<string>,
): Types.CalendarEventData[] {
  const events: Types.CalendarEventData[] = [];
  for (let day = new Date(2026, 4, 1); day < new Date(2026, 7, 1);) {
    const key = day.toISOString().slice(0, 10);
    const at = new Date(`${key}T09:00:00.000Z`);
    if (at >= start && at < end && (!only || only.has(key))) {
      events.push({
        summary: `Event ${key}`,
        start: { dateTime: `${key}T09:00:00.000Z` },
        end: { dateTime: `${key}T09:30:00.000Z` },
      });
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  }
  return events;
}

const callApi = vi.fn();

/** Answer every request from the fixture, at once. */
function answerFromFixture(only?: ReadonlySet<string>): void {
  callApi.mockImplementation(async (_method: string, path: string) => {
    const query = new URLSearchParams(path.split('?')[1]);
    return eventsBetween(new Date(query.get('start')!), new Date(query.get('end')!), only);
  });
}

/**
 * Every window the card has asked Home Assistant for, as first and last local day. The end
 * it sends is exclusive, so the last day is the one before it.
 */
function fetchedWindows(): Array<[string, string]> {
  return callApi.mock.calls.map((call) => {
    const query = new URLSearchParams(String(call[1]).split('?')[1]);
    const lastDay = new Date(Date.parse(query.get('end')!) - 1);
    return [query.get('start')!.slice(0, 10), lastDay.toISOString().slice(0, 10)];
  });
}

/** The window the card asked for last. */
function lastFetchedWindow(): [string, string] {
  const windows = fetchedWindows();
  return windows[windows.length - 1];
}

function hass(): Record<string, unknown> {
  return {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { supported_features: 7 },
      },
    },
    locale: { language: 'en' },
    callApi,
    localize: (key: string) => key,
  };
}

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(overrides: Partial<Types.Config> = {}): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig({ ...BASE, ...overrides }));
  card.hass = hass();
  document.body.appendChild(card);
  await settle(card);
  return card;
}

/** Deliver a width the way the browser does, and let the settle delay run out. */
async function measure(card: CardUnderTest, width: number): Promise<void> {
  const observer = RecordingResizeObserver.instances.find(({ observed }) =>
    observed.includes(card),
  );
  if (!observer) throw new Error('the card never asked to be observed');
  observer.callback([{ contentRect: { width } }]);
  vi.advanceTimersByTime(Constants.TIMING.WIDTH_SETTLE_DELAY);
  await settle(card);
}

const root = (card: CardUnderTest): ShadowRoot => card.shadowRoot!;

async function pick(card: CardUnderTest, view: Types.EffectiveView): Promise<void> {
  root(card)
    .querySelector<HTMLButtonElement>(`.view-switcher-segment[data-view="${view}"]`)!
    .click();
  await settle(card);
}

async function next(card: CardUnderTest): Promise<void> {
  root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[2].click();
  await settle(card);
}

function range(card: CardUnderTest): string {
  return root(card).querySelector('.toolbar-range-text')!.textContent!.trim();
}

/** How many days the view on screen draws, read off its own DOM. */
function drawnDays(card: CardUnderTest): number {
  const selector = {
    list: '.day-table',
    column: '.day-column',
    grid: '.grid-day-header .day',
  }[card.effectiveView];
  return root(card).querySelectorAll(selector).length;
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  callApi.mockReset();
  answerFromFixture();
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.useRealTimers();
  localStorage.clear();
});

describe('days_to_show per view', () => {
  it('loads the longest view once, and switching draws each count without fetching', async () => {
    const card = await mount();
    await measure(card, 1400);

    // Fourteen days from Monday the 15th, and not one more.
    expect(fetchedWindows()).toEqual([['2026-06-15', '2026-06-28']]);
    expect(card.effectiveView).toBe('list');
    expect(drawnDays(card)).toBe(14);
    expect(range(card)).toBe(`Jun 15${TO}28`);

    await pick(card, 'grid');
    expect(card.effectiveView).toBe('grid');
    expect(drawnDays(card)).toBe(7);
    expect(range(card)).toBe(`Jun 15${TO}21`);

    await pick(card, 'column');
    expect(card.effectiveView).toBe('column');
    expect(drawnDays(card)).toBe(5);
    expect(range(card)).toBe(`Jun 15${TO}19`);

    await pick(card, 'list');
    expect(drawnDays(card)).toBe(14);
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('loads a view longer than the card-wide count, so switching to it fetches nothing', async () => {
    const card = await mount({ time_grid: { days_to_show: 21, show_past_events: true } });
    await measure(card, 2400);

    expect(fetchedWindows()).toEqual([['2026-06-15', '2026-07-05']]);
    expect(drawnDays(card)).toBe(14);

    await pick(card, 'grid');
    expect(drawnDays(card)).toBe(21);
    expect(range(card)).toBe(`Jun 15${TO}Jul 5`);
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('pages by the days on screen, and a switch keeps the first day without fetching', async () => {
    const card = await mount();
    await measure(card, 1400);
    await pick(card, 'grid');

    await next(card);
    expect(range(card)).toBe(`Jun 22${TO}28`);
    // The page is loaded as long as the longest view, from its own first day.
    expect(fetchedWindows()[1]).toEqual(['2026-06-22', '2026-07-05']);
    const fetches = callApi.mock.calls.length;

    await pick(card, 'list');
    expect(range(card)).toBe(`Jun 22${TO}Jul 5`);
    expect(drawnDays(card)).toBe(14);
    expect(callApi.mock.calls.length).toBe(fetches);

    await next(card);
    expect(range(card)).toBe(`Jul 6${TO}19`);
  });

  it('loads only the configured view when nothing can switch it', async () => {
    // List-only, so the grid's thirty days can never be drawn and must not be loaded.
    await mount({
      view: 'list',
      time_grid: { days_to_show: 30 },
      toolbar: { show: true, navigation: false, view_switcher: false, add_event: false },
    });

    expect(fetchedWindows()).toEqual([['2026-06-15', '2026-06-28']]);
  });

  it('draws list’s own count when a narrow column card falls back to the list', async () => {
    const card = await mount({
      view: 'column',
      toolbar: { show: true, navigation: true, view_switcher: false, add_event: false },
    });
    await measure(card, 1400);
    expect(card.effectiveView).toBe('column');
    expect(drawnDays(card)).toBe(5);

    await measure(card, 300);
    expect(card.effectiveView).toBe('list');
    expect(drawnDays(card)).toBe(14);
    expect(range(card)).toBe(`Jun 15${TO}28`);
    // The fallback was loaded for from the start, because it can be drawn.
    expect(fetchedWindows()).toEqual([['2026-06-15', '2026-06-28']]);
  });

  it('holds no midnight timer for a grid drawing every one of its own days', async () => {
    // Seven columns fit at this width. Measured against the card-wide fourteen, the grid
    // would read as shedding and arm a timer for a window that never moves.
    const card = await mount({ view: 'grid' });
    await measure(card, 1400);

    expect(card._columnCount).toBe(7);
    expect(card._midnightTimerId).toBeNull();
  });

  it('suggests a day the view on screen shows', async () => {
    // Ten days back: the list's fourteen reach today, the grid's seven end on the 13th.
    const card = await mount({ start_date: 'today-10' });
    await measure(card, 1400);
    // Now itself, which `measure` has moved past `NOW` by the width settle delay.
    expect(card._newEventDate().getTime()).toBe(Date.now());

    await pick(card, 'grid');
    expect(card._newEventDate().getTime()).toBe(new Date(2026, 5, 7).getTime());
  });
});

describe('hide_when_empty across the views a card can show', () => {
  /** One event, on the 24th: inside the list's fourteen days, past the grid's seven. */
  const ONLY_THE_24TH = new Set(['2026-06-24']);

  it('keeps a card whose view on screen is empty while another view has an event', async () => {
    answerFromFixture(ONLY_THE_24TH);
    const card = await mount({ view: 'grid', hide_when_empty: true });
    await measure(card, 1400);

    expect(card.effectiveView).toBe('grid');
    expect(root(card).querySelectorAll('.grid-event')).toHaveLength(0);
    expect(card.hidden).toBe(false);
  });

  it('hides it when the view holding the event cannot be shown', async () => {
    // The event is loaded and the list would draw it, but the list is unreachable: no
    // switcher, and a grid that cramps rather than falling back. Monday's 09:00 has ended by
    // Wednesday 10:00, which this grid hides and the list shows, so only a check that
    // looks at views the card cannot show would keep the card.
    answerFromFixture(new Set(['2026-06-15']));
    const card = await mount({
      view: 'grid',
      hide_when_empty: true,
      show_past_events: true,
      time_grid: { days_to_show: 7, min_days_fallback: 'cramp', show_past_events: false },
      toolbar: { show: true, navigation: false, view_switcher: false, add_event: false },
    });
    await measure(card, 1400);

    expect(card.events.map((event) => event.summary)).toEqual(['Event 2026-06-15']);
    expect(card.hidden).toBe(true);
  });

  it('keeps it when that view can be shown after all', async () => {
    // The control for the case above: the same card with the switcher, which makes the list
    // reachable, and the list draws Monday's event.
    answerFromFixture(new Set(['2026-06-15']));
    const card = await mount({
      view: 'grid',
      hide_when_empty: true,
      show_past_events: true,
      time_grid: { days_to_show: 7, min_days_fallback: 'cramp', show_past_events: false },
    });
    await measure(card, 1400);

    expect(card.hidden).toBe(false);
  });

  it('hides it when no view has anything', async () => {
    answerFromFixture(new Set());
    const card = await mount({ view: 'grid', hide_when_empty: true });

    expect(card.hidden).toBe(true);
  });
});

describe('a per-view count fetches only when it moves the load', () => {
  function reconfigure(card: CardUnderTest, overrides: Partial<Types.Config>): string[] {
    const loads: string[] = [];
    const original = card.updateEvents.bind(card);
    vi.spyOn(card, 'updateEvents').mockImplementation((load?: string) => {
      loads.push(load ?? '');
      return original(load);
    });
    card.setConfig(buildConfig({ ...BASE, ...overrides }));
    return loads;
  }

  it('redraws without a request when a shorter view changes', async () => {
    const card = await mount();
    await measure(card, 1400);
    expect(reconfigure(card, { time_grid: { days_to_show: 3, show_past_events: true } })).toEqual(
      [],
    );
    await settle(card);

    await pick(card, 'grid');
    expect(drawnDays(card)).toBe(3);
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('fetches when the longest view changes', async () => {
    const card = await mount();
    expect(reconfigure(card, { days_to_show: 21 })).toEqual(['network']);
    await settle(card);
    expect(lastFetchedWindow()).toEqual(['2026-06-15', '2026-07-05']);
  });

  it('fetches when a view grows past the others', async () => {
    const card = await mount();
    expect(reconfigure(card, { column: { days_to_show: 21 } })).toEqual(['network']);
    await settle(card);
    expect(lastFetchedWindow()).toEqual(['2026-06-15', '2026-07-05']);
  });

  it('fetches when turning the switcher off drops the longest view from reach', async () => {
    const card = await mount({
      view: 'grid',
      time_grid: { days_to_show: 7, min_days_fallback: 'cramp' },
    });
    expect(
      reconfigure(card, {
        view: 'grid',
        time_grid: { days_to_show: 7, min_days_fallback: 'cramp' },
        toolbar: { show: true, navigation: true, view_switcher: false, add_event: false },
      }),
    ).toEqual(['network']);
  });
});
