/**
 * `show_time_left` across a clock change and across midnight (backlog item 281), in every zone
 * the DST projects run.
 *
 * Under a full day time left is the time that will pass, and from a full day on it is the wall
 * clock, as a duration is. A night when the clocks go forward tells the two apart, and so does a
 * span of days across that night. The oracle for each is the instants themselves, not the card's
 * own date helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import * as Presentation from '../src/rendering/presentation';

const HOUR = 3_600_000;

/** The first instant of the year's spring change: the first hour whose offset is smaller. */
function springForward(year: number): Date {
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += HOUR) {
    if (new Date(t).getTimezoneOffset() < new Date(t - HOUR).getTimezoneOffset()) {
      return new Date(t);
    }
  }
  throw new Error('no spring change in this zone');
}

/** The first instant of the year's autumn change: the first hour whose offset is larger. */
function fallBack(year: number): Date {
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += HOUR) {
    if (new Date(t).getTimezoneOffset() > new Date(t - HOUR).getTimezoneOffset()) {
      return new Date(t);
    }
  }
  throw new Error('no autumn change in this zone');
}

const SPRING = springForward(2026);
const AUTUMN = fallBack(2026);

const iso = (date: Date) => date.toISOString();

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('time left in a zone with a clock change', () => {
  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
  });

  it('reads the time that will pass, not the clock, through the night the clocks go forward', () => {
    const now = new Date(SPRING.getTime() - HOUR / 2);
    const end = new Date(SPRING.getTime() + (3 * HOUR) / 2);
    // The clock jumps an hour between them, which is what makes this case.
    const clockHours = (date: Date) => date.getHours() + date.getMinutes() / 60;
    const clockGap = (clockHours(end) - clockHours(now) + 24) % 24;
    expect(clockGap).toBe(3);

    const event = {
      summary: 'Night shift',
      start: { dateTime: iso(new Date(now.getTime() - HOUR)) },
      end: { dateTime: iso(end) },
    };
    const config = buildConfig({ show_time_left: true });
    expect(Presentation.eventTimeLeft(event, config, 'en', now)).toBe('2 hr left');
  });

  it('reads whole days on the clock across that night', () => {
    const day = new Date(SPRING.getTime());
    const now = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 12);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 12);
    // An hour short of two days, which an elapsed count would write as "1 day, 23 hr".
    expect(end.getTime() - now.getTime()).toBe(47 * HOUR);

    const event = {
      summary: 'Trip',
      start: { dateTime: iso(new Date(now.getTime() - HOUR)) },
      end: { dateTime: iso(end) },
    };
    const config = buildConfig({ show_time_left: true });
    expect(Presentation.eventTimeLeft(event, config, 'en', now)).toBe('2 days left');
  });
});

describe('the night the clocks go back', () => {
  it('never reads more than "1 day left" under a full day on the clock', () => {
    const day = new Date(AUTUMN.getTime());
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
    // Half a minute after noon the day before: just under a day on the clock, and over a day
    // that will pass, since that day is 25 hours long.
    const now = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 12, 0, 30);
    expect(end.getTime() - now.getTime()).toBe(25 * HOUR - 30_000);

    const event = {
      summary: 'Trip',
      start: { dateTime: iso(new Date(now.getTime() - HOUR)) },
      end: { dateTime: iso(end) },
    };
    const config = buildConfig({ show_time_left: true });
    expect(Presentation.eventTimeLeft(event, config, 'en', now)).toBe('1 day left');
    // Once less than 24 hours remain, it counts them.
    const later = new Date(end.getTime() - 24 * HOUR + 60_000);
    expect(Presentation.eventTimeLeft(event, config, 'en', later)).toBe('23 hr, 59 min left');
  });
});

describe("a day's row of an event split at midnight", () => {
  /** 23:00 on January 15, local: every zone here is off UTC in January. */
  const NOW = new Date(2026, 0, 15, 23, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it("counts to the event's own end, not to the midnight its row ends at", async () => {
    expect(NOW.getTimezoneOffset()).not.toBe(0);
    const late = {
      summary: 'Late shift',
      start: { dateTime: iso(new Date(2026, 0, 15, 22, 0)) },
      end: { dateTime: iso(new Date(2026, 0, 16, 2, 0)) },
    };
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({
      entities: ['calendar.anna'],
      view: 'column',
      days_to_show: 2,
      show_time_left: true,
    });
    card.hass = {
      states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
      locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
      connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
      callApi: vi.fn().mockResolvedValue([late]),
      callService: vi.fn(),
    } as unknown as Types.Hass;
    document.body.appendChild(card);
    await card.updateEvents(true);
    await card.updateComplete;

    // Two rows, one per day, and only tonight's is under way.
    const rows = [...card.shadowRoot!.querySelectorAll('.event')].filter((row) =>
      row.querySelector('.event-title'),
    );
    expect(rows).toHaveLength(2);
    expect(
      [...card.shadowRoot!.querySelectorAll('.time-left')].map((el) => el.textContent?.trim()),
    ).toEqual(['3 hr left']);
  });
});
