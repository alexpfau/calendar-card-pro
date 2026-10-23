/**
 * How the event data layer talks to Home Assistant: all calendars at once, each one
 * bounded in time, with failures recorded in the cache so every card sharing the key
 * reads the same answer.
 *
 * Calendars used to be fetched one after another, so a load took the sum of every
 * calendar's latency and one slow calendar held back every calendar after it. A request
 * that never settled pinned the shared in-flight entry for good, so the card silently
 * stopped refreshing. A partial result was cached as if it were complete, so a cache read
 * reported success with a calendar missing; and a total failure was not cached at all,
 * so a second card sharing the key went on reading the old entry as healthy.
 *
 * Falsifiers, each checked by planting it: awaiting `callApi` inside a loop in
 * `fetchEvents` fails the "requested together" case; dropping `withTimeout` leaves the
 * hung-calendar case pending; removing the merge in `fetchRawEvents` fails the kept-events
 * cases; deleting `window` from the in-flight signature fails the midnight case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/** One `callApi` request the test settles by hand. */
interface PendingCall {
  entityId: string;
  resolve(events: unknown): void;
  reject(error: unknown): void;
}

/** A `hass` whose calendar requests stay open until the test settles them. */
function manualHass(): { hass: Types.Hass; calls: PendingCall[] } {
  const calls: PendingCall[] = [];
  const hass = {
    states: {},
    locale: { language: 'en' },
    callApi: (_method: string, path: string) =>
      new Promise((resolve, reject) => {
        const entityId = decodeURIComponent(path.split('?')[0].replace('calendars/', ''));
        calls.push({ entityId, resolve, reject });
      }),
  } as unknown as Types.Hass;
  return { hass, calls };
}

/** A `hass` that answers from a table, failing any calendar the table maps to `Error`. */
function tableHass(table: Record<string, unknown[] | Error>): {
  hass: Types.Hass;
  requests: string[];
} {
  const requests: string[] = [];
  const hass = {
    states: {},
    locale: { language: 'en' },
    callApi: (_method: string, path: string) => {
      const entityId = decodeURIComponent(path.split('?')[0].replace('calendars/', ''));
      requests.push(entityId);
      const answer = table[entityId];
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer ?? []);
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

const TWO = buildConfig({
  entities: [{ entity: 'calendar.anna' }, { entity: 'calendar.ben' }],
  days_to_show: 3,
});

const summaries = (events: Types.CalendarEventData[]): string[] =>
  events.map((e) => e.summary ?? '').sort();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  // Settle any request still open; see the same step in event-loading-lifecycle.test.ts.
  await vi.advanceTimersByTimeAsync(Constants.TIMING.CALENDAR_FETCH_TIMEOUT);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('calendars are requested together', () => {
  it('asks every calendar before any of them has answered', async () => {
    const { hass, calls } = manualHass();
    const config = buildConfig({
      entities: ['calendar.anna', 'calendar.ben', 'calendar.clara'],
      days_to_show: 3,
    });

    const pending = EventUtils.fetchEventData(hass, config, 'together', 'network');
    await vi.advanceTimersByTimeAsync(0);

    expect(calls.map((c) => c.entityId)).toEqual([
      'calendar.anna',
      'calendar.ben',
      'calendar.clara',
    ]);

    calls.forEach((c) => c.resolve([]));
    await pending;
  });

  it('keeps config order when a slower calendar answers last', async () => {
    const { hass, calls } = manualHass();

    const pending = EventUtils.fetchEventData(hass, TWO, 'order', 'network');
    await vi.advanceTimersByTimeAsync(0);
    calls[1].resolve([event('Ben first', 12)]);
    await vi.advanceTimersByTimeAsync(0);
    calls[0].resolve([event('Anna second', 18)]);

    const result = await pending;
    expect(result.events.map((e) => e._entityId)).toEqual(['calendar.anna', 'calendar.ben']);
  });

  it('requests a calendar listed twice once, and reports it once when it fails', async () => {
    const { hass, requests } = tableHass({ 'calendar.anna': new Error('500') });
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', event_type: 'all_day' },
        { entity: 'calendar.anna', event_type: 'timed' },
      ],
      days_to_show: 3,
    });

    const result = await EventUtils.fetchEventData(hass, config, 'twice', 'network');

    expect({ requests, failed: result.failedEntities }).toEqual({
      requests: ['calendar.anna'],
      failed: ['calendar.anna'],
    });
  });

  it('gives up on a calendar that never answers, and is not stuck behind it afterwards', async () => {
    const { hass, calls } = manualHass();

    const first = EventUtils.fetchEventData(hass, TWO, 'hung', 'network');
    await vi.advanceTimersByTimeAsync(0);
    calls[0].resolve([event('Anna')]);
    // calls[1] never settles.

    await vi.advanceTimersByTimeAsync(Constants.TIMING.CALENDAR_FETCH_TIMEOUT);
    const result = await first;

    expect({ events: summaries(result.events), failed: result.failedEntities }).toEqual({
      events: ['Anna'],
      failed: ['calendar.ben'],
    });

    // The next attempt is a new request, not a join on the one that never settled.
    const before = calls.length;
    const second = EventUtils.fetchEventData(hass, TWO, 'hung', 'network');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.length - before).toBe(2);
    calls.slice(before).forEach((c) => c.resolve([]));
    await second;
  });
});

