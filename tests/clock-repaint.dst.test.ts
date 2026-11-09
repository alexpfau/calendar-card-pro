/**
 * Midnight on a card whose dates do not move (#19).
 *
 * Unrelated `hass` updates used to repaint every card, and one of them soon after midnight is
 * what moved the mark of today on a card with a fixed `start_date`: no timer of its own asked
 * for a render then, because nothing had to be loaded. The card skips those updates now, so
 * the clock repaint (`_nextClockRepaint`) arms one for the next local midnight on every
 * visible card, except a grid whose now line already ticks every minute.
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
  readonly effectiveView: string;
  _clockTimerAt: number | null;
}

// 23:58 local on the 17th, wherever the project's zone is.
const BEFORE_MIDNIGHT = new Date(2026, 5, 17, 23, 58, 0);

const EVENTS: Types.CalendarEventData[] = [
  { summary: 'Book club', start: { date: '2026-06-17' }, end: { date: '2026-06-18' } },
  { summary: 'Field trip', start: { date: '2026-06-18' }, end: { date: '2026-06-19' } },
];

let callApi: ReturnType<typeof vi.fn>;

async function mount(
  config: Record<string, unknown> = {},
  events: Types.CalendarEventData[] = EVENTS,
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({
    view: 'list',
    entities: ['calendar.anna'],
    start_date: '2026-06-17',
    days_to_show: 2,
    show_past_events: true,
    ...config,
  });
  callApi = vi.fn().mockResolvedValue(events);
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

describe("today's empty-day notice at midnight", () => {
  // Only the 15th has an event, so the 14th draws a notice. A notice dims once its whole local
  // date has ended (`buildEventPresentation`), and on fixed dates nothing is loaded at midnight,
  // so the clock repaint is what has to dim it then. In January, where every zone here is off
  // UTC, so a repaint at UTC midnight rather than local would miss it.
  const BEFORE_JANUARY_MIDNIGHT = new Date(2026, 0, 14, 23, 58, 0);
  const TOMORROW_ONLY: Types.CalendarEventData[] = [
    { summary: 'Field trip', start: { date: '2026-01-15' }, end: { date: '2026-01-16' } },
  ];

  /** Whether the card's one empty-day notice is drawn as past. */
  const noticeIsPast = (card: CardUnderTest): boolean => {
    const notices = [...card.shadowRoot!.querySelectorAll('.empty-day-title')];
    expect(notices).toHaveLength(1);
    return notices[0].closest('.event')!.classList.contains('past-event');
  };

  it('runs where local midnight is not UTC midnight', () => {
    expect(BEFORE_JANUARY_MIDNIGHT.getTimezoneOffset()).not.toBe(0);
  });

  it.each(['list', 'column'] as const)(
    'dims at midnight in %s view, with no hass update and no fetch',
    async (view) => {
      vi.setSystemTime(BEFORE_JANUARY_MIDNIGHT);
      const card = await mount(
        { view, start_date: '2026-01-14', show_empty_days: true },
        TOMORROW_ONLY,
      );
      expect(card.effectiveView).toBe(view);
      expect(noticeIsPast(card)).toBe(false);

      await vi.advanceTimersByTimeAsync(90_000);
      await card.updateComplete;
      expect(noticeIsPast(card)).toBe(false);

      await vi.advanceTimersByTimeAsync(2 * 60_000);
      await card.updateComplete;
      expect(noticeIsPast(card)).toBe(true);
      expect(callApi).not.toHaveBeenCalled();
    },
  );
});

describe('midnight on a window that follows today, after a sleep', () => {
  // The window moves at midnight, so the new day has to be loaded, not only drawn. Armed at
  // 22:00; awake until 23:00, asleep until 23:50, so the pending load timer kept the delay it
  // had left at 23:00. The render on waking sets it again, and the 19th arrives at midnight.
  const DAYS: Types.CalendarEventData[] = [
    { summary: 'Book club', start: { date: '2026-06-17' }, end: { date: '2026-06-18' } },
    { summary: 'Field trip', start: { date: '2026-06-18' }, end: { date: '2026-06-19' } },
    { summary: 'Bake sale', start: { date: '2026-06-19' }, end: { date: '2026-06-20' } },
  ];

  /** Mounted at 22:00 on the 17th, answering with the events of the window asked for. */
  async function mountFollowing() {
    vi.setSystemTime(new Date(2026, 5, 17, 22, 0, 0));
    const windowed = vi.fn(async (_method: string, path: string) => {
      const query = new URLSearchParams(path.split('?')[1]);
      const start = new Date(query.get('start')!).getTime();
      const end = new Date(query.get('end')!).getTime();
      return DAYS.filter((event) => {
        const [y, m, d] = event.start.date!.split('-').map(Number);
        const day = new Date(y, m - 1, d).getTime();
        return day >= start && day < end;
      });
    });
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ view: 'list', entities: ['calendar.anna'], days_to_show: 2 });
    card.hass = {
      states: {},
      locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
      callApi: windowed,
      callService: vi.fn(),
    } as unknown as Types.Hass;
    document.body.appendChild(card);
    await card.updateEvents(true);
    await card.updateComplete;
    return { card, windowed };
  }

  it('loads the new day at midnight, not a sleep later', async () => {
    const { card, windowed } = await mountFollowing();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    const loadsBefore = windowed.mock.calls.length;

    vi.setSystemTime(new Date(2026, 5, 17, 23, 50, 0));
    card.requestUpdate();
    await card.updateComplete;
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    await card.updateComplete;

    expect(windowed.mock.calls.length).toBeGreaterThan(loadsBefore);
    expect(card.shadowRoot!.textContent).toContain('Bake sale');
  });

  it('loads the missed day at once on waking after midnight', async () => {
    const { card, windowed } = await mountFollowing();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    const loadsBefore = windowed.mock.calls.length;

    // Asleep from 23:00 until 01:00: the timer for midnight is still pending on waking.
    vi.setSystemTime(new Date(2026, 5, 18, 1, 0, 0));
    card.requestUpdate();
    await card.updateComplete;
    await vi.advanceTimersByTimeAsync(1000);
    await card.updateComplete;

    expect(windowed.mock.calls.length).toBeGreaterThan(loadsBefore);
    expect(card.shadowRoot!.textContent).toContain('Bake sale');
  });
});
