import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { FROZEN_NOW, WEATHER } from './fixtures';
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
 * Drawing a new event in a grid (backlog item 136), under the gesture model in
 * docs/architecture.md: with `day_tap_action: add-event`, a finger held on an empty slot of a
 * grid's time area, or a mouse pressed there and dragged at once, draws a new event from that
 * quarter hour to the one under the pointer, across days too, and the popover opens on it at
 * release. Escape, a second contact or a canceled press throws it away. In the all-day band it
 * draws all-day days.
 *
 * happy-dom computes no layout, so each day's header and time area are stubbed to a known
 * geometry: day columns 100 px wide from x = 50, the time areas from y = 80, a pixel a minute
 * over the default band of 07:00 to 22:00. The unit project runs in UTC.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  preview: boolean;
  editMode: boolean;
  events: unknown[];
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
  // An all-day event, so the grid draws its all-day band.
  { summary: 'Sports day', start: { date: '2026-06-18' }, end: { date: '2026-06-19' } },
];

const ADD = { day_tap_action: { action: 'add-event' } } as const;
const AT = (day: number, hour: number, minute = 0) => new Date(2026, 5, day, hour, minute);
const JUNE = (day: number) => new Date(2026, 5, day);

/** The y of a wall-clock time in the stubbed time areas. */
const Y = (hour: number, minute = 0) => 80 + hour * 60 + minute - 7 * 60;
/** The x in the middle of a day's column: 0 is June 17. */
const X = (column: number) => 100 + column * 100;

async function mount(config: Record<string, unknown>, preview = false, events = EVENTS) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.preview = preview;
  card.setConfig({
    entities: [ANNA],
    days_to_show: 3,
    show_empty_days: true,
    view: 'grid',
    ...config,
  });
  card.hass = {
    states: STATES as unknown as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async () => events),
    callService: vi.fn(),
    localize: (key: string) => (key === 'ui.components.calendar.event.add' ? 'Add event' : key),
  } as unknown as Types.Hass;

  const dialogs: PopoverRequest[] = [];
  const hassActions: string[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: PopoverRequest }).detail),
  );
  card.addEventListener('hass-action', (ev) =>
    hassActions.push((ev as Event & { detail: { action: string } }).detail.action),
  );
  document.body.appendChild(card);
  const first = (events[0] as { summary: string }).summary;
  await vi.waitFor(() => expect(card.shadowRoot?.textContent).toContain(first));
  for (const [index, header] of all(card, '.grid-day-header').entries()) {
    placeAt(header, { left: 50 + index * 100, top: 0, width: 100, height: 40 });
  }
  for (const [index, body] of all(card, '.grid-day-body').entries()) {
    placeAt(body, { left: 50 + index * 100, top: 80, width: 100, height: 900 });
  }
  return { card, dialogs, hassActions };
}

const all = <T extends Element = HTMLElement>(card: Card, selector: string): T[] =>
  Array.from(card.shadowRoot!.querySelectorAll<T>(selector));
const bodies = (card: Card) => all(card, '.grid-day-body');
const plane = (card: Card, column: number) =>
  bodies(card)[column].querySelector('.grid-day-plane')!;
/** The new event's block, or its banner, where it is drawn into a day's time area or the band. */
const newBlock = (holder: Element) => holder.querySelector<HTMLElement>('.grid-new-event > .event');
/** Where the new event is drawn: each day's time area holding a block of it, or the band. */
const drawn = (card: Card) =>
  all(card, '.grid-new-event').map(
    (host) => host.closest<HTMLElement>('.grid-day-body') ?? (host.parentElement as HTMLElement),
  );
/** What a day's block of the new event reads, as the grid writes an event's: title, then time. */
const label = (body: HTMLElement) => {
  const block = newBlock(body);
  if (!block) return null;
  const text = (selector: string) =>
    (block.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const time = text('.time-actual');
  return time ? `${text('.event-title')}\n${time}` : text('.event-title');
};

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
  pointerType = 'touch',
  pointerId = 1,
): void {
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
}

const hold = () => vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
const settle = () => vi.advanceTimersByTimeAsync(0);

/** What the popovers opened on a new event asked for, as `[allDay, start, end]`. */
const adds = (dialogs: PopoverRequest[]) =>
  dialogs
    .filter(
      ({ dialogTag, dialogParams }) =>
        dialogTag === EVENT_POPOVER_TAG && dialogParams.mode === 'new',
    )
    .map(({ dialogParams }) => [
      dialogParams.times?.allDay,
      dialogParams.times?.start,
      dialogParams.times?.end,
    ]);

/** Where a day's block of the new event sits, as the grid places any block. */
const piece = (body: HTMLElement) => [
  newBlock(body)!.style.getPropertyValue('--calendar-card-grid-block-top'),
  newBlock(body)!.style.getPropertyValue('--calendar-card-grid-block-height'),
];
const pct = (minutes: number) => `${(minutes / 900) * 100}%`;

/** The new event's banner in the all-day band, as `[its columns, its title]`, or null. */
const bar = (card: Card) => {
  const band = card.shadowRoot!.querySelector<HTMLElement>('.grid-allday-band')!;
  const banner = newBlock(band);
  return banner ? [banner.style.gridColumn, banner.textContent!.trim()] : null;
};

/**
 * Holds every later fetch of the card's events until the test answers it, as a refresh after
 * a save that has not come back yet. Answered at the latest as the test ends, so no request
 * is left waiting into the next one.
 *
 * @param card - The card whose fetches to hold
 * @param events - What the fetches answer with
 * @returns Answers the fetches under way with the events
 */
