/**
 * `show_time_left` (backlog item 281, #164): how long an event under way has left, "47 min left",
 * in the place a countdown takes.
 *
 * Off by default, so every case turns it on, and the cases that say it is drawn sit beside the
 * same event drawn with it off. Zone-dependent arithmetic is in `time-left.dst.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import { CARD_LANGUAGES } from '../src/translations/language-codes';
import { getTranslations } from '../src/translations/localize';
import * as FormatUtils from '../src/utils/format';

const NOW = new Date('2026-06-17T10:00:00Z');

const timed = (summary: string, start: string, end: string): Types.CalendarEventData => ({
  summary,
  start: { dateTime: start },
  end: { dateTime: end },
});

/** Under way since 9:30, half an hour left. */
const RUNNING = timed('Swim practice', '2026-06-17T09:30:00Z', '2026-06-17T10:30:00Z');
/** Starts in 40 minutes. */
const LATER = timed('Piano', '2026-06-17T10:40:00Z', '2026-06-17T11:30:00Z');
/** Ended 30 minutes ago. */
const ENDED = timed('Breakfast', '2026-06-17T09:00:00Z', '2026-06-17T09:30:00Z');

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  _clockTimerAt: number | null;
}

async function mount(
  config: Record<string, unknown>,
  events: Types.CalendarEventData[] = [RUNNING],
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 2, ...config });
  card.hass = {
    states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
    callApi: vi.fn().mockResolvedValue(events),
    callService: vi.fn(),
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  return card;
}

const root = (card: CardUnderTest) => card.shadowRoot!;
const texts = (card: CardUnderTest, selector: string) =>
  [...root(card).querySelectorAll(selector)].map((el) => el.textContent?.trim() ?? '');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('formatTimeLeft', () => {
  const left = (ms: number) => FormatUtils.formatTimeLeft(new Date(NOW.getTime() + ms), NOW, 'en');
  const MIN = 60_000;

  it('rounds up to the minute under a full day, so the last minute reads 1 min', () => {
    expect(left(30_000)).toBe('1 min left');
    expect(left(47 * MIN)).toBe('47 min left');
    expect(left(46 * MIN + 1)).toBe('47 min left');
    expect(left(75 * MIN)).toBe('1 hr, 15 min left');
    expect(left(120 * MIN)).toBe('2 hr left');
  });

  it('counts days and hours from a full day on, rounding the hours up', () => {
    expect(left((2 * 24 + 3) * 60 * MIN)).toBe('2 days, 3 hr left');
    expect(left((2 * 24 + 2) * 60 * MIN + MIN)).toBe('2 days, 3 hr left');
    expect(left(24 * 60 * MIN)).toBe('1 day left');
  });

  it('keeps "1 day" for the minute after the full day, where rounding up would read 24 hr', () => {
    expect(left(24 * 60 * MIN - 30_000)).toBe('1 day left');
    expect(left(24 * 60 * MIN - MIN)).toBe('23 hr, 59 min left');
  });

  it('writes nothing where nothing is left', () => {
    expect(left(0)).toBeNull();
    expect(left(-MIN)).toBeNull();
  });

  it('has a phrase holding the duration once in every card language, and substitutes it', () => {
    expect(CARD_LANGUAGES.length).toBe(39);
    for (const language of CARD_LANGUAGES) {
      const phrase = getTranslations(language).timeLeft;
      expect([language, phrase.split('{duration}').length - 1]).toEqual([language, 1]);
      const text = FormatUtils.formatTimeLeft(new Date(NOW.getTime() + 47 * MIN), NOW, language);
      expect([language, text?.includes('47') && !text.includes('{')]).toEqual([language, true]);
    }
  });
});

