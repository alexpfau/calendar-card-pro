/**
 * A month's weeks scrolled by the wheel and by a finger (`month → week_scroll`).
 *
 * Off by default, and only on a wide month on a card at least `week_scroll_min_width` wide: only
 * then does the card take the wheel and a vertical finger from the page, and only the gestures it
 * uses. A notch of a wheel, or a trackpad's 100px, steps a week; a finger steps one once it has
 * gone `SWIPE_MIN_DISTANCE` and another every row's height. The header follows the majority of the
 * days shown, the arrows step from its month, and Home brings the month back. Pages scrolled to
 * load in month-sized pieces, so a scroll through a month's weeks asks once, not once a week.
 *
 * Wednesday, November 18, 2026, 10:00 UTC; Mondays first, so home's six weeks run from Monday,
 * October 26 to Sunday, December 6. Names are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { cardStyles } from '../src/rendering/styles';
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

const NOW = new Date('2026-11-18T10:00:00Z');
const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  requestUpdate(): void;
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

/** Every window a calendar was asked for, `start..end` as sent. */
let requests: string[] = [];

function hass(): Types.Hass {
  const state = (id: string, name: string) => ({
    entity_id: id,
    state: 'off',
    attributes: { friendly_name: name },
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
      const params = new URLSearchParams(path.split('?')[1]);
      requests.push(`${path.split('?')[0]} ${params.get('start')}..${params.get('end')}`);
      return Promise.resolve([]);
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

const BASE = {
  view: 'month',
  entities: [ANNA, BEN],
  first_day_of_week: 'monday',
  toolbar: { show: true, navigation: true },
  month: { week_scroll: true },
};

async function settle(card: CardUnderTest): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
}

async function mount(config: Record<string, unknown> = {}, width = 900): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ ...BASE, ...config });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  await setWidth(card, width);
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
const weeks = (card: CardUnderTest) => root(card).querySelector<HTMLElement>('.month-container')!;
const heading = (card: CardUnderTest) =>
  (root(card).querySelector('.toolbar-month-text')?.textContent ?? '').trim();

/** The first day the rows show, as its cell names it. */
const firstDay = (card: CardUnderTest) =>
  root(card)
    .querySelector('.month-container [role="gridcell"]')!
    .getAttribute('aria-label')!
    .split(', ')
    .slice(0, 3)
    .join(', ');

/** Turns the wheel over the weeks, and says whether the card kept it from the page. */
async function wheel(card: CardUnderTest, init: WheelEventInit): Promise<boolean> {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  // happy-dom's wheel event drops the modifier keys it is given.
  if (init.ctrlKey) Object.defineProperty(event, 'ctrlKey', { value: true });
  root(card).querySelector('.month-container [role="gridcell"]')!.dispatchEvent(event);
  await settle(card);
  return event.defaultPrevented;
}

function pointer(target: Element, type: string, x: number, y: number, pointerType = 'touch') {
  target.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true, composed: true }), {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType,
      clientX: x,
      clientY: y,
    }),
  );
}