function holdFetches(card: Card, events: unknown[] = EVENTS): () => Promise<void> {
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

describe('drawing a new event in a grid', () => {
  it('draws with a finger held and dragged, and opens the popover on what it drew', async () => {
    const { card, dialogs } = await mount(ADD);

    pointer(plane(card, 1), 'pointerdown', X(1), Y(10, 5));
    expect(drawn(card)).toEqual([]);
    hold();

    // Held: what a tap there adds, an hour from its quarter, with its times as a label.
    const body = bodies(card)[1];
    expect(drawn(card)).toEqual([body]);
    expect(piece(body)).toEqual([pct(180), pct(60)]);
    expect(label(body)).toBe('New event\n10:00 - 11:00');

    pointer(plane(card, 1), 'pointermove', X(1), Y(12, 20));
    expect(piece(body)).toEqual([pct(180), pct(150)]);
    expect(label(body)).toBe('New event\n10:00 - 12:30');

    pointer(plane(card, 1), 'pointerup', X(1), Y(12, 20));
    await settle();

    expect(adds(dialogs)).toEqual([[false, AT(18, 10), AT(18, 12, 30)]]);
    // Beside the drawn block, not at a point.
    expect(dialogs[0].dialogParams.anchor?.rect).toEqual({
      left: 150,
      right: 250,
      top: Y(10),
      bottom: Y(12, 30),
    });
    // The block stays while the popover adds it, as a "New event" does in a calendar app.
    expect(drawn(card)).toEqual([body]);
  });

  it('adds what a tap would where the finger is held and lifted without moving', async () => {
    const { card, dialogs } = await mount(ADD);
    pointer(plane(card, 2), 'pointerdown', X(2), Y(16, 50));
    hold();
    pointer(plane(card, 2), 'pointerup', X(2), Y(16, 50));
    await settle();
    expect(adds(dialogs)).toEqual([[false, AT(19, 16, 45), AT(19, 17, 45)]]);
  });

  it('draws upward from the first slot, and across days in either direction', async () => {
    const { card, dialogs } = await mount(ADD);

    pointer(plane(card, 1), 'pointerdown', X(1), Y(10));
    hold();
    pointer(plane(card, 1), 'pointermove', X(1), Y(8, 40));
    expect(label(bodies(card)[1])).toBe('New event\n8:30 - 10:15');

    // Across to the day after, past the band's end on the first day.
    pointer(plane(card, 1), 'pointermove', X(2), Y(8, 10));
    expect(drawn(card)).toEqual([bodies(card)[1], bodies(card)[2]]);
    expect(piece(bodies(card)[1])).toEqual([pct(180), pct(720)]);
    expect(piece(bodies(card)[2])).toEqual([pct(0), pct(75)]);
    // As the grid draws any event across days: its start on the first, its title on the next.
    expect(label(bodies(card)[1])).toBe('New event\n10:00');
    expect(label(bodies(card)[2])).toBe('New event');

    // Back across to the day before, through a whole day: the middle one drawn in full.
    pointer(plane(card, 1), 'pointermove', X(0), Y(21, 30));
    expect(drawn(card)).toEqual([bodies(card)[0], bodies(card)[1]]);
    pointer(plane(card, 1), 'pointerup', X(0), Y(21, 30));
    await settle();

    expect(adds(dialogs)).toEqual([[false, AT(17, 21, 30), AT(18, 10, 15)]]);
  });

  it('draws at once with a mouse, which never scrolls or swipes the card', async () => {
    const { card, dialogs } = await mount(ADD);
    pointer(plane(card, 0), 'pointerdown', X(0), Y(9, 5), 'mouse');
    pointer(plane(card, 0), 'pointermove', X(0), Y(11, 40), 'mouse');
    expect(drawn(card)).toEqual([bodies(card)[0]]);
    pointer(plane(card, 0), 'pointerup', X(0), Y(11, 40), 'mouse');
    await settle();
    expect(adds(dialogs)).toEqual([[false, AT(17, 9), AT(17, 11, 45)]]);
  });

  it('leaves a finger that moves before the hold to the browser: nothing drawn, nothing added', async () => {
    const { card, dialogs } = await mount(ADD);
    pointer(plane(card, 0), 'pointerdown', X(0), Y(9));
    pointer(plane(card, 0), 'pointermove', X(0), Y(10));
    hold();
    pointer(plane(card, 0), 'pointermove', X(0), Y(11));
    pointer(plane(card, 0), 'pointerup', X(0), Y(11));
    await settle();
    expect(drawn(card)).toEqual([]);
    expect(adds(dialogs)).toEqual([]);
  });

  it.each([
    ['Escape', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))],
    [
      'a second finger',
      (card: Card) => pointer(plane(card, 1), 'pointerdown', X(2), Y(15), 'touch', 2),
    ],
    ['a canceled press', (card: Card) => pointer(plane(card, 1), 'pointercancel', X(1), Y(12))],
  ])('throws the drawing away on %s', async (_name, cancel) => {
    const { card, dialogs } = await mount(ADD);
    pointer(plane(card, 1), 'pointerdown', X(1), Y(10));
    hold();
    pointer(plane(card, 1), 'pointermove', X(1), Y(12));
    expect(drawn(card)).toHaveLength(1);

    cancel(card);
    expect(drawn(card)).toEqual([]);
    pointer(plane(card, 1), 'pointerup', X(1), Y(12));
    await settle();
    expect(adds(dialogs)).toEqual([]);
  });

  it('throws the drawing away for a second finger on a toolbar control, which keeps its press', async () => {
    const { card, dialogs } = await mount({
      ...ADD,
      toolbar: { show: true, navigation: true, view_switcher: false, add_event: false },
    });
    pointer(plane(card, 1), 'pointerdown', X(1), Y(10));
    hold();
    expect(drawn(card)).toHaveLength(1);

    const segments = all(card, '.date-navigation-segment');
    const next = segments[segments.length - 1];
    pointer(next, 'pointerdown', 10, 10, 'touch', 2);
    expect(drawn(card)).toEqual([]);
    pointer(plane(card, 1), 'pointerup', X(1), Y(12));
    await settle();
    expect(adds(dialogs)).toEqual([]);
  });

  it('throws the drawing away when the card stops showing the days it was drawn on', async () => {
    const { card, dialogs } = await mount(ADD);
    pointer(plane(card, 1), 'pointerdown', X(1), Y(10));
    hold();
    expect(drawn(card)).toHaveLength(1);

    // Another input switches the view while the finger is still down.
    card.setConfig({
      entities: [ANNA],
      days_to_show: 3,
      show_empty_days: true,
      view: 'list',
      ...ADD,
    });
    await card.updateComplete;
    await settle();
    pointer(card.shadowRoot!.querySelector('ha-card')!, 'pointerup', X(1), Y(12));
    await settle();
    expect(adds(dialogs)).toEqual([]);
  });

  it("draws in an element of its own, which the grid's structure observers leave alone", async () => {
    const { card } = await mount(ADD);
    const refits = vi.spyOn(
      card as unknown as { _reconcileGridStructure(): void },
      '_reconcileGridStructure',
    );
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(card.shadowRoot!, { childList: true, subtree: true });

    pointer(plane(card, 0), 'pointerdown', X(0), Y(10));
    hold();
    pointer(plane(card, 0), 'pointermove', X(1), Y(12));
    pointer(plane(card, 0), 'pointermove', X(2), Y(9));
    pointer(plane(card, 0), 'pointercancel', X(2), Y(9));
    await Promise.resolve();
    expect(drawn(card)).toEqual([]);
    observer.disconnect();

    // Whatever came and went in the grid was a host of the new event, three days of it.
    const elements = changes
      .filter(
        (record) => record.target instanceof Element && !record.target.closest('.grid-new-event'),
      )
      .flatMap((record) =>
        [...record.addedNodes, ...record.removedNodes].filter((node) => node instanceof Element),
      );
    expect(elements.length).toBeGreaterThanOrEqual(6);
    expect(elements.every((node) => (node as Element).classList.contains('grid-new-event'))).toBe(
      true,
    );
    expect(refits).not.toHaveBeenCalled();
  });

  it('has its block fitted as the grid fits any block, and forgotten once it goes', async () => {
    const { card } = await mount(ADD);
    pointer(plane(card, 1), 'pointerdown', X(1), Y(10));
    hold();
    await vi.advanceTimersByTimeAsync(50);
    const block = newBlock(bodies(card)[1])!;
    expect(block.dataset.gridTitleFit).toBeDefined();

    const observed = () => [
      ...(
        card as unknown as { _gridDisclosureTargets: Map<Element, Element> }
      )._gridDisclosureTargets.values(),
    ];
    expect(observed()).toContain(block);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(observed()).not.toContain(block);
  });

  it('is drawn raised where it lies over an event, as a block over another is', async () => {
    const { card } = await mount(ADD);
    // The dentist is at 14:00 to 15:00 on the first day. From 15:00, touching it only.
    pointer(plane(card, 0), 'pointerdown', X(0), Y(15), 'mouse');
    pointer(plane(card, 0), 'pointermove', X(0), Y(16), 'mouse');
    const block = () => newBlock(bodies(card)[0])!;
    expect(label(bodies(card)[0])).toBe('New event\n15:00 - 16:15');
    expect(block().classList.contains('grid-event-raised')).toBe(false);
    pointer(plane(card, 0), 'pointermove', X(0), Y(14, 20), 'mouse');
    expect(block().classList.contains('grid-event-raised')).toBe(true);
    expect(bodies(card)[0].querySelector('.grid-new-event > .grid-event-backdrop')).not.toBeNull();
  });

  it("is drawn with its calendar's own options, as that calendar's events are", async () => {
    const { card } = await mount({
      ...ADD,
      entities: [{ entity: ANNA, show_time: false, color: 'rgb(1, 2, 3)' }],
    });
    pointer(plane(card, 1), 'pointerdown', X(1), Y(10));
    hold();
    expect(label(bodies(card)[1])).toBe('New event');
    // Its title in the calendar's own title color, read from the style the grid writes.
    const title = newBlock(bodies(card)[1])!.querySelector('.event-title')!;
    const dentist = bodies(card)[0].querySelector('.grid-day-plane > .grid-event .event-title')!;
    expect(dentist.getAttribute('style')).toContain('rgb(1, 2, 3)');
    expect(title.getAttribute('style')).toBe(dentist.getAttribute('style'));
  });

  it("refuses a finger's scroll only while it draws", async () => {
    const { card } = await mount(ADD);
    const touchmove = () => {
      const ev = new Event('touchmove', { bubbles: true, composed: true, cancelable: true });
      plane(card, 0).dispatchEvent(ev);
      return ev.defaultPrevented;
    };

    pointer(plane(card, 0), 'pointerdown', X(0), Y(10));
    expect(touchmove()).toBe(false);
    hold();
    expect(touchmove()).toBe(true);
    pointer(plane(card, 0), 'pointerup', X(0), Y(10));
    expect(touchmove()).toBe(false);
  });

  it("takes a slot's hold for drawing, and leaves an event's hold to the card", async () => {
    const { card, dialogs, hassActions } = await mount({
      ...ADD,
      hold_action: { action: 'more-info' },
    });
    pointer(plane(card, 0), 'pointerdown', X(0), Y(9));
    hold();
    pointer(plane(card, 0), 'pointerup', X(0), Y(9));
    expect(hassActions).toEqual([]);
    expect(adds(dialogs)).toHaveLength(1);

    const dentist = all(card, '.grid-event').find((el) => el.textContent?.includes('Dentist'))!;
    pointer(dentist, 'pointerdown', X(0), Y(14, 30));
    hold();
    pointer(dentist, 'pointerup', X(0), Y(14, 30));
    expect(hassActions).toEqual(['hold']);
    expect(adds(dialogs)).toHaveLength(1);
  });

  it('draws all-day days in the all-day band, across a banner', async () => {
    const { card, dialogs } = await mount(ADD);
    const band = card.shadowRoot!.querySelector('.grid-allday-band')!;
    const headers = all(card, '.grid-day-header');

    pointer(band, 'pointerdown', X(0), 60);
    hold();
    // A banner in the band's columns, the first of which is the hours' axis, in no row of its
    // own; for today, and not shown as over, an all-day event's end being the day after.
    expect(bar(card)).toEqual(['2 / span 1', 'New event']);
    expect(newBlock(band)!.style.gridRow).toBe('');
    expect(newBlock(band)!.classList.contains('past-event')).toBe(false);
    // Filled as the banner of its calendar beside it is. Read from the style attribute as first
    // drawn: happy-dom parses no color-mix(), and drops one Lit assigns on a later render.
    const fill = (banner: Element) =>
      /background-color:\s*([^;]+)/.exec(banner.getAttribute('style')!)?.[1];
    const sportsDay = all(card, '.grid-allday-band > .grid-banner')[0];
    expect(fill(sportsDay)).toContain('color-mix(');
    expect(fill(newBlock(band)!)).toBe(fill(sportsDay));
    pointer(band, 'pointermove', X(2), 60);
    expect(bar(card)).toEqual(['2 / span 3', 'New event']);
    pointer(band, 'pointerup', X(2), 60);
    await settle();

    expect(adds(dialogs)).toEqual([[true, JUNE(17), JUNE(19)]]);
    // It stays while the popover adds it, follows it, and goes once it closes without saving.
    expect(bar(card)).toEqual(['2 / span 3', 'New event']);
    expect(drawn(card)).toEqual([band]);
    expect(headers.filter((header) => header.hasAttribute('data-add-pressed'))).toEqual([]);
    dialogs[0].dialogParams.changed?.({
      calendarId: ANNA,
      summary: 'Sports camp',
      location: '',
      description: '',
      times: { allDay: true, start: JUNE(18), end: JUNE(19) },
    } as never);
    expect(bar(card)).toEqual(['3 / span 2', 'Sports camp']);
    dialogs[0].dialogParams.closed?.();
    expect(bar(card)).toBeNull();
  });

  it('shows the all-day event a tap in the band adds while the popover is open', async () => {
    const { card, dialogs } = await mount(ADD);
    const band = card.shadowRoot!.querySelector('.grid-allday-band')!;
    pointer(band, 'pointerdown', X(1), 60);
    pointer(band, 'pointerup', X(1), 60);
    await settle();

    expect(adds(dialogs)).toEqual([[true, JUNE(18), JUNE(18)]]);
    expect(bar(card)).toEqual(['3 / span 1', 'New event']);
    dialogs[0].dialogParams.closed?.();
    expect(bar(card)).toBeNull();
  });

  it('draws nothing while the card is edited, nor where a tap on a day does not add', async () => {
    const preview = await mount(ADD, true);
    pointer(plane(preview.card, 0), 'pointerdown', X(0), Y(10));
    hold();
    expect(drawn(preview.card)).toEqual([]);
    pointer(plane(preview.card, 0), 'pointerup', X(0), Y(10));
    await settle();
    expect(adds(preview.dialogs)).toEqual([]);
    document.body.replaceChildren();

    const off = await mount({});
    pointer(plane(off.card, 0), 'pointerdown', X(0), Y(10), 'mouse');
    pointer(plane(off.card, 0), 'pointermove', X(0), Y(12), 'mouse');
    expect(drawn(off.card)).toEqual([]);
  });
});

