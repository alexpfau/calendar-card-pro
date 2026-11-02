/**
 * Visual feedback helpers for Calendar Card Pro interactions.
 */

import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// VISUAL INDICATORS
//-----------------------------------------------------------------------------

/**
 * Create a visual hold indicator at pointer position.
 *
 * Fixed positioning and client coordinates use the same viewport coordinate space.
 *
 * @param event - Pointer event that triggered the hold
 * @param config - Card configuration to use for styling
 * @returns The created hold indicator element
 */
export function createHoldIndicator(event: PointerEvent, config: Types.Config): HTMLElement {
  const holdIndicator = document.createElement('div');

  holdIndicator.style.position = 'fixed';
  holdIndicator.style.pointerEvents = 'none';
  holdIndicator.style.borderRadius = '50%';
  holdIndicator.style.backgroundColor = config.accent_color;
  holdIndicator.style.opacity = `${Constants.UI.HOLD_INDICATOR_OPACITY}`;
  holdIndicator.style.transform = 'translate(-50%, -50%) scale(0)';
  holdIndicator.style.transition = `transform ${Constants.TIMING.HOLD_INDICATOR_TRANSITION}ms ease-out`;

  holdIndicator.style.left = event.clientX + 'px';
  holdIndicator.style.top = event.clientY + 'px';

  const isTouchEvent = event.pointerType === 'touch';
  const size = isTouchEvent
    ? Constants.UI.HOLD_INDICATOR.TOUCH_SIZE
    : Constants.UI.HOLD_INDICATOR.POINTER_SIZE;

  holdIndicator.style.width = `${size}px`;
  holdIndicator.style.height = `${size}px`;

  document.body.appendChild(holdIndicator);

  setTimeout(() => {
    holdIndicator.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 10);

  Logger.debug('Created hold indicator');
  return holdIndicator;
}

/**
 * Remove a hold indicator with animation
 *
 * @param indicator - Hold indicator element to remove
 */
export function removeHoldIndicator(indicator: HTMLElement): void {
  indicator.style.opacity = '0';
  indicator.style.transition = `opacity ${Constants.TIMING.HOLD_INDICATOR_FADEOUT}ms ease-out`;

  setTimeout(() => {
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
      Logger.debug('Removed hold indicator');
    }
  }, Constants.TIMING.HOLD_INDICATOR_FADEOUT);
}

/**
 * A point the busy cue is centered on, in viewport coordinates, and how the press was made:
 * a touch draws it at a fingertip's size, anything else at a pointer's.
 */
export interface BusyCueOrigin {
  readonly x: number;
  readonly y: number;
  readonly pointerType?: string;
}

/**
 * Show that a press is waiting for one of Home Assistant's dialogs to load: the hold
 * indicator's circle at the press, pulsing softly until the dialog opens.
 *
 * Fixed and on `document.body` like the hold indicator, so nothing is added to the card's
 * own DOM. It pulses through the Web Animations API, and stays still under
 * `prefers-reduced-motion`.
 *
 * @param origin - Where the press was, and with what
 * @param config - Card configuration, for its accent color
 * @returns The cue, for `removeBusyCue`
 */
export function createBusyCue(origin: BusyCueOrigin, config: Types.Config): HTMLElement {
  const cue = document.createElement('div');
  const size =
    origin.pointerType === 'touch'
      ? Constants.UI.HOLD_INDICATOR.TOUCH_SIZE
      : Constants.UI.HOLD_INDICATOR.POINTER_SIZE;

  cue.className = 'calendar-card-pro-busy-cue';
  cue.setAttribute('aria-hidden', 'true');
  cue.style.position = 'fixed';
  cue.style.pointerEvents = 'none';
  cue.style.zIndex = '9999';
  cue.style.borderRadius = '50%';
  cue.style.backgroundColor = config.accent_color;
  cue.style.opacity = `${Constants.UI.HOLD_INDICATOR_OPACITY}`;
  cue.style.transform = 'translate(-50%, -50%) scale(1)';
  cue.style.left = origin.x + 'px';
  cue.style.top = origin.y + 'px';
  cue.style.width = `${size}px`;
  cue.style.height = `${size}px`;

  document.body.appendChild(cue);

  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  if (!still && typeof cue.animate === 'function') {
    const opacity = Constants.UI.HOLD_INDICATOR_OPACITY;
    const pulse = cue.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.7)', opacity: opacity * 0.6 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity },
        { transform: 'translate(-50%, -50%) scale(0.7)', opacity: opacity * 0.6 },
      ],
      {
        duration: Constants.TIMING.BUSY_CUE_PULSE,
        iterations: Infinity,
        easing: 'ease-in-out',
      },
    );
    // Removing the cue cancels its pulse, which rejects `finished`.
    pulse.finished?.catch(() => undefined);
  }

  Logger.debug('Created busy cue');
  return cue;
}

/**
 * Fade a busy cue out and remove it.
 *
 * @param cue - The cue `createBusyCue` returned
 */
export function removeBusyCue(cue: HTMLElement): void {
  for (const animation of cue.getAnimations?.() ?? []) animation.cancel();
  removeHoldIndicator(cue);
}
