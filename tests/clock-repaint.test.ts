/**
 * The clock repaint (#19): what keeps time-dependent text moving now that an unrelated `hass`
 * update no longer renders the card.
 *
 * Before, every state change in the house repainted the card, and that alone kept a countdown
 * counting, a progress bar filling and an `allday_expires_at` event leaving on time. Each case
 * here passes time with fake timers and no `hass` traffic at all, and asserts on what is drawn.
 * Midnight, which depends on the zone, is pinned in `clock-repaint.dst.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

const NOW = new Date('2026-06-17T10:00:00Z');

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  render(): unknown;
  _clockTimerId: number | null;
  _clockTimerAt: number | null;
}

let callApi: ReturnType<typeof vi.fn>;

async function mount(
  config: Record<string, unknown>,
  events: Types.CalendarEventData[],
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 2, ...config });
  callApi = vi.fn().mockResolvedValue(events);
  card.hass = {
    states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
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

const passMinutes = async (card: CardUnderTest, minutes: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(minutes * 60_000);
  await card.updateComplete;
};

const text = (card: CardUnderTest, selector: string): string[] =>
  [...card.shadowRoot!.querySelectorAll(selector)].map((el) => el.textContent?.trim() ?? '');

const nextMidnight = (now: number): number => {
  const day = new Date(now);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 1).getTime();
};

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

const LATER_TODAY: Types.CalendarEventData = {
  summary: 'Piano lesson',
  start: { dateTime: '2026-06-17T10:40:00Z' },
  end: { dateTime: '2026-06-17T11:30:00Z' },
};

const RUNNING: Types.CalendarEventData = {
  summary: 'Swim practice',
  start: { dateTime: '2026-06-17T09:30:00Z' },
  end: { dateTime: '2026-06-17T10:30:00Z' },
};

describe('a countdown on screen', () => {
  it.each(['list', 'column'] as const)(
    'counts down minute by minute with no hass update, in %s view',
    async (view) => {
      const card = await mount({ view, show_countdown: true }, [LATER_TODAY]);
      expect(text(card, '.time-countdown').join()).toMatch(/40 minutes/);

      await passMinutes(card, 10);

      expect(text(card, '.time-countdown').join()).toMatch(/30 minutes/);
      expect(callApi).not.toHaveBeenCalled();
    },
  );

  it('repaints once a minute, not more', async () => {
    const card = await mount({ view: 'list', show_countdown: true }, [LATER_TODAY]);
    const render = vi.spyOn(card, 'render');

    await passMinutes(card, 10);

    expect(render).toHaveBeenCalledTimes(10);
  });

  it('waits for midnight when the start is on a later day, which counts in days', async () => {
    const tomorrow: Types.CalendarEventData = {
      summary: 'Piano lesson',
      start: { dateTime: '2026-06-18T10:50:00Z' },
      end: { dateTime: '2026-06-18T11:30:00Z' },
    };
    const card = await mount({ view: 'list', show_countdown: true }, [tomorrow]);

    expect(card._clockTimerAt).toBe(nextMidnight(NOW.getTime()));
  });
});

describe('a progress bar on screen', () => {
  const width = (card: CardUnderTest): string[] =>
    [...card.shadowRoot!.querySelectorAll<HTMLElement>('.progress-bar-filled')].map(
      (bar) => bar.style.width,
    );

  it.each(['list', 'column'] as const)('fills with no hass update, in %s view', async (view) => {
    const card = await mount({ view, show_progress_bar: true }, [RUNNING]);
    expect(width(card)).toEqual(['50%']);

    await passMinutes(card, 15);

    expect(width(card)).toEqual(['75%']);
    expect(callApi).not.toHaveBeenCalled();
  });
});

describe('nothing on screen that moves by the minute', () => {
  it('holds only a timer for midnight', async () => {
    const card = await mount({ view: 'list' }, [LATER_TODAY, RUNNING]);

    expect(card._clockTimerAt).toBe(nextMidnight(NOW.getTime()));
  });

  it('holds none in a grid with its now line, whose own tick repaints every minute', async () => {
    const card = await mount({ view: 'grid', show_countdown: true }, [LATER_TODAY]);

    expect(card._clockTimerId).toBeNull();
  });
});

describe('an all-day event that allday_expires_at retires', () => {
  const TODAY: Types.CalendarEventData = {
    summary: 'Trash pickup',
    start: { date: '2026-06-17' },
    end: { date: '2026-06-18' },
  };

  // A refresh interval past the test, so only the card's own timers can repaint it.
  const config = (expires?: string) => ({
    view: 'list',
    show_past_events: false,
    refresh_interval: 120,
    entities: [{ entity: 'calendar.anna', ...(expires ? { allday_expires_at: expires } : {}) }],
  });

  it('leaves at its time with no hass update and no fetch', async () => {
    const card = await mount(config('10:30'), [TODAY]);
    expect(card.shadowRoot!.textContent).toContain('Trash pickup');

    await passMinutes(card, 29);
    expect(card.shadowRoot!.textContent).toContain('Trash pickup');

    await passMinutes(card, 2);
    expect(card.shadowRoot!.textContent).not.toContain('Trash pickup');
    expect(callApi).not.toHaveBeenCalled();
  });

  it('stays all day without it (control)', async () => {
    const card = await mount(config(), [TODAY]);

    await passMinutes(card, 31);

    expect(card.shadowRoot!.textContent).toContain('Trash pickup');
  });
});

describe('the timer itself', () => {
  const setVisibility = (state: DocumentVisibilityState): void => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('stops in a hidden tab, and repaints on return', async () => {
    const card = await mount({ view: 'list', show_countdown: true }, [LATER_TODAY]);
    expect(card._clockTimerId).not.toBeNull();

    setVisibility('hidden');
    expect(card._clockTimerId).toBeNull();

    await passMinutes(card, 20);
    expect(text(card, '.time-countdown').join()).toMatch(/40 minutes/);

    setVisibility('visible');
    await card.updateComplete;

    expect(text(card, '.time-countdown').join()).toMatch(/20 minutes/);
    expect(card._clockTimerId).not.toBeNull();
  });

  it('is released when the card is removed', async () => {
    const card = await mount({ view: 'list', show_countdown: true }, [LATER_TODAY]);

    card.remove();

    expect(card._clockTimerId).toBeNull();
  });
});
