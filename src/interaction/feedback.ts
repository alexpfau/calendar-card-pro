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
 * Positioned `fixed` with `clientX`/`clientY`, not `absolute` with page
 * coordinates. Page coordinates already include the window scroll; absolute
 * placement against the initial containing block does not, so a scrolled
 * dashboard drew the disc hundreds of pixels away from the finger.
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