describe('list view, the time under the title', () => {
  it('ends the time row with time left, as a countdown would', async () => {
    const card = await mount({ show_time_left: true });
    const left = root(card).querySelector('.time > .time-countdown');
    expect(left?.className).toBe('time-countdown time-left');
    expect(left?.textContent?.trim()).toBe('30 min left');
    document.body.replaceChildren();
    // The control: off by default, nothing in its place.
    expect(texts(await mount({}), '.time-countdown')).toEqual([]);
  });

  it('puts the bar after it, in one box, and leaves a lone bar where it was', async () => {
    const card = await mount({ show_time_left: true, show_progress_bar: true });
    const run = root(card).querySelector('.time > .time-left-run');
    expect([...run!.children].map((child) => child.className)).toEqual([
      'time-countdown time-left',
      'progress-bar',
    ]);
    expect(run!.querySelector<HTMLElement>('.progress-bar-filled')!.style.width).toBe('50%');
    document.body.replaceChildren();
    const bar = await mount({ show_progress_bar: true });
    expect(root(bar).querySelector('.time-left-run')).toBeNull();
    expect(root(bar).querySelector('.time > .progress-bar')).not.toBeNull();
  });

  it('keeps both on the row the countdown takes with times off', async () => {
    const card = await mount({ show_time_left: true, show_progress_bar: true, show_time: false });
    expect(root(card).querySelector('.time > .time-actual:empty')).not.toBeNull();
    expect(texts(card, '.time > .time-left-run > .time-left')).toEqual(['30 min left']);
    document.body.replaceChildren();
    const alone = await mount({ show_time_left: true, show_time: false });
    expect(texts(alone, '.time > .time-countdown.time-left')).toEqual(['30 min left']);
  });
});

describe('folded after the time', () => {
  it.each([
    ['list, beside the title', { time_position: 'title' }],
    ['column view', { view: 'column' }],
    ['grid view', { view: 'grid' }],
  ])('reads after the time in %s, with the bar on a row of its own', async (_, config) => {
    const card = await mount({ ...config, show_time_left: true, show_progress_bar: true });
    expect(texts(card, '.time-text > .time-countdown.time-left')).toEqual(['30 min left']);
    expect(root(card).querySelector('.time-left-run')).toBeNull();
    expect(root(card).querySelector('.progress-bar-row')).not.toBeNull();
  });

  it("names it in a grid block's accessible name", async () => {
    const card = await mount({ view: 'grid', show_time_left: true });
    expect(root(card).querySelector('.grid-event-accessible')?.getAttribute('aria-label')).toMatch(
      /30 min left/,
    );
  });

  it('shows it on the grid block under way after midnight, and names it there alone', async () => {
    // Since 22:00 yesterday: yesterday's block has ended, today's is under way.
    const night = timed('Night shift', '2026-06-16T22:00:00Z', '2026-06-17T12:00:00Z');
    const card = await mount(
      {
        view: 'grid',
        start_date: '2026-06-16',
        // Every hour, so yesterday's block from 22:00 is drawn too.
        time_grid: { start_time: '00:00', end_time: '24:00' },
        show_time_left: true,
        show_progress_bar: true,
      },
      [night],
    );
    const blocks = [...root(card).querySelectorAll('.grid-event')].filter((block) =>
      block.querySelector('.event-title')?.textContent?.includes('Night shift'),
    );
    expect(blocks).toHaveLength(2);
    const drawn = blocks.map((block) => block.querySelector('.time-left')?.textContent?.trim());
    expect(drawn).toEqual([undefined, '2 hr left']);
    const named = blocks.map((block) =>
      /2 hr left/.test(
        block.querySelector('.grid-event-accessible')?.getAttribute('aria-label') ?? '',
      ),
    );
    expect(named).toEqual([false, true]);
    // The bar is on the same block.
    expect(blocks.map((block) => block.querySelector('.progress-bar') !== null)).toEqual([
      false,
      true,
    ]);
  });
});

