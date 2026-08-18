import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Presentation from '../src/rendering/presentation';

/**
 * `show_countdown_allday` is the opt-out that suppresses the countdown on all-day
 * events while leaving it on timed ones. Nothing exercised it: a repository-wide
 * search for the key found no test at all, and removing its arm from the gate in
 * `presentation.ts` left the entire suite green.
 *
 * That is the usual shape. `show_countdown` itself is well covered because a test
 * that proves the countdown appears dies when it stops appearing — but the same
 * test is equally satisfied when the countdown appears somewhere it should not,
 * which is exactly what turning this option off is meant to prevent. Only an
 * assertion written against the off value can see that direction.
 *
 * The two positive controls matter as much as the guard: without them a harness
 * that never produces a countdown at all would satisfy every "renders nothing"
 * assertion here vacuously.
 */
const ALL_DAY = {
  summary: 'Public holiday',
  start: { date: '2026-06-22' },
  end: { date: '2026-06-23' },
};

const TIMED = {
  summary: 'Standup',
  start: { dateTime: '2026-06-22T07:00:00.000Z' },
  end: { dateTime: '2026-06-22T08:00:00.000Z' },
};

function countdownFor(
  event: typeof ALL_DAY | typeof TIMED,
  overrides: Record<string, unknown>,
): string | null {
  const config = buildConfig({ show_countdown: true, ...overrides });
  const presentation = Presentation.buildEventPresentation(
    event as unknown as Types.CalendarEventData,
    config,
    'en',
    null,
  );
  return presentation.contentParts.countdownStr;
}

describe('show_countdown_allday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a countdown on an all-day event when left at its default', () => {
    expect(countdownFor(ALL_DAY, {})).toBeTruthy();
  });

  it('shows a countdown on a timed event when the all-day opt-out is off', () => {
    expect(countdownFor(TIMED, { show_countdown_allday: false })).toBeTruthy();
  });

  it('suppresses the countdown on an all-day event when turned off', () => {
    expect(countdownFor(ALL_DAY, { show_countdown_allday: false })).toBeNull();
  });

  it('suppresses every countdown when show_countdown itself is off', () => {
    expect(countdownFor(ALL_DAY, { show_countdown: false })).toBeNull();
    expect(countdownFor(TIMED, { show_countdown: false })).toBeNull();
  });
});
