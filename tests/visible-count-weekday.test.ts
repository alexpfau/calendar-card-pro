/**
 * `visibleEventCount` must notice the Home Assistant profile weekday.
 *
 * The count feeds `hide_when_empty`, and it is memoized. The memo's identity was
 * events + config + view + language — all four of which can be *identical* across a
 * change that moves the fetch window, because `first_day_of_week: system` reads the
 * weekday from the user's HA profile rather than from the card config. Switching the
 * profile from Sunday to Monday therefore left a stale count, and with it a stale
 * decision about whether the card is empty.
 *
 * `start_of_week` is the only start-date anchor that consumes the resolved weekday, so
 * that is what these tests configure. One displayed day makes the window a single date,
 * which is what lets a one-day shift move an event in or out of it:
 *
 * - profile Sunday → week starts Sun 2026-06-14 → the event is inside the window
 * - profile Monday → week starts Mon 2026-06-15 → the event is outside it
 *
 * The event array reference is deliberately reused across both reads, and asserted to be
 * unchanged before the second one. Without that, a card that simply dropped its events
 * when `hass` was reassigned would return 0 and look like a pass.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: unknown;
  events: Types.CalendarEventData[];
  readonly visibleEventCount: number;
}

/** A `hass` whose only interesting field is the profile's first weekday. */
function hassWith(firstWeekday: string): unknown {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en', first_weekday: firstWeekday },
    callApi: async () => [],
  };
}

/** One timed event on Sunday 2026-06-14. */
const SUNDAY_EVENT: Types.CalendarEventData = {
  start: { dateTime: '2026-06-14T10:00:00' },
  end: { dateTime: '2026-06-14T11:00:00' },
  summary: 'Sunday only',
  _entityId: 'calendar.test',
};

describe('visibleEventCount tracks the resolved first weekday', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mount(extra: Record<string, unknown> = {}): CardUnderTest {
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({
      entities: ['calendar.test'],
      days_to_show: 1,
      start_date: 'start_of_week',
      first_day_of_week: 'system',
      show_past_events: true,
      ...extra,
    });
    document.body.appendChild(card);
    return card;
  }

  it('recomputes when only the profile weekday changes', () => {
    const card = mount();
    const events = [SUNDAY_EVENT];

    card.hass = hassWith('sunday');
    card.events = events;
    expect(card.visibleEventCount).toBe(1);

    card.hass = hassWith('monday');
    // The guard against a wrong-reason pass: the events themselves must still be there.
    expect(card.events).toBe(events);
    expect(card.visibleEventCount).toBe(0);
  });

  it('still memoizes when nothing moves', () => {
    // The control. If the memo were simply disabled — or keyed on an object HA replaces
    // on every state update — the assertion above would pass while the card recomputed
    // the whole grouping on every render.
    const card = mount();
    card.hass = hassWith('sunday');
    card.events = [SUNDAY_EVENT];

    const first = card.visibleEventCount;
    card.hass = hassWith('sunday');
    expect(card.visibleEventCount).toBe(first);
  });

  it('is unaffected by the profile when the start date does not depend on it', () => {
    // The second control, bounding the blast radius. An absolute start date resolves to
    // the same window whatever the week starts on, so the count must not move.
    const card = mount({ start_date: '2026-06-14' });
    card.hass = hassWith('sunday');
    card.events = [SUNDAY_EVENT];
    expect(card.visibleEventCount).toBe(1);

    card.hass = hassWith('monday');
    expect(card.visibleEventCount).toBe(1);
  });
});
