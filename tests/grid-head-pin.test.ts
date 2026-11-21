import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import { GRID_HEAD_HEIGHT_PROPERTY } from '../src/rendering/grid';
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
 * The grid's head pinned over the hours (D54).
 *
 * Under a `card_height`, a `card_max_height` or a `max_height` the whole grid scrolled, and the
 * day headers and the all-day band scrolled away with the hours. The card now marks the head
 * `data-pinned`, which the stylesheet makes sticky, while the events area scrolls and the head
 * takes at most half of it, and writes the head's height on the area for the hours' scroll
 * margin. Measured by a resize observer, so a fake one stands in here, and the sizes it would
 * read are stubbed: happy-dom computes no layout. Chrome's side of it, that the head stays in
 * sight and nothing shows through it, is recorded in the change that added it.
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

async function mount(config: Record<string, unknown> = {}): Promise<Card> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({ entities: [ANNA], days_to_show: 3, view: 'grid', ...config });
  card.hass = {
    states: {
      [ANNA]: { entity_id: ANNA, state: 'off', attributes: {} },
    } as unknown as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async () => EVENTS),
    callService: vi.fn(),
    callWS: vi.fn(async () => undefined),
    localize: () => '',
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await vi.waitFor(() => expect(card.shadowRoot?.querySelector('.grid-banner')).not.toBeNull());
  await card.updateComplete;
  return card;
}

const headOf = (card: Card) => card.shadowRoot!.querySelector<HTMLElement>('.grid-head')!;
const areaOf = (card: Card) => card.shadowRoot!.querySelector<HTMLElement>('.content-container')!;

/** The observer watching the head, which also watches the grid and the events area. */
function headObserver(card: Card): RecordingResizeObserver {
  const found = RecordingResizeObserver.instances.filter((observer) =>
    observer.observed.includes(headOf(card)),
  );
  expect(found, 'nothing observes the head').toHaveLength(1);
  return found[0];
}

/** Lays the head and the area out at these heights, as a browser would report them. */
function layOut(card: Card, sizes: { head: number; area: number; content: number }): void {
  vi.spyOn(headOf(card), 'getBoundingClientRect').mockReturnValue({
    height: sizes.head,
  } as DOMRect);
  const area = areaOf(card);
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: sizes.area });
  Object.defineProperty(area, 'scrollHeight', { configurable: true, value: sizes.content });
}

describe('the grid head pinned over the hours (D54)', () => {
  it('pins while the area scrolls and the head leaves the hours room', async () => {
    const card = await mount({ card_max_height: '260px' });
    const observer = headObserver(card);
    const head = headOf(card);
    const area = areaOf(card);

    // The head, the grid it sits in and the area it pins to: each can change the answer.
    expect(observer.observed).toEqual([head, head.parentElement, area]);

    layOut(card, { head: 80, area: 228, content: 800 });
    observer.fire();
    expect(head.hasAttribute('data-pinned')).toBe(true);
    expect(area.style.getPropertyValue(GRID_HEAD_HEIGHT_PROPERTY)).toBe('80px');

    // Content that fits: nothing scrolls, so nothing pins, and the margin goes with it.
    layOut(card, { head: 80, area: 800, content: 800 });
    observer.fire();
    expect(head.hasAttribute('data-pinned')).toBe(false);
    expect(area.style.getPropertyValue(GRID_HEAD_HEIGHT_PROPERTY)).toBe('');

    // A head taller than half the area would leave a short card almost none of the hours.
    layOut(card, { head: 79, area: 68, content: 440 });
    observer.fire();
    expect(head.hasAttribute('data-pinned')).toBe(false);
  });

  it('never pins a crammed grid, whose own sideways scrolling is the nearest', async () => {
    const card = await mount({
      card_max_height: '260px',
      time_grid: { min_days_fallback: 'cramp' },
    });
    expect(headOf(card).parentElement!.style.overflowX).toBe('auto');

    layOut(card, { head: 80, area: 228, content: 800 });
    headObserver(card).fire();
    expect(headOf(card).hasAttribute('data-pinned')).toBe(false);
  });

  it('lets go of the area, and its margin, once the grid is gone', async () => {
    const card = await mount({ card_max_height: '260px' });
    const observer = headObserver(card);
    const area = areaOf(card);
    layOut(card, { head: 80, area: 228, content: 800 });
    observer.fire();
    expect(area.style.getPropertyValue(GRID_HEAD_HEIGHT_PROPERTY)).toBe('80px');

    card.setConfig({ entities: [ANNA], days_to_show: 3, view: 'list', card_max_height: '260px' });
    await card.updateComplete;

    expect(card.shadowRoot!.querySelector('.grid-head')).toBeNull();
    expect(observer.disconnected).toBe(true);
    expect(areaOf(card).style.getPropertyValue(GRID_HEAD_HEIGHT_PROPERTY)).toBe('');
  });
});
