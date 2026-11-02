/**
 * Swiping across the card's days pages it, as the date navigation's arrows do.
 *
 * A swipe is a third way for the card's one pointer gesture to end, beside a tap and a hold, so
 * this file pins how the recognizer tells them apart on the real card: which pointers may swipe,
 * how far and how straight a swipe has to go, which way it pages in either reading direction,
 * that taps and holds and the events' own taps are what they were, and where swiping is not
 * offered at all. It also pins the two pieces of motion, the days following the finger and the
 * new page sliding in, which happy-dom cannot lay out or animate: the offset written and the
 * animations asked for are what is read. The browser's side of it, `touch-action` deciding which
 * finger movements reach the card at all, is pinned as the declaration it is; what a browser does
 * with it needs a real touch screen.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
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

/** Wednesday, June 17, 2026, mid-morning; the unit project runs on UTC. */
const NOW = new Date(2026, 5, 17, 10, 0);

/** `Intl`'s range separator: an en dash between thin spaces. */
const TO = '\u2009–\u2009';

const HOME = `Jun 15${TO}21`;
const NEXT = `Jun 22${TO}28`;
const PREVIOUS = `Jun 8${TO}14`;

/** The date navigation and nothing else. */
const NAVIGATION_ONLY: Types.ToolbarConfig = {
  show: true,
  navigation: true,
  view_switcher: false,
  add_event: false,
  reset: false,
  refresh: false,
  legend: false,
};

/** Home is the week of June 15, Monday to Sunday. */
const BASE: Partial<Types.Config> = {
  entities: ['calendar.anna'],
  days_to_show: 7,
  start_date: 'start_of_week',
  first_day_of_week: 'monday',
  toolbar: NAVIGATION_ONLY,
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  preview: boolean;
  editMode: boolean;
  requestUpdate(): void;
  readonly updateComplete: Promise<boolean>;
}

/** The card's private gesture state, read where the outcome leaves nothing on screen. */
interface GestureInternals {
  _activePointerId: number | null;
  _pageShown: string | null;
  _runEventTapAction: (target: unknown) => void;
}

