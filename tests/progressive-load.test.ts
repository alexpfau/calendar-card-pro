/**
 * Progressive rendering on a cold load (#20).
 *
 * Calendars are requested together, but the card used to commit them together too, so one slow
 * calendar held back the first paint of every other. On a cold load, with nothing drawn yet for
 * the window, each calendar is now drawn as it answers. A warm load keeps its cached events
 * until every calendar has answered, so no calendar vanishes and comes back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  isLoading: boolean;
  isInitialLoad: boolean;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

const EVENTS: Record<string, Types.CalendarEventData[]> = {
  'calendar.anna': [
    {
      summary: 'Anna swim',
      start: { dateTime: '2026-06-17T15:00:00Z' },
      end: { dateTime: '2026-06-17T16:00:00Z' },
    },
  ],
  'calendar.ben': [
    {
      summary: 'Ben piano',
      start: { dateTime: '2026-06-17T17:00:00Z' },
      end: { dateTime: '2026-06-17T18:00:00Z' },
    },
  ],
  'calendar.leo': [
    {
      summary: 'Leo football',
      start: { dateTime: '2026-06-17T12:00:00Z' },
      end: { dateTime: '2026-06-17T13:00:00Z' },
    },
  ],
};

/** How long each calendar takes to answer, and whether it fails or answers with nothing. */
type Answer = { after: number; fail?: boolean; empty?: boolean };

function hassFor(answers: Record<string, Answer>) {
  const callApi = vi.fn((_method: string, path: string) => {
    const id = path.slice('calendars/'.length).split('?')[0];
    const answer = answers[id] ?? { after: 0 };
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        if (answer.fail) reject(new Error('Internal Server Error'));
        else resolve(answer.empty ? [] : EVENTS[id]);
      }, answer.after),
    );
  });
  const hass = {
    states: {},
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    callApi,
    callService: vi.fn(),
  } as unknown as Types.Hass;
  return { hass, callApi };
}

/** Attached with hass already set, as Home Assistant does: the card starts its own load. */
function attach(hass: Types.Hass, entities: string[]): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities, days_to_show: 1 });
  card.hass = hass;
  document.body.appendChild(card);
  return card;
}

async function settleFor(card: CardUnderTest, ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await card.updateComplete;
}

const drawn = (card: CardUnderTest): string[] =>
  [...card.shadowRoot!.querySelectorAll('.event-title')].map((el) => el.textContent!.trim());

const failureNotice = (card: CardUnderTest): string =>
  card.shadowRoot!.querySelector('.fetch-error')?.textContent?.trim() ?? '';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-17T10:00:00Z'));
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a cold load', () => {
  it('draws the calendars that answered while a slow one is still out', async () => {
    const { hass, callApi } = hassFor({
      'calendar.anna': { after: 100 },
      'calendar.ben': { after: 3000 },
    });
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);

    await settleFor(card, 200);

    expect(drawn(card)).toEqual(['Anna swim']);
    expect(card.isLoading).toBe(true);
    expect(failureNotice(card)).toBe('');

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano']);
    expect(card.isLoading).toBe(false);
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it('draws only once when every calendar answers together', async () => {
    const { hass } = hassFor({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 100 } });
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);
    const render = vi.spyOn(card as unknown as { render(): unknown }, 'render');

    await settleFor(card, 200);

    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano']);
    // The loading state, then the full result. A partial draw in between would be a third.
    expect(render.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('keeps its loading state while the calendars that answered have nothing to draw', async () => {
    // Drawing them would claim the day is empty until the slow calendar arrives.
    const { hass } = hassFor({
      'calendar.anna': { after: 100, empty: true },
      'calendar.ben': { after: 3000 },
    });
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);

    await settleFor(card, 200);

    expect(card.isInitialLoad).toBe(true);

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Ben piano']);
  });

  it('names a failed calendar only once every calendar has answered', async () => {
    const { hass } = hassFor({
      'calendar.anna': { after: 100 },
      'calendar.ben': { after: 3000, fail: true },
    });
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);

    await settleFor(card, 200);
    expect(drawn(card)).toEqual(['Anna swim']);
    expect(failureNotice(card)).toBe('');

    await settleFor(card, 3000);
    expect(drawn(card)).toEqual(['Anna swim']);
    expect(failureNotice(card)).toContain('calendar.ben');
  });

  it('draws nothing of a request a newer one has replaced', async () => {
    const { hass } = hassFor({
      'calendar.anna': { after: 100 },
      'calendar.ben': { after: 3000 },
      'calendar.leo': { after: 3000 },
    });
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(card, 0);

    card.setConfig({ entities: ['calendar.leo'], days_to_show: 1 });
    await settleFor(card, 200);

    expect(drawn(card)).not.toContain('Anna swim');

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Leo football']);
  });

  it('is shared with a second card that joins the request', async () => {
    const { hass, callApi } = hassFor({
      'calendar.anna': { after: 100 },
      'calendar.ben': { after: 3000 },
    });
    const first = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(first, 150);
    expect(drawn(first)).toEqual(['Anna swim']);
    // Joins after Anna answered, so it can only learn of her from what the request kept.
    const second = attach(hass, ['calendar.anna', 'calendar.ben']);

    await settleFor(second, 50);

    expect(drawn(second)).toEqual(['Anna swim']);
    await settleFor(second, 3000);
    expect(callApi).toHaveBeenCalledTimes(2);
  });
});

describe('a warm load', () => {
  it('keeps every cached calendar until every calendar has answered', async () => {
    const { hass } = hassFor({ 'calendar.anna': { after: 0 }, 'calendar.ben': { after: 0 } });
    const earlier = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(earlier, 10);
    expect(drawn(earlier)).toEqual(['Anna swim', 'Ben piano']);
    earlier.remove();
    await vi.advanceTimersByTimeAsync(60_000);

    const slow = hassFor({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = attach(slow.hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(card, 200);

    // The appear load refetches in the background (`refresh_on_navigate`), and while it is out
    // the cached Ben stays drawn rather than giving way to Anna's fresh answer alone.
    expect(slow.callApi).toHaveBeenCalled();
    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano']);

    await settleFor(card, 3000);
    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano']);
  });
});
