import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import { PINNED_HEAD_HEIGHT_PROPERTY } from '../src/utils/head-pin';
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

/**
 * The rows pinned over a scrolling events area: a grid's head and its all-day band (D54, and
 * backlog item 402), a column view's day headers and a wide month's weekday names.
 *
 * Under a `card_height`, a `card_max_height`, a `max_height` or a Sections slot the events area
 * scrolls, and the dates scrolled away with what was under them. The card now marks what stays
 * `data-pinned`, which the stylesheet makes sticky, while the area scrolls and what stays takes at
 * most two thirds of it, and writes its height on the area for a scroll margin. Measured by a
 * resize observer, so a fake one stands in here, and the sizes it would read are stubbed: happy-dom
 * computes no layout. Chrome's and WebKit's side of it, that the rows stay in sight and nothing
 * shows through them, is recorded in the change that added it.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
}

class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];

  readonly observed: Element[] = [];
  disconnected = false;

  constructor(readonly callback: ResizeObserverCallback) {
    RecordingResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const ANNA = 'calendar.anna';
const EVENTS = [
  {
    summary: 'Bakery run',
    start: { dateTime: '2026-06-17T09:00:00Z' },
    end: { dateTime: '2026-06-17T10:00:00Z' },
  },
  { summary: 'Sports day', start: { date: '2026-06-18' }, end: { date: '2026-06-19' } },
];

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  RecordingResizeObserver.instances = [];
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function mount(
  config: Record<string, unknown> = {},
  ready = '.grid-banner',
  events = EVENTS,
): Promise<Card> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({ entities: [ANNA], days_to_show: 3, view: 'grid', ...config });
  card.hass = {
    states: {
      [ANNA]: { entity_id: ANNA, state: 'off', attributes: {} },
    } as unknown as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async () => events),
    callService: vi.fn(),
    callWS: vi.fn(async () => undefined),
    localize: () => '',
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await vi.waitFor(() => expect(card.shadowRoot?.querySelector(ready)).not.toBeNull());
  await card.updateComplete;
  return card;
}

const $ = (card: Card, selector: string) => card.shadowRoot!.querySelector<HTMLElement>(selector)!;
const areaOf = (card: Card) => $(card, '.content-container');

/** The observer watching the area for the pinned rows: the one that also watches `target`. */
function pinObserver(card: Card, target: Element): RecordingResizeObserver {
  const found = RecordingResizeObserver.instances.filter(
    (observer) => observer.observed.includes(target) && observer.observed.includes(areaOf(card)),
  );
  expect(found, 'nothing observes the pinned rows').toHaveLength(1);
  return found[0];
}

/** Lays elements out at these heights, as a browser would report them. */
function heights(entries: Array<[Element, number]>): void {
  for (const [element, height] of entries) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
  }
}

/** Lays the area out: its visible height and the height of what it scrolls through. */
function area(card: Card, visible: number, content: number): HTMLElement {
  const element = areaOf(card);
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: visible });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: content });
  return element;
}

const pinned = (element: Element) => element.getAttribute('data-pinned');
const margin = (card: Card) => areaOf(card).style.getPropertyValue(PINNED_HEAD_HEIGHT_PROPERTY);