/** A finger down on the weeks, moved through each point in turn, and lifted at the last. */
async function drag(card: CardUnderTest, points: Array<[number, number]>, pointerType = 'touch') {
  const target = root(card).querySelectorAll('.month-container [role="gridcell"]')[10];
  pointer(target, 'pointerdown', 200, 300, pointerType);
  const firsts: string[] = [];
  for (const [dx, dy] of points) {
    pointer(target, 'pointermove', 200 + dx, 300 + dy, pointerType);
    await settle(card);
    firsts.push(firstDay(card));
  }
  const [dx, dy] = points[points.length - 1];
  pointer(target, 'pointerup', 200 + dx, 300 + dy, pointerType);
  await settle(card);
  return firsts;
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('innerWidth', 1024);
  EventUtils.clearPageStore();
  requests = [];
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.replaceChildren();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the wheel on a month’s weeks', () => {
  it('steps a week a notch, the header following the month most of the days are in', async () => {
    const card = await mount();
    const seen: string[][] = [[firstDay(card), heading(card)]];
    for (let notch = 0; notch < 3; notch += 1) {
      expect(await wheel(card, { deltaY: 100 })).toBe(true);
      seen.push([firstDay(card), heading(card)]);
    }
    expect(seen).toEqual([
      ['Monday, October 26, 2026', 'November 2026'],
      ['Monday, November 2, 2026', 'November 2026'],
      // November 9 to December 20: 22 days of November, 20 of December.
      ['Monday, November 9, 2026', 'November 2026'],
      ['Monday, November 16, 2026', 'December 2026'],
    ]);
    expect(await wheel(card, { deltaY: -100 })).toBe(true);
    expect(firstDay(card)).toBe('Monday, November 9, 2026');
  });

  it('adds a trackpad’s small steps up to a week, and lets go of what it rests short of', async () => {
    const card = await mount();
    await wheel(card, { deltaY: 40 });
    await wheel(card, { deltaY: 40 });
    expect(firstDay(card)).toBe('Monday, October 26, 2026');
    await wheel(card, { deltaY: 40 });
    expect(firstDay(card)).toBe('Monday, November 2, 2026');

    // 40 left over, let go after a rest: 60 more is not a week.
    vi.advanceTimersByTime(Constants.TIMING.WEEK_SCROLL_WHEEL_RESET + 1);
    await wheel(card, { deltaY: 60 });
    expect(firstDay(card)).toBe('Monday, November 2, 2026');
    // Turning back lets go too.
    await wheel(card, { deltaY: -60 });
    await wheel(card, { deltaY: -40 });
    expect(firstDay(card)).toBe('Monday, October 26, 2026');
  });

  it('counts a wheel that reports lines, three to a notch, as a week a notch', async () => {
    const card = await mount();
    await wheel(card, { deltaY: 3, deltaMode: 1 });
    expect(firstDay(card)).toBe('Monday, November 2, 2026');
    vi.advanceTimersByTime(Constants.TIMING.WEEK_SCROLL_WHEEL_RESET + 1);
    await wheel(card, { deltaY: 3, deltaMode: 1 });
    expect(firstDay(card)).toBe('Monday, November 9, 2026');
  });

  it('leaves the page a sideways wheel and a pinch', async () => {
    const card = await mount();
    expect(await wheel(card, { deltaX: 120, deltaY: 30 })).toBe(false);
    expect(await wheel(card, { deltaY: 100, ctrlKey: true })).toBe(false);
    expect(firstDay(card)).toBe('Monday, October 26, 2026');
  });

  it('steps the arrows from the header’s month after a scroll, and Home brings the month back', async () => {
    const card = await mount();
    for (let notch = 0; notch < 3; notch += 1) await wheel(card, { deltaY: 100 });
    expect(heading(card)).toBe('December 2026');
    const [previous, home, next] = root(card).querySelectorAll<HTMLButtonElement>(
      '.date-navigation-segment',
    );
    next.click();
    await settle(card);
    expect([firstDay(card), heading(card)]).toEqual(['Monday, December 28, 2026', 'January 2027']);
    previous.click();
    await settle(card);
    expect([firstDay(card), heading(card)]).toEqual(['Monday, November 30, 2026', 'December 2026']);
    home.click();
    await settle(card);
    expect([firstDay(card), heading(card)]).toEqual(['Monday, October 26, 2026', 'November 2026']);
  });

  it('asks once for each month a scroll passes through, not once a week', async () => {
    const card = await mount();
    const atHome = requests.length;
    expect(atHome).toBe(2);
    // Four weeks on, every row still November's: one load for the four.
    for (let notch = 0; notch < 4; notch += 1) await wheel(card, { deltaY: 100 });
    expect(firstDay(card)).toBe('Monday, November 23, 2026');
    expect(requests.slice(atHome)).toEqual([
      `calendars/${ANNA} 2026-10-26T00:00:00.000Z..2027-01-04T00:00:00.000Z`,
      `calendars/${BEN} 2026-10-26T00:00:00.000Z..2027-01-04T00:00:00.000Z`,
    ]);
    // November 30's row ends in December: December's piece.
    await wheel(card, { deltaY: 100 });
    expect(requests.slice(atHome + 2)).toEqual([
      `calendars/${ANNA} 2026-11-30T00:00:00.000Z..2027-02-01T00:00:00.000Z`,
      `calendars/${BEN} 2026-11-30T00:00:00.000Z..2027-02-01T00:00:00.000Z`,
    ]);
    // Back up through November: already loaded.
    for (let notch = 0; notch < 4; notch += 1) await wheel(card, { deltaY: -100 });
    expect(firstDay(card)).toBe('Monday, November 2, 2026');
    expect(requests).toHaveLength(atHome + 4);
  });
});

