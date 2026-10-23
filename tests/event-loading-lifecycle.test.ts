/**
 * When the card asks Home Assistant for events, when it trusts its cache, and what it
 * shows when a calendar fails — driven through the real lifecycle in Home Assistant's own
 * mount order: config and `hass` first, then attach.
 *
 * Four defects motivated this file. The refresh timer was armed before the fetch it
 * accompanied had written the cache, and the cache lived exactly one interval, so every
 * other tick found it a few milliseconds young and skipped: the card refreshed at twice
 * its configured interval. The first `hass` forced a fetch that superseded the cache read
 * from `connectedCallback`, so the cache never shortened a page load. A calendar that
 * failed disappeared with nothing on screen. And a retry waited a full interval.
 *
 * Falsifiers, each checked by planting it: arming the timer one interval from "now"
 * after each tick halves the refresh count; restoring a forced fetch in `updated()` fails
 * the warm-mount cases; dropping the synchronous snapshot from `updateEvents` fails the
 * first-frame case; returning `nothing` from `_renderFetchErrorNotice` fails the notice
 * cases; making `navigate` refetch whenever an entry has failures fails the backoff cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import { memoryStorage } from './memory-storage';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import '../src/calendar-card-pro';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  events: Types.CalendarEventData[];
  isInitialLoad: boolean;
  updateEvents(mode?: string | boolean): Promise<void>;
  refreshEvents(): Promise<void>;
  updateComplete: Promise<boolean>;
  _handleVisibilityChange(): void;
  _lastUpdateTime: number;
}

type Answer = unknown[] | Error;

/**
 * A `hass` whose calendars answer after `latencyMs` of fake time, from a table the test
 * can change between requests.
 */
function scriptedHass(
  table: Record<string, Answer>,
  latencyMs = 200,
  states: Record<string, unknown> = {},
): { hass: Types.Hass; requests: Array<{ entityId: string; at: number }> } {
  const requests: Array<{ entityId: string; at: number }> = [];
  const hass = {
    states,
    locale: { language: 'en' },
    connection: {},
    callApi: (_method: string, path: string) => {
      const entityId = decodeURIComponent(path.split('?')[0].replace('calendars/', ''));
      requests.push({ entityId, at: Date.now() });
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          const answer = table[entityId] ?? [];
          if (answer instanceof Error) reject(answer);
          else resolve(answer);
        }, latencyMs);
      });
    },
  } as unknown as Types.Hass;
  return { hass, requests };
}

function event(summary: string, hour = 15): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: `2026-06-17T${hour}:00:00Z` },
    end: { dateTime: `2026-06-17T${hour + 1}:00:00Z` },
  } as Types.CalendarEventData;
}

const ANNA_AND_BEN = {
  entities: [{ entity: 'calendar.anna' }, { entity: 'calendar.ben' }],
  days_to_show: 3,
};

/** Configure and hand over `hass`, then attach: the order Home Assistant uses. */
function mount(config: Record<string, unknown>, hass: Types.Hass): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(config);
  card.hass = hass;
  document.body.appendChild(card);
  return card;
}

/** Let every pending timer and microtask up to `ms` from now run. */
async function elapse(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

function noticeText(card: CardUnderTest): string | null {
  const notice = card.shadowRoot?.querySelector('.fetch-error');
  return notice ? (notice.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
}

const summaries = (card: CardUnderTest): string[] => card.events.map((e) => e.summary ?? '').sort();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  document.body.innerHTML = '';
  // Settle any request still open. The in-flight map outlives a test, and a request whose
  // fake timer is thrown away never settles, so the next test asking for the same
  // calendars would join it and wait forever. In a browser the timeout guarantees this.
  await vi.advanceTimersByTimeAsync(Constants.TIMING.CALENDAR_FETCH_TIMEOUT);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the refresh interval', () => {
  it.each([30, 5])(
    'refreshes every %i minutes, not every other interval, with real response latency',
    async (minutes) => {
      const { hass, requests } = scriptedHass({ 'calendar.anna': [event('Anna')] }, 250);
      mount({ entities: [{ entity: 'calendar.anna' }], refresh_interval: minutes }, hass);

      // A minute of headroom: each refresh is due one interval after the previous one
      // *landed*, so the 250 ms responses push every later tick a little further out.
      await elapse(6 * 60 * 60 * 1000 + 60 * 1000);

      // One initial load plus one per interval. Arming the next tick before the fetch it
      // accompanied had written the cache gave half of this.
      expect(requests).toHaveLength(1 + (6 * 60) / minutes);
    },
  );
});