describe('the new event while the popover adds it', () => {
  /** Draws 10:00 to 12:30 on June 18 and lets go, which opens the popover. */
  async function drawAndRelease(card: Card) {
    pointer(plane(card, 1), 'pointerdown', X(1), Y(10));
    hold();
    pointer(plane(card, 1), 'pointermove', X(1), Y(12, 20));
    pointer(plane(card, 1), 'pointerup', X(1), Y(12, 20));
    await settle();
  }

  const draftOf = (dialogs: PopoverRequest[], changes: Record<string, unknown>) => ({
    calendarId: ANNA,
    summary: '',
    location: '',
    description: '',
    times: dialogs[0].dialogParams.times!,
    ...changes,
  });

  it('follows the title typed and the times set in the popover', async () => {
    const { card, dialogs } = await mount(ADD);
    await drawAndRelease(card);
    const body = bodies(card)[1];

    dialogs[0].dialogParams.changed?.(
      draftOf(dialogs, {
        summary: 'Swim practice',
        times: { allDay: false, start: AT(18, 13), end: AT(18, 14, 30) },
      }) as never,
    );
    expect(drawn(card)).toEqual([body]);
    expect(label(body)).toBe('Swim practice\n13:00 - 14:30');
    expect(piece(body)).toEqual([pct(360), pct(90)]);
  });

  it('takes the color of the calendar picked in the popover', async () => {
    const { card, dialogs } = await mount({
      ...ADD,
      entities: [
        { entity: ANNA, accent_color: 'rgb(204, 51, 102)' },
        { entity: BEN, accent_color: 'rgb(51, 102, 204)' },
      ],
    });
    await drawAndRelease(card);
    const body = bodies(card)[1];
    const color = () =>
      newBlock(body)!.style.getPropertyValue('--calendar-card-event-accent-bar-color');
    expect(color()).toContain('204, 51, 102');

    dialogs[0].dialogParams.changed?.(draftOf(dialogs, { calendarId: BEN }) as never);
    expect(color()).toContain('51, 102, 204');
  });

  it('is painted again by every render, which may change how its label reads', async () => {
    const { card, dialogs } = await mount(ADD);
    pointer(plane(card, 2), 'pointerdown', X(2), Y(9, 20));
    pointer(plane(card, 2), 'pointerup', X(2), Y(9, 20));
    await settle();
    expect(adds(dialogs)).toHaveLength(1);
    const body = bodies(card)[2];
    expect(label(body)).toBe('New event\n9:15 - 10:15');

    card.hass = { ...card.hass, locale: { language: 'de', time_format: '12' } } as Types.Hass;
    await card.updateComplete;
    expect(bodies(card)[2]).toBe(body);
    expect(drawn(card)).toEqual([body]);
    const text = label(body);
    expect(text).toMatch(/^Neuer Termin\n/);
    expect(text).toContain('9:15 AM');
  });

  it('refits nothing when the times leave the hours shown and come back', async () => {
    const { card, dialogs } = await mount(ADD);
    const refits = vi.spyOn(
      card as unknown as { _reconcileGridStructure(): void },
      '_reconcileGridStructure',
    );
    await drawAndRelease(card);
    const body = bodies(card)[1];
    const times = (start: Date, end: Date) =>
      dialogs[0].dialogParams.changed?.(
        draftOf(dialogs, { times: { allDay: false, start, end } }) as never,
      );

    const first = newBlock(body)!;
    const observed = () => [
      ...(
        card as unknown as { _gridDisclosureTargets: Map<Element, Element> }
      )._gridDisclosureTargets.values(),
    ];
    expect(observed()).toContain(first);
    times(AT(18, 23), AT(18, 23, 30));
    await settle();
    expect(newBlock(body)).toBeNull();
    expect(observed()).not.toContain(first);
    times(AT(18, 10), AT(18, 11));
    await settle();
    expect(label(body)).toBe('New event\n10:00 - 11:00');
    expect(refits).not.toHaveBeenCalled();
  });

  it('is drawn with the entry of its calendar the saved event will match, and its text', async () => {
    const { card, dialogs } = await mount({
      ...ADD,
      time_grid: { show_location: true },
      entities: [
        {
          entity: ANNA,
          allowlist: 'Dentist',
          accent_color: 'rgb(204, 51, 102)',
          color: 'rgb(1, 2, 3)',
        },
        {
          entity: ANNA,
          allowlist: 'Swim',
          accent_color: 'rgb(51, 102, 204)',
          replace_pattern: 'Swim',
          replace_with: 'Pool',
        },
      ],
    });
    await drawAndRelease(card);
    const body = bodies(card)[1];
    const accent = () =>
      newBlock(body)!.style.getPropertyValue('--calendar-card-event-accent-bar-color');
    // "New event" passes neither filter: drawn as it stands, with the calendar's first entry.
    expect(label(body)).toBe('New event\n10:00 - 12:30');
    expect(accent()).toBe('rgb(204, 51, 102)');
    expect(newBlock(body)!.querySelector('.event-title')!.getAttribute('style')).toContain(
      'rgb(1, 2, 3)',
    );

    dialogs[0].dialogParams.changed?.(
      draftOf(dialogs, { summary: 'Swim club', location: 'Riverside Pool' }) as never,
    );
    expect(accent()).toBe('rgb(51, 102, 204)');
    expect(label(body)).toBe('Pool club\n10:00 - 12:30');
    expect(newBlock(body)!.textContent).toContain('Riverside Pool');
  });

  it("is drawn by the day, as the grid draws an event's days", async () => {
    // Today is June 17 at 10:00. From 9:00 today to 11:00 tomorrow, with progress bars.
    const { card, dialogs } = await mount({ ...ADD, show_progress_bar: true });
    await drawAndRelease(card);
    dialogs[0].dialogParams.changed?.(
      draftOf(dialogs, { times: { allDay: false, start: AT(17, 9), end: AT(18, 11) } }) as never,
    );
    const [today, tomorrow] = bodies(card);
    // Under way today, so today's block repeats the now line and runs a progress bar; the
    // piece tomorrow has not begun.
    expect(newBlock(today)!.classList.contains('grid-event-now')).toBe(true);
    expect(newBlock(today)!.querySelector('.progress-bar')).not.toBeNull();
    expect(newBlock(tomorrow)!.classList.contains('grid-event-now')).toBe(false);
    expect(newBlock(tomorrow)!.querySelector('.progress-bar')).toBeNull();
  });

  it('shows the weather forecast for its time, as an event there does', async () => {
    const { card } = await mount({
      ...ADD,
      weather: { entity: 'weather.home', position: 'event', event: { show_temp: true } },
    });
    (card as unknown as { weatherForecasts: unknown }).weatherForecasts = WEATHER;
    await card.updateComplete;
    pointer(plane(card, 1), 'pointerdown', X(1), Y(14));
    hold();
    expect(newBlock(bodies(card)[1])!.querySelector('.event-weather')).not.toBeNull();
  });

  it('is drawn as a banner running past the days shown, with its continuation marks', async () => {
    const { card, dialogs } = await mount(ADD);
    const band = card.shadowRoot!.querySelector('.grid-allday-band')!;
    pointer(band, 'pointerdown', X(1), 60);
    pointer(band, 'pointerup', X(1), 60);
    await settle();
    dialogs[0].dialogParams.changed?.(
      draftOf(dialogs, { times: { allDay: true, start: JUNE(15), end: JUNE(22) } }) as never,
    );
    expect(bar(card)).toEqual(['2 / span 3', 'New event']);
    const classes = newBlock(band)!.classList;
    expect([classes.contains('continues-before'), classes.contains('continues-after')]).toEqual([
      true,
      true,
    ]);
  });

  it('is fitted on a grid with no timed event of its own yet', async () => {
    const { card } = await mount(ADD, false, [EVENTS[1]]);
    expect(all(card, '.grid-day-plane > .grid-event')).toEqual([]);
    pointer(plane(card, 1), 'pointerdown', X(1), Y(10));
    hold();
    const observed = [
      ...(
        card as unknown as { _gridDisclosureTargets: Map<Element, Element> }
      )._gridDisclosureTargets.values(),
    ];
    expect(observed).toContain(newBlock(bodies(card)[1]));
  });

  it('is drawn again only when what it spans changes, not on every move', async () => {
    const { card } = await mount(ADD);
    const paints = vi.spyOn(card as unknown as { _paintNew(): void }, '_paintNew');
    pointer(plane(card, 1), 'pointerdown', X(1), Y(10));
    hold();
    paints.mockClear();
    pointer(plane(card, 1), 'pointermove', X(1), Y(11, 1));
    pointer(plane(card, 1), 'pointermove', X(1), Y(11, 5));
    pointer(plane(card, 1), 'pointermove', X(1), Y(11, 10));
    expect(paints).toHaveBeenCalledTimes(1);
    pointer(plane(card, 1), 'pointermove', X(1), Y(11, 20));
    expect(paints).toHaveBeenCalledTimes(2);
  });

  it('goes as soon as the popover closes without saving', async () => {
    const { card, dialogs } = await mount(ADD);
    await drawAndRelease(card);
    expect(drawn(card)).toHaveLength(1);
    dialogs[0].dialogParams.closed?.();
    expect(drawn(card)).toEqual([]);
  });

  it('stays once saved until the refresh after the save brings the real event', async () => {
    const { card, dialogs } = await mount(ADD);
    const answer = holdFetches(card);
    await drawAndRelease(card);
    dialogs[0].dialogParams.updated(ANNA);
    dialogs[0].dialogParams.closed?.();
    expect(drawn(card)).toHaveLength(1);

    // Events that arrive another way may have left before the save, so they do not count.
    card.events = [...card.events];
    await card.updateComplete;
    expect(drawn(card)).toHaveLength(1);

    await answer();
    expect(drawn(card)).toEqual([]);
  });

  it('goes on its own a few seconds after the save if that refresh is slow', async () => {
    const { card, dialogs } = await mount(ADD);
    holdFetches(card);
    await drawAndRelease(card);
    dialogs[0].dialogParams.updated(ANNA);
    dialogs[0].dialogParams.closed?.();
    vi.advanceTimersByTime(Constants.TIMING.NEW_EVENT_HOLD - 1);
    expect(drawn(card)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(drawn(card)).toEqual([]);
  });

  it('goes at once on closing when the real event arrived while the popover was still open', async () => {
    const { card, dialogs } = await mount(ADD);
    const answer = holdFetches(card);
    await drawAndRelease(card);
    dialogs[0].dialogParams.updated(ANNA);
    await answer();
    // Still open: it stays while the popover shows it.
    expect(drawn(card)).toHaveLength(1);
    dialogs[0].dialogParams.closed?.();
    expect(drawn(card)).toEqual([]);
  });

  it('gives way to the next new event, whatever the one before was waiting on', async () => {
    const { card, dialogs } = await mount(ADD);
    const tap = async (column: number, hour: number) => {
      pointer(plane(card, column), 'pointerdown', X(column), Y(hour));
      pointer(plane(card, column), 'pointerup', X(column), Y(hour));
      await settle();
    };

    // Saved and closed, waiting on its event: a tap elsewhere shows its own block, which the
    // first one's timer must not take away while its popover is open.
    await drawAndRelease(card);
    dialogs[0].dialogParams.updated(ANNA);
    dialogs[0].dialogParams.closed?.();
    await tap(2, 9);
    expect(drawn(card)).toEqual([bodies(card)[2]]);
    vi.advanceTimersByTime(Constants.TIMING.NEW_EVENT_HOLD + 1);
    expect(drawn(card)).toEqual([bodies(card)[2]]);
    dialogs[1].dialogParams.closed?.();
    expect(drawn(card)).toEqual([]);

    // Still open when the next one opens: the first popover's closing leaves the next block be.
    await tap(0, 9);
    await tap(2, 11);
    expect(drawn(card)).toEqual([bodies(card)[2]]);
    dialogs[2].dialogParams.closed?.();
    expect(drawn(card)).toEqual([bodies(card)[2]]);
    expect(label(bodies(card)[2])).toBe('New event\n11:00 - 12:00');
  });

  it("gives way to an event the toolbar's button adds, which shows no block", async () => {
    const { card, dialogs } = await mount({ ...ADD, toolbar: { show: true } });
    // The refetch after the save has not answered yet, so the block is still waiting on it.
    holdFetches(card);
    await drawAndRelease(card);
    dialogs[0].dialogParams.updated(ANNA);
    dialogs[0].dialogParams.closed?.();
    expect(drawn(card)).toHaveLength(1);

    card
      .shadowRoot!.querySelector('.add-event-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
    await settle();
    expect(adds(dialogs)).toHaveLength(2);
    expect(drawn(card)).toEqual([]);
  });

  it('shows the hour a tap adds while the popover is open', async () => {
    const { card, dialogs } = await mount(ADD);
    pointer(plane(card, 2), 'pointerdown', X(2), Y(9, 20));
    pointer(plane(card, 2), 'pointerup', X(2), Y(9, 20));
    await settle();

    expect(adds(dialogs)).toEqual([[false, AT(19, 9, 15), AT(19, 10, 15)]]);
    expect(drawn(card)).toEqual([bodies(card)[2]]);
    expect(label(bodies(card)[2])).toBe('New event\n9:15 - 10:15');
    dialogs[0].dialogParams.closed?.();
    expect(drawn(card)).toEqual([]);
  });

  it("refuses the lifting finger's touchend once it opened the popover, and only then", async () => {
    const { card } = await mount(ADD);
    const haCard = card.shadowRoot!.querySelector('ha-card')!;
    const touchend = () => {
      const ev = new Event('touchend', { bubbles: true, composed: true, cancelable: true });
      plane(card, 0).dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(touchend()).toBe(false);

    pointer(plane(card, 0), 'pointerdown', X(0), Y(9));
    pointer(plane(card, 0), 'pointerup', X(0), Y(9));
    expect(touchend()).toBe(true);
    // Once: the next touch is the page's again.
    expect(touchend()).toBe(false);
    expect(haCard.isConnected).toBe(true);

    // A pen sends no touch events, so its lifting leaves the next finger's alone.
    pointer(plane(card, 1), 'pointerdown', X(1), Y(9), 'pen');
    pointer(plane(card, 1), 'pointerup', X(1), Y(9), 'pen');
    expect(touchend()).toBe(false);
  });

  it("leaves touchend alone when a finger's click opens the popover, its touch ended", async () => {
    const { card, dialogs } = await mount({ ...ADD, toolbar: { show: true } });
    const button = card.shadowRoot!.querySelector('.add-event-button')!;
    placeAt(button, { left: 10, top: 10, width: 32, height: 32 });
    // A finger's press that ran nothing, a swipe, leaves nothing armed behind it either.
    pointer(plane(card, 0), 'pointerdown', X(0), Y(9));
    pointer(plane(card, 0), 'pointermove', X(0) + 60, Y(9));
    pointer(plane(card, 0), 'pointerup', X(0) + 60, Y(9));
    expect(dialogs).toEqual([]);
    const click = new MouseEvent('click', { bubbles: true, composed: true, detail: 1 });
    button.dispatchEvent(Object.assign(click, { pointerType: 'touch' }));
    await settle();
    expect(dialogs[0].dialogParams.anchor?.pointerType).toBe('touch');

    const ev = new Event('touchend', { bubbles: true, composed: true, cancelable: true });
    plane(card, 0).dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

/**
 * A grid draws its all-day band only for the all-day events of the days it shows, and a new
 * event is not one of them until it is saved and arrives (backlog item 144). So on days without
 * one, the band opens, one row, while the grid draws a new all-day event, which would otherwise
 * have nowhere to be drawn, and closes once it goes.
 */
describe('the all-day band while a new all-day event is drawn on days without one', () => {
  /** Days whose only event is timed, so the grid draws no all-day band of its own. */
  const TIMED = [EVENTS[0]];

  /** The all-day band, or null where the grid draws none. */
  const bandOf = (card: Card) => card.shadowRoot!.querySelector<HTMLElement>('.grid-allday-band');

  /** Taps 10:00 on June 18, which opens the popover on a timed new event there. */
  async function tapTen(card: Card, pointerType = 'touch') {
    pointer(plane(card, 1), 'pointerdown', X(1), Y(10), pointerType);
    pointer(plane(card, 1), 'pointerup', X(1), Y(10), pointerType);
    await settle();
  }

  /** Answers the popover as its All day switch does, turned on or off again. */
  async function switchAllDay(dialogs: PopoverRequest[], on: boolean) {
    dialogs[0].dialogParams.changed?.({
      calendarId: ANNA,
      summary: '',
      location: '',
      description: '',
      times: on
        ? { allDay: true, start: JUNE(18), end: JUNE(18) }
        : { allDay: false, start: AT(18, 10), end: AT(18, 11) },
    } as never);
    await settle();
  }

  /**
   * Everything that sets the band's height and the rules around it, as the grid writes them:
   * each inline style as written, but for the spaces happy-dom puts around its colons and
   * semicolons once a later render has set it.
   */
  const bandShape = (card: Card) => {
    const style = (element: Element) =>
      element.getAttribute('style')!.replace(/\s*([:;])\s*/g, '$1');
    const band = bandOf(card)!;
    return {
      band: style(band),
      banners: band.querySelectorAll('.grid-banner').length,
      rules: all(card, '.grid-boundary').map((rule) => [rule.className, style(rule)]),
    };
  };

  it('draws no band at rest, while the days hold no all-day event', async () => {
    const { card } = await mount(ADD, false, TIMED);
    expect(bandOf(card)).toBeNull();
    expect(all(card, '.grid-boundary-band-top')).toEqual([]);
  });

  it('opens the band for the new event switched to all day, and draws its banner there', async () => {
    const { card, dialogs } = await mount(ADD, false, TIMED);
    await tapTen(card);
    expect(drawn(card)).toEqual([bodies(card)[1]]);
    expect(bandOf(card)).toBeNull();

    await switchAllDay(dialogs, true);
    const band = bandOf(card)!;
    expect(band).not.toBeNull();
    expect(band.style.gridTemplateRows).toBe('repeat(1, auto)');
    // The new event's banner is all the band holds, and the timed block it was is gone.
    expect(drawn(card)).toEqual([band]);
    expect(bar(card)).toEqual(['3 / span 1', 'New event']);
    expect(all(card, '.grid-allday-band > .grid-banner')).toEqual([]);
    // Closed off above, as any band is.
    expect(all(card, '.grid-boundary-band-top')).toHaveLength(1);
  });

  it('closes it once All day is switched back off, and the timed block returns', async () => {
    const { card, dialogs } = await mount(ADD, false, TIMED);
    await tapTen(card);
    await switchAllDay(dialogs, true);
    expect(bandOf(card)).not.toBeNull();

    await switchAllDay(dialogs, false);
    expect(bandOf(card)).toBeNull();
    expect(all(card, '.grid-boundary-band-top')).toEqual([]);
    expect(drawn(card)).toEqual([bodies(card)[1]]);
    expect(label(bodies(card)[1])).toBe('New event\n10:00 - 11:00');
  });

  it('closes it while the new event lies on days the grid does not show', async () => {
    const { card, dialogs } = await mount(ADD, false, TIMED);
    await tapTen(card);
    await switchAllDay(dialogs, true);
    expect(bandOf(card)).not.toBeNull();

    // Moved to the week after in the popover: nothing of it is drawn, so nothing holds the band.
    dialogs[0].dialogParams.changed?.({
      calendarId: ANNA,
      summary: '',
      location: '',
      description: '',
      times: { allDay: true, start: JUNE(22), end: JUNE(23) },
    } as never);
    await settle();
    expect(drawn(card)).toEqual([]);
    expect(bandOf(card)).toBeNull();

    await switchAllDay(dialogs, true);
    expect(bar(card)).toEqual(['3 / span 1', 'New event']);
  });

  it('closes it when the popover closes without saving, as Cancel does', async () => {
    const { card, dialogs } = await mount(ADD, false, TIMED);
    await tapTen(card);
    await switchAllDay(dialogs, true);
    expect(bandOf(card)).not.toBeNull();

    dialogs[0].dialogParams.closed?.();
    await settle();
    expect(drawn(card)).toEqual([]);
    expect(bandOf(card)).toBeNull();
  });

  it('opens it from the popover itself, and closes it when Escape throws the event away', async () => {
    const { card, dialogs } = await mount(ADD, false, TIMED);
    // With a mouse: a finger's lifting would be refused by the popover it opened, as the
    // ghost of that touch.
    await tapTen(card, 'mouse');
    const popover = document.createElement(EVENT_POPOVER_TAG) as HTMLElement & {
      hass?: Types.Hass;
      showDialog(params: PopoverRequest['dialogParams']): void;
      readonly updateComplete: Promise<boolean>;
    };
    popover.hass = card.hass;
    popover.showDialog(dialogs[0].dialogParams);
    document.body.appendChild(popover);
    await popover.updateComplete;
    const root = popover.shadowRoot!;
    root.querySelector<HTMLButtonElement>('button.cell.time')!.click();
    await popover.updateComplete;
    // The popover's title takes focus as it opens, and happy-dom cannot answer the card's own
    // `activeElement` while focus is in another element's shadow root: it throws, and takes the
    // card's next update with it. Nothing here is about focus, so it is let go.
    (root.activeElement as HTMLElement | null)?.blur();
    const allDay = root.querySelector<HTMLInputElement>('input.switch')!;
    allDay.checked = true;
    allDay.dispatchEvent(new Event('change'));
    await settle();
    expect(bar(card)).toEqual(['3 / span 1', 'New event']);

    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await settle();
    expect(drawn(card)).toEqual([]);
    expect(bandOf(card)).toBeNull();
  });

  it('keeps it once saved until the saved event arrives, whose own banner takes its place', async () => {
    const swimCamp = {
      summary: 'Swim camp',
      start: { date: '2026-06-18' },
      end: { date: '2026-06-19' },
    };
    const { card, dialogs } = await mount(ADD, false, TIMED);
    const answer = holdFetches(card, [...TIMED, swimCamp]);
    await tapTen(card);
    await switchAllDay(dialogs, true);
    dialogs[0].dialogParams.updated(ANNA);
    dialogs[0].dialogParams.closed?.();
    await settle();
    expect(bar(card)).toEqual(['3 / span 1', 'New event']);

    await answer();
    const band = bandOf(card)!;
    expect(band).not.toBeNull();
    expect(drawn(card)).toEqual([]);
    expect(all(card, '.grid-allday-band > .grid-banner').map((b) => b.textContent!.trim())).toEqual(
      ['Swim camp'],
    );
    expect(band.style.gridTemplateRows).toBe('repeat(1, auto)');
  });

  it('closes it a few seconds after the save if the refresh bringing the event is slow', async () => {
    const { card, dialogs } = await mount(ADD, false, TIMED);
    holdFetches(card);
    await tapTen(card);
    await switchAllDay(dialogs, true);
    dialogs[0].dialogParams.updated(ANNA);
    dialogs[0].dialogParams.closed?.();
    await vi.advanceTimersByTimeAsync(Constants.TIMING.NEW_EVENT_HOLD - 1);
    expect(bandOf(card)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(drawn(card)).toEqual([]);
    expect(bandOf(card)).toBeNull();
  });

  it('leaves a band the days draw anyway as it is', async () => {
    const { card, dialogs } = await mount(ADD);
    const band = bandOf(card)!;
    const shape = bandShape(card);
    await tapTen(card);
    await switchAllDay(dialogs, true);
    // The same band, drawn as before, with the new event beside Sports day.
    expect(bandOf(card)).toBe(band);
    expect(bandShape(card)).toEqual({ ...shape, banners: 2 });
    expect(drawn(card)).toEqual([band]);

    dialogs[0].dialogParams.closed?.();
    await settle();
    expect(bandOf(card)).toBe(band);
    expect(bandShape(card)).toEqual(shape);
  });

  it('is one row high, as a band holding one all-day event is', async () => {
    const adding = await mount(ADD, false, TIMED);
    await tapTen(adding.card);
    await switchAllDay(adding.dialogs, true);
    const opened = bandShape(adding.card);
    document.body.replaceChildren();
    localStorage.clear();

    // The same days, with an all-day event of their own on the same day.
    const holding = await mount(ADD);
    expect(opened).toEqual(bandShape(holding.card));
    expect(opened.banners).toBe(1);
  });

  it('is no group, no name and no tab stop while it holds only the new event', async () => {
    // A fixed height is what makes a band a scrolling group of its own.
    const fixed = { ...ADD, height: '360px' };
    const { card, dialogs } = await mount(fixed, false, TIMED);
    await tapTen(card);
    await switchAllDay(dialogs, true);
    const band = bandOf(card)!;
    expect(band).not.toBeNull();
    expect(['role', 'aria-label', 'tabindex'].map((name) => band.getAttribute(name))).toEqual([
      null,
      null,
      null,
    ]);
    document.body.replaceChildren();
    localStorage.clear();

    // One with an all-day event of its own is all three.
    const holding = await mount(fixed);
    expect(
      ['role', 'aria-label', 'tabindex'].map((name) => bandOf(holding.card)!.getAttribute(name)),
    ).toEqual(['group', 'All day', '0']);
  });

  it("opens no band for an event the toolbar's button or the card's own action adds", async () => {
    const { card, dialogs } = await mount(
      { tap_action: { action: 'add-event' }, toolbar: { show: true } },
      false,
      TIMED,
    );
    card
      .shadowRoot!.querySelector('.add-event-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
    await settle();
    await tapTen(card);
    // Neither draws its event, so neither follows the popover's All day switch.
    expect(adds(dialogs)).toHaveLength(2);
    expect(dialogs.map(({ dialogParams }) => dialogParams.changed)).toEqual([undefined, undefined]);
    expect(drawn(card)).toEqual([]);
    expect(bandOf(card)).toBeNull();
  });

  /**
   * Every way the new all-day event can go, on days whose only event is timed, so that a band
   * left open by any of them shows: each opens the band, takes one way out, lets every timer
   * run out, and expects no band but where the days shown hold a real all-day event by then.
   * The ways that redraw the grid or begin another add are taken twice: while the popover is
   * open, and once it has saved and closed, while the drawing waits on the real event.
   */
  describe('on every way the new event goes', () => {
    const CONFIG = { ...ADD, toolbar: { show: true, navigation: true, view_switcher: true } };
    const SWIM_CAMP = {
      summary: 'Swim camp',
      start: { date: '2026-06-18' },
      end: { date: '2026-06-19' },
    };

    type Phase = 'popover open' | 'saved, waiting';
    interface Exit {
      card: Card;
      dialogs: PopoverRequest[];
      phase: Phase;
    }

    /** Lets a render, the fetch it starts and the render after it land. */
    async function land(card: Card) {
      await settle();
      await card.updateComplete;
      await settle();
    }

    /** Presses the toolbar's previous or next segment, and lets that page's events land. */
    async function page(card: Card, which: 'previous' | 'next') {
      const [previous, , next] = all<HTMLButtonElement>(card, '.date-navigation-segment');
      (which === 'previous' ? previous : next).click();
      await land(card);
    }

    /** Sets the configuration the card was mounted with, and more. */
    async function reconfigure(card: Card, changes: Record<string, unknown>) {
      card.setConfig({
        entities: [ANNA],
        days_to_show: 3,
        show_empty_days: true,
        view: 'grid',
        ...CONFIG,
        ...changes,
      });
      await land(card);
    }

    /**
     * Saves the new event and closes the popover, the refresh after the save not answered yet.
     *
     * @returns Answers that refresh, with the days' timed event only, as at the latest the test
     *   ending does
     */
    async function saveUnanswered(card: Card, dialogs: PopoverRequest[]) {
      const waiting: Array<(events: unknown) => void> = [];
      vi.mocked(card.hass.callApi).mockImplementationOnce(
        () => new Promise((resolve) => waiting.push(resolve)),
      );
      const release = () => {
        for (const resolve of waiting.splice(0)) resolve(TIMED);
      };
      onTestFinished(release);
      dialogs[0].dialogParams.updated(ANNA);
      dialogs[0].dialogParams.closed?.();
      await settle();
      expect(waiting).toHaveLength(1);
      return release;
    }

    /** The real popover on the first add, its title let go of focus as the Escape test explains. */
    async function realPopover(card: Card, dialogs: PopoverRequest[]) {
      const popover = document.createElement(EVENT_POPOVER_TAG) as HTMLElement & {
        hass?: Types.Hass;
        showDialog(params: PopoverRequest['dialogParams']): void;
        readonly updateComplete: Promise<boolean>;
      };
      popover.hass = card.hass;
      popover.showDialog(dialogs[0].dialogParams);
      document.body.appendChild(popover);
      // It focuses its title once drawn in place, an update after it opens.
      await popover.updateComplete;
      await settle();
      const root = popover.shadowRoot!;
      (root.activeElement as HTMLElement | null)?.blur();
      return root;
    }

    /** The banners of the days' own all-day events in the band, by title. */
    const realBanners = (card: Card) =>
      all(card, '.grid-allday-band > .grid-banner').map((banner) => banner.textContent!.trim());
    /** The days the grid shows, as their headers read. */
    const days = (card: Card) =>
      all(card, '.grid-day-header').map((header) =>
        header.textContent!.replace(/\s+/g, ' ').trim(),
      );

    const BOTH: Phase[] = ['popover open', 'saved, waiting'];
    const EXITS: Array<[string, Phase[], (exit: Exit) => Promise<void>]> = [
      [
        'paging to the next week and back',
        BOTH,
        async ({ card }) => {
          const home = days(card);
          await page(card, 'next');
          expect(days(card)).not.toEqual(home);
          expect(bandOf(card)).toBeNull();
          await page(card, 'previous');
          expect(days(card)).toEqual(home);
        },
      ],
      [
        'switching to the list view and back',
        BOTH,
        async ({ card }) => {
          all<HTMLButtonElement>(card, '.view-switcher-segment[data-view="list"]')[0].click();
          await land(card);
          expect(card.shadowRoot!.querySelector('.grid-container')).toBeNull();
          all<HTMLButtonElement>(card, '.view-switcher-segment[data-view="grid"]')[0].click();
          await land(card);
        },
      ],
      [
        'the dashboard going into edit mode and out',
        BOTH,
        async ({ card }) => {
          card.editMode = true;
          await land(card);
          expect(bandOf(card)).toBeNull();
          card.editMode = false;
          await land(card);
        },
      ],
      [
        "the card becoming the editor's preview and back",
        BOTH,
        async ({ card }) => {
          card.preview = true;
          await land(card);
          expect(bandOf(card)).toBeNull();
          card.preview = false;
          await land(card);
        },
      ],
      [
        'a configuration showing other days',
        BOTH,
        async ({ card }) => {
          await reconfigure(card, { days_to_show: 5 });
        },
      ],
      [
        'a configuration showing the same days, and then the popover closing or the wait ending',
        BOTH,
        async ({ card, dialogs, phase }) => {
          await reconfigure(card, { title: 'Family' });
          // The same days, and the new event still drawn on them, in the band opened for it.
          expect(drawn(card)).toEqual([bandOf(card)]);
          if (phase === 'popover open') dialogs[0].dialogParams.closed?.();
          else await vi.advanceTimersByTimeAsync(Constants.TIMING.NEW_EVENT_HOLD);
          await land(card);
        },
      ],
      [
        'a second add, tapped in the time grid',
        BOTH,
        async ({ card, dialogs }) => {
          pointer(plane(card, 2), 'pointerdown', X(2), Y(9));
          pointer(plane(card, 2), 'pointerup', X(2), Y(9));
          await settle();
          expect(drawn(card)).toEqual([bodies(card)[2]]);
          expect(bandOf(card)).toBeNull();
          dialogs[dialogs.length - 1].dialogParams.closed?.();
          await settle();
        },
      ],
      [
        "a second add, from the toolbar's button",
        BOTH,
        async ({ card, dialogs }) => {
          card
            .shadowRoot!.querySelector('.add-event-button')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
          await settle();
          expect(adds(dialogs)).toHaveLength(2);
        },
      ],
      [
        'a second add, drawn in the band opened for the first and thrown away with Escape',
        BOTH,
        async ({ card }) => {
          const band = bandOf(card)!;
          pointer(band, 'pointerdown', X(0), 60);
          hold();
          // The band stays open for the event drawn now, beside nothing of the first one.
          expect(bar(card)).toEqual(['2 / span 1', 'New event']);
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          pointer(band, 'pointerup', X(0), 60);
          await settle();
        },
      ],
      [
        'Cancel',
        ['popover open'],
        async ({ dialogs }) => {
          dialogs[0].dialogParams.closed?.();
          await settle();
        },
      ],
      [
        'Escape in the popover',
        ['popover open'],
        async ({ card, dialogs }) => {
          const root = await realPopover(card, dialogs);
          root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
          await settle();
        },
      ],
    ];

    it.each(
      EXITS.flatMap(([name, phases, exit]) =>
        phases.map((phase) => [`${name} (${phase})`, phase, exit] as const),
      ),
    )('%s', async (_name, phase, exit) => {
      const { card, dialogs } = await mount(CONFIG, false, TIMED);
      await tapTen(card);
      await switchAllDay(dialogs, true);
      expect(drawn(card)).toEqual([bandOf(card)]);
      if (phase === 'saved, waiting') {
        await saveUnanswered(card, dialogs);
        expect(drawn(card)).toEqual([bandOf(card)]);
      }

      await exit({ card, dialogs, phase });
      expect(drawn(card)).toEqual([]);
      expect(bandOf(card)).toBeNull();

      await vi.advanceTimersByTimeAsync(Constants.TIMING.NEW_EVENT_HOLD);
      await land(card);
      expect(drawn(card)).toEqual([]);
      expect(bandOf(card)).toBeNull();
    });

    it("a save whose refresh brings the event: the band is then the event's own", async () => {
      const { card, dialogs } = await mount(CONFIG, false, TIMED);
      const answer = holdFetches(card, [...TIMED, SWIM_CAMP]);
      await tapTen(card);
      await switchAllDay(dialogs, true);
      dialogs[0].dialogParams.updated(ANNA);
      dialogs[0].dialogParams.closed?.();
      await answer();
      expect(drawn(card)).toEqual([]);
      expect(realBanners(card)).toEqual(['Swim camp']);

      // Present only while the days shown hold a real all-day event: not on the next week.
      vi.mocked(card.hass.callApi).mockImplementation(async () => [...TIMED, SWIM_CAMP]);
      await page(card, 'next');
      expect(bandOf(card)).toBeNull();
      await page(card, 'previous');
      await vi.advanceTimersByTimeAsync(Constants.TIMING.NEW_EVENT_HOLD);
      await land(card);
      expect(drawn(card)).toEqual([]);
      expect(realBanners(card)).toEqual(['Swim camp']);
      expect(bandOf(card)!.style.gridTemplateRows).toBe('repeat(1, auto)');
    });

    it('a save whose refresh does not bring the event yet: the band goes as it commits', async () => {
      const { card, dialogs } = await mount(CONFIG, false, TIMED);
      const answer = holdFetches(card, TIMED);
      await tapTen(card);
      await switchAllDay(dialogs, true);
      dialogs[0].dialogParams.updated(ANNA);
      dialogs[0].dialogParams.closed?.();
      await settle();
      expect(drawn(card)).toEqual([bandOf(card)]);

      // The refresh after the save is the one that counts, whatever it holds (`_newArrived`).
      await answer();
      expect(drawn(card)).toEqual([]);
      expect(bandOf(card)).toBeNull();
      await vi.advanceTimersByTimeAsync(Constants.TIMING.NEW_EVENT_HOLD);
      await land(card);
      expect(bandOf(card)).toBeNull();
    });

    it('a save whose refresh is slow: the band goes as the wait ends, and stays gone', async () => {
      const { card, dialogs } = await mount(CONFIG, false, TIMED);
      await tapTen(card);
      await switchAllDay(dialogs, true);
      const answer = await saveUnanswered(card, dialogs);
      await vi.advanceTimersByTimeAsync(Constants.TIMING.NEW_EVENT_HOLD - 1);
      expect(drawn(card)).toEqual([bandOf(card)]);
      await vi.advanceTimersByTimeAsync(1);
      await land(card);
      expect(drawn(card)).toEqual([]);
      expect(bandOf(card)).toBeNull();

      // The refresh landing at last, without the event, opens nothing again.
      answer();
      await land(card);
      expect(drawn(card)).toEqual([]);
      expect(bandOf(card)).toBeNull();
    });
  });
});
