/**
 * Raising `days_to_show` keeps the days on screen until the wider load lands.
 *
 * A card loads the longest count among the views it can show, and draws a prefix of that
 * load. Raising the count past it asks for a wider load, and the card redrew at once with the
 * new count, so until the answer arrived the days it added read "No events" in a list and stood
 * empty in a grid: a claim about days nothing had been asked for yet. The card now draws the
 * days its events were loaded for until the wider load is committed, as it keeps a page on
 * screen while the next one loads.
 *
 * Lowering the count still asks again, by decision: the cache keys an entry by the days loaded,
 * and deriving a narrower entry from a wider one, failure records and 24-hour bounds included,
 * is not worth one request per edit. The last case pins that, so a change to it is deliberate.
 *
 * Only the days drawn wait. Paging follows the new count at once, or a page asked for during
 * the load would overlap home once it landed; a partial load does not end the wait, since a
 * calendar still out may have events on the added days; and a card left with no calendar has
 * no load to wait for.
 *
 * Falsifiers, in `calendar-card-pro.ts`: drop the `_loadedDaysShown` cap from `effectiveConfig`
 * and the raise cases draw the added days empty while the request is out; read `_viewDays` from
 * the capped count and the paging case overlaps; widen the cap in the partial commit and the
 * second-calendar case draws early; drop the reset where `updateEvents` finds no calendar and
 * the last of those cases stays capped.
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

/** One event a day, E1 today to E14 thirteen days on. */
const EVENTS = Array.from({ length: 14 }, (_, index) => {
  const start = new Date(Date.UTC(2026, 5, 17 + index, 15));
  return {
    summary: `E${index + 1}`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: new Date(start.getTime() + 60 * 60 * 1000).toISOString() },
  };
});

/** Every window Home Assistant was asked for, as `MM-DD..MM-DD`. */
let asked: string[] = [];
/** Answers held back while `holding` is set. */
let held: Array<() => void> = [];
/** Whether answers are held back: all of them, or only those of the calendars named. */
let holding: boolean | ReadonlySet<string> = false;
/** What each calendar answers with. */
let table: Record<string, typeof EVENTS> = {};

function hass(): Types.Hass {
  return {
    states: {
      'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} },
      'calendar.ben': { entity_id: 'calendar.ben', state: 'off', attributes: {} },
    },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
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
    callApi: vi.fn((_method: string, path: string) => {
      const calendar = decodeURIComponent(path.split('?')[0].replace('calendars/', ''));
      const query = new URLSearchParams(path.split('?')[1]);
      const from = Date.parse(query.get('start')!);
      const to = Date.parse(query.get('end')!);
      asked.push(`${query.get('start')!.slice(5, 10)}..${query.get('end')!.slice(5, 10)}`);
      const answer = (table[calendar] ?? [])
        .filter(
          (event) => Date.parse(event.start.dateTime) < to && Date.parse(event.end.dateTime) > from,
        )
        .map((event) => ({ ...event }));
      const holds = holding === true || (holding !== false && holding.has(calendar));
      return new Promise((resolve) => (holds ? held.push(() => resolve(answer)) : resolve(answer)));
    }),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

const BASE = { entities: ['calendar.anna'], show_empty_days: true };

async function mount(config: Record<string, unknown>): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ ...BASE, ...config });
  card.hass = hass();
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  asked = [];
  return card;
}

async function settle(card: CardUnderTest): Promise<void> {
  await card.updateComplete;
  await vi.advanceTimersByTimeAsync(50);
  await card.updateComplete;
}

/** Lets every held answer through. */
async function release(card: CardUnderTest): Promise<void> {
  holding = false;
  for (const resolve of held.splice(0)) resolve();
  await settle(card);
}

/** Changes the configuration with Home Assistant's answers held back, and reads the card. */
async function editHeld(
  card: CardUnderTest,
  config: Record<string, unknown>,
  hold: true | ReadonlySet<string> = true,
): Promise<{ during: string; after: string; asked: string[] }> {
  holding = hold;
  card.setConfig({ ...BASE, ...config });
  await settle(card);
  const during = drawn(card);
  await release(card);
  return { during, after: drawn(card), asked };
}

