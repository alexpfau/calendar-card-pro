/**
 * Live updates on the card (#20): with Home Assistant pushing calendar changes through
 * `calendar/event/subscribe`, the card draws from the pushes, redraws only when a push changes
 * what it holds, stops polling while every calendar is live, and falls back to polling, with its
 * backoff, wherever one is not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import * as Live from '../src/utils/live-calendars';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  isLoading: boolean;
  readonly updateComplete: Promise<boolean>;
  updateEvents(mode?: string): Promise<void>;
  refreshEvents(afterWrite?: number): Promise<void>;
}

/** An event as Home Assistant pushes it (`CalendarEvent.as_dict`), in New York time. */
interface Pushed {
  start: string;
  end: string;
  summary: string;
  all_day: boolean;
}

const at = (day: string, hour: number, summary: string): Pushed => ({
  start: `${day}T${String(hour).padStart(2, '0')}:00:00-04:00`,
  end: `${day}T${String(hour + 1).padStart(2, '0')}:00:00-04:00`,
  summary,
  all_day: false,
});

interface FakeSub {
  message: { type: string; entity_id: string; start: string; end: string };
  callback: (message: unknown) => void;
  unsubscribed: boolean;
}

/**
 * A Home Assistant whose calendars hold `events`: the REST API answers from them, and each
 * subscription pushes them once on subscribing and again on `change`, as a state write does.
 * `answer` is how it takes a subscription; `restFails` lists calendars REST fails for, and a
 * calendar holding `null` fails both ways.
 */
function homeAssistant(
  events: Record<string, Pushed[] | null>,
  answer: 'accept' | 'unknown_command' = 'accept',
) {
  const subs: FakeSub[] = [];
  const ready = new Set<() => void>();
  const restFails = new Set<string>();
  const send = (sub: FakeSub): void => {
    const id = sub.message.entity_id;
    if (!sub.unsubscribed) sub.callback({ events: id in events ? events[id] : [] });
  };
  const subscribeMessage = vi.fn(
    (callback: (message: unknown) => void, message: FakeSub['message']) => {
      if (message.type !== 'calendar/event/subscribe') return Promise.resolve(() => undefined);
      if (answer !== 'accept') return Promise.reject({ code: answer, message: 'Unknown command.' });
      const sub: FakeSub = { message, callback, unsubscribed: false };
      subs.push(sub);
      setTimeout(() => send(sub), 5);
      return Promise.resolve(() => {
        sub.unsubscribed = true;
      });
    },
  );
  const callApi = vi.fn((_method: string, path: string) => {
    const id = path.slice('calendars/'.length).split('?')[0];
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        const list = events[id];
        if (restFails.has(id) || list === null) {
          reject(new Error('Internal Server Error'));
          return;
        }
        // REST writes times in Home Assistant's zone; the push above, in the event's own.
        resolve(
          (list ?? []).map(({ all_day: _allDay, start, end, ...rest }) => ({
            ...rest,
            start: { dateTime: Live.inZone(start, 'Europe/Berlin') },
            end: { dateTime: Live.inZone(end, 'Europe/Berlin') },
          })),
        );
      }, 20),
    );
  });
  const hass = {
    states: {},
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    config: { time_zone: 'Europe/Berlin' },
    connection: {
      subscribeMessage,
      subscribeEvents: vi.fn(),
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'ready') ready.add(listener);
      },
    },
    callApi,
    callService: vi.fn(),
  } as unknown as Types.Hass;

  return {
    hass,
    /** What Home Assistant holds, to change without pushing. */
    events,
    callApi,
    restFails,
    subs,
    open: () => subs.filter((sub) => !sub.unsubscribed),
    calendarSubscribes: () =>
      subscribeMessage.mock.calls.filter(([, m]) => m.type === 'calendar/event/subscribe').length,
    restCalls: (id?: string) =>
      callApi.mock.calls.filter(([, path]) => !id || path.startsWith(`calendars/${id}?`)).length,
    /** The calendar changes: Home Assistant pushes to every subscription of it. */
    change: (id: string, next: Pushed[] | null) => {
      events[id] = next;
      for (const sub of subs) if (sub.message.entity_id === id) send(sub);
    },
    /** The calendar writes its state with the same events, as at an event's start. */
    touch: (id: string) => {
      for (const sub of subs) if (sub.message.entity_id === id) send(sub);
    },
    reconnect: () => {
      for (const listener of ready) listener();
    },
  };
}

