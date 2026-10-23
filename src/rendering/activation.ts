/**
 * Makes a rendered event a tap target of its own.
 *
 * The card's `tap_action` and `hold_action` live on `ha-card`, which captures the pointer
 * on `pointerdown`. An event that is its own tap target therefore has to keep its pointer
 * and activation keys from reaching the card, or one tap would both open the event and run
 * the card's action.
 */

import * as Types from '../config/types';

/** Called when an event is activated, with the accent color it is drawn in. */
export type EventActivateHandler = (
  event: Types.CalendarEventData,
  color: string | undefined,
) => void;

/** Listeners for one interactive event root. */
export interface EventActivation {
  onClick(ev: Event): void;
  onKeyDown(ev: KeyboardEvent): void;
  onPointer(ev: Event): void;
}

/**
 * Listeners that make one rendered event activatable, or undefined to leave it inert.
 *
 * Undefined keeps the event's markup exactly as it is without the feature: every binding
 * that consumes this resolves to `nothing`, which Lit renders as no attribute and no
 * listener at all.
 *
 * Only Enter and Space are kept from the card. Other keys propagate, so Home Assistant's
 * own keyboard shortcuts still work while an event has focus.
 *
 * @param event - The rendered event
 * @param color - The accent color it is drawn in
 * @param onActivate - Handler, or undefined when events are not tap targets
 * @returns Listeners, or undefined
 */
export function eventActivation(
  event: Types.CalendarEventData,
  color: string | undefined,
  onActivate: EventActivateHandler | undefined,
): EventActivation | undefined {
  if (!onActivate || event._isEmptyDay) return undefined;

  return {
    onClick(ev: Event): void {
      ev.stopPropagation();
      onActivate(event, color);
    },
    onKeyDown(ev: KeyboardEvent): void {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      onActivate(event, color);
    },
    onPointer(ev: Event): void {
      ev.stopPropagation();
    },
  };
}