/** The days the card draws, by their dates, and the events on them. */
function drawn(card: CardUnderTest): string {
  const text = (card.shadowRoot!.textContent ?? '').replace(/\s+/g, ' ');
  const days = [...text.matchAll(/\b(\d{1,2}) Jun\b/g)].map((match) => match[1]);
  const events = [...text.matchAll(/\bE(\d+)\b/g)].map((match) => match[1]);
  return `days ${[...new Set(days)].join(',')} · events ${[...new Set(events)].join(',')}`;
}

beforeEach(() => {
  asked = [];
  held = [];
  holding = false;
  table = { 'calendar.anna': EVENTS };
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('raising days_to_show past the days loaded', () => {
  it.each(['list', 'column'])(
    'keeps the old days in %s until the wider load lands',
    async (view) => {
      const card = await mount({ view, days_to_show: 3 });
      expect(drawn(card)).toBe('days 17,18,19 · events 1,2,3');

      expect(await editHeld(card, { view, days_to_show: 6 })).toEqual({
        during: 'days 17,18,19 · events 1,2,3',
        after: 'days 17,18,19,20,21,22 · events 1,2,3,4,5,6',
        asked: ['06-17..06-23'],
      });
    },
  );

  it('keeps the old days under an absolute start date', async () => {
    const card = await mount({ days_to_show: 3, start_date: '2026-06-24' });

    expect(await editHeld(card, { days_to_show: 5, start_date: '2026-06-24' })).toEqual({
      during: 'days 24,25,26 · events 8,9,10',
      after: 'days 24,25,26,27,28 · events 8,9,10,11,12',
      asked: ['06-24..06-29'],
    });
  });
});

describe('while the wider load is out', () => {
  it('pages by the new count, so the pages after it line up with home', async () => {
    const toolbar = { show: true, navigation: true };
    const card = await mount({ days_to_show: 3, toolbar });
    holding = true;
    card.setConfig({ ...BASE, days_to_show: 6, toolbar });
    await settle(card);

    const step = (direction: -1 | 1) =>
      (card as unknown as { _stepPage(direction: -1 | 1): void })._stepPage(direction);
    step(1);
    await settle(card);
    await release(card);
    const next = drawn(card);
    step(-1);
    await settle(card);

    expect({ next, back: drawn(card) }).toEqual({
      next: 'days 23,24,25,26,27,28 · events 7,8,9,10,11,12',
      back: 'days 17,18,19,20,21,22 · events 1,2,3,4,5,6',
    });
  });

  it('keeps the old days until every calendar has answered', async () => {
    // Nothing on the first three days, so the load draws calendars as they answer.
    table = {
      'calendar.anna': EVENTS.slice(3, 6),
      'calendar.ben': EVENTS.slice(4, 5).map((event) => ({ ...event, summary: 'E99' })),
    };
    const two = { entities: ['calendar.anna', 'calendar.ben'] };
    const card = await mount({ ...two, days_to_show: 3 });

    expect(await editHeld(card, { ...two, days_to_show: 6 }, new Set(['calendar.ben']))).toEqual({
      during: 'days 17,18,19 · events ',
      after: 'days 17,18,19,20,21,22 · events 4,5,99,6',
      asked: ['06-17..06-23', '06-17..06-23'],
    });
  });

  it('draws the new count at once for a card left with no calendar', async () => {
    const card = await mount({ days_to_show: 3 });
    card.setConfig({ ...BASE, entities: [], days_to_show: 6 });
    await settle(card);

    const effective = (card as unknown as { effectiveConfig: Types.Config }).effectiveConfig;
    expect(effective.days_to_show).toBe(6);
  });
});

describe('changes that need no hold', () => {
  it('draws a raise within the days already loaded at once, asking nothing', async () => {
    // Grid's own count makes the card load six days while List draws three.
    const switcher = {
      toolbar: { show: true, view_switcher: true },
      time_grid: { days_to_show: 6 },
    };
    const card = await mount({ ...switcher, days_to_show: 3 });

    expect(await editHeld(card, { ...switcher, days_to_show: 5 })).toEqual({
      during: 'days 17,18,19,20,21 · events 1,2,3,4,5',
      after: 'days 17,18,19,20,21 · events 1,2,3,4,5',
      asked: [],
    });
  });

  it('draws a lowered count at once, and still asks for it', async () => {
    const card = await mount({ days_to_show: 6 });

    expect(await editHeld(card, { days_to_show: 3 })).toEqual({
      during: 'days 17,18,19 · events 1,2,3',
      after: 'days 17,18,19 · events 1,2,3',
      asked: ['06-17..06-20'],
    });
  });
});
