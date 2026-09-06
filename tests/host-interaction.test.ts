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
  _handlePointerMove(ev: PointerEvent): void;
  _handlePointerUp(ev: PointerEvent): void;
  _handlePointerCancel(ev: PointerEvent): void;
  _handleKeyDown(ev: KeyboardEvent): void;
  _holdTriggered: boolean;
  _holdIndicator: HTMLElement | null;
  readonly updateComplete: Promise<boolean>;
}

/** A minimal stand-in for a real PointerEvent, which happy-dom does not construct. */
function pointer(pointerId: number, clientX = 0, clientY = 0): PointerEvent {
  return { pointerId, clientX, clientY } as PointerEvent;
}

/** Dispatch a bubbling pointer event with the fields the host reads. */
function dispatchPointer(
  target: EventTarget,
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  target.dispatchEvent(event);
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

  it('does not leave a hold indicator behind when a second finger takes over after hold', async () => {
    // createHoldIndicator appends straight to document.body. A second pointerdown after
    // the first hold has already drawn its disc used to overwrite the card's reference
    // without removing the first node, so the disc stayed on the page forever.
    const card = await mount({ hold_action: { action: 'expand' } });

    card._handlePointerDown(pointer(11));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    const first = card._holdIndicator;
    expect(first).toBeTruthy();
    expect(first!.parentNode).toBe(document.body);

    card._handlePointerDown(pointer(12));
    // The card drops the reference immediately; the fadeout then unmounts the node.
    expect(card._holdIndicator).toBeNull();
    vi.advanceTimersByTime(Constants.TIMING.HOLD_INDICATOR_FADEOUT + 10);
    expect(first!.parentNode).toBeNull();

    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    const second = card._holdIndicator;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(first!.parentNode).toBeNull();

    card._handlePointerUp(pointer(12));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_INDICATOR_FADEOUT + 10);
    expect(second!.parentNode).toBeNull();
  });

  it('does not cancel the active pointer when a different finger is canceled', async () => {
    const card = await mount({ hold_action: { action: 'expand' } });

    card._handlePointerDown(pointer(1));
    card._handlePointerDown(pointer(2));
    card._handlePointerCancel(pointer(1));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    card._handlePointerUp(pointer(2));

    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(handleAction.mock.calls[0][2]).toBe('hold');
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

  it('keeps a small pointer wobble as a tap', async () => {
    const card = await mount({ tap_action: { action: 'expand' } });

    card._handlePointerDown(pointer(5, 100, 100));
    card._handlePointerMove(pointer(5, 104, 103));
    card._handlePointerUp(pointer(5, 104, 103));

    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(handleAction.mock.calls[0][2]).toBe('tap');
  });

  it('does not turn a scroll or drag into a tap action', async () => {
    const card = await mount({ tap_action: { action: 'expand' } });

    card._handlePointerDown(pointer(6, 100, 100));
    card._handlePointerMove(pointer(6, 109, 100));
    card._handlePointerUp(pointer(6, 109, 100));

    expect(handleAction).not.toHaveBeenCalled();
  });

  it('listens for pointer movement on the rendered card host', async () => {
    const card = await mount({ tap_action: { action: 'expand' } });
    const haCard = card.shadowRoot?.querySelector('ha-card');
    expect(haCard).toBeTruthy();

    dispatchPointer(haCard!, 'pointerdown', 7, 100, 100);
    dispatchPointer(haCard!, 'pointermove', 7, 109, 100);
    dispatchPointer(haCard!, 'pointerup', 7, 109, 100);

    expect(handleAction).not.toHaveBeenCalled();
  });

  it('does not turn a moved long press into a hold action', async () => {
    const card = await mount({ hold_action: { action: 'expand' } });

    card._handlePointerDown(pointer(8, 100, 100));
    card._handlePointerMove(pointer(8, 100, 109));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    card._handlePointerUp(pointer(8, 100, 109));

    expect(card._holdTriggered).toBe(false);
    expect(handleAction).not.toHaveBeenCalled();
  });

  it('keeps a hold that already fired when the finger slips on release', async () => {
    // Hold runs on pointerup, not at the threshold. Movement after the
    // indicator appears used to set _pointerMoved and clear _holdTriggered,
    // so a normal touch lift after a successful long-press ran neither hold
    // nor tap — the user saw the disc and got nothing.
    const card = await mount({ hold_action: { action: 'expand' } });

    card._handlePointerDown(pointer(9, 100, 100));
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    expect(card._holdTriggered).toBe(true);
    expect(card._holdIndicator).toBeTruthy();

    card._handlePointerMove(pointer(9, 100, 120));
    card._handlePointerUp(pointer(9, 100, 120));

    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(handleAction.mock.calls[0][2]).toBe('hold');
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

  // The three cases below dispatch a real bubbling event rather than calling the handler,
  // because the thing under test is which element the keystroke started from — and the
  // direct-call cases above pass a synthetic object with neither target nor currentTarget,
  // so they are blind to it by construction.
  it('leaves Space to the grid scroll region it was aimed at', async () => {
    // The listener sits on <ha-card> and keydown bubbles, so before the guard this ran the
    // card's tap action instead of paging the scroller — the one affordance the tab stop
    // exists to provide.
    const card = await mount({
      view: 'grid',
      days_to_show: 7,
      tap_action: { action: 'expand' },
      time_grid: { min_days_to_show: 7, min_days_fallback: 'cramp' },
    });

    const region = card.shadowRoot?.querySelector<HTMLElement>('.grid-container');
    expect(region).toBeTruthy();
    expect(region?.tabIndex).toBe(0);

    region?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(handleAction).not.toHaveBeenCalled();
  });

  it('still activates on Space aimed at the card itself', async () => {
    // The positive control for the case above: a guard that swallowed everything would
    // pass it while breaking the card's own keyboard activation.
    const card = await mount({
      view: 'grid',
      days_to_show: 7,
      tap_action: { action: 'expand' },
      time_grid: { min_days_to_show: 7, min_days_fallback: 'cramp' },
    });

    const haCard = card.shadowRoot?.querySelector<HTMLElement>('ha-card');
    expect(haCard).toBeTruthy();

    haCard?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(handleAction.mock.calls[0][2]).toBe('tap');
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
