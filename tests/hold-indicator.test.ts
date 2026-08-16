/**
 * The hold indicator is the only visual feedback a user gets while holding the
 * card, and it lives outside the shadow root: `createHoldIndicator` appends a
 * bare div straight to `document.body`. That put it outside the reach of every
 * DOM snapshot and every custom-property test, and a mutation sweep confirmed
 * it — eight separate breakages, including ignoring the configured accent color
 * entirely, all left the full suite green.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
import { createHoldIndicator, removeHoldIndicator } from '../src/interaction/feedback';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

function pointer(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return { pageX: 120, pageY: 340, pointerType: 'mouse', ...overrides } as PointerEvent;
}

describe('the hold indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('is attached to the document so it can be seen at all', () => {
    const indicator = createHoldIndicator(pointer(), buildConfig());
    expect(indicator.parentNode).toBe(document.body);
    expect(document.body.contains(indicator)).toBe(true);
  });

  it('is painted in the configured accent color, not a fixed one', () => {
    const custom = createHoldIndicator(pointer(), buildConfig({ accent_color: '#ff0000' }));
    const other = createHoldIndicator(pointer(), buildConfig({ accent_color: '#00ff00' }));

    expect(custom.style.backgroundColor).toBe('#ff0000');
    expect(other.style.backgroundColor).toBe('#00ff00');
    expect(custom.style.backgroundColor).not.toBe(other.style.backgroundColor);
  });

  it('is translucent rather than a solid disc over the card', () => {
    const indicator = createHoldIndicator(pointer(), buildConfig());
    expect(indicator.style.opacity).toBe(String(Constants.UI.HOLD_INDICATOR_OPACITY));
    expect(Number(indicator.style.opacity)).toBeGreaterThan(0);
    expect(Number(indicator.style.opacity)).toBeLessThan(1);
  });

  it('is positioned absolutely, so page coordinates mean what they say', () => {
    const indicator = createHoldIndicator(pointer(), buildConfig());
    expect(indicator.style.position).toBe('absolute');
  });

  it('is drawn where the finger actually is', () => {
    const here = createHoldIndicator(pointer({ pageX: 120, pageY: 340 }), buildConfig());
    const there = createHoldIndicator(pointer({ pageX: 900, pageY: 15 }), buildConfig());

    expect(here.style.left).toBe('120px');
    expect(here.style.top).toBe('340px');
    expect(there.style.left).toBe('900px');
    expect(there.style.top).toBe('15px');
  });

  it.each([
    ['touch', Constants.UI.HOLD_INDICATOR.TOUCH_SIZE],
    ['mouse', Constants.UI.HOLD_INDICATOR.POINTER_SIZE],
    ['pen', Constants.UI.HOLD_INDICATOR.POINTER_SIZE],
  ])('sizes itself for a %s pointer', (pointerType, expected) => {
    const indicator = createHoldIndicator(pointer({ pointerType }), buildConfig());
    expect(indicator.style.width).toBe(`${expected}px`);
    expect(indicator.style.height).toBe(`${expected}px`);
  });

  it('gives a finger a larger target than a mouse cursor', () => {
    expect(Constants.UI.HOLD_INDICATOR.TOUCH_SIZE).toBeGreaterThan(
      Constants.UI.HOLD_INDICATOR.POINTER_SIZE,
    );
  });

  it('never intercepts the clicks it is drawn on top of', () => {
    const indicator = createHoldIndicator(pointer(), buildConfig());
    expect(indicator.style.pointerEvents).toBe('none');
  });

  it('grows into view instead of appearing at full size', () => {
    const indicator = createHoldIndicator(pointer(), buildConfig());
    expect(indicator.style.transform).toContain('scale(0)');

    vi.advanceTimersByTime(50);
    expect(indicator.style.transform).toContain('scale(1)');
  });

  it('fades out and is then removed from the document', () => {
    const indicator = createHoldIndicator(pointer(), buildConfig());
    expect(document.body.contains(indicator)).toBe(true);

    removeHoldIndicator(indicator);
    expect(indicator.style.opacity).toBe('0');
    expect(document.body.contains(indicator)).toBe(true);

    vi.advanceTimersByTime(Constants.TIMING.HOLD_INDICATOR_FADEOUT + 10);
    expect(document.body.contains(indicator)).toBe(false);
  });

  it('does not throw when asked to remove an indicator that is already gone', () => {
    const indicator = createHoldIndicator(pointer(), buildConfig());
    indicator.remove();

    expect(() => {
      removeHoldIndicator(indicator);
      vi.advanceTimersByTime(Constants.TIMING.HOLD_INDICATOR_FADEOUT + 10);
    }).not.toThrow();
  });
});
