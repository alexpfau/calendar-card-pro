/**
 * A forecast that has gone too long without an update is dimmed.
 *
 * Home Assistant pushes a forecast on every update of its weather entity. One that stops coming,
 * as when the connection came back without the subscription, used to stay drawn exactly as a
 * current one. The card now dims the forecast once any type it subscribes to has gone twice its
 * interval without an update: 2 hours for the hourly forecast, 48 for the daily one.
 *
 * It turns stale with nothing else changing, so the clock repaint has to draw it
 * (`_nextClockRepaint`); a `hass` update that changes nothing drawn renders nothing. The hourly
 * cases need no midnight or minute tick in between, so they fail where that repaint is missing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

interface CardElement extends HTMLElement {
  hass: Types.Hass;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<boolean>;
}

const HOUR = 60 * 60_000;

/** A connection holding each forecast subscription's callback, to push to it. */
function makeHass() {
  const push: Record<string, (forecast: Array<Record<string, unknown>>) => void> = {};
  const hass = {
    states: {},
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    callApi: async () => [
      {
        summary: 'Anna swim',
        start: { dateTime: '2026-06-17T15:00:00Z' },
        end: { dateTime: '2026-06-17T16:00:00Z' },
      },
    ],
    callService: vi.fn(),
    connection: {
      async subscribeMessage(
        callback: (message: { forecast: Array<Record<string, unknown>> }) => void,
        payload: { type: string; forecast_type: string },
      ) {
        // Calendar subscriptions answered as Home Assistant before 2026.5 does.
        if (payload.type === 'calendar/event/subscribe') throw { code: 'unknown_command' };
        push[payload.forecast_type] = (forecast) => callback({ forecast });
        return () => undefined;
      },
    },
  } as unknown as Types.Hass;
  return { hass, push };
}

const HOURLY = [
  { datetime: '2026-06-17T15:00:00Z', condition: 'sunny', temperature: 21 },
  { datetime: '2026-06-17T16:00:00Z', condition: 'sunny', temperature: 22 },
];
const DAILY = [{ datetime: '2026-06-17T00:00:00Z', condition: 'sunny', temperature: 23 }];

async function mount(weather: Record<string, unknown>) {
  const { hass, push } = makeHass();
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardElement;
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 1, weather });
  card.hass = hass;
  document.body.appendChild(card);
  await vi.advanceTimersByTimeAsync(50);
  push.hourly?.(HOURLY);
  push.daily?.(DAILY);
  await vi.advanceTimersByTimeAsync(10);
  await card.updateComplete;
  return { card, push };
}

const stale = (card: CardElement): boolean =>
  card.shadowRoot!.querySelector('ha-card')!.classList.contains('weather-stale');

const badge = (card: CardElement, selector: string): HTMLElement | null =>
  card.shadowRoot!.querySelector<HTMLElement>(selector);

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

describe('a forecast that stops updating', () => {
  it('dims the hourly forecast after 2 hours, with nothing else changing', async () => {
    const { card } = await mount({ entity: 'weather.home', position: 'event' });
    expect(badge(card, '.event-weather')).not.toBeNull();
    expect(stale(card)).toBe(false);

    await vi.advanceTimersByTimeAsync(2 * HOUR - 60_000);
    await card.updateComplete;
    expect(stale(card)).toBe(false);

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    await card.updateComplete;
    expect(stale(card)).toBe(true);
    expect(getComputedStyle(badge(card, '.event-weather')!).opacity).toBe('0.5');
  });

  it('is current again with the next update', async () => {
    const { card, push } = await mount({ entity: 'weather.home', position: 'event' });
    await vi.advanceTimersByTimeAsync(2 * HOUR + 60_000);
    await card.updateComplete;
    expect(stale(card)).toBe(true);

    push.hourly(HOURLY);
    await vi.advanceTimersByTimeAsync(10);
    await card.updateComplete;

    expect(stale(card)).toBe(false);
  });

  it('keeps an hourly forecast that updates every hour current', async () => {
    const { card, push } = await mount({ entity: 'weather.home', position: 'event' });
    for (let hour = 0; hour < 4; hour += 1) {
      await vi.advanceTimersByTimeAsync(HOUR);
      push.hourly(HOURLY);
    }
    await vi.advanceTimersByTimeAsync(10);
    await card.updateComplete;

    expect(stale(card)).toBe(false);
  });

  it('gives the daily forecast 48 hours', async () => {
    const { card } = await mount({ entity: 'weather.home', position: 'date' });
    expect(badge(card, '.weather')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(47 * HOUR);
    await card.updateComplete;
    expect(stale(card)).toBe(false);

    await vi.advanceTimersByTimeAsync(2 * HOUR);
    await card.updateComplete;
    expect(stale(card)).toBe(true);
  });
});
