import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import type { PopoverRequest } from './popover-spy';
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

/**
 * A press the browser hands to an event the finger is not on (backlog item 195).
 *
 * Chromium's touch adjustment gives a finger's pointer-down to a tap target near the finger when
 * it finds none under it, at the finger's own position. An empty grid slot is never one, since
 * the card hears its presses on `ha-card`, so a hold beside an event, meant to draw a new one,
 * lifted the event and dragged it, and the drop wrote it to its calendar. Each press here is
 * dispatched as Chromium dispatches it: on the event's block, at a point beside the block. Where
 * a tap on a slot adds an event, such a press is read from what lies under the finger; elsewhere
 * a tap beside an event still opens it, but a hold never lifts it.
 *
 * happy-dom computes no layout and has no `elementFromPoint` on a shadow root, so both are
 * stubbed: the hours' axis left of x = 50, day columns 100 px wide from there, the all-day band
 * above y = 80 and the time areas below it, a pixel a minute from 07:00, and Dentist's block from
 * 14:00 to 15:00 on June 17. The unit project runs in UTC.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
}

const ANNA = 'calendar.anna';
const DENTIST = {
  summary: 'Dentist',
  start: { dateTime: '2026-06-17T14:00:00Z' },
  end: { dateTime: '2026-06-17T15:00:00Z' },
  uid: 'uid-dentist',
};
// An all-day event, so the grid draws its all-day band.
const SPORTS_DAY = {
  summary: 'Sports day',
  start: { date: '2026-06-18' },
  end: { date: '2026-06-19' },
  uid: 'uid-sports',
};

const ADD = { day_tap_action: { action: 'add-event' } } as const;
const DETAILS = { event_tap_action: { action: 'details' } } as const;
const AT = (day: number, hour: number, minute = 0) => new Date(2026, 5, day, hour, minute);
const JUNE = (day: number) => new Date(2026, 5, day);

/** The y of a wall-clock time in the stubbed time areas. */
const Y = (hour: number, minute = 0) => 80 + hour * 60 + minute - 7 * 60;
/** The x in the middle of a day's column: 0 is June 17. */
const X = (column: number) => 100 + column * 100;

async function mount(config: Record<string, unknown>) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({
    entities: [ANNA],
    days_to_show: 3,
    show_empty_days: true,
    view: 'grid',
    ...config,
  });
  const callWS = vi.fn(async (_message: Record<string, unknown>) => undefined);
  card.hass = {
    states: {
      [ANNA]: { entity_id: ANNA, state: 'off', attributes: { supported_features: 7 } },
    } as unknown as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async () => [DENTIST, SPORTS_DAY]),
    callService: vi.fn(),
    callWS,
    localize: () => '',
  } as unknown as Types.Hass;

  const dialogs: PopoverRequest[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: PopoverRequest }).detail),
  );
  document.body.appendChild(card);
  await vi.waitFor(() => expect(card.shadowRoot?.textContent).toContain('Dentist'));
  for (const [index, body] of all(card, '.grid-day-body').entries()) {
    placeAt(body, { left: 50 + index * 100, top: 80, width: 100, height: 900 });
  }
  const hitTest = stubHitTest(card);
  const writes = () =>
    callWS.mock.calls
      .map(([message]) => message)
      .filter((message) => String(message.type).startsWith('calendar/event/'));
  return { card, dialogs, writes, hitTest };
}

const all = <T extends Element = HTMLElement>(card: Card, selector: string): T[] =>
  Array.from(card.shadowRoot!.querySelectorAll<T>(selector));
const bodies = (card: Card) => all(card, '.grid-day-body');
const plane = (card: Card, column: number) =>
  bodies(card)[column].querySelector('.grid-day-plane')!;
/** The grid's own block of Dentist; never one a press draws. */
const dentist = (card: Card) =>
  all(card, '.grid-event').find(
    (element) =>
      !element.closest('.grid-new-event') &&
      element.querySelector('.event-title')?.textContent?.includes('Dentist'),
  )!;
const sportsDay = (card: Card) => all(card, '.grid-allday-band > .grid-banner')[0];
/** Where a block a press draws is: each day's time area holding one. */
const drawn = (card: Card) =>
  all(card, '.grid-new-event').map((host) => host.closest<HTMLElement>('.grid-day-body'));