describe('beside the countdown', () => {
  it('reads a countdown before the event, time left while it runs and a count-up after', async () => {
    const card = await mount(
      { show_countdown: true, show_time_left: true, show_past_events: true },
      [ENDED, RUNNING, LATER],
    );
    expect(texts(card, '.time-countdown')).toEqual([
      '30 minutes ago',
      '30 min left',
      'in 40 minutes',
    ]);
    expect([...root(card).querySelectorAll('.time-countdown')].map((el) => el.className)).toEqual([
      'time-countdown count-up',
      'time-countdown time-left',
      'time-countdown',
    ]);
  });

  it('works with countdowns off, and countdowns without it', async () => {
    const card = await mount({ show_time_left: true }, [RUNNING, LATER]);
    expect(texts(card, '.time-countdown')).toEqual(['30 min left']);
    document.body.replaceChildren();
    expect(
      texts(await mount({ show_countdown: true }, [RUNNING, LATER]), '.time-countdown'),
    ).toEqual(['in 40 minutes']);
  });

  it('never leaves out time left as a repeat under once_per_day', async () => {
    // Begun yesterday, so not the countdown in clock units to today that once_per_day keeps
    // anyway: only being time left keeps the second.
    const night = timed('Night shift', '2026-06-16T22:00:00Z', '2026-06-17T10:30:00Z');
    const twin = { ...night, summary: 'Night shift, ward 2' };
    const card = await mount({ show_countdown: 'once_per_day', show_time_left: true }, [
      night,
      twin,
    ]);
    expect(texts(card, '.time-countdown')).toEqual(['30 min left', '30 min left']);
  });
});

describe('an event a day or longer', () => {
  const TRIP = timed('Trip', '2026-06-16T08:00:00Z', '2026-06-19T08:00:00Z');

  it('names its day with the bar on, and reads time left with it off', async () => {
    const counted = await mount(
      { show_time_left: true, show_progress_bar: true, days_to_show: 1 },
      [TRIP],
    );
    expect(texts(counted, '.time-countdown')).toEqual(['Day 2 of 4']);
    document.body.replaceChildren();
    const left = await mount({ show_time_left: true, days_to_show: 1 }, [TRIP]);
    expect(texts(left, '.time-countdown.time-left')).toEqual(['1 day, 22 hr left']);
  });
});

describe('per calendar', () => {
  it("follows a calendar's own value over the card's", async () => {
    const on = await mount({ entities: [{ entity: 'calendar.anna', show_time_left: true }] });
    expect(texts(on, '.time-left')).toEqual(['30 min left']);
    document.body.replaceChildren();
    const off = await mount({
      show_time_left: true,
      entities: [{ entity: 'calendar.anna', show_time_left: false }],
    });
    expect(texts(off, '.time-countdown')).toEqual([]);
  });
});

describe('the clock repaint', () => {
  it('ticks by the minute with countdowns and the bar off', async () => {
    const card = await mount({ show_time_left: true });
    expect(card._clockTimerAt).toBe(NOW.getTime() + 60_000);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await card.updateComplete;
    expect(texts(card, '.time-left')).toEqual(['20 min left']);
    document.body.replaceChildren();
    // The control: the same card without it waits for midnight.
    expect((await mount({}))._clockTimerAt).not.toBe(NOW.getTime() + 60_000);
  });

  it('ticks for any value that draws it, as YAML may write one', async () => {
    const card = await mount({ show_time_left: 'yes' });
    expect(texts(card, '.time-left')).toEqual(['30 min left']);
    expect(card._clockTimerAt).toBe(NOW.getTime() + 60_000);
  });

  it('asks for no tick where the day counter has the place', async () => {
    const trip = timed('Trip', '2026-06-16T08:00:00Z', '2026-06-19T08:00:00Z');
    const card = await mount({ show_time_left: true, show_progress_bar: true, days_to_show: 1 }, [
      trip,
    ]);
    expect(card._clockTimerAt).not.toBe(NOW.getTime() + 60_000);
  });
});