describe('the grid head and band pinned over the hours (D54)', () => {
  it('pins both while they fit, the head alone past that, and nothing on a shorter card', async () => {
    const card = await mount({ card_max_height: '260px' });
    const head = $(card, '.grid-head');
    const band = $(card, '.grid-allday-row');
    const observer = pinObserver(card, head);

    // The head, the band's box, the grid they sit in and the area: each can change the answer.
    expect(observer.observed).toEqual([head, band, head.parentElement, areaOf(card)]);

    // The band's box spans the head's rows too: 99 tall over a 75 head is a 24 band. Together
    // 99 of 162 is under two thirds, the 300px card of backlog item 402, which #951 let go.
    heights([
      [head, 75],
      [band, 99],
    ]);
    area(card, 162, 460);
    observer.fire();
    expect(pinned(head)).toBe('');
    expect(pinned(band)).toBe('');
    expect(margin(card)).toBe('99px');

    // A taller band: the head stays alone and the band scrolls under it with the hours.
    heights([
      [head, 75],
      [band, 150],
    ]);
    observer.fire();
    expect(pinned(head)).toBe('alone');
    expect(pinned(band)).toBeNull();
    expect(margin(card)).toBe('75px');

    // Content that fits: nothing scrolls, so nothing pins, and the margin goes with it.
    area(card, 800, 800);
    observer.fire();
    expect(pinned(head)).toBeNull();
    expect(pinned(band)).toBeNull();
    expect(margin(card)).toBe('');

    // A head over two thirds of the area would leave a short card almost none of the hours.
    area(card, 100, 440);
    observer.fire();
    expect(pinned(head)).toBeNull();
    expect(pinned(band)).toBeNull();
  });

  it('keeps the rule under the headers with them while there is no band', async () => {
    const card = await mount({ card_max_height: '260px' }, '.grid-event', [EVENTS[0]]);
    expect(card.shadowRoot!.querySelector('.grid-allday-band')).toBeNull();
    const head = $(card, '.grid-head');
    const band = $(card, '.grid-allday-row');
    // Without banners the band's box holds only that rule, 76 against a 75 head, however much
    // of the area the two take.
    heights([
      [head, 75],
      [band, 76],
    ]);
    area(card, 120, 460);
    pinObserver(card, head).fire();
    expect(pinned(head)).toBe('');
    expect(pinned(band)).toBe('');
    expect(margin(card)).toBe('76px');
  });

  it('never pins a crammed grid, whose own sideways scrolling is the nearest', async () => {
    const card = await mount({
      card_max_height: '260px',
      time_grid: { min_days_fallback: 'cramp' },
    });
    expect($(card, '.grid-head').parentElement!.style.overflowX).toBe('auto');
    expect(
      RecordingResizeObserver.instances.some((observer) =>
        observer.observed.includes($(card, '.grid-head')),
      ),
    ).toBe(false);
    expect(pinned($(card, '.grid-head'))).toBeNull();
  });

  it('lets go of the area, and its margin, once the grid is gone', async () => {
    const card = await mount({ card_max_height: '260px' });
    const head = $(card, '.grid-head');
    const observer = pinObserver(card, head);
    heights([
      [head, 75],
      [$(card, '.grid-allday-row'), 99],
    ]);
    area(card, 228, 800);
    observer.fire();
    expect(margin(card)).toBe('99px');

    card.setConfig({ entities: [ANNA], days_to_show: 3, view: 'list', card_max_height: '260px' });
    await card.updateComplete;

    expect(card.shadowRoot!.querySelector('.grid-head')).toBeNull();
    expect(observer.disconnected).toBe(true);
    expect(margin(card)).toBe('');
  });
});

describe('the rows pinned in the other layouts (backlog item 402)', () => {
  it("pins a column view's day headers by its tallest, while they fit", async () => {
    const card = await mount({ view: 'column', card_height: '300px' }, '.column-day-header');
    const grid = $(card, '.column-grid');
    const observer = pinObserver(card, grid);
    const headers = card.shadowRoot!.querySelectorAll('.day-column > .column-day-header');
    expect(headers.length).toBe(3);
    heights(Array.from(headers, (header, index) => [header, 50 + index] as [Element, number]));
    area(card, 162, 320);
    observer.fire();
    expect(pinned(grid)).toBe('');
    expect(margin(card)).toBe('52px');

    area(card, 320, 320);
    observer.fire();
    expect(pinned(grid)).toBeNull();
    expect(margin(card)).toBe('');
  });

  it("pins a wide month's weekday names while its weeks scroll", async () => {
    const card = await mount({ view: 'month', month: { card_height: '300px' } }, '.month-weekdays');
    const names = $(card, '.month-weekdays');
    expect(card.shadowRoot!.querySelector('.month-narrow')).toBeNull();
    const observer = pinObserver(card, names);
    heights([[names, 26]]);
    area(card, 162, 298);
    observer.fire();
    expect(pinned(names)).toBe('');
    expect(margin(card)).toBe('26px');
  });

  it('pins nothing in a narrow month or a list, which scroll as they are', async () => {
    const month = await mount(
      { view: 'month', month: { narrow_card_height: '300px', min_day_width: 80 } },
      '.month-weekdays',
    );
    for (const observer of RecordingResizeObserver.instances) {
      observer.callback(
        [{ contentRect: { width: 320 } } as unknown as ResizeObserverEntry],
        observer as unknown as ResizeObserver,
      );
    }
    await vi.waitFor(() => expect(month.shadowRoot!.querySelector('.month-narrow')).not.toBeNull());
    await month.updateComplete;
    const names = $(month, '.month-narrow > .month-weekdays');
    expect(
      RecordingResizeObserver.instances.some(
        (observer) => observer.observed.includes(names) && !observer.disconnected,
      ),
    ).toBe(false);
    expect(month.shadowRoot!.querySelector('[data-pinned]')).toBeNull();
    month.remove();

    const list = await mount({ view: 'list', card_height: '300px' }, '.event');
    expect(list.shadowRoot!.querySelector('[data-pinned]')).toBeNull();
    expect(
      RecordingResizeObserver.instances.some(
        (observer) => observer.observed.includes(areaOf(list)) && !observer.disconnected,
      ),
    ).toBe(false);
  });
});