function attach(hass: Types.Hass, config: Record<string, unknown> = {}): CardUnderTest {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.anna', 'calendar.ben'], days_to_show: 1, ...config });
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

const DAY = '2026-06-17';

beforeEach(() => {
  EventUtils.clearPageStore();
  vi.useFakeTimers();
  // 12:00 in New York, 18:00 in Berlin.
  vi.setSystemTime(new Date(`${DAY}T16:00:00Z`));
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(async () => {
  document.body.replaceChildren();
  await vi.advanceTimersByTimeAsync(2 * Live.DISCONNECT_LINGER);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a card on a Home Assistant that pushes', () => {
  it('draws from the first pushes, with no REST request', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);

    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano']);
    expect(ha.restCalls()).toBe(0);
    expect(ha.open()).toHaveLength(2);
  });

  it('redraws for a push that changes an event', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);

    ha.change('calendar.ben', [at(DAY, 15, 'Ben piano lesson')]);
    await settleFor(card, 10);

    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano lesson']);
    expect(ha.restCalls()).toBe(0);
  });

  it('does not load or draw for a push that changes nothing', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);
    const render = vi.spyOn(card as unknown as { render(): unknown }, 'render');
    const load = vi.spyOn(card, 'updateEvents');

    ha.touch('calendar.anna');
    // The same events again, written in another zone.
    ha.change('calendar.ben', [
      { ...at(DAY, 15, 'Ben piano'), start: `${DAY}T19:00:00Z`, end: `${DAY}T20:00:00Z` },
    ]);
    await settleFor(card, 10);

    expect(load).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('does not poll while every calendar is live', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);
    const load = vi.spyOn(card, 'updateEvents');

    await settleFor(card, 2 * 60 * 60_000);

    // A poll would be answered from the subscriptions, with no request; it is not run at all.
    expect(load).not.toHaveBeenCalled();
    expect(ha.restCalls()).toBe(0);
    expect(ha.calendarSubscribes()).toBe(2);
  });

  it('shares one subscription per calendar between two cards on the same days', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const first = attach(ha.hass);
    const second = attach(ha.hass, { show_location: false });
    await settleFor(second, 100);

    ha.change('calendar.anna', [at(DAY, 14, 'Anna swim, lane 3')]);
    await settleFor(second, 10);

    expect(drawn(first)).toEqual(['Anna swim, lane 3', 'Ben piano']);
    expect(drawn(second)).toEqual(['Anna swim, lane 3', 'Ben piano']);
    expect(ha.calendarSubscribes()).toBe(2);
  });
});

describe('a drift a load cannot settle', () => {
  it('is loaded for once, not in a loop', async () => {
    // A storage that keeps the first entry and drops every later write without a word: the
    // entry never takes the pushed events, so they always differ from it.
    const storage = memoryStorage();
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (storage.getItem(key) === null) setItem(key, value);
    };
    vi.stubGlobal('localStorage', storage);
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);
    const load = vi.spyOn(card, 'updateEvents');

    ha.change('calendar.anna', [at(DAY, 14, 'Anna swim, lane 3')]);
    await settleFor(card, 1000);

    expect(load.mock.calls.filter(([mode]) => mode === 'live')).toHaveLength(1);
    expect(drawn(card)).toEqual(['Anna swim, lane 3', 'Ben piano']);
  });
});

describe('a calendar Home Assistant cannot read', () => {
  it('is polled by REST at the next refresh, and live again once it pushes events', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);

    ha.restFails.add('calendar.ben');
    ha.change('calendar.ben', null);
    await settleFor(card, 10);
    // Its last events stay; polling starts, at the entry's own deadline.
    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano']);
    expect(ha.restCalls()).toBe(0);

    await settleFor(card, 30 * 60_000);
    expect(ha.restCalls('calendar.ben')).toBe(1);
    expect(ha.restCalls('calendar.anna')).toBe(0);
    expect(failureNotice(card)).toContain('calendar.ben');

    ha.restFails.delete('calendar.ben');
    ha.change('calendar.ben', [at(DAY, 15, 'Ben piano')]);
    await settleFor(card, 10);
    expect(failureNotice(card)).toBe('');

    const calls = ha.restCalls();
    await settleFor(card, 2 * 60 * 60_000);
    expect(ha.restCalls()).toBe(calls);
  });

  it('is not asked again before its retry for a change to another calendar', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': null,
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);
    expect(ha.restCalls('calendar.ben')).toBe(1);

    // Anna changes twice within Ben's first retry delay of a minute.
    ha.change('calendar.anna', [at(DAY, 14, 'Anna swim, lane 3')]);
    await settleFor(card, 10_000);
    ha.change('calendar.anna', [at(DAY, 14, 'Anna swim, lane 4')]);
    await settleFor(card, 10_000);

    expect(drawn(card)).toEqual(['Anna swim, lane 4']);
    expect(ha.restCalls('calendar.ben')).toBe(1);

    await settleFor(card, 60_000);
    expect(ha.restCalls('calendar.ben')).toBe(2);
    expect(ha.restCalls('calendar.anna')).toBe(0);
  });
});