describe('appearing with data on disk', () => {
  async function seed(config: Record<string, unknown>, table: Record<string, Answer>) {
    const { hass } = scriptedHass(table);
    const first = mount(config, hass);
    await elapse(1000);
    first.remove();
  }

  it('draws cached events on the very first frame, before anything has awaited', async () => {
    await seed({ entities: [{ entity: 'calendar.anna' }] }, { 'calendar.anna': [event('Anna')] });
    await elapse(60 * 1000);

    const { hass } = scriptedHass({ 'calendar.anna': [event('Anna, fresh')] });
    const card = mount({ entities: [{ entity: 'calendar.anna' }] }, hass);

    // Synchronously after `appendChild`: no timer, no microtask has run yet.
    expect({ initial: card.isInitialLoad, events: summaries(card) }).toEqual({
      initial: false,
      events: ['Anna'],
    });

    await elapse(1000);
    expect(summaries(card)).toEqual(['Anna, fresh']);
  });

  it('draws events up to 24 hours old while it refetches', async () => {
    await seed({ entities: [{ entity: 'calendar.anna' }] }, { 'calendar.anna': [event('Anna')] });
    vi.setSystemTime(FROZEN_NOW.getTime() + 2 * 60 * 60 * 1000);

    const { hass, requests } = scriptedHass({ 'calendar.anna': [event('Anna, fresh', 18)] });
    const card = mount({ entities: [{ entity: 'calendar.anna' }] }, hass);

    expect(summaries(card)).toEqual(['Anna']);
    await elapse(1000);
    expect({ requests: requests.length, events: summaries(card) }).toEqual({
      requests: 1,
      events: ['Anna, fresh'],
    });
  });

  it('shows the loading state instead of anything older than 24 hours', async () => {
    await seed({ entities: [{ entity: 'calendar.anna' }] }, { 'calendar.anna': [event('Anna')] });
    vi.setSystemTime(FROZEN_NOW.getTime() + 25 * 60 * 60 * 1000);

    const { hass } = scriptedHass({});
    const card = mount({ entities: [{ entity: 'calendar.anna' }] }, hass);

    expect({ initial: card.isInitialLoad, events: card.events.length }).toEqual({
      initial: true,
      events: 0,
    });
  });

  it('commits the fetch it started even when a cache read arrives meanwhile', async () => {
    // A visibility return, or a per-calendar edit, lands while the appear load's fetch is
    // still open. Stopping at the cache would supersede the fetch and discard its answer.
    await seed({ entities: [{ entity: 'calendar.anna' }] }, { 'calendar.anna': [event('Anna')] });
    await elapse(60 * 1000);

    const { hass, requests } = scriptedHass({ 'calendar.anna': [event('Anna, fresh')] }, 500);
    const card = mount({ entities: [{ entity: 'calendar.anna' }] }, hass);
    await elapse(100);
    void card.updateEvents('cache');
    await elapse(1000);

    expect({ requests: requests.length, events: summaries(card) }).toEqual({
      requests: 1,
      events: ['Anna, fresh'],
    });
  });
});

describe('the same element coming back', () => {
  it('does not draw events it loaded more than 24 hours ago', async () => {
    const { hass } = scriptedHass({ 'calendar.anna': [event('Anna')] });
    const card = mount({ entities: [{ entity: 'calendar.anna' }] }, hass);
    await elapse(1000);
    card.remove();

    vi.setSystemTime(FROZEN_NOW.getTime() + 25 * 60 * 60 * 1000);
    document.body.appendChild(card);

    expect({ initial: card.isInitialLoad, events: card.events.length }).toEqual({
      initial: true,
      events: 0,
    });
  });

  it('does not draw the old calendar after its config changed while detached', async () => {
    const { hass } = scriptedHass({ 'calendar.anna': [event('Anna')] });
    const card = mount({ entities: [{ entity: 'calendar.anna' }] }, hass);
    await elapse(1000);
    card.remove();

    card.setConfig({ entities: [{ entity: 'calendar.ben' }] });
    document.body.appendChild(card);

    expect(summaries(card)).toEqual([]);
  });
});

