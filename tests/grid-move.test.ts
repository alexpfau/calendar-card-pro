import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

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
 * Moving an event in a grid by drag (backlog item 181), under the gesture model in
 * docs/architecture.md: where the popover can change an event (`event_tap_action` or
 * `event_hold_action` is `details`), a mouse pressed on its block and dragged, or a finger held
 * on it and dragged, moves it by quarter hours and across days, and lets it go there. A single
 * event is written at once; a repeating one opens its popover at the new times to ask which
 * occurrences move.
 *
 * happy-dom computes no layout, so each day's time area is stubbed to a known geometry: day
 * columns 100 px wide from x = 50, the time areas from y = 80, a pixel a minute over the
 * default band of 07:00 to 22:00. The unit project runs in UTC.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
}

const ANNA = 'calendar.anna';
const READ_ONLY = 'calendar.holidays';
const STATES = {
  [ANNA]: { entity_id: ANNA, state: 'off', attributes: { supported_features: 7 } },
  // Creates and deletes, but cannot update.
  [READ_ONLY]: { entity_id: READ_ONLY, state: 'off', attributes: { supported_features: 3 } },
};
const DENTIST = {
  summary: 'Dentist',
  start: { dateTime: '2026-06-17T14:00:00Z' },
  end: { dateTime: '2026-06-17T15:00:00Z' },
  location: 'Main Street 1',
  uid: 'uid-dentist',
};
const SWIM = {
  summary: 'Swim',
  start: { dateTime: '2026-06-18T09:00:00Z' },
  end: { dateTime: '2026-06-18T10:00:00Z' },
  uid: 'uid-swim',
  rrule: 'FREQ=WEEKLY;BYDAY=TH',
  recurrence_id: '20260618T090000Z',
};
const TRIP = {
  summary: 'Night train',
  start: { dateTime: '2026-06-17T20:00:00Z' },
  end: { dateTime: '2026-06-18T08:00:00Z' },
  uid: 'uid-trip',
};

const DETAILS = { event_tap_action: { action: 'details' } } as const;
const ON_HOLD = { event_hold_action: { action: 'details' } } as const;

/** The y of a wall-clock time in the stubbed time areas. */
const Y = (hour: number, minute = 0) => 80 + hour * 60 + minute - 7 * 60;
/** The x in the middle of a day's column: 0 is June 17. */
const X = (column: number) => 100 + column * 100;

async function mount(
  config: Record<string, unknown>,
  events: unknown[] = [DENTIST],
  write: (message: Record<string, unknown>) => Promise<unknown> = async () => undefined,
) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({
    entities: [ANNA],
    days_to_show: 3,
    show_empty_days: true,
    view: 'grid',
    ...config,
  });
  const callWS = vi.fn(write);
  card.hass = {
    states: STATES as unknown as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async () => events),
    callService: vi.fn(),
    callWS,
    localize: () => '',
  } as unknown as Types.Hass;

  const dialogs: PopoverRequest[] = [];
  const notes: string[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: PopoverRequest }).detail),
  );
  card.addEventListener('hass-notification', (ev) =>
    notes.push((ev as Event & { detail: { message: string } }).detail.message),
  );
  document.body.appendChild(card);
  const first = (events[0] as { summary: string }).summary;
  await vi.waitFor(() => expect(card.shadowRoot?.textContent).toContain(first));
  stubGeometry(card);
  const writes = () =>
    callWS.mock.calls
      .map(([message]) => message)
      .filter((message) => String(message.type).startsWith('calendar/event/'));
  return { card, dialogs, notes, writes, callWS };
}

function stubGeometry(card: Card) {
  for (const [index, body] of all(card, '.grid-day-body').entries()) {
    placeAt(body, { left: 50 + index * 100, top: 80, width: 100, height: 900 });
  }
}

const all = <T extends Element = HTMLElement>(card: Card, selector: string): T[] =>
  Array.from(card.shadowRoot!.querySelectorAll<T>(selector));
const bodies = (card: Card) => all(card, '.grid-day-body');
/** The grid's own block of an event, by its title; never the one a drag draws. */
const block = (card: Card, title: string) =>
  all(card, '.grid-event').find(
    (element) =>
      !element.closest('.grid-new-event') &&
      element.querySelector('.event-title')?.textContent?.includes(title),
  )!;
