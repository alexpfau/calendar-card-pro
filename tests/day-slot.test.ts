import { afterEach, describe, expect, it, vi } from 'vitest';

import * as AddEvent from '../src/interaction/add-event';
import * as Activation from '../src/rendering/activation';

/**
 * Where a press lands, read without a card: the walk from a press's composed path to a day
 * and, in a grid's time area, a quarter hour (`findDayHit`), and the calendar a new event starts in.
 * The card-level behavior is in `day-tap-add.test.ts`; these pin the rules themselves, on
 * stand-in elements with known rects, so an edge such as a band ending at 24:00 or a press
 * in a gutter is a case rather than a coincidence of layout.
 */

/** A stand-in element: a rect, a slot, children. */
function node(
  slot: Activation.DaySlot | undefined,
  rect = { left: 0, top: 0, width: 0, height: 0 },
  children: Element[] = [],
): Element {
  const element = document.createElement('div');
  for (const child of children) element.appendChild(child);
  (element as Activation.DaySlotElement).calendarCardDaySlot = slot;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  } as DOMRect);
  return element;
}

const DAY = (day: number) => new Date(2026, 5, day).getTime();
const at = (x: number, y: number) => ({ x, y });

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('minuteAt', () => {
  const rect = { top: 100, height: 900 };

  it('maps the area linearly over its minutes, rounding down to the quarter hour', () => {
    // 07:00 to 22:00, 900 minutes over 900 px: a pixel a minute.
    expect(Activation.minuteAt(rect, 100, 420, 1320)).toBe(420);
    expect(Activation.minuteAt(rect, 100 + 14, 420, 1320)).toBe(420);
    expect(Activation.minuteAt(rect, 100 + 15, 420, 1320)).toBe(435);
    expect(Activation.minuteAt(rect, 100 + 59, 420, 1320)).toBe(465);
    expect(Activation.minuteAt(rect, 100 + 405, 420, 1320)).toBe(825);
  });

  it('snaps to quarters of the clock, not of the band', () => {
    // A band from 07:10: its first pixel is 07:10, in the quarter that began at 07:00.
    expect(Activation.minuteAt(rect, 100, 430, 1330)).toBe(420);
    expect(Activation.minuteAt(rect, 100 + 5, 430, 1330)).toBe(435);
  });

  it('gives the lower edge to the last slot, so a band ending at 24:00 never answers midnight', () => {
    expect(Activation.minuteAt(rect, 1000, 420, 1320)).toBe(1305);
    expect(Activation.minuteAt(rect, 1000, 0, 1440)).toBe(1425);
  });

  it('clamps a point outside the area to its edges', () => {
    expect(Activation.minuteAt(rect, 0, 420, 1320)).toBe(420);
    expect(Activation.minuteAt(rect, 5000, 420, 1320)).toBe(1305);
  });

  it('answers the first slot for an area with no height', () => {
    expect(Activation.minuteAt({ top: 0, height: 0 }, 50, 450, 1320)).toBe(450);
  });
});

describe('spanPct', () => {
  it('places a span in the area, in percent', () => {
    expect(Activation.spanPct(540, 600, { startMin: 420, endMin: 1320 })).toEqual({
      topPct: (120 / 900) * 100,
      heightPct: (60 / 900) * 100,
    });
  });

  it('clips a span the area shows only part of, at either edge', () => {
    // The band starts at 07:30, so it shows the last half of seven o'clock.
    expect(Activation.spanPct(420, 480, { startMin: 450, endMin: 1320 })).toEqual({
      topPct: 0,
      heightPct: (30 / 870) * 100,
    });
    expect(Activation.spanPct(1290, 1440, { startMin: 420, endMin: 1320 })).toEqual({
      topPct: (870 / 900) * 100,
      heightPct: (30 / 900) * 100,
    });
    expect(Activation.spanPct(0, 300, { startMin: 420, endMin: 1320 }).heightPct).toBe(0);
  });
});

describe('nearestDayAt', () => {
  const bodies = () => [
    node(Activation.timeSlot(DAY(17), 420, 1320), { left: 50, top: 0, width: 100, height: 900 }),
    node(Activation.timeSlot(DAY(18), 420, 1320), { left: 160, top: 0, width: 100, height: 900 }),
  ];

  it('takes the day whose column holds the point', () => {
    const [first, second] = bodies();
    expect(Activation.nearestDayAt([first, second], 200)).toEqual({
      element: second,
      timestamp: DAY(18),
      band: { startMin: 420, endMin: 1320 },
    });
    expect(Activation.nearestDayAt([first, second], 200)?.element).toBe(second);
  });

  it('keeps to the nearest day past the first or last column, and in a gutter', () => {
    const [first, second] = bodies();
    expect(Activation.nearestDayAt([first, second], 0)?.element).toBe(first);
    expect(Activation.nearestDayAt([first, second], 900)?.element).toBe(second);
    expect(Activation.nearestDayAt([first, second], 152)?.element).toBe(first);
    expect(Activation.nearestDayAt([first, second], 158)?.element).toBe(second);
  });

  it('reads a day header as a day, and nothing else at all', () => {
    const header = node(Activation.daySlot(DAY(19)), { left: 0, top: 0, width: 100, height: 40 });
    expect(Activation.nearestDayAt([node(undefined), header], 50)).toEqual({
      element: header,
      timestamp: DAY(19),
    });
    expect(Activation.nearestDayAt([node(Activation.COVERED)], 50)).toBeUndefined();
  });
});