/** What the drawn block reads: title, then time. */
const label = (card: Card) => {
  const block = card.shadowRoot!.querySelector('.grid-new-event > .event');
  if (!block) return null;
  const text = (selector: string) =>
    (block.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return `${text('.event-title')}\n${text('.time-actual')}`;
};
const lifted = (card: Card) => dentist(card).getAttribute('data-move-origin');

/** What the popovers opened on: `['new', start, end]`, all-day ones marked, or `['event', title]`. */
const opened = (dialogs: PopoverRequest[]) =>
  dialogs.map(({ dialogParams: params }) =>
    params.mode === 'new'
      ? [params.times?.allDay ? 'new all-day' : 'new', params.times?.start, params.times?.end]
      : ['event', params.entry?.summary],
  );

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

/**
 * What a hit test finds at a point, as a browser's would: the hours' axis, the all-day band,
 * Dentist's title on its block, and a day's plane anywhere else in the time areas.
 */
function stubHitTest(card: Card) {
  const root = card.shadowRoot!;
  const elementFromPoint = vi.fn((x: number, y: number): Element | null => {
    if (x < 50) return root.querySelector('.grid-axis');
    const column = Math.floor((x - 50) / 100);
    if (!bodies(card)[column]) return null;
    if (y < 80) return root.querySelector('.grid-allday-band');
    if (column === 0 && y >= Y(14) && y < Y(15)) {
      return dentist(card).querySelector('.event-title');
    }
    return plane(card, column);
  });
  Object.assign(card.shadowRoot!, { elementFromPoint });
  return elementFromPoint;
}

function pointer(target: EventTarget, type: string, x: number, y: number, pointerType = 'touch') {
  const ev = new Event(type, { bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(
    Object.assign(ev, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType,
      clientX: x,
      clientY: y,
    }),
  );
}

/** A press as Chromium hands it on: on Dentist's block, at the finger's point beside it. */
const handedToDentist = (card: Card, type: string, x: number, y: number, pointerType = 'touch') =>
  pointer(dentist(card), type, x, y, pointerType);

const hold = () => vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
const settle = () => vi.advanceTimersByTimeAsync(0);

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

describe('a press the browser hands to an event beside the finger', () => {
  it('draws where the finger is held, under a block beside it, and lifts nothing', async () => {
    const { card, dialogs, writes } = await mount({ ...ADD, ...DETAILS });

    // Six pixels below Dentist's block, which ends at 15:00.
    handedToDentist(card, 'pointerdown', X(0), Y(15, 6));
    hold();
    expect(lifted(card)).toBeNull();
    expect(drawn(card)).toEqual([bodies(card)[0]]);
    expect(label(card)).toBe('New event\n15:00 - 16:00');

    handedToDentist(card, 'pointermove', X(0), Y(16, 20));
    expect(label(card)).toBe('New event\n15:00 - 16:30');
    handedToDentist(card, 'pointerup', X(0), Y(16, 20));
    await settle();

    expect(opened(dialogs)).toEqual([['new', AT(17, 15), AT(17, 16, 30)]]);
    expect(writes()).toEqual([]);
  });

  it('draws above a block, and in the next day beside it', async () => {
    const { card, dialogs } = await mount({ ...ADD, ...DETAILS });

    handedToDentist(card, 'pointerdown', X(0), Y(13, 52));
    hold();
    handedToDentist(card, 'pointerup', X(0), Y(13, 52));
    // Across the line between June 17 and 18, level with Dentist.
    handedToDentist(card, 'pointerdown', 153, Y(14, 30));
    hold();
    handedToDentist(card, 'pointerup', 153, Y(14, 30));
    await settle();

    expect(opened(dialogs)).toEqual([
      ['new', AT(17, 13, 45), AT(17, 14, 45)],
      ['new', AT(18, 14, 30), AT(18, 15, 30)],
    ]);
    expect(lifted(card)).toBeNull();
  });

  it('adds where the finger taps, rather than opening the event beside it', async () => {
    const { card, dialogs } = await mount({ ...ADD, ...DETAILS });

    handedToDentist(card, 'pointerdown', X(0), Y(15, 6));
    // The hour under the finger is washed, as for any tap that adds.
    expect(bodies(card)[0].hasAttribute('data-add-pressed')).toBe(true);
    handedToDentist(card, 'pointerup', X(0), Y(15, 6));
    await settle();

    expect(opened(dialogs)).toEqual([['new', AT(17, 15), AT(17, 16)]]);
  });

  it('still lifts and moves an event a finger holds at its very edge', async () => {
    const { card, writes } = await mount({ ...ADD, ...DETAILS });

    pointer(dentist(card), 'pointerdown', X(0), Y(14, 58));
    hold();
    expect(lifted(card)).toBe('lifted');
    expect(drawn(card)).toEqual([bodies(card)[0]]);
    pointer(dentist(card), 'pointermove', X(0), Y(16, 58));
    pointer(dentist(card), 'pointerup', X(0), Y(16, 58));
    await settle();

    expect(writes()).toEqual([
      expect.objectContaining({
        type: 'calendar/event/update',
        uid: 'uid-dentist',
        event: expect.objectContaining({
          dtstart: '2026-06-17T16:00:00Z',
          dtend: '2026-06-17T17:00:00Z',
        }),
      }),
    ]);
  });

  it('never lifts the event where a tap on a slot adds nothing, but a tap still opens it', async () => {
    const { card, dialogs, writes } = await mount(DETAILS);

    handedToDentist(card, 'pointerdown', X(0), Y(15, 6));
    hold();
    expect(lifted(card)).toBeNull();
    expect(drawn(card)).toEqual([]);
    handedToDentist(card, 'pointermove', X(0), Y(17, 6));
    handedToDentist(card, 'pointerup', X(0), Y(17, 6));
    await settle();
    expect(writes()).toEqual([]);
    expect(dialogs).toEqual([]);

    // The browser's forgiveness for a finger that just misses an event stays where nothing
    // else is under it.
    handedToDentist(card, 'pointerdown', X(0), Y(15, 6));
    handedToDentist(card, 'pointerup', X(0), Y(15, 6));
    await settle();
    expect(opened(dialogs)).toEqual([['event', 'Dentist']]);
  });

  it('owes the click a browser derives to the event it handed the press to', async () => {
    const { card, dialogs } = await mount({ ...ADD, ...DETAILS });

    handedToDentist(card, 'pointerdown', X(0), Y(15, 6));
    handedToDentist(card, 'pointerup', X(0), Y(15, 6));
    // A browser that does not retarget the click to the capture aims it at the pointer-down's
    // target: Dentist, which the finger never was on.
    dentist(card).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await settle();

    expect(opened(dialogs)).toEqual([['new', AT(17, 15), AT(17, 16)]]);
  });

  it('adds in the all-day band where the finger is, beside a banner it was handed to', async () => {
    const { card, dialogs } = await mount({ ...ADD, ...DETAILS });
    expect(sportsDay(card)?.textContent).toContain('Sports day');

    // In the band, over June 19, beside Sports day on June 18.
    pointer(sportsDay(card), 'pointerdown', X(2), 60);
    pointer(sportsDay(card), 'pointerup', X(2), 60);
    await settle();

    expect(opened(dialogs)).toEqual([['new all-day', JUNE(19), JUNE(19)]]);
  });

  it("leaves the browser's choice off the days, and lifts nothing there", async () => {
    const { card, dialogs, writes } = await mount({ ...ADD, ...DETAILS });

    // On the hours' axis, level with Dentist: no slot is under the finger, so the tap that
    // just missed Dentist opens it, as it always did.
    handedToDentist(card, 'pointerdown', 46, Y(14, 30));
    handedToDentist(card, 'pointerup', 46, Y(14, 30));
    await settle();
    expect(opened(dialogs)).toEqual([['event', 'Dentist']]);

    handedToDentist(card, 'pointerdown', 46, Y(14, 30));
    hold();
    expect(lifted(card)).toBeNull();
    expect(drawn(card)).toEqual([]);
    handedToDentist(card, 'pointermove', 46, Y(16, 30));
    handedToDentist(card, 'pointerup', 46, Y(16, 30));
    await settle();
    expect(writes()).toEqual([]);
  });

  it.each(['mouse', 'pen'])('reads a %s press as the browser hands it', async (pointerType) => {
    const { card, hitTest } = await mount({ ...ADD, ...DETAILS });

    pointer(dentist(card), 'pointerdown', X(0), Y(15, 6), pointerType);
    if (pointerType === 'pen') hold();
    pointer(dentist(card), 'pointermove', X(0), Y(15, 26), pointerType);
    expect(lifted(card)).toBe('lifted');
    expect(hitTest).not.toHaveBeenCalled();
    pointer(dentist(card), 'pointerup', X(0), Y(15, 26), pointerType);
  });
});
