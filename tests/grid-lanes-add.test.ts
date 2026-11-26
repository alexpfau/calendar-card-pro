import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import type { PopoverRequest } from './popover-spy';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import { EVENT_POPOVER_TAG } from '../src/rendering/event-popover';
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
 * Adding an event in a grid's lane (backlog item 334): a tap or a drawn event in a calendar's
 * slice starts the new event in that calendar, and the block drawn for it keeps to that slice.
 *
 * happy-dom computes no layout, so each day's time area is stubbed to 100px wide from x = 50,
 * a pixel a minute from y = 80 over the default band of 07:00 to 22:00, as in
 * `grid-draw-add.test.ts`. With two lanes, Anna's slice of the first day is x 50 to 100 and
 * Ben's x 100 to 150. The unit project runs in UTC.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
}

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const STATES = {
  [ANNA]: { entity_id: ANNA, state: 'off', attributes: { supported_features: 7 } },
  [BEN]: { entity_id: BEN, state: 'off', attributes: { supported_features: 7 } },
};
const EVENTS = [
  {
    summary: 'Dentist',
    start: { dateTime: '2026-06-17T14:00:00Z' },
    end: { dateTime: '2026-06-17T15:00:00Z' },
    uid: 'uid-dentist',
  },
];

const Y = (hour: number, minute = 0) => 80 + hour * 60 + minute - 7 * 60;
const ANNA_X = 75;
const BEN_X = 125;

async function mount(config: Record<string, unknown> = {}) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({
    entities: [ANNA, BEN],
    days_to_show: 2,
    show_empty_days: true,
    view: 'grid',
    lanes: true,
    day_tap_action: { action: 'add-event' },
    ...config,
  });
  card.hass = {
    states: STATES as unknown as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async (_method: string, path: string) => (path.includes(ANNA) ? EVENTS : [])),
    callService: vi.fn(),
    localize: (key: string) => key,
  } as unknown as Types.Hass;

  const dialogs: PopoverRequest[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: PopoverRequest }).detail),
  );
  document.body.appendChild(card);
  await vi.waitFor(() => expect(card.shadowRoot?.textContent).toContain('Dentist'));
  for (const [index, body] of bodies(card).entries()) {
    placeAt(body, { left: 50 + index * 100, top: 80, width: 100, height: 900 });
  }
  return { card, dialogs };
}

const bodies = (card: Card) =>
  Array.from(card.shadowRoot!.querySelectorAll<HTMLElement>('.grid-day-body'));
const plane = (card: Card, column: number) =>
  bodies(card)[column].querySelector('.grid-day-plane')!;

function placeAt(
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  } as DOMRect);
}

function pointer(target: EventTarget, type: string, x: number, y: number): void {
  const ev = new Event(type, { bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(
    Object.assign(ev, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: 'touch',
      clientX: x,
      clientY: y,
    }),
  );
}

const settle = () => vi.advanceTimersByTimeAsync(0);

/** The calendar each new-event popover opened in. */
const startedIn = (dialogs: PopoverRequest[]) =>
  dialogs
    .filter(
      ({ dialogTag, dialogParams }) =>
        dialogTag === EVENT_POPOVER_TAG && dialogParams.mode === 'new',
    )
    .map(({ dialogParams }) => dialogParams.calendarId);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('adding in a grid’s lanes', () => {
  it('starts a tapped event in the calendar whose slice was tapped', async () => {
    const { card, dialogs } = await mount();

    pointer(plane(card, 1), 'pointerdown', BEN_X + 100, Y(10));
    pointer(plane(card, 1), 'pointerup', BEN_X + 100, Y(10));
    await settle();
    pointer(plane(card, 1), 'pointerdown', ANNA_X + 100, Y(12));
    pointer(plane(card, 1), 'pointerup', ANNA_X + 100, Y(12));
    await settle();

    expect(startedIn(dialogs)).toEqual([BEN, ANNA]);
  });

  it('draws a held event in its slice, and opens it in that calendar', async () => {
    const { card, dialogs } = await mount();

    pointer(plane(card, 1), 'pointerdown', BEN_X + 100, Y(10));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
    const block = bodies(card)[1].querySelector<HTMLElement>('.grid-new-event > .event')!;
    expect(block.style.insetInlineStart).toBe('calc(50% + var(--calendar-card-grid-event-gap))');
    expect(block.style.width).toBe('calc(50% - var(--calendar-card-grid-event-gap) * 2)');

    pointer(plane(card, 1), 'pointerup', BEN_X + 100, Y(10));
    await settle();
    expect(startedIn(dialogs)).toEqual([BEN]);
  });

  it('starts where any press would, the first calendar, once lanes are off', async () => {
    const { card, dialogs } = await mount({ lanes: false });

    pointer(plane(card, 1), 'pointerdown', BEN_X + 100, Y(10));
    pointer(plane(card, 1), 'pointerup', BEN_X + 100, Y(10));
    await settle();

    expect(startedIn(dialogs)).toEqual([ANNA]);
    expect(card.shadowRoot!.querySelector('.lane-strip')).toBeNull();
  });
});
