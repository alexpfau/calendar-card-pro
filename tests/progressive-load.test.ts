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
import * as EventUtils from '../src/utils/events';

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
  // After the grid's last hour, so the grid draws no block for it.
  'calendar.mia': [
    {
      summary: 'Mia late show',
      start: { dateTime: '2026-06-17T22:30:00Z' },
      end: { dateTime: '2026-06-17T23:30:00Z' },
    },
  ],
  // Tomorrow, on a day a narrow grid sheds.
  'calendar.noah': [
    {
      summary: 'Noah dentist',
      start: { dateTime: '2026-06-18T15:00:00Z' },
      end: { dateTime: '2026-06-18T16:00:00Z' },
    },
  ],
  // Later in the week, on Sunday and Monday.
  'calendar.ivy': [
    {
      summary: 'Ivy hike',
      start: { dateTime: '2026-06-21T09:00:00Z' },
      end: { dateTime: '2026-06-21T12:00:00Z' },
    },
  ],
  'calendar.max': [
    {
      summary: 'Max gym',
      start: { dateTime: '2026-06-22T09:00:00Z' },
      end: { dateTime: '2026-06-22T10:00:00Z' },
    },
  ],
  // Over before the card loads, so with past events hidden it draws nothing.
  'calendar.clara': [
    {
      summary: 'Clara breakfast',
      start: { dateTime: '2026-06-17T07:00:00Z' },
      end: { dateTime: '2026-06-17T08:00:00Z' },
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

/**
 * Answers each calendar with one event on the first day of the window asked for, or fails
 * where `failOn` names that day.
 */
function pagedHass(answers: Record<string, Answer & { failOn?: string }>) {
  const callApi = vi.fn((_method: string, path: string) => {
    const id = path.slice('calendars/'.length).split('?')[0];
    const day = new URLSearchParams(path.split('?')[1]).get('start')!.slice(0, 10);
    const name = id === 'calendar.anna' ? 'Anna swim' : 'Ben piano';
    return new Promise((resolve, reject) =>
      setTimeout(
        () =>
          answers[id].failOn === day
            ? reject(new Error('Internal Server Error'))
            : resolve([
                {
                  summary: `${name} ${day}`,
                  start: { dateTime: `${day}T15:00:00Z` },
                  end: { dateTime: `${day}T16:00:00Z` },
                },
              ]),
        answers[id].after,
      ),
    );
  });
  return {
    states: {},
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    callApi,
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

/** Answers each calendar with one event on every day of the window asked for. */
function dailyHass(answers: Record<string, Answer>) {
  const callApi = vi.fn((_method: string, path: string) => {
    const id = path.slice('calendars/'.length).split('?')[0];
    const query = new URLSearchParams(path.split('?')[1]);
    const name = id === 'calendar.anna' ? 'Anna swim' : 'Ben piano';
    const events: Types.CalendarEventData[] = [];
    for (
      let day = new Date(query.get('start')!);
      day < new Date(query.get('end')!);
      day = new Date(day.getTime() + 86_400_000)
    ) {
      const date = day.toISOString().slice(0, 10);
      events.push({
        summary: `${name} ${date}`,
        start: { dateTime: `${date}T15:00:00Z` },
        end: { dateTime: `${date}T16:00:00Z` },
      });
    }
    return new Promise((resolve) => setTimeout(() => resolve(events), answers[id].after));
  });
  return {
    states: {},
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    callApi,
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

/** Anna has an event on every day of the window asked for; Ben has an all-day trip, 17–19 June. */
function tripHass(answers: Record<string, Answer>) {
  const daily = dailyHass(answers);
  const callApi = vi.fn((method: string, path: string) => {
    const id = path.slice('calendars/'.length).split('?')[0];
    if (id !== 'calendar.ben') return daily.callApi(method, path);
    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve([
            { summary: 'Ben trip', start: { date: '2026-06-17' }, end: { date: '2026-06-20' } },
          ]),
        answers[id].after,
      ),
    );
  });
  return { ...daily, callApi } as unknown as Types.Hass;
}

beforeEach(() => {
  // Pages are kept page-wide, and one case's page must not be another's cache.
  EventUtils.clearPageStore();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-17T10:00:00Z'));
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(async () => {
  // Settle every request still out. The requests are shared page-wide by calendar and dates,
  // so one left pending would be joined by the next case and decide what it sees. The cards go
  // first, so none of them starts another request, a failure's retry, while time passes.
  document.body.replaceChildren();
  await vi.advanceTimersByTimeAsync(60_000);
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
    // Anna fails first. Leo's answer is drawn while Ben is still out, with no notice yet.
    const { hass } = hassFor({
      'calendar.anna': { after: 100, fail: true },
      'calendar.leo': { after: 150 },
      'calendar.ben': { after: 3000 },
    });
    const card = attach(hass, ['calendar.anna', 'calendar.leo', 'calendar.ben']);

    await settleFor(card, 200);
    expect(drawn(card)).toEqual(['Leo football']);
    expect(failureNotice(card)).toBe('');

    await settleFor(card, 3000);
    expect(drawn(card)).toEqual(['Leo football', 'Ben piano']);
    expect(failureNotice(card)).toContain('calendar.anna');
  });

  it('keeps its loading state while what answered would draw no event', async () => {
    // Clara's only event is over, and past events are hidden: drawing her answer would show
    // the day as empty while Ben is still out.
    const { hass } = hassFor({
      'calendar.clara': { after: 100 },
      'calendar.ben': { after: 3000 },
    });
    const card = attach(hass, ['calendar.clara', 'calendar.ben']);

    await settleFor(card, 200);

    expect(card.isInitialLoad).toBe(true);

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Ben piano']);
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

  it("is not held back by a replaced request's answer arriving after its own", async () => {
    // Released by hand: Leo answers the new request, then Anna the replaced one, in one task.
    const pending: Array<[string, () => void]> = [];
    const release = (id: string): void => {
      const index = pending.findIndex(([key]) => key === id);
      pending.splice(index, 1)[0][1]();
    };
    const callApi = vi.fn((_method: string, path: string) => {
      const id = path.slice('calendars/'.length).split('?')[0];
      return new Promise((resolve) => pending.push([id, () => resolve(EVENTS[id])]));
    });
    const hass = {
      states: {},
      locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
      callApi,
      callService: vi.fn(),
    } as unknown as Types.Hass;
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(card, 0);
    card.setConfig({ entities: ['calendar.leo', 'calendar.ben'], days_to_show: 1 });
    await settleFor(card, 0);

    release('calendar.leo');
    release('calendar.anna');
    await settleFor(card, 10);

    expect(drawn(card)).toEqual(['Leo football']);
    while (pending.length) pending.shift()![1]();
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

describe('a page of dates not shown before', () => {
  it('draws the calendars that answered on the new page, under its own dates', async () => {
    // Ben failed on today's page; whether he fails on the next is not known until he answers.
    const hass = pagedHass({
      'calendar.anna': { after: 100 },
      'calendar.ben': { after: 3000, failOn: '2026-06-17' },
    });
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({
      entities: ['calendar.anna', 'calendar.ben'],
      days_to_show: 1,
      toolbar: {
        show: true,
        navigation: true,
        view_switcher: false,
        add_event: false,
        reset: false,
        refresh: false,
      },
    });
    card.hass = hass;
    document.body.appendChild(card);
    await settleFor(card, 3100);
    expect(drawn(card)).toEqual(['Anna swim 2026-06-17']);
    expect(failureNotice(card)).toContain('calendar.ben');

    card.shadowRoot!.querySelectorAll<HTMLButtonElement>('.date-navigation-segment')[2].click();
    await settleFor(card, 200);

    expect(drawn(card)).toEqual(['Anna swim 2026-06-18']);
    expect(failureNotice(card)).toBe('');

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Anna swim 2026-06-18', 'Ben piano 2026-06-18']);
    expect(failureNotice(card)).toBe('');
  });
});

describe('a load the view would not draw', () => {
  it("keeps its loading state while what answered lies outside the grid's hours", async () => {
    const { hass } = hassFor({ 'calendar.mia': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ view: 'grid', entities: ['calendar.mia', 'calendar.ben'], days_to_show: 1 });
    card.hass = hass;
    document.body.appendChild(card);

    await settleFor(card, 200);

    expect(card.isInitialLoad).toBe(true);

    await settleFor(card, 3000);

    expect(card.isInitialLoad).toBe(false);
    expect(card.shadowRoot!.textContent).toContain('Ben piano');
  });

  it('keeps its loading state while what answered lies on a day the width sheds', async () => {
    // Three days, measured to one column: only today is drawn, and Noah's only event is
    // tomorrow's.
    const { hass } = hassFor({ 'calendar.noah': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest & {
      _handleWidthMeasured(widthPx: number): void;
      _shownColumnCount: number;
    };
    card.setConfig({ view: 'grid', entities: ['calendar.noah', 'calendar.ben'], days_to_show: 3 });
    card.hass = hass;
    document.body.appendChild(card);
    await settleFor(card, 10);
    card._handleWidthMeasured(200);
    await card.updateComplete;
    expect(card._shownColumnCount).toBe(1);

    await settleFor(card, 200);

    expect(card.isInitialLoad).toBe(true);

    await settleFor(card, 3000);

    expect(card.shadowRoot!.textContent).toContain('Ben piano');
  });
});

describe('a start date not shown before', () => {
  it('draws the calendars that answered under the new dates', async () => {
    const hass = pagedHass({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(card, 3100);
    expect(drawn(card)).toEqual(['Anna swim 2026-06-17', 'Ben piano 2026-06-17']);

    card.setConfig({
      entities: ['calendar.anna', 'calendar.ben'],
      days_to_show: 1,
      start_date: '2026-06-24',
    });
    await settleFor(card, 200);

    expect(drawn(card)).toEqual(['Anna swim 2026-06-24']);

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Anna swim 2026-06-24', 'Ben piano 2026-06-24']);
  });
});

describe('the next day, at midnight', () => {
  it('keeps the days still on screen drawn until every calendar has answered', async () => {
    // Two days from today: at midnight the window moves one day, and the 18th, still on
    // screen, must not lose Ben while only Anna has answered.
    vi.setSystemTime(new Date('2026-06-17T23:58:00Z'));
    const hass = dailyHass({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);
    (card as unknown as { setConfig(c: unknown): void }).setConfig({
      entities: ['calendar.anna', 'calendar.ben'],
      days_to_show: 2,
    });
    await settleFor(card, 3100);
    expect(drawn(card)).toContain('Ben piano 2026-06-18');

    // Past midnight, and the load the midnight timer starts is out.
    await settleFor(card, 2 * 60_000 - 3100 + 1300);

    expect(drawn(card)).toContain('Ben piano 2026-06-18');

    await settleFor(card, 3000);

    expect(drawn(card)).toContain('Ben piano 2026-06-19');
  });

  it("keeps a slow calendar's trip on a one-day card while the trip goes on", async () => {
    // The trip was loaded for the 17th and is drawn on the 18th as well, beyond the window it
    // was loaded for: the midnight load must not take it off while only Anna has answered.
    vi.setSystemTime(new Date('2026-06-17T23:58:00Z'));
    const hass = tripHass({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(card, 3100);
    expect(drawn(card)).toContain('Ben trip');

    await settleFor(card, 2 * 60_000 - 3100 + 1300);

    expect(drawn(card)).toEqual(['Ben trip']);

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Ben trip', 'Anna swim 2026-06-18']);
  });
});

describe('a retry after every calendar failed', () => {
  it('draws the calendars that answered, with nothing drawn to keep', async () => {
    const answers: Record<string, Answer> = {
      'calendar.anna': { after: 100, fail: true },
      'calendar.ben': { after: 100, fail: true },
    };
    const { hass, callApi } = hassFor(answers);
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(card, 200);
    expect(drawn(card)).toEqual([]);
    expect(failureNotice(card)).toContain('calendar.anna');

    answers['calendar.anna'] = { after: 100 };
    answers['calendar.ben'] = { after: 3000 };
    // The retry starts a minute after the failure, and Anna answers it 100 ms later.
    await settleFor(card, 60_300);

    expect(callApi).toHaveBeenCalledTimes(4);
    expect(drawn(card)).toEqual(['Anna swim']);
    expect(card.isLoading).toBe(true);

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano']);
  });
});

describe('a page with the same dates home loads', () => {
  it('is drawn as it answers, since its days are not on screen', async () => {
    // A week from the start of the week, shed to one column: home draws Wednesday, and the
    // page starting Monday loads exactly home's dates but shows other days.
    const hass = dailyHass({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest & {
      _handleWidthMeasured(widthPx: number): void;
      _pickDate(value: string): void;
      _pageShown: string | null;
    };
    card.setConfig({
      view: 'grid',
      entities: ['calendar.anna', 'calendar.ben'],
      days_to_show: 7,
      start_date: 'start_of_week',
      toolbar: { show: true, navigation: true, view_switcher: false, add_event: false },
    });
    card.hass = hass;
    document.body.appendChild(card);
    await settleFor(card, 10);
    card._handleWidthMeasured(200);
    await settleFor(card, 3100);

    card._pickDate('2026-06-15');
    await settleFor(card, 200);

    expect(card._pageShown).toBe('2026-06-15');
    expect(card.shadowRoot!.textContent).toContain('Anna swim 2026-06-15');
  });
});

describe('days drawn, against days loaded', () => {
  type Measured = CardUnderTest & {
    _handleWidthMeasured(widthPx: number): void;
    _pickDate(value: string): void;
    _pageShown: string | null;
  };

  function weekGrid(hass: Types.Hass): Measured {
    const card = document.createElement('calendar-card-pro-dev') as unknown as Measured;
    card.setConfig({
      view: 'grid',
      entities: ['calendar.anna', 'calendar.ben'],
      days_to_show: 7,
      toolbar: { show: true, navigation: true, view_switcher: false, add_event: false },
    });
    card.hass = hass;
    document.body.appendChild(card);
    return card;
  }

  it('draws a page as it answers when the width narrowed after the week was loaded', async () => {
    // Loaded at full width, then narrowed to one column: only today is drawn. Tomorrow was
    // loaded but is not on screen, so its page is new to the eye.
    const hass = dailyHass({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = weekGrid(hass);
    await settleFor(card, 3100);
    card._handleWidthMeasured(200);
    await card.updateComplete;

    card._pickDate('2026-06-18');
    await settleFor(card, 200);

    expect(card._pageShown).toBe('2026-06-18');
    expect(card.shadowRoot!.textContent).toContain('Anna swim 2026-06-18');
  });

  it('keeps the day on screen at midnight when a week was loaded behind one column', async () => {
    // The 18th was loaded the day before and is the day drawn after midnight; the midnight
    // load must not take Ben off it while only Anna has answered.
    vi.setSystemTime(new Date('2026-06-17T23:58:00Z'));
    const hass = dailyHass({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = weekGrid(hass);
    await settleFor(card, 10);
    card._handleWidthMeasured(200);
    await settleFor(card, 3100);

    await settleFor(card, 2 * 60_000 - 3110 + 1300);

    expect(card.shadowRoot!.textContent).toContain('Ben piano 2026-06-18');
  });

  it("draws today as it answers over yesterday's saved events", async () => {
    // One day per page: yesterday's events, still under a day old, are drawn for today on
    // opening, and none of them is on today. Today's calendars draw as they answer.
    const hass = dailyHass({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const yesterday = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(yesterday, 3100);
    expect(drawn(yesterday)).toEqual(['Anna swim 2026-06-17', 'Ben piano 2026-06-17']);
    yesterday.remove();

    vi.setSystemTime(new Date('2026-06-18T08:00:00Z'));
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(card, 200);

    expect(drawn(card)).toEqual(['Anna swim 2026-06-18']);
  });
});

describe('a reload of the days on screen', () => {
  it('keeps them drawn when the width sheds days and empty days are not drawn', async () => {
    // A week in two columns, without the date navigation: the columns are the first two days
    // with events, Sunday and Monday, not today and tomorrow. Reloading them must not take Max
    // off while only Ivy has answered.
    const { hass } = hassFor({ 'calendar.ivy': { after: 100 }, 'calendar.max': { after: 3000 } });
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest & {
      _handleWidthMeasured(widthPx: number): void;
      _shownColumnCount: number;
      refreshEvents(): Promise<void>;
    };
    card.setConfig({
      view: 'grid',
      entities: ['calendar.ivy', 'calendar.max'],
      days_to_show: 7,
      time_grid: { show_empty_days: false },
    });
    card.hass = hass;
    document.body.appendChild(card);
    await settleFor(card, 10);
    card._handleWidthMeasured(300);
    await settleFor(card, 3100);
    expect(card._shownColumnCount).toBe(2);
    expect(card.shadowRoot!.textContent).toContain('Max gym');

    void card.refreshEvents();
    await settleFor(card, 200);

    expect(card.isLoading).toBe(true);
    expect(card.shadowRoot!.textContent).toContain('Max gym');

    await settleFor(card, 3000);

    expect(card.shadowRoot!.textContent).toContain('Ivy hike');
    expect(card.shadowRoot!.textContent).toContain('Max gym');
  });
});

describe('a calendar the legend hides', () => {
  it('keeps the loading state while only it has answered', async () => {
    const { hass } = hassFor({ 'calendar.anna': { after: 100 }, 'calendar.ben': { after: 3000 } });
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest & {
      _hiddenCalendars: ReadonlySet<string>;
    };
    card.setConfig({
      entities: ['calendar.anna', 'calendar.ben'],
      days_to_show: 1,
      toolbar: { show: true, legend: true, view_switcher: false, add_event: false },
    });
    card.hass = hass;
    document.body.appendChild(card);
    // After attaching, which reads the calendars this device hides from its storage.
    card._hiddenCalendars = new Set(['calendar.anna']);

    await settleFor(card, 200);

    expect(card.isInitialLoad).toBe(true);

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Ben piano']);
  });
});

describe('a configuration change on the same dates', () => {
  it('keeps the events drawn until every calendar has answered', async () => {
    // A card whose configuration changes in place, outside the editor's preview (which builds a
    // new card for every edit): adding a calendar must not take the others away for as long as
    // the slowest one takes.
    const { hass } = hassFor({
      'calendar.anna': { after: 100 },
      'calendar.ben': { after: 3000 },
      'calendar.leo': { after: 3000 },
    });
    const card = attach(hass, ['calendar.anna', 'calendar.ben']);
    await settleFor(card, 3100);
    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano']);

    card.setConfig({
      entities: ['calendar.anna', 'calendar.ben', 'calendar.leo'],
      days_to_show: 1,
    });
    await settleFor(card, 200);

    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano']);

    await settleFor(card, 3000);

    expect(drawn(card)).toEqual(['Leo football', 'Anna swim', 'Ben piano']);
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
