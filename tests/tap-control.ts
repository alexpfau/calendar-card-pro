import { expect } from 'vitest';

/**
 * Asserts that a card hosting controls hands its tap to a control of its own
 * (`Render.TapControl`): the card is no tab stop and no button, and its first child is a
 * named native button.
 *
 * @param haCard - The card's `ha-card`
 */
export function expectTapControl(haCard: Element): void {
  expect(haCard.hasAttribute('tabindex')).toBe(false);
  expect(haCard.hasAttribute('role')).toBe(false);
  const control = haCard.firstElementChild;
  expect(control?.matches('button.card-tap-control[type="button"]')).toBe(true);
  expect(control?.getAttribute('aria-label')?.trim()).toBeTruthy();
}