describe('a calendar that fails', () => {
  it('is named at the bottom of the card by its friendly name, and its last events stay', async () => {
    const states = { 'calendar.ben': { state: 'off', attributes: { friendly_name: 'Ben' } } };
    const table: Record<string, Answer> = {
      'calendar.anna': [event('Anna')],
      'calendar.ben': [event('Ben', 17)],
    };
    const { hass } = scriptedHass(table, 200, states);
    const card = mount(ANNA_AND_BEN, hass);
    await elapse(1000);

    // Control: no notice while everything loads.
    expect(noticeText(card)).toBeNull();

    table['calendar.ben'] = new Error('500');
    await elapse(30 * 60 * 1000);
    await card.updateComplete;

    expect({ notice: noticeText(card), events: summaries(card) }).toEqual({
      notice: "Couldn't load: Ben",
      events: ['Anna', 'Ben'],
    });
    // Below the events, not in place of them.
    const content = card.shadowRoot?.querySelector('.content-container');
    expect(content?.nextElementSibling?.classList.contains('fetch-error')).toBe(true);
  });

  it('is named by its entity id when Home Assistant does not know it', async () => {
    const { hass } = scriptedHass({ 'calendar.typo': new Error('Entity not found') });
    const card = mount({ entities: [{ entity: 'calendar.typo' }] }, hass);
    await elapse(1000);
    await card.updateComplete;

    expect(noticeText(card)).toBe("Couldn't load: calendar.typo");
    expect(card.shadowRoot?.textContent).not.toContain('Error:');
  });

  it('is retried after 1, 2 and 4 minutes, then at the normal interval once it recovers', async () => {
    const table: Record<string, Answer> = {
      'calendar.anna': [event('Anna')],
      'calendar.ben': new Error('500'),
    };
    const { hass, requests } = scriptedHass(table, 0);
    mount(ANNA_AND_BEN, hass);
    await elapse(0);

    const rounds = (): number[] =>
      requests
        .filter((r) => r.entityId === 'calendar.ben')
        // Whole seconds, in minutes: a zero-latency fake response still takes a tick.
        .map((r) => Math.round((r.at - FROZEN_NOW.getTime()) / 1000) / 60);

    await elapse(7 * 60 * 1000 + 1000);
    expect(rounds()).toEqual([0, 1, 3, 7]);

    table['calendar.ben'] = [event('Ben')];
    await elapse(8 * 60 * 1000);
    // The 7-minute attempt failed too, so the next is 8 minutes later and succeeds.
    expect(rounds()).toEqual([0, 1, 3, 7, 15]);

    await elapse(30 * 60 * 1000);
    expect(rounds()).toEqual([0, 1, 3, 7, 15, 45]);
  });

  it('is not retried early by a view switch or a returning tab', async () => {
    const table: Record<string, Answer> = { 'calendar.ben': new Error('500') };
    const { hass, requests } = scriptedHass(table, 0);
    const card = mount({ entities: [{ entity: 'calendar.ben' }] }, hass);
    await elapse(10 * 1000);
    expect(requests).toHaveLength(1);

    // A view switch: detach and reattach, refresh_on_navigate at its default (on).
    card.remove();
    document.body.appendChild(card);
    await elapse(10 * 1000);

    // A tab coming back.
    card._lastUpdateTime = 0;
    card._handleVisibilityChange();
    await elapse(10 * 1000);

    expect(requests).toHaveLength(1);
    // Control: the retry itself still comes.
    await elapse(60 * 1000);
    expect(requests).toHaveLength(2);
  });

  it('does not cost a fetch when a per-calendar option is edited', async () => {
    // An empty answer is cached for 15 seconds, so 20 seconds on the entry is due while
    // the card's own refresh is still half an hour out. A color edit there only needs the
    // cached payload processed again; asking Home Assistant would cost a request per
    // keystroke, and against a failing calendar wait up to the timeout.
    const { hass, requests } = scriptedHass({ 'calendar.ben': [] }, 0);
    const card = mount({ entities: [{ entity: 'calendar.ben', color: 'red' }] }, hass);
    await elapse(20 * 1000);

    card.setConfig({ entities: [{ entity: 'calendar.ben', color: 'blue' }] });
    await elapse(1000);

    expect(requests).toHaveLength(1);
  });

  it('shares one retry between two cards showing the same calendars', async () => {
    const { hass, requests } = scriptedHass({ 'calendar.ben': new Error('500') }, 0);
    mount({ entities: [{ entity: 'calendar.ben' }] }, hass);
    await elapse(20 * 1000);
    mount({ entities: [{ entity: 'calendar.ben' }] }, hass);
    await elapse(1000);

    // The second card read the first one's failure and its deadline.
    expect(requests).toHaveLength(1);
    await elapse(60 * 1000);
    expect(requests).toHaveLength(2);
  });

  it('stops being named once it is removed from the config', async () => {
    const { hass } = scriptedHass(
      { 'calendar.anna': [event('Anna')], 'calendar.ben': new Error('500') },
      0,
    );
    const card = mount(ANNA_AND_BEN, hass);
    await elapse(1000);
    await card.updateComplete;
    expect(noticeText(card)).toBe("Couldn't load: calendar.ben");

    card.setConfig({ entities: [{ entity: 'calendar.anna' }], days_to_show: 3 });
    await card.updateComplete;
    expect(noticeText(card)).toBeNull();
  });
});

describe('refreshing after the card changed a calendar', () => {
  it('fetches even when the cache is fresh, and commits that answer', async () => {
    const table: Record<string, Answer> = { 'calendar.anna': [event('Anna')] };
    const { hass, requests } = scriptedHass(table);
    const card = mount({ entities: [{ entity: 'calendar.anna' }] }, hass);
    await elapse(1000);

    table['calendar.anna'] = [event('Anna'), event('Added', 18)];
    const done = card.refreshEvents();
    await elapse(1000);
    await done;

    expect({ requests: requests.length, events: summaries(card) }).toEqual({
      requests: 2,
      events: ['Added', 'Anna'],
    });
  });
});