describe('failures are recorded in the cache', () => {
  it('treats an empty answer beside a failure as a partial failure', async () => {
    const { hass } = tableHass({ 'calendar.anna': [], 'calendar.ben': new Error('500') });

    const result = await EventUtils.fetchEventData(hass, TWO, 'partial', 'network');
    const snapshot = EventUtils.readEventSnapshot(hass, TWO, 'partial');

    expect({ failed: result.failedEntities, cached: snapshot?.failedEntities }).toEqual({
      failed: ['calendar.ben'],
      cached: ['calendar.ben'],
    });
  });

  it('keeps the last events of a calendar that fails on a later attempt', async () => {
    const ok = tableHass({ 'calendar.anna': [event('Anna')], 'calendar.ben': [event('Ben')] });
    await EventUtils.fetchEventData(ok.hass, TWO, 'keep', 'network');

    vi.advanceTimersByTime(60 * 60 * 1000);
    const failing = tableHass({
      'calendar.anna': [event('Anna again')],
      'calendar.ben': new Error('500'),
    });
    const result = await EventUtils.fetchEventData(failing.hass, TWO, 'keep', 'network');

    expect({ events: summaries(result.events), failed: result.failedEntities }).toEqual({
      events: ['Anna again', 'Ben'],
      failed: ['calendar.ben'],
    });
  });

  it('keeps them only while the last success is under 24 hours old', async () => {
    const ok = tableHass({ 'calendar.anna': [event('Anna')], 'calendar.ben': [event('Ben')] });
    await EventUtils.fetchEventData(ok.hass, TWO, 'bound', 'network');

    // Ben keeps failing, Anna keeps answering, so the entry itself never ages out.
    const failing = tableHass({ 'calendar.anna': [event('Anna')], 'calendar.ben': new Error('x') });
    let result: Types.EventFetchResult | undefined;
    for (const hours of [12, 11]) {
      vi.advanceTimersByTime(hours * 60 * 60 * 1000);
      result = await EventUtils.fetchEventData(failing.hass, TWO, 'bound', 'network');
    }
    // Control: 23 hours after Ben last loaded, its event is still kept.
    expect(summaries(result!.events)).toEqual(['Anna', 'Ben']);

    vi.advanceTimersByTime(60 * 60 * 1000);
    result = await EventUtils.fetchEventData(failing.hass, TWO, 'bound', 'network');
    expect(summaries(result.events)).toEqual(['Anna']);
  });

  it('backs off 1, 2, 4 minutes, capped at the refresh interval, and clears on success', async () => {
    const config = buildConfig({ ...TWO, refresh_interval: 5 });
    const failing = tableHass({ 'calendar.anna': [], 'calendar.ben': new Error('500') });

    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await EventUtils.fetchEventData(failing.hass, config, 'backoff', 'network');
      delays.push((result.nextAttemptAt - Date.now()) / 1000);
      vi.setSystemTime(result.nextAttemptAt);
    }
    expect(delays).toEqual([60, 120, 240, 300, 300]);

    const ok = tableHass({ 'calendar.anna': [event('Anna')], 'calendar.ben': [event('Ben')] });
    const healed = await EventUtils.fetchEventData(ok.hass, config, 'backoff', 'network');
    expect(healed.failedEntities).toEqual([]);
    expect((healed.nextAttemptAt - Date.now()) / 1000).toBe(300);
    expect(EventUtils.readCacheEntry(Object.keys(dumpStorage())[0])?.failureCount).toBeUndefined();
  });

  it('writes a total failure, so a card sharing the key does not read the old entry as healthy', async () => {
    const ok = tableHass({ 'calendar.anna': [event('Anna')], 'calendar.ben': [event('Ben')] });
    await EventUtils.fetchEventData(ok.hass, TWO, 'shared', 'network');

    vi.advanceTimersByTime(60 * 1000);
    const down = tableHass({ 'calendar.anna': new Error('x'), 'calendar.ben': new Error('x') });
    await EventUtils.fetchEventData(down.hass, TWO, 'shared', 'network');

    const other = EventUtils.readEventSnapshot(ok.hass, TWO, 'shared');
    expect({
      failed: other?.failedEntities,
      kept: summaries(other?.events ?? []),
      due: other?.due,
    }).toEqual({ failed: ['calendar.anna', 'calendar.ben'], kept: ['Anna', 'Ben'], due: false });
  });
});