describe('a finger on a month’s weeks', () => {
  it('steps a week once it has moved far enough, and another for each row after', async () => {
    const card = await mount();
    const pitch = Constants.UI.WEEK_SCROLL_TOUCH_STEP;
    const min = Constants.UI.SWIPE_MIN_DISTANCE;
    expect(
      await drag(card, [
        [0, -(min - 1)],
        [0, -min],
        [0, -(min + pitch - 1)],
        [0, -(min + pitch)],
        [0, -10],
      ]),
    ).toEqual([
      'Monday, October 26, 2026',
      'Monday, November 2, 2026',
      'Monday, November 2, 2026',
      'Monday, November 9, 2026',
      'Monday, October 26, 2026',
    ]);
    // Down steps back.
    expect(await drag(card, [[5, min + 2]])).toEqual(['Monday, October 19, 2026']);
  });

  it('still pages a month with a sideways swipe', async () => {
    const card = await mount();
    await drag(card, [[-120, 10]]);
    expect([firstDay(card), heading(card)]).toEqual(['Monday, November 30, 2026', 'December 2026']);
  });

  it('runs no tap where it stepped', async () => {
    const card = await mount({ day_tap_action: { action: 'add-event' } });
    const dialogs: string[] = [];
    const record = (event: Event) => dialogs.push((event as CustomEvent).detail.dialogTag);
    document.addEventListener('show-dialog', record);
    await drag(card, [[0, -80]]);
    document.removeEventListener('show-dialog', record);
    expect(dialogs).toEqual([]);
    expect(firstDay(card)).toBe('Monday, November 2, 2026');
  });

  it('leaves a mouse to the wheel', async () => {
    const card = await mount();
    await drag(card, [[0, -200]], 'mouse');
    expect(firstDay(card)).toBe('Monday, October 26, 2026');
  });
});

describe('where the weeks do not scroll', () => {
  /** Whether the weeks take a wheel and a finger now: the class, and a wheel kept from the page. */
  async function scrolls(card: CardUnderTest): Promise<[boolean, boolean]> {
    const before = firstDay(card);
    const taken = await wheel(card, { deltaY: 100 });
    const moved = firstDay(card) !== before;
    if (moved) await wheel(card, { deltaY: -100 });
    return [weeks(card).classList.contains('week-scroll'), taken || moved];
  }

  it('is off unless the month block turns it on', async () => {
    expect(await scrolls(await mount({ month: {} }))).toEqual([false, false]);
    expect(await scrolls(await mount())).toEqual([true, true]);
  });

  it('never applies to the compact form, to the wheel or to a finger', async () => {
    const card = await mount({}, 375);
    expect(weeks(card).classList.contains('month-compact')).toBe(true);
    expect(await scrolls(card)).toEqual([false, false]);
    const before = root(card).querySelector('.month-day-list-name')!.textContent;
    const target = root(card).querySelectorAll('.month-container [role="gridcell"]')[10];
    pointer(target, 'pointerdown', 200, 300);
    pointer(target, 'pointermove', 200, 100);
    pointer(target, 'pointerup', 200, 100);
    await settle(card);
    expect(firstDay(card)).toBe('Monday, October 26, 2026');
    expect(root(card).querySelector('.month-day-list-name')!.textContent).toBe(before);
  });

  it('waits for week_scroll_min_width, and stops below it', async () => {
    const card = await mount({ month: { week_scroll: true, week_scroll_min_width: 1000 } }, 900);
    expect(await scrolls(card)).toEqual([false, false]);
    await setWidth(card, 1000);
    expect(await scrolls(card)).toEqual([true, true]);
    await setWidth(card, 999);
    expect(await scrolls(card)).toEqual([false, false]);
  });

  it('leaves a card Home Assistant is editing alone', async () => {
    const card = await mount();
    (card as unknown as { editMode: boolean }).editMode = true;
    await settle(card);
    expect(await scrolls(card)).toEqual([false, false]);
  });

  it('stands down while the card is too short for its weeks, whose scroll the wheel needs', async () => {
    const card = await mount();
    expect(await scrolls(card)).toEqual([true, true]);
    // The content area holding more than it shows, as below the month's floors: by more than a
    // pixel, which fractional layout forgives.
    const content = root(card).querySelector<HTMLElement>('.content-container')!;
    const contentHeight = (scroll: number) => {
      Object.defineProperty(content, 'clientHeight', { configurable: true, value: 150 });
      Object.defineProperty(content, 'scrollHeight', { configurable: true, value: scroll });
    };
    for (const [scroll, applies] of [
      [293, false],
      [151, true],
      [152, false],
      [150, true],
    ] as const) {
      contentHeight(scroll);
      card.requestUpdate();
      await settle(card);
      expect(await scrolls(card)).toEqual([applies, applies]);
    }
  });
});