/** One event a day at 09:00, named for its day, from May through July. */
function eventsBetween(start: Date, end: Date): Types.CalendarEventData[] {
  const events: Types.CalendarEventData[] = [];
  for (let day = new Date(2026, 4, 1); day < new Date(2026, 7, 1);) {
    const key = day.toISOString().slice(0, 10);
    const at = new Date(`${key}T09:00:00.000Z`);
    if (at >= start && at < end) {
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

/** Answers a case is holding back, released after every case whatever its outcome. */
let held: Array<() => void> = [];

function answerFromFixture(): void {
  callApi.mockImplementation(async (_method: string, path: string) => {
    const query = new URLSearchParams(path.split('?')[1]);
    return eventsBetween(new Date(query.get('start')!), new Date(query.get('end')!));
  });
}

/** Hold every answer back until the returned release is called. */
function holdAnswers(): () => void {
  let releases: Array<() => void> = [];
  callApi.mockImplementation(
    (_method: string, path: string) =>
      new Promise((resolve) => {
        const query = new URLSearchParams(path.split('?')[1]);
        const release = () =>
          resolve(eventsBetween(new Date(query.get('start')!), new Date(query.get('end')!)));
        releases.push(release);
        held.push(release);
      }),
  );
  return () => {
    const pending = releases;
    releases = [];
    pending.forEach((release) => release());
  };
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
    localize: (key: string) =>
      ({ 'ui.common.previous': 'Previous', 'ui.common.next': 'Next' })[key] ?? key,
  };
}

/** Let every pending fetch and render run. */
async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(
  overrides: Partial<Types.Config> = {},
  flag?: 'preview' | 'editMode',
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig({ ...BASE, ...overrides }));
  if (flag) card[flag] = true;
  card.hass = hass();
  document.body.appendChild(card);
  await settle(card);
  return card;
}

const root = (card: CardUnderTest): ShadowRoot => card.shadowRoot!;
const haCard = (card: CardUnderTest): HTMLElement => root(card).querySelector('ha-card')!;
const content = (card: CardUnderTest): HTMLElement =>
  root(card).querySelector<HTMLElement>('.content-container')!;
const internals = (card: CardUnderTest): GestureInternals => card as unknown as GestureInternals;

/** The exact dates on screen, as the hidden live region holds them. */
function range(card: CardUnderTest): string {
  return root(card).querySelector('.toolbar-range-text')!.textContent!.trim();
}

type PointerKind = 'touch' | 'pen' | 'mouse';

/** One pointer event, bubbling from `target` the way a browser delivers it. */
function pointer(
  target: Element,
  type: string,
  x: number,
  y: number,
  options: { kind?: PointerKind; id?: number; primary?: boolean } = {},
): void {
  const ev = new Event(type, { bubbles: true, composed: true });
  target.dispatchEvent(
    Object.assign(ev, {
      pointerId: options.id ?? 1,
      pointerType: options.kind ?? 'touch',
      button: 0,
      isPrimary: options.primary ?? true,
      clientX: x,
      clientY: y,
    }),
  );
}

/**
 * A finger going down at `from`, moving to `to` in a few steps, and lifting there. Returns
 * nothing: what it did is read from the card.
 */
function swipe(
  target: Element,
  from: [number, number],
  to: [number, number],
  options: { kind?: PointerKind; lift?: 'pointerup' | 'pointercancel' } = {},
): void {
  pointer(target, 'pointerdown', from[0], from[1], options);
  for (const step of [0.25, 0.5, 0.75, 1]) {
    pointer(
      target,
      'pointermove',
      from[0] + (to[0] - from[0]) * step,
      from[1] + (to[1] - from[1]) * step,
      options,
    );
  }
  pointer(target, options.lift ?? 'pointerup', to[0], to[1], options);
}

/** A swipe to the left across the middle of the days: forward, reading left to right. */
const LEFT: [[number, number], [number, number]] = [
  [600, 300],
  [480, 310],
];
/** A swipe to the right: back, reading left to right. */
const RIGHT: [[number, number], [number, number]] = [
  [480, 300],
  [600, 310],
];

/** Every `hass-action` the card dispatched, by the gesture that asked for it. */
let hassActions: string[] = [];
const recordHassAction = (ev: Event) =>
  hassActions.push((ev as unknown as { detail: { action: string } }).detail.action);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  callApi.mockReset();
  answerFromFixture();
  document.body.innerHTML = '';
  localStorage.clear();
  EventUtils.clearPageStore();
  hassActions = [];
  document.addEventListener('hass-action', recordHassAction);
});

