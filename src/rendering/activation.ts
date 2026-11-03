/**
 * Marks a rendered event as a tap target of the card's gesture recognizer.
 *
 * The card's gestures live on `ha-card`, which captures the pointer on `pointerdown` so a
 * hold survives the finger slipping past the card's edge. That capture also retargets the
 * `click` a browser derives from the gesture to `ha-card`, so an event cannot recognize its
 * own taps: the recognizer reads which event the pointer landed on from the pointer-down's
 * composed path, and decides at pointer-up whether the gesture was a tap on it, a tap on the
 * card or a hold. An event therefore stops nothing. It only carries what it is, under a
 * property the recognizer looks for, plus the role and tab stop that make it a button and
 * the reference to its day's header that describes it.
 *
 * Days are marked the same way, for adding an event where a press lands (`DaySlot`): each
 * view's day element says which day it is, a grid body which hours it spans, and every
 * event that it covers the day beneath it.
 */

import * as Types from '../config/types';

/** What a tap on one rendered event acts on. */
export interface EventTapTarget {
  /** The rendered event. */
  readonly event: Types.CalendarEventData;
  /** The accent color it is drawn in, which Home Assistant's detail dialog is handed. */
  readonly color: string | undefined;
}

/**
 * A rendered element that may carry a tap target.
 *
 * The property is set through a Lit property binding, so it leaves no trace in the markup:
 * with taps off the DOM is exactly what it was without the feature.
 */
export interface TappableEventElement extends Element {
  calendarCardEventTap?: EventTapTarget;
}

/**
 * The tap target one rendered event carries, or undefined to leave it inert.
 *
 * Undefined keeps the event's markup exactly as it is without the feature: every binding
 * that consumes this resolves to `nothing`, which Lit renders as no attribute at all.
 * Empty-day placeholders are never tap targets; they stand for no event.
 *
 * @param event - The rendered event
 * @param color - The accent color it is drawn in
 * @param tappable - Whether events are tap targets at all
 * @returns The tap target, or undefined
 */
export function eventTapTarget(
  event: Types.CalendarEventData,
  color: string | undefined,
  tappable: boolean,
): EventTapTarget | undefined {
  if (!tappable || event._isEmptyDay) return undefined;
  return { event, color };
}

/**
 * The id a day's header carries while events are tap targets, so each of the day's events
 * can name its day with `aria-describedby`.
 *
 * Two events with the same title and time on different days are otherwise announced
 * identically. The id is only ever drawn while events are tap targets, so the default
 * markup gains nothing. It is unique within the card's shadow root, which is the scope an
 * `aria-describedby` reference resolves in: every view draws one header per day, and the
 * id is the day's own local date.
 *
 * @param timestamp - The day's local midnight, as grouping stamps it
 * @returns The header's id
 */