describe('requests in flight', () => {
  it('lets a reload start its own request, and only the newest one write the cache', async () => {
    const { hass, calls } = manualHass();
    const config = buildConfig({ entities: ['calendar.anna'], days_to_show: 3 });

    const older = EventUtils.fetchEventData(hass, config, 'reload', 'network');
    await vi.advanceTimersByTimeAsync(0);
    const reload = EventUtils.fetchEventData(hass, config, 'reload', 'reload');
    await vi.advanceTimersByTimeAsync(0);
    // An ordinary caller after the reload joins the reload, not the older request.
    const joiner = EventUtils.fetchEventData(hass, config, 'reload', 'network');
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toHaveLength(2);

    calls[1].resolve([event('After the write')]);
    calls[0].resolve([event('Before the write')]);
    const [olderResult, reloadResult, joinerResult] = await Promise.all([older, reload, joiner]);

    expect({
      older: summaries(olderResult.events),
      reload: summaries(reloadResult.events),
      joiner: summaries(joinerResult.events),
      cached: summaries(EventUtils.readEventSnapshot(hass, config, 'reload')?.events ?? []),
    }).toEqual({
      older: ['Before the write'],
      reload: ['After the write'],
      joiner: ['After the write'],
      cached: ['After the write'],
    });
  });

  it('keeps the reload joinable when the request it replaced settles first', async () => {
    const { hass, calls } = manualHass();
    const config = buildConfig({ entities: ['calendar.anna'], days_to_show: 3 });

    const older = EventUtils.fetchEventData(hass, config, 'reload-order', 'network');
    await vi.advanceTimersByTimeAsync(0);
    const reload = EventUtils.fetchEventData(hass, config, 'reload-order', 'reload');
    await vi.advanceTimersByTimeAsync(0);

    // The replaced request settling must not unregister the reload.
    calls[0].resolve([event('Before the write')]);
    await older;
    const joiner = EventUtils.fetchEventData(hass, config, 'reload-order', 'network');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);

    calls[1].resolve([event('After the write')]);
    expect(summaries((await joiner).events)).toEqual(['After the write']);
    await reload;
  });

  it('does not join a request for yesterday after midnight', async () => {
    const { hass, calls } = manualHass();
    const config = buildConfig({ entities: ['calendar.anna'], days_to_show: 3 });

    vi.setSystemTime(new Date('2026-06-17T23:59:59.000Z'));
    const yesterday = EventUtils.fetchEventData(hass, config, 'midnight', 'network');
    await vi.advanceTimersByTimeAsync(0);

    vi.setSystemTime(new Date('2026-06-18T00:00:01.000Z'));
    const today = EventUtils.fetchEventData(hass, config, 'midnight', 'network');
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toHaveLength(2);
    calls.forEach((c) => c.resolve([]));
    await Promise.all([yesterday, today]);
  });
});

describe('the cache snapshot', () => {
  it('serves data past its lifetime as due, and nothing older than 24 hours', async () => {
    const config = buildConfig({ entities: ['calendar.anna'], days_to_show: 3 });
    const ok = tableHass({ 'calendar.anna': [event('Anna')] });
    await EventUtils.fetchEventData(ok.hass, config, 'snap', 'network');

    // Control: fresh straight away.
    expect(EventUtils.readEventSnapshot(ok.hass, config, 'snap')?.due).toBe(false);

    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    const stale = EventUtils.readEventSnapshot(ok.hass, config, 'snap');
    expect({ due: stale?.due, events: summaries(stale?.events ?? []) }).toEqual({
      due: true,
      events: ['Anna'],
    });

    vi.advanceTimersByTime(22 * 60 * 60 * 1000);
    expect(EventUtils.readEventSnapshot(ok.hass, config, 'snap')).toBeNull();
  });
});

/** Everything in the stubbed storage, keyed as written. */
function dumpStorage(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    out[key] = JSON.parse(localStorage.getItem(key)!);
  }
  return out;
}
