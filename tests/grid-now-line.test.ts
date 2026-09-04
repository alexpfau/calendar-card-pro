import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW, buildConfig } from './fixtures';

/**
 * The grid view's now-line repaint.
 *
 * The line is the only thing on the card that goes stale purely with the passage of
 * time — everything else changes when `hass` does — so it needs a timer, and a timer is
 * the kind of thing that leaks. What is pinned here is therefore mostly about *not*
 * running: a list card must pay nothing, a hidden tab must pay nothing, and a
 * disconnected card must leave nothing behind.
 *
 * The interval count is read off `vi.getTimerCount()` rather than by spying on
 * `setInterval`, because the card owns several timers and a spy would need to know which
 * one it caught. Comparing the count *between* two states isolates the one under test
 * without naming it.
 */

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  isInitialLoad: boolean;
  updateComplete: Promise<boolean>;
  requestUpdate(): void;
  _nowLineTimerId: number | null;
  _nowLineDayKey: string | null;
  _wantsNowLine: boolean;
  _syncNowLineTimer(): void;
  _tickNowLine(): void;
  updateEvents(force?: boolean): Promise<void>;
}

function card(config: Record<string, unknown> = {}): CardUnderTest {
  const element = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  element.setConfig(buildConfig({ entities: ['calendar.personal'], ...config }));
  element.isInitialLoad = false;
  return element;
}

/** Mount, let the first update settle, and hand the card back. */
async function mounted(config: Record<string, unknown> = {}): Promise<CardUnderTest> {
  const element = card(config);
  document.body.appendChild(element);
  await element.updateComplete;
  return element;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the timer runs only where there is a line to move', () => {
  it('does not run in list view', async () => {
    const element = await mounted({ view: 'list' });

    expect(element._wantsNowLine).toBe(false);
    expect(element._nowLineTimerId).toBeNull();
  });

  it('does not run in column view', async () => {
    const element = await mounted({ view: 'column' });

    expect(element._nowLineTimerId).toBeNull();
  });

  it('runs in grid view', async () => {
    const element = await mounted({ view: 'grid' });

    expect(element._wantsNowLine).toBe(true);
    expect(element._nowLineTimerId).not.toBeNull();
  });

  // Starting a timer for a card that cannot display a line would make it pay a repaint a
  // minute for nothing — the same waste as running it in list view, one option deeper.
  it('does not run when the line is switched off', async () => {
    const element = await mounted({ view: 'grid', grid: { show_now_line: false } });

    expect(element._wantsNowLine).toBe(false);
    expect(element._nowLineTimerId).toBeNull();
  });
});

describe('the timer is released', () => {
  it('stops when the card is disconnected', async () => {
    const element = await mounted({ view: 'grid' });
    expect(element._nowLineTimerId).not.toBeNull();

    element.remove();

    expect(element._nowLineTimerId).toBeNull();
  });

  it('stops while the tab is hidden and restarts when it returns', async () => {
    const element = await mounted({ view: 'grid' });
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('hidden');
    element._syncNowLineTimer();
    expect(element._nowLineTimerId, 'a hidden tab must not repaint').toBeNull();

    visibility.mockReturnValue('visible');
    element._syncNowLineTimer();
    expect(element._nowLineTimerId).not.toBeNull();

    visibility.mockRestore();
  });

  it('does not stack a second interval on repeated syncs', async () => {
    const element = await mounted({ view: 'grid' });
    const first = element._nowLineTimerId;

    element._syncNowLineTimer();
    element._syncNowLineTimer();

    expect(element._nowLineTimerId).toBe(first);
  });

  it('leaves no timer behind after disconnect', async () => {
    const element = await mounted({ view: 'grid' });
    const withCard = vi.getTimerCount();

    element.remove();

    expect(vi.getTimerCount()).toBeLessThan(withCard);
  });
});

describe('midnight', () => {
  // A plain repaint at midnight is wrong in a way that is easy to miss: every day header
  // is a day stale, "today" has moved to a different column, and the line would be drawn
  // at the top of a column that is no longer today. Only refetching fixes that.
  it('refetches rather than repainting when the local day rolls over', async () => {
    const element = await mounted({ view: 'grid' });
    const update = vi.spyOn(element, 'updateEvents').mockResolvedValue();
    const repaint = vi.spyOn(element, 'requestUpdate');

    element._nowLineDayKey = '2026-06-16';
    element._tickNowLine();

    expect(update, 'a rollover must refetch').toHaveBeenCalledWith(true);
    expect(repaint, 'and must not merely repaint').not.toHaveBeenCalled();

    update.mockRestore();
    repaint.mockRestore();
  });

  it('repaints without refetching on an ordinary tick', async () => {
    const element = await mounted({ view: 'grid' });
    const update = vi.spyOn(element, 'updateEvents').mockResolvedValue();
    const repaint = vi.spyOn(element, 'requestUpdate');

    element._tickNowLine();

    expect(repaint).toHaveBeenCalled();
    expect(update, 'no rollover, so nothing to refetch').not.toHaveBeenCalled();

    update.mockRestore();
    repaint.mockRestore();
  });

  it('records the new day so a rollover fires once, not on every tick after it', async () => {
    const element = await mounted({ view: 'grid' });
    const update = vi.spyOn(element, 'updateEvents').mockResolvedValue();

    element._nowLineDayKey = '2026-06-16';
    element._tickNowLine();
    element._tickNowLine();

    expect(update).toHaveBeenCalledTimes(1);

    update.mockRestore();
  });
});
