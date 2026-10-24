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
