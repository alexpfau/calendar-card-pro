/**
 * The midnight timer across a DST change, on a real card.
 *
 * The timer is armed for the next local midnight from local fields. A day that contains a DST
 * change is 23 or 25 hours long, so a timer armed for "24 hours from the last midnight" fires an
 * hour into the next day, or an hour before it ends, and the card draws the new last day empty
 * in the meantime. The day of each change is found at run time, so every zone checks its own two;
 * none is uniquely required, since any zone with DST catches a fixed 24-hour delay.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import { getLocalDateKey } from '../src/utils/format';
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

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  readonly updateComplete: Promise<boolean>;
}

/** Days of 2026 during which the local UTC offset changes. */
function transitions(): Date[] {
  const found: Date[] = [];
  for (let day = new Date(2026, 0, 1); day.getFullYear() === 2026;) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    if (next.getTimezoneOffset() !== day.getTimezoneOffset()) found.push(day);
    day = next;
  }
  return found;
}

const dayAfter = (day: Date, n: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate() + n);

/** One event at local noon on every day, named for its day, answered for the window asked. */
const callApi = vi.fn(async (_method: string, path: string) => {
  const query = new URLSearchParams(path.split('?')[1]);
  const from = new Date(query.get('start')!);
  const to = new Date(query.get('end')!);
  const events: Types.CalendarEventData[] = [];
  for (let day = dayAfter(from, 0); day < to; day = dayAfter(day, 1)) {
    const noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
    events.push({
      summary: `Day ${getLocalDateKey(day)}`,
      start: { dateTime: noon.toISOString() },
      end: { dateTime: new Date(noon.getTime() + 3_600_000).toISOString() },
    });
  }
  return events;
});

function hass(): Record<string, unknown> {
  return {
    states: {
      'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} },
    },
    locale: { language: 'en', time_format: '24' },
    callApi,
    localize: (key: string) => key,
  };
}

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
}

/** Run the clock to a moment, then deliver a `hass` update, as any state change in HA would. */
async function runTo(card: CardUnderTest, at: Date): Promise<void> {
  await vi.advanceTimersByTimeAsync(at.getTime() - Date.now());
  card.hass = hass();
  await settle(card);
}

/** The first day of the window the card last asked Home Assistant for. */
function lastRequestedFrom(): string {
  const path = String(callApi.mock.calls[callApi.mock.calls.length - 1][1]);
  return getLocalDateKey(new Date(new URLSearchParams(path.split('?')[1]).get('start')!));
}

function drawn(card: CardUnderTest): string[] {
  return [...(card.shadowRoot!.textContent ?? '').matchAll(/Day \d{4}-\d{2}-\d{2}/g)].map(
    ([match]) => match,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', memoryStorage());
  EventUtils.clearPageStore();
  callApi.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the midnight timer across a DST change', () => {
  // Sanity: these tests only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
    expect(transitions()).toHaveLength(2);
  });

  it.each(transitions().map((day) => [getLocalDateKey(day), day] as const))(
    'a list card moves on at both midnights around the change on %s',
    async (_label, change) => {
      const at = (day: Date, hours: number, minutes: number) =>
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
      vi.setSystemTime(at(dayAfter(change, -1), 23, 50));
      const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
      // A ten-hour interval, so no scheduled refresh lands near either midnight.
      card.setConfig(
        buildConfig({
          entities: ['calendar.anna'],
          days_to_show: 2,
          view: 'list',
          refresh_interval: 600,
        }),
      );
      card.hass = hass();
      document.body.appendChild(card);
      await settle(card);
      expect(lastRequestedFrom()).toBe(getLocalDateKey(dayAfter(change, -1)));

      // Into the day of the change, then out of it: one of the two midnights ends a day that
      // is not 24 hours long.
      for (const day of [change, dayAfter(change, 1)]) {
        await runTo(card, at(dayAfter(day, -1), 23, 50));
        const calls = callApi.mock.calls.length;
        await runTo(card, at(day, 0, 5));

        expect(callApi.mock.calls.length).toBe(calls + 1);
        expect(lastRequestedFrom()).toBe(getLocalDateKey(day));
        expect(drawn(card)).toEqual([
          `Day ${getLocalDateKey(day)}`,
          `Day ${getLocalDateKey(dayAfter(day, 1))}`,
        ]);
      }
    },
  );
});