/** The block a drag draws, and where: each day's time area holding one. */
const drawn = (card: Card) =>
  all(card, '.grid-new-event').map((host) => host.closest<HTMLElement>('.grid-day-body'));
/** What the drawn block reads: title, then time. */
const label = (card: Card) => {
  const moved = card.shadowRoot!.querySelector('.grid-new-event > .event');
  if (!moved) return null;
  const text = (selector: string) =>
    (moved.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return `${text('.event-title')}\n${text('.time-actual')}`;
};
const origin = (card: Card, title: string) =>
  block(card, title)?.getAttribute('data-move-origin') ?? null;

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

function pointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  pointerType = 'mouse',
  pointerId = 1,
): Event {
  const ev = new Event(type, { bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(
    Object.assign(ev, {
      pointerId,
      button: 0,
      isPrimary: pointerId === 1,
      pointerType,
      clientX: x,
      clientY: y,
    }),
  );
  return ev;
}

/** A drag from one point to another, its pointer-down on what it starts on. */
function drag(
  from: Element,
  start: [number, number],
  end: [number, number],
  pointerType = 'mouse',
): void {
  pointer(from, 'pointerdown', ...start, pointerType);
  if (pointerType !== 'mouse') hold();
  pointer(from, 'pointermove', start[0], start[1] + 20, pointerType);
  pointer(from, 'pointermove', ...end, pointerType);
  pointer(from, 'pointerup', ...end, pointerType);
}

const hold = () => vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
const settle = () => vi.advanceTimersByTimeAsync(0);
const dentistMovedTo = (dtstart: string, dtend: string) => ({
  type: 'calendar/event/update',
  entity_id: ANNA,
  uid: 'uid-dentist',
  event: { summary: 'Dentist', dtstart, dtend, location: 'Main Street 1' },
});

/**
 * Holds every later fetch of the card's events until the test answers it, as the refresh after
 * a write that has not come back yet.
 *
 * @param card - The card whose fetches to hold
 * @param events - What the fetches answer with
 * @returns Answers the fetches under way with the events
 */
function holdFetches(card: Card, events: unknown[]): () => Promise<void> {
  const waiting: Array<(events: unknown) => void> = [];
  vi.mocked(card.hass.callApi).mockImplementation(
    () => new Promise((resolve) => waiting.push(resolve)),
  );
  const release = () => {
    for (const resolve of waiting.splice(0)) resolve(events);
  };
  onTestFinished(release);
  return async () => {
    await settle();
    expect(waiting.length).toBeGreaterThan(0);
    release();
    await settle();
  };
}

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

describe('moving an event in a grid by drag', () => {
  it('moves with a mouse, by quarter hours and across days, and writes it once on release', async () => {
    const { card, writes, dialogs } = await mount(DETAILS);
    const dentist = block(card, 'Dentist');

    // Grabbed at 14:30, half way down its hour.
    pointer(dentist, 'pointerdown', X(0), Y(14, 30));
    expect(drawn(card)).toEqual([]);
    pointer(dentist, 'pointermove', X(0), Y(14, 50));

    // Lifted: drawn as itself where it is, its own block faded under it.
    expect(drawn(card)).toEqual([bodies(card)[0]]);
    expect(origin(card, 'Dentist')).toBe('lifted');

    // Down two hours and seven minutes, which rounds to two hours, and a day across.
    pointer(dentist, 'pointermove', X(1), Y(16, 37));
    expect(drawn(card)).toEqual([bodies(card)[1]]);
    expect(label(card)).toBe('Dentist\n16:00 - 17:00');
    expect(writes()).toEqual([]);

    const refresh = holdFetches(card, [
      {
        ...DENTIST,
        start: { dateTime: '2026-06-18T16:00:00Z' },
        end: { dateTime: '2026-06-18T17:00:00Z' },
      },
    ]);
    pointer(dentist, 'pointerup', X(1), Y(16, 37));
    await settle();

    expect(writes()).toEqual([dentistMovedTo('2026-06-18T16:00:00Z', '2026-06-18T17:00:00Z')]);
    // No popover, and the click the browser derives from the release opens none either.
    card.shadowRoot!.querySelector('ha-card')!.dispatchEvent(new MouseEvent('click'));
    expect(dialogs).toEqual([]);
    // Where it was dropped until the refresh brings it there; gone from where it was.
    expect(drawn(card)).toEqual([bodies(card)[1]]);
    expect(origin(card, 'Dentist')).toBe('dropped');

    await refresh();
    await card.updateComplete;
    expect(drawn(card)).toEqual([]);
    expect(all(card, '[data-move-origin]')).toEqual([]);
    expect(bodies(card)[1].textContent).toContain('Dentist');
  });

  it('keeps the minute within its quarter, and the length, as it moves', async () => {
    const odd = {
      ...DENTIST,
      start: { dateTime: '2026-06-17T14:10:00Z' },
      end: { dateTime: '2026-06-17T14:55:00Z' },
    };
    const { card, writes } = await mount(DETAILS, [odd]);
    drag(block(card, 'Dentist'), [X(0), Y(14, 20)], [X(0), Y(13, 34)]);
    await settle();
    expect(writes()).toEqual([dentistMovedTo('2026-06-17T13:25:00Z', '2026-06-17T14:10:00Z')]);
  });

  it('opens the popover on a click that does not move, and writes nothing', async () => {
    const { card, writes, dialogs } = await mount(DETAILS);
    const dentist = block(card, 'Dentist');
    pointer(dentist, 'pointerdown', X(0), Y(14, 30));
    pointer(dentist, 'pointermove', X(0), Y(14, 33));
    pointer(dentist, 'pointerup', X(0), Y(14, 33));
    await settle();
    expect(dialogs.map(({ dialogParams }) => dialogParams.mode)).toEqual(['event']);
    expect(dialogs[0].dialogParams.moved).toBeUndefined();
    expect(writes()).toEqual([]);
    expect(drawn(card)).toEqual([]);
  });

  it('writes nothing for an event let go where it was taken from', async () => {
    const { card, writes, dialogs } = await mount(DETAILS);
    const dentist = block(card, 'Dentist');
    pointer(dentist, 'pointerdown', X(0), Y(14, 30));
    pointer(dentist, 'pointermove', X(1), Y(16, 30));
    pointer(dentist, 'pointermove', X(0), Y(14, 34));
    pointer(dentist, 'pointerup', X(0), Y(14, 34));
    await settle();
    expect(writes()).toEqual([]);
    expect(dialogs).toEqual([]);
    expect(drawn(card)).toEqual([]);
    expect(origin(card, 'Dentist')).toBeNull();
  });

  it("refuses the browser's text selection and drag while a press may move an event", async () => {
    const { card } = await mount(DETAILS);
    const dentist = block(card, 'Dentist');
    const select = () => {
      const ev = new Event('selectstart', { bubbles: true, composed: true, cancelable: true });
      dentist.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(select()).toBe(false);
    pointer(dentist, 'pointerdown', X(0), Y(14, 30));
    expect(select()).toBe(true);
    pointer(dentist, 'pointerup', X(0), Y(14, 30));
    expect(select()).toBe(false);
  });

  describe('by finger', () => {
    it('lifts on a hold, follows the finger, and refuses its scroll meanwhile', async () => {
      const { card, writes } = await mount(DETAILS);
      const dentist = block(card, 'Dentist');
      const scroll = () => {
        const ev = new Event('touchmove', { bubbles: true, composed: true, cancelable: true });
        dentist.dispatchEvent(ev);
        return ev.defaultPrevented;
      };

      pointer(dentist, 'pointerdown', X(0), Y(14, 30), 'touch');
      expect(scroll()).toBe(false);
      hold();
      expect(drawn(card)).toEqual([bodies(card)[0]]);
      expect(scroll()).toBe(true);

      pointer(dentist, 'pointermove', X(2), Y(9, 30), 'touch');
      pointer(dentist, 'pointerup', X(2), Y(9, 30), 'touch');
      await settle();
      expect(writes()).toEqual([dentistMovedTo('2026-06-19T09:00:00Z', '2026-06-19T10:00:00Z')]);
      expect(scroll()).toBe(false);
    });

    it('is a scroll, moving nothing, when the finger moves before the hold', async () => {
      const { card, writes } = await mount(DETAILS);
      const dentist = block(card, 'Dentist');
      pointer(dentist, 'pointerdown', X(0), Y(14, 30), 'touch');
      pointer(dentist, 'pointermove', X(0), Y(16, 30), 'touch');
      hold();
      pointer(dentist, 'pointermove', X(1), Y(16, 30), 'touch');
      pointer(dentist, 'pointerup', X(1), Y(16, 30), 'touch');
      await settle();
      expect(drawn(card)).toEqual([]);
      expect(writes()).toEqual([]);
    });

    it('runs the hold as it always has, held and let go where it was', async () => {
      const { card, writes, dialogs } = await mount({ ...DETAILS, ...ON_HOLD });
      const dentist = block(card, 'Dentist');
      pointer(dentist, 'pointerdown', X(0), Y(14, 30), 'touch');
      hold();
      pointer(dentist, 'pointermove', X(0), Y(14, 34), 'touch');
      pointer(dentist, 'pointerup', X(0), Y(14, 34), 'touch');
      await settle();
      expect(writes()).toEqual([]);
      expect(dialogs.map(({ dialogParams }) => dialogParams.mode)).toEqual(['event']);
      expect(drawn(card)).toEqual([]);
    });

    it('moves by hold where only the hold opens the popover', async () => {
      const { card, writes } = await mount(ON_HOLD);
      drag(block(card, 'Dentist'), [X(0), Y(14, 30)], [X(0), Y(11, 30)], 'touch');
      await settle();
      expect(writes()).toEqual([dentistMovedTo('2026-06-17T11:00:00Z', '2026-06-17T12:00:00Z')]);
    });
  });

  describe('throwing a move away', () => {
    it.each([
      [
        'Escape',
        () =>
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })),
      ],
      ['a second contact', () => pointer(window, 'pointerdown', X(2), Y(9), 'touch', 2)],
    ])('on %s, writing nothing', async (_name, cancel) => {
      const { card, writes, dialogs } = await mount(DETAILS);
      const dentist = block(card, 'Dentist');
      pointer(dentist, 'pointerdown', X(0), Y(14, 30));
      pointer(dentist, 'pointermove', X(1), Y(16, 30));
      expect(drawn(card)).toHaveLength(1);

      cancel();
      expect(drawn(card)).toEqual([]);
      expect(origin(card, 'Dentist')).toBeNull();
      pointer(dentist, 'pointerup', X(1), Y(16, 30));
      // A browser may still aim the click it derives from the press at the event.
      dentist.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      await settle();
      expect(writes()).toEqual([]);
      expect(dialogs).toEqual([]);
    });

    it('on a canceled pointer, writing nothing', async () => {
      const { card, writes } = await mount(DETAILS);
      const dentist = block(card, 'Dentist');
      pointer(dentist, 'pointerdown', X(0), Y(14, 30));
      pointer(dentist, 'pointermove', X(1), Y(16, 30));
      pointer(dentist, 'pointercancel', X(1), Y(16, 30));
      await settle();
      expect(drawn(card)).toEqual([]);
      expect(writes()).toEqual([]);
    });
  });

  it('stops drawing it where it was dropped after a while, if the refresh is slow', async () => {
    const { card, writes } = await mount(DETAILS);
    holdFetches(card, [DENTIST]);
    drag(block(card, 'Dentist'), [X(0), Y(14, 30)], [X(1), Y(16, 30)]);
    await settle();
    expect(writes()).toHaveLength(1);
    expect(drawn(card)).toEqual([bodies(card)[1]]);

    await vi.advanceTimersByTimeAsync(Constants.TIMING.NEW_EVENT_HOLD - 10);
    expect(drawn(card)).toEqual([bodies(card)[1]]);
    await vi.advanceTimersByTimeAsync(20);
    expect(drawn(card)).toEqual([]);
    expect(all(card, '[data-move-origin]')).toEqual([]);
  });

  it("puts it back, and shows Home Assistant's reason, when the write is refused", async () => {
    const { card, writes, notes } = await mount(DETAILS, [DENTIST], async () => {
      throw { code: 'invalid_format', message: 'Event overlaps a locked slot' };
    });
    drag(block(card, 'Dentist'), [X(0), Y(14, 30)], [X(1), Y(16, 30)]);
    await settle();
    expect(writes()).toHaveLength(1);
    expect(notes).toEqual(['Event overlaps a locked slot']);
    expect(drawn(card)).toEqual([]);
    expect(origin(card, 'Dentist')).toBeNull();
  });

  describe('a repeating event', () => {
    it('opens its popover at the new times on release, and writes nothing itself', async () => {
      const { card, writes, dialogs } = await mount(DETAILS, [SWIM]);
      drag(block(card, 'Swim'), [X(1), Y(9, 30)], [X(2), Y(10, 30)]);
      await settle();

      expect(writes()).toEqual([]);
      expect(dialogs).toHaveLength(1);
      const params = dialogs[0].dialogParams;
      expect(params.mode).toBe('event');
      expect(params.entry?.recurrence_id).toBe('20260618T090000Z');
      expect(params.moved).toEqual({
        allDay: false,
        start: new Date('2026-06-19T10:00:00Z'),
        end: new Date('2026-06-19T11:00:00Z'),
      });
      // Beside where it was dropped, which it stays drawn at while the popover asks.
      expect(params.anchor?.rect).toEqual({ left: 250, right: 350, top: Y(10), bottom: Y(11) });
      expect(drawn(card)).toEqual([bodies(card)[2]]);
      expect(origin(card, 'Swim')).toBe('lifted');

      // Thrown away in the popover: back where it was.
      params.closed?.();
      expect(drawn(card)).toEqual([]);
      expect(origin(card, 'Swim')).toBeNull();
    });

    it('stays where it was dropped once the popover saves it, until the refresh brings it', async () => {
      const { card, dialogs } = await mount(DETAILS, [SWIM]);
      drag(block(card, 'Swim'), [X(1), Y(9, 30)], [X(2), Y(10, 30)]);
      await settle();
      const params = dialogs[0].dialogParams;

      const refresh = holdFetches(card, [SWIM]);
      params.updated(ANNA);
      params.closed?.();
      expect(drawn(card)).toEqual([bodies(card)[2]]);
      expect(origin(card, 'Swim')).toBe('dropped');
      await refresh();
      expect(drawn(card)).toEqual([]);
      expect(all(card, '[data-move-origin]')).toEqual([]);
    });
  });

  describe('what a drag never moves', () => {
    it.each([
      ['events that open nothing', {}, [DENTIST], 'Dentist'],
      [
        'events opened by a Home Assistant action',
        { event_tap_action: { action: 'more-info' } },
        [DENTIST],
        'Dentist',
      ],
      [
        'events the card may not change',
        { ...DETAILS, allow_event_edit: false },
        [DENTIST],
        'Dentist',
      ],
      [
        'a calendar that cannot update events',
        { ...DETAILS, entities: [READ_ONLY] },
        [DENTIST],
        'Dentist',
      ],
      ['an event without a uid', DETAILS, [{ ...DENTIST, uid: undefined }], 'Dentist'],
      ['an event running over two days', DETAILS, [TRIP], 'Night train'],
    ])('%s', async (_name, config, events, title) => {
      const { card, writes, dialogs } = await mount(config, events);
      const target = block(card, title);
      pointer(target, 'pointerdown', X(0), Y(20, 30));
      pointer(target, 'pointermove', X(1), Y(18, 30));
      expect(drawn(card)).toEqual([]);
      pointer(target, 'pointerup', X(1), Y(18, 30));
      await settle();
      expect(writes()).toEqual([]);
      expect(dialogs).toEqual([]);
    });

    it('in list view, where events have no hours to move along', async () => {
      const { card, writes } = await mount({ ...DETAILS, view: 'list' });
      const row = all(card, '.event-interactive')[0];
      pointer(row, 'pointerdown', 100, 100);
      pointer(row, 'pointermove', 100, 200);
      pointer(row, 'pointerup', 100, 200);
      await settle();
      expect(card.shadowRoot!.querySelector('.grid-new-event')).toBeNull();
      expect(writes()).toEqual([]);
    });
  });
});
