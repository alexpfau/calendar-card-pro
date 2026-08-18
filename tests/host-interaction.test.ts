/**
 * The host's own pointer and keyboard handlers.
 *
 * `src/interaction/` is well covered, but that module only ever sees a call that the
 * host has already decided to make. Deciding *whether* to make it -- arming the hold
 * timer, matching the pointer that started the gesture, recognising the two activation
 * keys, and labelling an action as tap or hold -- lives in `calendar-card-pro.ts` and
 * was measured to be unguarded: a mutation sweep of that file left five separate
 * interaction mutations alive with the whole suite green.
 *
 * Each of the five is user-visible. Inverting the `hold_action: none` guard arms a hold
 * timer precisely when the user asked for no hold action; inverting the pointer-id
 * comparison lets a second finger's release fire the first finger's action; dropping
 * either key from the keydown handler removes half of the card's keyboard
 * accessibility; and swapping the label in `handleAction` runs the tap action when a
 * caller asked for hold.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
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

const handleAction = vi.hoisted(() => vi.fn());
vi.mock('../src/interaction/actions', () => ({ handleAction }));

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  isInitialLoad: boolean;
  handleAction(actionConfig: unknown): void;
  _handlePointerDown(ev: PointerEvent): void;
  _handlePointerUp(ev: PointerEvent): void;
  _handleKeyDown(ev: KeyboardEvent): void;
  _holdTriggered: boolean;
  readonly updateComplete: Promise<boolean>;
}

/** A minimal stand-in for a real PointerEvent, which happy-dom does not construct. */
function pointer(pointerId: number): PointerEvent {
  return { pointerId, clientX: 0, clientY: 0 } as PointerEvent;
}

async function mount(overrides: Record<string, unknown> = {}): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig(overrides));
  card.hass = { states: {}, locale: { language: 'en' } };
  card.isInitialLoad = false;
  document.body.appendChild(card);
  await card.updateComplete;
  return card;
}

describe('host pointer handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handleAction.mockClear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not arm a hold when the user configured no hold action', async () => {
    const card = await mount({ hold_action: { action: 'none' } });

    card._handlePointerDown(pointer(1));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);

    expect(card._holdTriggered).toBe(false);
  });

  it('arms a hold when a hold action is configured', async () => {
    // The positive control for the case above: without it, a handler that never armed
    // anything at all would satisfy that assertion.
    const card = await mount({ hold_action: { action: 'expand' } });

    card._handlePointerDown(pointer(1));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);

    expect(card._holdTriggered).toBe(true);
  });

  it('ignores a hold timer belonging to a pointer that is no longer active', async () => {
    const card = await mount({ hold_action: { action: 'expand' } });

    card._handlePointerDown(pointer(1));
    // A second finger lands before the first one's timer fires, taking over the gesture.
    card._handlePointerDown(pointer(2));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);

    // The surviving timer is the second pointer's, so a hold is still recognised --
    // but the first pointer's timer must not have been the one to set it.
    expect(card._holdTriggered).toBe(true);

    // Releasing the pointer that never became active must do nothing at all.
    handleAction.mockClear();
    card._handlePointerUp(pointer(1));
    expect(handleAction).not.toHaveBeenCalled();
  });

  it('runs the hold action when the active pointer is released after a hold', async () => {
    const card = await mount({ hold_action: { action: 'expand' } });

    card._handlePointerDown(pointer(3));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    card._handlePointerUp(pointer(3));

    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(handleAction.mock.calls[0][2]).toBe('hold');
  });

  it('runs the tap action when the pointer is released before the hold threshold', async () => {
    const card = await mount({ tap_action: { action: 'expand' } });

    card._handlePointerDown(pointer(4));
    vi.advanceTimersByTime(50);
    card._handlePointerUp(pointer(4));

    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(handleAction.mock.calls[0][2]).toBe('tap');
  });
});

describe('host keyboard handling', () => {
  beforeEach(() => {
    handleAction.mockClear();
    document.body.innerHTML = '';
  });

  it.each(['Enter', ' '])('activates the card on %j', async (key) => {
    const card = await mount({ tap_action: { action: 'expand' } });

    card._handleKeyDown({ key, preventDefault: vi.fn() } as unknown as KeyboardEvent);

    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(handleAction.mock.calls[0][2]).toBe('tap');
  });

  it('ignores other keys', async () => {
    // The negative control. Without it, a handler that fired on every keystroke would
    // pass both cases above.
    const card = await mount({ tap_action: { action: 'expand' } });

    card._handleKeyDown({ key: 'a', preventDefault: vi.fn() } as unknown as KeyboardEvent);

    expect(handleAction).not.toHaveBeenCalled();
  });
});

describe('host handleAction labelling', () => {
  beforeEach(() => {
    handleAction.mockClear();
    document.body.innerHTML = '';
  });

  it('labels the configured hold action as a hold and the tap action as a tap', async () => {
    const card = await mount({
      tap_action: { action: 'expand' },
      hold_action: { action: 'more-info' },
    });

    card.handleAction((card as unknown as { config: { hold_action: unknown } }).config.hold_action);
    expect(handleAction.mock.calls[0][2]).toBe('hold');

    card.handleAction((card as unknown as { config: { tap_action: unknown } }).config.tap_action);
    expect(handleAction.mock.calls[1][2]).toBe('tap');
  });
});
