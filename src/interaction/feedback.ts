/* eslint-disable import/order */
/**
 * Visual feedback for Calendar Card Pro interactions
 *
 * This module provides visual indicators and feedback for user interactions
 * including hold indicators and related visual effects.
 */

import * as Types from '../config/types';
import * as Logger from '../utils/logger';
import * as Constants from '../config/constants';

//-----------------------------------------------------------------------------
// VISUAL INDICATORS
//-----------------------------------------------------------------------------

/**
 * Create a visual hold indicator at pointer position
 *
 * @param event - Pointer event that triggered the hold
 * @param config - Card configuration to use for styling
 * @returns The created hold indicator element
 */
export function createHoldIndicator(event: PointerEvent, config: Types.Config): HTMLElement {
  // Create hold indicator
  const holdIndicator = document.createElement('div');

  // Configure the visual appearance
  holdIndicator.style.position = 'absolute';
  holdIndicator.style.pointerEvents = 'none';
  holdIndicator.style.borderRadius = '50%';
  holdIndicator.style.backgroundColor = config.accent_color;
  holdIndicator.style.opacity = `${Constants.UI.HOLD_INDICATOR_OPACITY}`;
  holdIndicator.style.transform = 'translate(-50%, -50%) scale(0)';
  holdIndicator.style.transition = `transform ${Constants.TIMING.HOLD_INDICATOR_TRANSITION}ms ease-out`;

  // Set position based on pointer event
  holdIndicator.style.left = event.pageX + 'px';
  holdIndicator.style.top = event.pageY + 'px';

  // Choose size based on interaction type (touch vs mouse)
  const isTouchEvent = event.pointerType === 'touch';
  const size = isTouchEvent
    ? Constants.UI.HOLD_INDICATOR.TOUCH_SIZE
    : Constants.UI.HOLD_INDICATOR.POINTER_SIZE;

  holdIndicator.style.width = `${size}px`;
  holdIndicator.style.height = `${size}px`;

  // Add to body
  document.body.appendChild(holdIndicator);

  // Trigger animation
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
  // Fade out animation
  indicator.style.opacity = '0';
  indicator.style.transition = `opacity ${Constants.TIMING.HOLD_INDICATOR_FADEOUT}ms ease-out`;

  // Remove after animation completes
  setTimeout(() => {
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
      Logger.debug('Removed hold indicator');
    }
  }, Constants.TIMING.HOLD_INDICATOR_FADEOUT);
}