describe('findDayHit', () => {
  it("finds a day's own element, innermost first", () => {
    const inner = node(undefined);
    const day = node(Activation.daySlot(DAY(18)));
    const hit = Activation.findDayHit([inner, day], null, at(0, 0));
    // `toBe` on the element: `toEqual` compares DOM nodes by `isEqualNode`, which two empty
    // stand-ins pass whichever one was found.
    expect(hit?.element).toBe(day);
    expect(hit).toEqual({ element: day, timestamp: DAY(18) });
  });

  it('stops at an event, which covers its day, and at a tappable event too', () => {
    const day = node(Activation.daySlot(DAY(18)));
    const covered = node(Activation.COVERED);
    expect(Activation.findDayHit([covered, day], null, at(0, 0))).toBeUndefined();

    const tappable = node(undefined) as Activation.TappableEventElement;
    tappable.calendarCardEventTap = { event: {} as never, color: undefined };
    expect(Activation.findDayHit([tappable, day], null, at(0, 0))).toBeUndefined();
  });

  it('walks past events when asked, for where a hold landed', () => {
    const day = node(Activation.daySlot(DAY(18)));
    const covered = node(Activation.COVERED);
    expect(Activation.findDayHit([covered, day], null, at(0, 0), true)?.timestamp).toBe(DAY(18));
  });

  it('stops at the boundary', () => {
    const boundary = node(undefined);
    const day = node(Activation.daySlot(DAY(18)));
    expect(Activation.findDayHit([boundary, day], boundary, at(0, 0))).toBeUndefined();
  });

  it("reads a time area's quarter hour from the pointer", () => {
    const body = node(Activation.timeSlot(DAY(19), 420, 1320), {
      left: 0,
      top: 0,
      width: 100,
      height: 1500,
    });
    const hit = Activation.findDayHit([body], null, at(50, 750));
    expect(hit?.element).toBe(body);
    expect(hit).toEqual({
      element: body,
      timestamp: DAY(19),
      minute: 870,
      band: { startMin: 420, endMin: 1320 },
    });
  });

  it("finds the day under a short column's empty space by its column, not in a gutter or above", () => {
    const first = node(Activation.daySlot(DAY(17)), { left: 0, top: 40, width: 100, height: 50 });
    const second = node(Activation.daySlot(DAY(18)), {
      left: 110,
      top: 40,
      width: 100,
      height: 80,
    });
    const weekNumbers = node(undefined, { left: 0, top: 0, width: 100, height: 30 });
    const grid = node(
      Activation.COLUMNS_AMONG_CHILDREN,
      { left: 0, top: 0, width: 210, height: 300 },
      [weekNumbers, first, second],
    );

    const hit = Activation.findDayHit([grid], null, at(150, 280));
    expect(hit?.element).toBe(second);
    expect(hit?.timestamp).toBe(DAY(18));
    // Column view's empty space adds a timed event; only the grid's band adds an all-day one.
    expect(hit?.allDay).toBeUndefined();
    expect(Activation.findDayHit([grid], null, at(105, 280))).toBeUndefined();
    expect(Activation.findDayHit([grid], null, at(150, 20))).toBeUndefined();
  });

  it("finds a grid band's day among its siblings, by the header rather than the time area", () => {
    const header = node(Activation.daySlot(DAY(18)), { left: 100, top: 0, width: 100, height: 40 });
    const body = node(Activation.timeSlot(DAY(18), 420, 1320), {
      left: 100,
      top: 80,
      width: 100,
      height: 900,
    });
    const band = node(Activation.COLUMNS_AMONG_SIBLINGS, {
      left: 0,
      top: 40,
      width: 300,
      height: 40,
    });
    node(undefined, undefined, [body, band, header]);

    // The header, not the time area in the same column: the header is what a press in the
    // band washes, and the time area would wash nothing, having no hour to show. A press in
    // the band adds an all-day event, which the hit says.
    const hit = Activation.findDayHit([band], null, at(150, 60));
    expect(hit?.element).toBe(header);
    expect(hit).toEqual({ element: header, timestamp: DAY(18), allDay: true });
  });

  it('finds no day where nothing is marked', () => {
    expect(
      Activation.findDayHit([node(undefined), node(undefined)], null, at(0, 0)),
    ).toBeUndefined();
  });
});

describe('findDayAdd', () => {
  it("finds the day's add button a press began in", () => {
    const button = node(undefined) as Activation.DayAddButtonElement;
    button.calendarCardDayAdd = DAY(18);
    const inner = node(undefined);
    const hit = Activation.findDayAdd([inner, button], null);
    expect(hit?.element).toBe(button);
    expect(hit?.timestamp).toBe(DAY(18));
    expect(Activation.findDayAdd([inner], null)).toBeUndefined();
  });
});

describe('preselectedCalendarId', () => {
  it('takes the first writable calendar the legend shows', () => {
    expect(AddEvent.preselectedCalendarId(['calendar.anna', 'calendar.ben'], new Set())).toBe(
      'calendar.anna',
    );
    expect(
      AddEvent.preselectedCalendarId(['calendar.anna', 'calendar.ben'], new Set(['calendar.anna'])),
    ).toBe('calendar.ben');
  });

  it('takes the first writable one when the legend hides them all, and none when there is none', () => {
    expect(
      AddEvent.preselectedCalendarId(
        ['calendar.anna', 'calendar.ben'],
        new Set(['calendar.anna', 'calendar.ben']),
      ),
    ).toBe('calendar.anna');
    expect(AddEvent.preselectedCalendarId([], new Set())).toBeUndefined();
  });
});
