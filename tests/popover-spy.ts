import { vi } from 'vitest';

import type { PopoverParams } from '../src/interaction/popover-model';
import { EVENT_POPOVER_TAG } from '../src/rendering/event-popover';

/** What a card hands Home Assistant's dialog manager when it opens the event popover. */
export interface PopoverRequest {
  dialogTag: string;
  dialogImport: () => Promise<unknown>;
  dialogParams: PopoverParams;
}

/**
 * Record every event popover a card asks Home Assistant to open, by the parameters it passes.
 *
 * The card opens its popover by firing `show-dialog`, which bubbles and crosses shadow roots,
 * so one listener on the document sees every card in the test. Anything else fired that way is
 * left out, so a call count is a count of popovers.
 *
 * @param target - Where to listen; the document unless a test wants one card's alone
 * @returns A spy called with each popover's parameters, and a function that stops listening
 */
export function spyOnPopovers(target: EventTarget = document) {
  const opened = vi.fn<(params: PopoverParams) => void>();
  const listener = (event: Event) => {
    const detail = (event as Event & { detail?: Partial<PopoverRequest> }).detail;
    if (detail?.dialogTag === EVENT_POPOVER_TAG && detail.dialogParams) opened(detail.dialogParams);
  };
  target.addEventListener('show-dialog', listener);
  return { opened, stop: () => target.removeEventListener('show-dialog', listener) };
}