export function dayLabelId(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `calendar-card-day-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The tap target a node carries, if it is a tappable event itself.
 *
 * @param node - Any event target
 * @returns Its tap target, or undefined
 */
export function tapTargetOn(node: EventTarget | null | undefined): EventTapTarget | undefined {
  return (node as TappableEventElement | null | undefined)?.calendarCardEventTap;
}

/**
 * The tappable event an input event started on: the element that carries it, and what a tap
 * on it acts on.
 */
export interface EventTapHit {
  /** The rendered event's element, which keeps its identity when the card re-renders. */
  readonly element: EventTarget;
  readonly target: EventTapTarget;
}

/**
 * The tappable event an input event started on, read from its composed path.
 *
 * The walk stops at `boundary`, the element the recognizer listens on, so nothing outside
 * the card can be mistaken for one of its events.
 *
 * @param path - The input event's composed path, innermost first
 * @param boundary - Where the walk ends, exclusive
 * @returns The event's element and tap target, or undefined when it started on none
 */
export function findEventTap(
  path: ReadonlyArray<EventTarget>,
  boundary: EventTarget | null,
): EventTapHit | undefined {
  for (const node of path) {
    if (node === boundary) return undefined;
    const target = tapTargetOn(node);
    if (target) return { element: node, target };
  }
  return undefined;
}

/** The class every link drawn in an event row carries (`open_links`). */
export const ROW_LINK_CLASS = 'event-link';

/**
 * Whether an input event started on a link drawn in an event row, read from its composed path.
 *
 * Such a press is the link's: the browser follows it, and the card arms nothing for it, so a
 * tap on a link never runs the card's tap and a hold never its hold. Stops at `boundary`, like
 * `findEventTap`.
 *
 * @param path - The input event's composed path, innermost first
 * @param boundary - Where the walk ends, exclusive
 * @returns True when the press began on a row's link
 */
export function startsOnRowLink(
  path: ReadonlyArray<EventTarget>,
  boundary: EventTarget | null,
): boolean {
  for (const node of path) {
    if (node === boundary) return false;
    if (
      (node as Element).localName === 'a' &&
      (node as Element).classList?.contains(ROW_LINK_CLASS)
    ) {
      return true;
    }
  }
  return false;
}

//-----------------------------------------------------------------------------
// DAYS
//-----------------------------------------------------------------------------

/**
 * What a press on one rendered element stands for, when a press there may add an event.
 *
 * - `day`: the element is one day's own, and its empty parts add on that day: a list day, a
 *   column-view day column, a grid day header.
 * - `time`: a grid day's time area, which adds at the hour under the pointer.
 * - `columns`: space that belongs to no day element, under a short column-view column or in
 *   a grid's all-day band, whose day is the one whose column the pointer is in. `among`
 *   names where those columns are: the element's children, or its siblings.
 * - `covered`: an event, or a grid `+N` block standing for several. It covers the day
 *   beneath it, so a press on it never adds there.
 *
 * Set through a Lit property binding like the tap target, so it leaves no trace in the markup.
 */
export type DaySlot =
  | { readonly kind: 'day'; readonly timestamp: number }
  | {
      readonly kind: 'time';
      readonly timestamp: number;
      /** First minute of the day the area shows, from midnight. */
      readonly startMin: number;
      /** Minute the area ends at, from midnight, exclusive. */
      readonly endMin: number;
    }
  | { readonly kind: 'columns'; readonly among: 'children' | 'siblings' }
  | { readonly kind: 'covered' };

/** A rendered element that may carry a day slot. */
export interface DaySlotElement extends Element {
  calendarCardDaySlot?: DaySlot;
}

/** The slot every event and `+N` block carries. */
export const COVERED: DaySlot = Object.freeze({ kind: 'covered' });

/** The slot of a column-view grid, whose day columns are its children. */
export const COLUMNS_AMONG_CHILDREN: DaySlot = Object.freeze({
  kind: 'columns',
  among: 'children',
});

/** The slot of a grid's all-day band, whose day headers and bodies are its siblings. */
export const COLUMNS_AMONG_SIBLINGS: DaySlot = Object.freeze({
  kind: 'columns',
  among: 'siblings',
});

/**
 * One day's own slot.
 *
 * @param timestamp - The day's local midnight, as grouping stamps it
 * @returns The slot
 */
export function daySlot(timestamp: number): DaySlot {
  return { kind: 'day', timestamp };
}

/**
 * The slot of one day's time area in a grid.
 *
 * @param timestamp - The day's local midnight
 * @param startMin - First minute the area shows, from midnight
 * @param endMin - Minute it ends at, exclusive
 * @returns The slot
 */
export function timeSlot(timestamp: number, startMin: number, endMin: number): DaySlot {
  return { kind: 'time', timestamp, startMin, endMin };
}

/**
 * The slot a node carries, if any.
 *
 * @param node - Any event target
 * @returns Its slot, or undefined
 */
export function daySlotOn(node: EventTarget | null | undefined): DaySlot | undefined {
  return (node as DaySlotElement | null | undefined)?.calendarCardDaySlot;
}

/** Where a press landed, for adding an event there. */
export interface DayHit {
  /**
   * The day's element: a list day, a column-view day column, a grid header or time area.
   * What the recognizer marks while the press is down, so the day it would add on is washed.
   */
  readonly element: Element;
  /** The day's local midnight. */
  readonly timestamp: number;
  /** The hour under the pointer, for a press in a grid's time area; otherwise undefined. */
  readonly hour?: number;
  /** The minutes the time area spans, for a press in one. */
  readonly band?: { readonly startMin: number; readonly endMin: number };
}

/** A pointer position in viewport coordinates, as a pointer event carries it. */
export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The hour a point in a grid's time area falls in.
 *
 * The area's scale is linear in wall-clock minutes from `startMin` to `endMin`, as the
 * blocks in it are placed (`computeEventPlacement` in `utils/grid.ts`). A point on the
 * area's lower edge belongs to its last hour, so an area ending at `24:00` never answers 24.
 *
 * @param rect - The area's client rect
 * @param y - The pointer's viewport y
 * @param startMin - First minute the area shows
 * @param endMin - Minute it ends at, exclusive
 * @returns The hour, 0 to 23
 */
export function hourAt(
  rect: { top: number; height: number },
  y: number,
  startMin: number,
  endMin: number,
): number {
  const span = endMin - startMin;
  if (!(rect.height > 0) || !(span > 0))
    return Math.min(23, Math.max(0, Math.floor(startMin / 60)));

  const share = Math.min(1, Math.max(0, (y - rect.top) / rect.height));
  const minute = Math.min(endMin - 1, startMin + share * span);
  return Math.min(23, Math.max(0, Math.floor(minute / 60)));
}

/**
 * The day whose column holds a point, among a container's day elements.
 *
 * For space that belongs to no day element. Every view lays its days out as columns, so the
 * day is the one whose element spans the point across, read from the drawn rects rather
 * than from the order of the days, which right to left runs the other way. A day header is
 * preferred over a time area in the same column: a press in a grid's all-day band is on the
 * day, at no hour. Column view also asks the point to be level with or below the column's
 * top, so the row of week numbers above the columns stays the card's.
 *
 * @param candidates - Elements that may carry a day slot
 * @param point - The press
 * @param belowTop - Whether the point must not lie above the column
 * @returns The day's element and slot, or undefined in a gutter or outside every column
 */
function dayInColumnAt(
  candidates: Iterable<Element>,
  point: ViewportPoint,
  belowTop: boolean,
): { element: Element; timestamp: number } | undefined {
  let found: { element: Element; timestamp: number } | undefined;
  for (const element of candidates) {
    const slot = daySlotOn(element);
    if (!slot || (slot.kind !== 'day' && slot.kind !== 'time')) continue;

    const rect = element.getBoundingClientRect();
    if (point.x < rect.left || point.x >= rect.right) continue;
    if (belowTop && point.y < rect.top) continue;

    if (slot.kind === 'day') return { element, timestamp: slot.timestamp };
    found ??= { element, timestamp: slot.timestamp };
  }
  return found;
}

/**
 * The day an input event landed on, and in a grid's time area the hour, read from the
 * pointer-down's composed path and position.
 *
 * Innermost first, so an event, which covers its day, is met before the day around it, and
 * ends the walk with nothing: a press on an event never adds there. A tappable event ends it
 * the same way, carrying the tap marker even where no slot was drawn. With `throughEvents`
 * events are walked past instead, which is how the card's own `add-event` action reads which
 * day a hold on an event was on. Stops at `boundary`, like `findEventTap`.
 *
 * @param path - The input event's composed path, innermost first
 * @param boundary - Where the walk ends, exclusive
 * @param point - The pointer's viewport position
 * @param throughEvents - Whether events are walked past rather than ending the walk
 * @returns Where the press landed, or undefined off the days
 */
export function findDayHit(
  path: ReadonlyArray<EventTarget>,
  boundary: EventTarget | null,
  point: ViewportPoint,
  throughEvents = false,
): DayHit | undefined {
  for (const node of path) {
    if (node === boundary) return undefined;
    const slot = daySlotOn(node);
    if (!throughEvents && (slot?.kind === 'covered' || tapTargetOn(node))) return undefined;
    if (!slot || slot.kind === 'covered') continue;

    const element = node as Element;
    if (slot.kind === 'day') return { element, timestamp: slot.timestamp };

    if (slot.kind === 'time') {
      const rect = element.getBoundingClientRect();
      return {
        element,
        timestamp: slot.timestamp,
        hour: hourAt(rect, point.y, slot.startMin, slot.endMin),
        band: { startMin: slot.startMin, endMin: slot.endMin },
      };
    }

    const container = slot.among === 'children' ? element : element.parentElement;
    if (!container) return undefined;
    return dayInColumnAt(container.children, point, slot.among === 'children');
  }
  return undefined;
}

/**
 * Where an hour sits in a grid's time area, as percentages of its height, for the wash a
 * press there shows. Clipped to the area, so a band starting at 07:30 washes the half hour
 * of 07:00 it shows.
 *
 * @param hour - The hour, 0 to 23
 * @param band - The minutes the area spans
 * @returns Top and height, in percent
 */
export function hourBandPct(
  hour: number,
  band: { readonly startMin: number; readonly endMin: number },
): { topPct: number; heightPct: number } {
  const span = band.endMin - band.startMin;
  if (!(span > 0)) return { topPct: 0, heightPct: 0 };

  const from = Math.max(band.startMin, hour * 60);
  const until = Math.min(band.endMin, hour * 60 + 60);
  return {
    topPct: ((from - band.startMin) / span) * 100,
    heightPct: (Math.max(0, until - from) / span) * 100,
  };
}

/**
 * A day's add button: the element a keyboard and assistive technology reach a day by, while a
 * tap on a day adds an event there. The property names its day.
 */
export interface DayAddButtonElement extends Element {
  calendarCardDayAdd?: number;
}

/**
 * The day a node adds on, if it is a day's add button itself.
 *
 * @param node - Any event target
 * @returns The day's local midnight, or undefined
 */
export function dayAddOn(node: EventTarget | null | undefined): number | undefined {
  return (node as DayAddButtonElement | null | undefined)?.calendarCardDayAdd;
}

/**
 * The day's add button an input event started on: the element, and its day.
 *
 * @param path - The input event's composed path, innermost first
 * @param boundary - Where the walk ends, exclusive
 * @returns The button and its day, or undefined
 */
export function findDayAdd(
  path: ReadonlyArray<EventTarget>,
  boundary: EventTarget | null,
): { element: EventTarget; timestamp: number } | undefined {
  for (const node of path) {
    if (node === boundary) return undefined;
    const timestamp = dayAddOn(node);
    if (timestamp !== undefined) return { element: node, timestamp };
  }
  return undefined;
}

/**
 * What a render needs to draw each day as a button that adds an event on it, or undefined
 * while a tap on a day adds nothing.
 */
export interface DayAddButtons {
  /** The buttons' accessible name: Home Assistant's own "Add event", or English. */
  readonly label: string;
}