describe('what the weeks declare to the browser while they scroll', () => {
  const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(
      ([, prelude, body]) => body.includes('touch-action') && prelude.includes('.week-scroll'),
    )
    .map(([, prelude, body]) => ({
      selectors: prelude.split(',').map((selector) => selector.replace(/\s+/g, ' ').trim()),
      declarations: body
        .split(';')
        .map((declaration) => declaration.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    }));

  it('claims the vertical pan as well only with the class, and keeps pinch zoom', () => {
    expect(rules).toEqual([
      {
        selectors: ['.month-container.week-scroll', '.month-container.week-scroll *'],
        declarations: ['touch-action: pan-x', 'touch-action: pan-x pinch-zoom'],
      },
      {
        // Over a swipe's own `pan-y`, which these outrank.
        selectors: [
          'ha-card.swipe-paging .content-container .month-container.week-scroll',
          'ha-card.swipe-paging .content-container .month-container.week-scroll *',
        ],
        declarations: ['touch-action: none', 'touch-action: pinch-zoom'],
      },
    ]);
  });
});

describe('a month-sized piece', () => {
  it('holds every row whose last day falls in one month, and the five under the last', () => {
    // November 2026, Mondays first: rows from October 26 to November 23, then five more.
    const piece = (day: number) => {
      const { start, end } = ViewConfig.monthScrollPiece(new Date(2026, 10, day), 1);
      return [start.toDateString(), end.toDateString()];
    };
    const november = ['Mon Oct 26 2026', 'Mon Jan 04 2027'];
    expect([26, 27, 28, 29, 30].map((day) => piece(day - 31))).toEqual(
      [26, 27, 28, 29, 30].map(() => november),
    );
    expect([2, 9, 16, 23, 29].map(piece)).toEqual([2, 9, 16, 23, 29].map(() => november));
    expect(piece(30)).toEqual(['Mon Nov 30 2026', 'Mon Feb 01 2027']);
  });

  it('is what a page loads while week_scroll is on, whatever row the page starts on', () => {
    const config = (start: string, extra: Partial<Types.Config> = {}) =>
      ViewConfig.loadConfig(
        buildConfig({
          view: 'month',
          start_date: start,
          show_past_events: true,
          month: { week_scroll: true },
          // Every view reachable, as a toolbar's switcher makes them.
          toolbar: { show: true },
          ...extra,
        }),
        1,
        false,
        NOW,
      );
    const window = (start: string, extra?: Partial<Types.Config>) => {
      const load = config(start, extra);
      return [load.start_date, load.days_to_show];
    };
    for (const page of ['2026-10-26', '2026-11-02', '2026-11-16', '2026-11-23', '2026-11-25']) {
      expect([page, ...window(page)]).toEqual([page, '2026-10-26', 70]);
    }
    expect(window('2026-11-30')).toEqual(['2026-11-30', 63]);
    // Another view's longer days from any of those rows are in the piece too.
    for (const page of ['2026-10-26', '2026-11-23', '2026-11-29']) {
      expect(window(page, { days_to_show: 60 })).toEqual(['2026-10-26', 94]);
    }
    // Without week_scroll a page loads its own six weeks.
    expect(window('2026-11-16', { month: {} })).toEqual(['2026-11-16', 42]);
  });
});
