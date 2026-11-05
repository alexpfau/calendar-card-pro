/**
 * A week-relative window that moves without the configuration changing.
 *
 * `first_day_of_week: system`, the default, resolves through the Home Assistant profile: its
 * first weekday, or its language when that is left at the language's default. So with
 * `start_date: start_of_week` the window the card draws moves when the profile changes, though
 * the configuration has not. `_homeWindowStart` follows at once, and the cache key follows too,
 * since `getBaseCacheKey` takes the resolved weekday. The two cache identities differ on purpose
 * and together still tell the two windows apart: `generateDeterministicId` keys the raw setting,
 * which a profile change leaves alone, and `getBaseCacheKey` adds the resolved weekday on top.
 *
 * What did not follow was the request. Nothing asked for the new window, so the card drew it
 * with the old window's events, missing whatever fell on the day it gained, until its next
 * refresh or a reload.
 *
 * Falsifier: drop the `_homeWeekMoved` call from `updated()` in `calendar-card-pro.ts`, and
 * both profile cases draw the new Sunday without Brunch: no request is made for it. Each guard
 * in `_homeWeekMoved` is pinned by one of the cases that load nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

/** Wednesday, June 17, 2026; the unit project runs on UTC. */
const NOW = new Date('2026-06-17T10:00:00Z');

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

const EVENTS = [
  {
    summary: 'Brunch',
    start: { dateTime: '2026-06-14T10:00:00Z' },
    end: { dateTime: '2026-06-14T11:00:00Z' },
  },
  {
    summary: 'Swim',
    start: { dateTime: '2026-06-17T15:00:00Z' },
    end: { dateTime: '2026-06-17T16:00:00Z' },
  },
];

/** The first day of every window Home Assistant was asked for. */
let asked: string[] = [];

function hass(locale: Record<string, string>): Types.Hass {
  return {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { friendly_name: 'Anna' },
      },
    },
    locale: { time_format: '24', ...locale },
    config: { country: 'DE' },
    themes: { darkMode: false },
    entities: {},
    connection: {
      subscribeMessage: vi.fn((_callback: unknown, message: { type: string }) =>
        message.type === 'calendar/event/subscribe'
          ? Promise.reject({ code: 'unknown_command' })
          : Promise.resolve(() => {}),
      ),
      subscribeEvents: vi.fn().mockResolvedValue(() => {}),
    },
    callWS: vi.fn().mockResolvedValue({}),
    localize: (key: string) => key,
    formatEntityState: (_stateObj: unknown, value?: string) => String(value ?? ''),
    callApi: vi.fn(async (_method: string, path: string) => {
      const query = new URLSearchParams(path.split('?')[1]);
      const from = Date.parse(query.get('start')!);
      const to = Date.parse(query.get('end')!);
      asked.push(new Date(from).toISOString().slice(0, 10));
      return EVENTS.filter(
        (event) => Date.parse(event.start.dateTime) < to && Date.parse(event.end.dateTime) > from,
      ).map((event) => ({ ...event }));
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

async function mount(
  config: Record<string, unknown>,
  locale: Record<string, string>,
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  // A whole week from its first day; Brunch is on the Sunday before today, so past events
  // are shown.
  card.setConfig({
    entities: ['calendar.anna'],
    start_date: 'start_of_week',
    days_to_show: 7,
    show_past_events: true,
    ...config,
  });
  card.hass = hass(locale);
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  return card;
}

/** Hands the card a profile with another locale, then lets anything it starts settle. */
async function changeProfile(card: CardUnderTest, locale: Record<string, string>): Promise<void> {
  card.hass = { ...card.hass, locale: { time_format: '24', ...locale } } as Types.Hass;
  await card.updateComplete;
  await vi.advanceTimersByTimeAsync(1000);
  await card.updateComplete;
}

const drawn = (card: CardUnderTest): string => card.shadowRoot!.textContent ?? '';

beforeEach(() => {
  asked = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a profile change that moves a week-relative window', () => {
  it('draws the new window with its events when the first weekday changes', async () => {
    const card = await mount({}, { language: 'en', first_weekday: 'monday' });
    // Control: a Monday week starts on the 15th and has no Brunch.
    expect({ asked, brunch: drawn(card).includes('Brunch') }).toEqual({
      asked: ['2026-06-15'],
      brunch: false,
    });

    await changeProfile(card, { language: 'en', first_weekday: 'sunday' });

    expect({
      asked: asked[asked.length - 1],
      brunch: drawn(card).includes('Brunch'),
      swim: drawn(card).includes('Swim'),
    }).toEqual({ asked: '2026-06-14', brunch: true, swim: true });
  });

  it('draws the new window when the language decides the week and changes', async () => {
    // German starts the week on Monday, US English on Sunday.
    const card = await mount({}, { language: 'de', first_weekday: 'language' });
    expect(drawn(card).includes('Brunch')).toBe(false);

    await changeProfile(card, { language: 'en-US', first_weekday: 'language' });

    expect({
      asked: asked[asked.length - 1],
      brunch: drawn(card).includes('Brunch'),
      swim: drawn(card).includes('Swim'),
    }).toEqual({ asked: '2026-06-14', brunch: true, swim: true });
  });
});

describe('profile changes that leave the window where it was', () => {
  /**
   * Hands the card another profile and reports the loads it started and the windows it asked
   * for. Loads are counted as well as requests: a load for a window already cached asks nothing,
   * so requests alone would pass a card that reloads on every profile change.
   */
  async function loadsAfter(
    config: Record<string, unknown>,
    from: Record<string, string>,
    to: Record<string, string>,
  ): Promise<{ loads: number; asked: string[] }> {
    const card = await mount(config, from);
    const updateEvents = vi.spyOn(card, 'updateEvents');
    await changeProfile(card, to);
    return { loads: updateEvents.mock.calls.length, asked };
  }

  it('loads nothing when the configuration names the weekday', async () => {
    expect(
      await loadsAfter(
        { first_day_of_week: 'monday' },
        { language: 'en', first_weekday: 'monday' },
        { language: 'en', first_weekday: 'sunday' },
      ),
    ).toEqual({ loads: 0, asked: ['2026-06-15'] });
  });

  it('loads nothing when the start date does not depend on the week', async () => {
    expect(
      await loadsAfter(
        { start_date: undefined },
        { language: 'en', first_weekday: 'monday' },
        { language: 'en', first_weekday: 'sunday' },
      ),
    ).toEqual({ loads: 0, asked: ['2026-06-17'] });
  });

  it('loads nothing when the language changes and the weekday does not', async () => {
    expect(
      await loadsAfter(
        {},
        { language: 'en', first_weekday: 'monday' },
        { language: 'de', first_weekday: 'monday' },
      ),
    ).toEqual({ loads: 0, asked: ['2026-06-15'] });
  });

  it('loads nothing for a page, whose first day is a date', async () => {
    const card = await mount(
      { toolbar: { show: true, navigation: true } },
      { language: 'en', first_weekday: 'monday' },
    );
    (card as unknown as { _requestPage(page: string): void })._requestPage('2026-06-22');
    await card.updateComplete;
    const updateEvents = vi.spyOn(card, 'updateEvents');
    await changeProfile(card, { language: 'en', first_weekday: 'sunday' });

    expect(updateEvents).not.toHaveBeenCalled();
  });
});
