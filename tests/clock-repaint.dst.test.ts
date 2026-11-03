/**
 * Midnight on a card whose dates do not move (#19).
 *
 * Unrelated `hass` updates used to repaint every card, and one of them soon after midnight is
 * what moved the mark of today on a card with a fixed `start_date`: no timer of its own asked
 * for a render then, because nothing had to be loaded. The card skips those updates now, so
 * the clock repaint (`_nextClockRepaint`) arms one for the next local midnight on every card.
 *
 * Local midnight is a zone question, so this runs under each DST project. The guard below
 * fails loudly if it is ever run under UTC instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  requestUpdate(): void;
  _clockTimerAt: number | null;
}

// 23:58 local on the 17th, wherever the project's zone is.
const BEFORE_MIDNIGHT = new Date(2026, 5, 17, 23, 58, 0);

const EVENTS: Types.CalendarEventData[] = [
  { summary: 'Book club', start: { date: '2026-06-17' }, end: { date: '2026-06-18' } },
  { summary: 'Field trip', start: { date: '2026-06-18' }, end: { date: '2026-06-19' } },
];

let callApi: ReturnType<typeof vi.fn>;

async function mount(): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({
    view: 'list',
    entities: ['calendar.anna'],
    start_date: '2026-06-17',
    days_to_show: 2,
    show_past_events: true,
  });
  callApi = vi.fn().mockResolvedValue(EVENTS);
  card.hass = {
    states: {},
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    callApi,
    callService: vi.fn(),
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  callApi.mockClear();
  return card;
}

/** The title drawn under the day the card marks as today. */
const today = (card: CardUnderTest): string | undefined =>
  card.shadowRoot!.querySelector('.today .event-title')?.textContent?.trim();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_MIDNIGHT);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('midnight on fixed dates', () => {
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2025, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2025, 6, 1).getTimezoneOffset();

    expect(janOffset).not.toBe(julOffset);
  });

  it('arms the repaint for one second past local midnight', async () => {
    const card = await mount();

    expect(card._clockTimerAt).toBe(new Date(2026, 5, 18, 0, 0, 1).getTime());
  });

  it('sets the repaint again on waking, rather than keep one stretched by sleep', async () => {
    // Armed at 22:00 for midnight; awake until 23:00, asleep until 23:50. The pending timer
    // kept the delay it had left at 23:00, so untouched it would fire at 00:50.
    vi.setSystemTime(new Date(2026, 5, 17, 22, 0, 0));
    const card = await mount();
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    vi.setSystemTime(new Date(2026, 5, 17, 23, 50, 0));
    card.requestUpdate();
    await card.updateComplete;
    expect(today(card)).toBe('Book club');

    await vi.advanceTimersByTimeAsync(20 * 60_000);
    await card.updateComplete;

    expect(today(card)).toBe('Field trip');
  });

  it('moves the mark of today with no hass update and no fetch', async () => {
    const card = await mount();
    expect(today(card)).toBe('Book club');

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    await card.updateComplete;

    expect(today(card)).toBe('Field trip');
    expect(callApi).not.toHaveBeenCalled();
  });
});