afterEach(async () => {
  held.forEach((release) => release());
  held = [];
  await new Promise((resolve) => setImmediate(resolve));
  document.removeEventListener('hass-action', recordHassAction);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('a swipe across the days', () => {
  it('pages forward when the finger moves left and back when it moves right', async () => {
    const card = await mount();
    expect(range(card)).toBe(HOME);

    swipe(content(card), ...LEFT);
    await settle(card);
    expect(range(card)).toBe(NEXT);

    swipe(content(card), ...RIGHT);
    await settle(card);
    expect(range(card)).toBe(HOME);

    swipe(content(card), ...RIGHT);
    await settle(card);
    expect(range(card)).toBe(PREVIOUS);
  });

  it('pages with a pen as with a finger, and never with a mouse', async () => {
    const card = await mount();

    swipe(content(card), ...LEFT, { kind: 'mouse' });
    await settle(card);
    expect(range(card)).toBe(HOME);

    swipe(content(card), ...LEFT, { kind: 'pen' });
    await settle(card);
    expect(range(card)).toBe(NEXT);
  });

  it('pages from the title too, the one part of the header that is the card', async () => {
    const card = await mount({ title: 'Family' });
    swipe(root(card).querySelector('.card-header')!, ...LEFT);
    await settle(card);
    expect(range(card)).toBe(NEXT);
  });

  it('pages nothing from a press on the toolbar, which keeps its presses from the card', async () => {
    const card = await mount();
    swipe(root(card).querySelector('.toolbar-month-text')!, ...LEFT);
    await settle(card);
    expect(range(card)).toBe(HOME);
  });

  it(`needs ${Constants.UI.SWIPE_MIN_DISTANCE}px sideways, and no less`, async () => {
    const card = await mount();
    const short = Constants.UI.SWIPE_MIN_DISTANCE - 1;

    swipe(content(card), [600, 300], [600 - short, 300]);
    await settle(card);
    expect(range(card)).toBe(HOME);

    swipe(content(card), [600, 300], [600 - Constants.UI.SWIPE_MIN_DISTANCE, 300]);
    await settle(card);
    expect(range(card)).toBe(NEXT);
  });

  it('needs to go mostly sideways, at least half again as far across as down', async () => {
    const card = await mount();
    const across = 120;
    const steepest = across / Constants.UI.SWIPE_MIN_SLOPE_RATIO;

    swipe(content(card), [600, 300], [600 - across, 300 + steepest + 1]);
    await settle(card);
    expect(range(card)).toBe(HOME);

    swipe(content(card), [600, 300], [600 - across, 300 - steepest]);
    await settle(card);
    expect(range(card)).toBe(NEXT);
  });

  it('pages nothing once the browser takes the gesture for a scroll or a pinch', async () => {
    const card = await mount();
    swipe(content(card), ...LEFT, { lift: 'pointercancel' });
    // A pointer-up the browser may still deliver for the canceled pointer finds no gesture.
    pointer(content(card), 'pointerup', 480, 310);
    await settle(card);
    expect(range(card)).toBe(HOME);
  });

  it('follows one finger: a second contact neither starts nor steers a swipe', async () => {
    const card = await mount();
    const days = content(card);

    pointer(days, 'pointerdown', 600, 300);
    pointer(days, 'pointerdown', 300, 300, { id: 2, primary: false });
    pointer(days, 'pointermove', 100, 300, { id: 2, primary: false });
    pointer(days, 'pointerup', 100, 300, { id: 2, primary: false });
    expect(range(card)).toBe(HOME);

    pointer(days, 'pointermove', 540, 300);
    pointer(days, 'pointerup', 480, 300);
    await settle(card);
    expect(range(card)).toBe(NEXT);
  });

  it('adds quick swipes up, from the page asked for rather than the one still drawn', async () => {
    const card = await mount();
    holdAnswers();

    swipe(content(card), ...LEFT);
    swipe(content(card), ...LEFT);
    held.forEach((release) => release());
    held = [];
    await settle(card);
    expect(range(card)).toBe(`Jun 29${TO}Jul 5`);
  });

  it(`starts no swipe within ${Constants.UI.SWIPE_EDGE_GUARD}px of either edge of the screen`, async () => {
    const card = await mount();
    const guard = Constants.UI.SWIPE_EDGE_GUARD;
    const width = window.innerWidth;

    swipe(content(card), [guard - 1, 300], [guard + 120, 300]);
    await settle(card);
    expect(range(card)).toBe(HOME);
    swipe(content(card), [width - guard + 1, 300], [width - guard - 120, 300]);
    await settle(card);
    expect(range(card)).toBe(HOME);

    swipe(content(card), [guard, 300], [guard + 120, 300]);
    await settle(card);
    expect(range(card)).toBe(PREVIOUS);

    swipe(content(card), [width - guard, 300], [width - guard - 120, 300]);
    await settle(card);
    expect(range(card)).toBe(HOME);
  });

  it('turns around reading right to left, as the arrows do', async () => {
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

    swipe(content(card), ...LEFT);
    await settle(card);
    expect(range(card)).toBe(PREVIOUS);

    swipe(content(card), ...RIGHT);
    swipe(content(card), ...RIGHT);
    await settle(card);
    expect(range(card)).toBe(NEXT);
  });
});

describe('a swipe beside the taps and the hold', () => {
  it("leaves the card's tap where it was: a tap runs it, a swipe never does", async () => {
    const card = await mount({ tap_action: { action: 'navigate', navigation_path: '/x' } });

    swipe(content(card), ...LEFT);
    await settle(card);
    expect(range(card)).toBe(NEXT);
    expect(hassActions).toEqual([]);

    pointer(content(card), 'pointerdown', 500, 300);
    pointer(content(card), 'pointerup', 503, 302);
    expect(hassActions).toEqual(['tap']);
    expect(range(card)).toBe(NEXT);
  });

  it('runs a hold that fired, and pages nothing, whatever the finger does after it', async () => {
    const card = await mount({ hold_action: { action: 'navigate', navigation_path: '/x' } });

    pointer(content(card), 'pointerdown', 600, 300);
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD);
    for (const x of [570, 540, 510, 480]) pointer(content(card), 'pointermove', x, 300);
    pointer(content(card), 'pointerup', 480, 300);
    await settle(card);

    expect(hassActions).toEqual(['hold']);
    expect(range(card)).toBe(HOME);
  });

  it('pages from a swipe that began on an event, and never opens it; a tap still does', async () => {
    const card = await mount({ event_tap_action: { action: 'details' } });
    const opened = vi.spyOn(internals(card), '_runEventTapAction').mockImplementation(() => {});
    const event = root(card).querySelector('.event-interactive')!;
    expect(event).not.toBeNull();

    swipe(event, ...LEFT);
    // The click a browser that does not retarget derives from the gesture names the event.
    event.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await settle(card);
    expect(range(card)).toBe(NEXT);
    expect(opened).not.toHaveBeenCalled();

    const next = root(card).querySelector('.event-interactive')!;
    pointer(next, 'pointerdown', 500, 300);
    pointer(next, 'pointerup', 502, 301);
    expect(opened).toHaveBeenCalledTimes(1);
  });
});

describe('where a swipe pages nothing at all', () => {
  /** A plain touch on the days: did the card start a gesture for it? */
  function armsFor(card: CardUnderTest): boolean {
    pointer(content(card), 'pointerdown', 600, 300);
    const armed = internals(card)._activePointerId !== null;
    pointer(content(card), 'pointercancel', 600, 300);
    return armed;
  }

  it('pages, arms and declares nothing on a card without the date navigation', async () => {
    const card = await mount({ toolbar: { ...NAVIGATION_ONLY, refresh: true, navigation: false } });
    expect(haCard(card).classList.contains('swipe-paging')).toBe(false);
    expect(armsFor(card)).toBe(false);

    const before = callApi.mock.calls.length;
    swipe(content(card), ...LEFT);
    await settle(card);
    expect(callApi.mock.calls.length).toBe(before);
  });

  it('pages nothing and declares nothing on a card without a toolbar', async () => {
    const card = await mount({ toolbar: undefined });
    expect(haCard(card).classList.contains('swipe-paging')).toBe(false);
    expect(armsFor(card)).toBe(false);
  });

  it('pages nothing while the card is being edited', async () => {
    for (const flag of ['preview', 'editMode'] as const) {
      document.body.innerHTML = '';
      const card = await mount({}, flag);
      expect(haCard(card).classList.contains('swipe-paging')).toBe(false);
      expect(armsFor(card)).toBe(false);
      swipe(content(card), ...LEFT);
      await settle(card);
      expect(range(card)).toBe(HOME);
    }
  });

  it('leaves a crammed grid its sideways scroll, and swipes a crammed column view', async () => {
    const grid = await mount({ view: 'grid', time_grid: { min_days_fallback: 'cramp' } });
    expect(haCard(grid).classList.contains('swipe-paging')).toBe(false);
    expect(armsFor(grid)).toBe(false);
    swipe(content(grid), ...LEFT);
    await settle(grid);
    expect(range(grid)).toBe(HOME);

    document.body.innerHTML = '';
    const column = await mount({ view: 'column', column: { min_days_fallback: 'cramp' } });
    expect(haCard(column).classList.contains('swipe-paging')).toBe(true);
    swipe(content(column), ...LEFT);
    await settle(column);
    expect(range(column)).toBe(NEXT);
  });

  it('swipes a grid that falls back to the list, and every view with the arrows', async () => {
    for (const view of ['list', 'column', 'grid'] as const) {
      document.body.innerHTML = '';
      const card = await mount({ view });
      expect(haCard(card).classList.contains('swipe-paging')).toBe(true);
      swipe(content(card), ...LEFT);
      await settle(card);
      expect(range(card)).toBe(NEXT);
    }
  });

  it('arms for a touch on a card that swipes, even with no action of its own', async () => {
    const card = await mount();
    expect(haCard(card).classList.contains('swipe-paging')).toBe(true);
    expect(armsFor(card)).toBe(true);
  });
});

describe('what a card that swipes declares to the browser', () => {
  const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

  it('hands it vertical panning and pinch zoom on the card and its body, only with the class', () => {
    const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , body]) =>
      body.includes('touch-action'),
    );
    expect(rules).toHaveLength(1);

    const [, prelude, body] = rules[0];
    expect(prelude.split(',').map((selector) => selector.replace(/\s+/g, ' ').trim())).toEqual([
      'ha-card.swipe-paging',
      'ha-card.swipe-paging .content-container',
      'ha-card.swipe-paging .content-container *',
    ]);
    // The fallback first: a browser that does not know pinch-zoom drops the second whole.
    expect(
      body
        .split(';')
        .map((declaration) => declaration.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ).toEqual(['touch-action: pan-y', 'touch-action: pan-y pinch-zoom']);
  });
});