describe('a refresh after a write', () => {
  it('asks REST, and draws nothing a subscription held from before', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);
    const before = ha.open();

    // Written: Home Assistant holds the new event, for REST and any new subscription, and the
    // push to the open one has not arrived yet.
    ha.events['calendar.anna'] = [at(DAY, 14, 'Anna swim'), at(DAY, 17, 'Anna dentist')];

    void card.refreshEvents(EventUtils.advanceWriteGeneration());
    await settleFor(card, 100);

    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano', 'Anna dentist']);
    expect(ha.restCalls('calendar.anna')).toBe(1);
    expect(before.every((sub) => sub.unsubscribed)).toBe(true);
    // Subscribed again, and the new subscription's first push says nothing new.
    expect(ha.open()).toHaveLength(2);
    await settleFor(card, 1000);
    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano', 'Anna dentist']);
  });
});

describe('the next day, at midnight', () => {
  it("subscribes for the new day's window and lets the old one go", async () => {
    vi.setSystemTime(new Date(`${DAY}T23:59:00Z`));
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim'), at('2026-06-18', 9, 'Anna school')],
      'calendar.ben': [],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);
    expect(ha.open().map((sub) => sub.message.start)).toEqual([
      `${DAY}T00:00:00.000Z`,
      `${DAY}T00:00:00.000Z`,
    ]);

    await settleFor(card, 2 * 60_000);

    expect(ha.open().map((sub) => sub.message.start)).toEqual([
      '2026-06-18T00:00:00.000Z',
      '2026-06-18T00:00:00.000Z',
    ]);
    expect(drawn(card)).toEqual(['Anna school']);
    expect(ha.restCalls()).toBe(0);
  });
});

describe('a reconnect', () => {
  it('keeps the subscriptions that push again', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);

    ha.reconnect();
    ha.touch('calendar.anna');
    ha.touch('calendar.ben');
    await settleFor(card, Live.RECONNECT_TIMEOUT + 1000);

    expect(ha.calendarSubscribes()).toBe(2);
    expect(ha.restCalls()).toBe(0);
  });

  it('subscribes again for a calendar that stayed silent after it', async () => {
    // As after a restart of Home Assistant, where subscribing again failed silently.
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);

    ha.events['calendar.ben'] = [at(DAY, 15, 'Ben piano'), at(DAY, 16, 'Ben football')];
    ha.reconnect();
    ha.touch('calendar.anna');
    await settleFor(card, Live.RECONNECT_TIMEOUT + 1000);

    expect(ha.calendarSubscribes()).toBe(3);
    expect(drawn(card)).toEqual(['Anna swim', 'Ben piano', 'Ben football']);
  });
});

describe('a card that leaves the page', () => {
  it('keeps its subscriptions for a minute, for a card that comes back', async () => {
    const ha = homeAssistant({
      'calendar.anna': [at(DAY, 14, 'Anna swim')],
      'calendar.ben': [at(DAY, 15, 'Ben piano')],
    });
    const card = attach(ha.hass);
    await settleFor(card, 100);

    card.remove();
    await vi.advanceTimersByTimeAsync(30_000);
    document.body.appendChild(card);
    await settleFor(card, 100);
    expect(ha.calendarSubscribes()).toBe(2);
    expect(ha.restCalls()).toBe(0);

    card.remove();
    await vi.advanceTimersByTimeAsync(Live.DISCONNECT_LINGER);
    expect(ha.open()).toHaveLength(0);
  });
});

describe('a Home Assistant before 2026.5', () => {
  it('is asked once, then polled exactly as before', async () => {
    const live = homeAssistant(
      { 'calendar.anna': [at(DAY, 14, 'Anna swim')], 'calendar.ben': [] },
      'unknown_command',
    );
    const card = attach(live.hass);
    await settleFor(card, 100);
    expect(drawn(card)).toEqual(['Anna swim']);

    await settleFor(card, 2 * 60 * 60_000);

    expect(live.calendarSubscribes()).toBe(1);
    // The first load and four refreshes at the default 30 minutes, two calendars each.
    expect(live.restCalls()).toBe(10);
  });
});