describe('the motion of a swipe', () => {
  interface Asked {
    element: Element;
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
  }
  let asked: Asked[] = [];

  /** Records every animation asked for, and stands in for it. */
  function recordAnimations(): void {
    asked = [];
    vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(function (
      this: HTMLElement,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      asked.push({
        element: this,
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
      });
      return { cancel: vi.fn() } as unknown as Animation;
    });
  }

  function reduceMotion(reduce: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion: reduce'),
    }));
  }

  /** The offset the days are drawn at, in CSS pixels, read off their inline transform. */
  function offset(card: CardUnderTest): number | null {
    const transform = content(card).style.transform;
    if (!transform) return null;
    return Number(/translateX\((-?[\d.]+)px\)/.exec(transform)![1]);
  }

  beforeEach(() => {
    reduceMotion(false);
    recordAnimations();
  });

  it('lets the days follow the finger with resistance, never past the cap', async () => {
    const card = await mount();
    const days = content(card);
    const cap = Constants.UI.SWIPE_NUDGE_MAX;

    pointer(days, 'pointerdown', 600, 300);
    pointer(days, 'pointermove', 590, 300);
    const first = offset(card)!;
    expect(first).toBeLessThan(0);
    expect(Math.abs(first)).toBeLessThan(10);

    pointer(days, 'pointermove', 540, 300);
    const second = offset(card)!;
    expect(second).toBeLessThan(first);

    pointer(days, 'pointermove', 100, 300);
    const far = offset(card)!;
    expect(far).toBeLessThan(second);
    expect(far).toBeGreaterThanOrEqual(-cap);

    pointer(days, 'pointermove', 1000, 300);
    expect(offset(card)!).toBeGreaterThan(0);
    expect(offset(card)!).toBeLessThanOrEqual(cap);
    pointer(days, 'pointercancel', 1000, 300);
  });

  it('keeps the days still while the finger goes mostly up or down', async () => {
    const card = await mount();
    const days = content(card);

    pointer(days, 'pointerdown', 600, 300);
    pointer(days, 'pointermove', 590, 330);
    expect(offset(card)).toBeNull();

    pointer(days, 'pointermove', 520, 310);
    expect(offset(card)).not.toBeNull();
    pointer(days, 'pointermove', 520, 400);
    expect(offset(card)).toBeNull();
    pointer(days, 'pointercancel', 520, 400);
  });

  it('springs the days back as the gesture ends, and leaves no style behind', async () => {
    const card = await mount();
    const days = content(card);
    expect(days.hasAttribute('style')).toBe(false);

    pointer(days, 'pointerdown', 600, 300);
    pointer(days, 'pointermove', 560, 300);
    const moved = offset(card)!;
    pointer(days, 'pointercancel', 560, 300);

    expect(days.hasAttribute('style')).toBe(false);
    expect(asked).toHaveLength(1);
    expect(asked[0].element).toBe(days);
    expect(asked[0].keyframes).toEqual([
      { transform: `translateX(${moved.toFixed(1)}px)` },
      { transform: 'translateX(0)' },
    ]);
    expect(asked[0].options.duration).toBe(Constants.TIMING.SWIPE_SPRING_BACK);
  });

  it('slides the new page in from the side the finger came from, once it is drawn', async () => {
    const card = await mount();
    const release = holdAnswers();

    swipe(content(card), ...LEFT);
    await settle(card);
    // The spring-back only: the page asked for is not drawn yet, home's days still are.
    expect(asked).toHaveLength(1);
    expect(internals(card)._pageShown).toBeNull();

    release();
    await settle(card);
    expect(internals(card)._pageShown).not.toBeNull();
    expect(range(card)).toBe(NEXT);
    expect(asked).toHaveLength(2);
    expect(asked[1].element).toBe(content(card));
    expect(asked[1].keyframes).toEqual([
      { transform: `translateX(${Constants.UI.SWIPE_ARRIVAL_OFFSET}px)`, opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 },
    ]);
    expect(asked[1].options.duration).toBe(Constants.TIMING.SWIPE_ARRIVAL);

    // Drawn once is arrived: a later render slides nothing.
    card.requestUpdate();
    await settle(card);
    expect(asked).toHaveLength(2);

    answerFromFixture();
    swipe(content(card), ...RIGHT);
    await settle(card);
    expect(asked[asked.length - 1].keyframes[0]).toEqual({
      transform: `translateX(-${Constants.UI.SWIPE_ARRIVAL_OFFSET}px)`,
      opacity: 0,
    });
  });

  it('slides nothing in for a page the arrows turned to', async () => {
    const card = await mount();
    root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[2].click();
    await settle(card);
    expect(range(card)).toBe(NEXT);
    expect(asked).toEqual([]);
  });

  it('lets a page asked for since take the arrival with it', async () => {
    const card = await mount();
    const release = holdAnswers();
    const arrow = (which: 0 | 2) =>
      root(card).querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[which].click();

    swipe(content(card), ...LEFT);
    arrow(2);
    await settle(card);
    // Back by the arrows to the page the swipe asked for, which was never drawn for it.
    arrow(0);
    release();
    await settle(card);
    release();
    await settle(card);
    expect(range(card)).toBe(NEXT);
    expect(internals(card)._pageShown).not.toBeNull();
    // The swipe's spring-back, and nothing for the pages the arrows asked for.
    expect(asked).toHaveLength(1);
  });

  it('moves nothing under reduced motion, and still pages', async () => {
    reduceMotion(true);
    const card = await mount();

    pointer(content(card), 'pointerdown', 600, 300);
    pointer(content(card), 'pointermove', 540, 300);
    expect(offset(card)).toBeNull();
    pointer(content(card), 'pointermove', 480, 300);
    pointer(content(card), 'pointerup', 480, 300);
    await settle(card);

    expect(range(card)).toBe(NEXT);
    expect(asked).toEqual([]);
    expect(content(card).hasAttribute('style')).toBe(false);
  });
});
