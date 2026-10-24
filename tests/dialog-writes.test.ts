import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import { CALENDARS_CHANGED_EVENT } from '../src/interaction/calendar-changes';
import {
  EVENT_DETAIL_DIALOG_TAG,
  EVENT_EDITOR_DIALOG_TAG,
} from '../src/interaction/ha-calendar-dialogs';
import * as EventUtils from '../src/utils/events';

/**
 * What the card does once one of Home Assistant's dialogs reports that it saved a change.
 *
 * Driven through the real card, from the press that opens the dialog to the `updated`
 * callback the dialog would call, because the contract is entirely about timing: which
 * request answers after the save, and when Home Assistant may close the dialog. Both
 * dialogs are defined up front, which is the state of any session that has opened them
 * once; `ha-calendar-dialogs.test.ts` covers loading them.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  updateEvents(mode?: unknown): Promise<void>;
  refreshEvents(afterWrite?: number): Promise<void>;
  readonly updateComplete: Promise<boolean>;
}

interface DialogDetail {
  dialogTag: string;
  dialogParams: { calendarId?: string; updated: () => unknown };
}

const DENTIST = {
  summary: 'Dentist',
  start: { dateTime: '2026-06-17T14:00:00Z' },
  end: { dateTime: '2026-06-17T15:00:00Z' },
  uid: 'uid-dentist',
};

/** The event a save adds, so a card drawing it proves it saw the answer from after the save. */
const LUNCH = {
  summary: 'Lunch',
  start: { dateTime: '2026-06-17T12:00:00Z' },
  end: { dateTime: '2026-06-17T13:00:00Z' },
  uid: 'uid-lunch',
};

/**
 * Create, delete and update. Every calendar may be written to unless a test says otherwise,
 * so both dialogs can be opened from any card.
 */
const WRITABLE = 7;

/**
 * Mount a card and wait for its first events.
 *
 * @param config - The card's configuration, over one calendar and three days
 * @param features - `supported_features` for a calendar that is not fully writable
 */
async function mount(config: Record<string, unknown>, features: Record<string, number> = {}) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 3, ...config });

  const entities = (config.entities as Array<string | { entity: string }> | undefined) ?? [
    'calendar.anna',
  ];
  const entityIds = entities.map((entity) => (typeof entity === 'string' ? entity : entity.entity));
  const states = Object.fromEntries(
    entityIds.map((id) => [
      id,
      { entity_id: id, state: 'off', attributes: { supported_features: features[id] ?? WRITABLE } },
    ]),
  );
  const callApi = vi.fn((_method: string, _path: string) => Promise.resolve<unknown>([DENTIST]));
  card.hass = {
    states,
    locale: { language: 'en', time_format: '24' },
    callApi,
    callService: vi.fn(),
  } as unknown as Types.Hass;

  const dialogs: DialogDetail[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: DialogDetail }).detail),
  );

  document.body.appendChild(card);
  await vi.waitFor(() => expect(eventRoot(card)).not.toBeNull());
  return { card, callApi, dialogs };
}

function eventRoot(card: Card): HTMLElement | null {
  return (
    Array.from(card.shadowRoot?.querySelectorAll<HTMLElement>('.event') ?? []).find((el) =>
      el.textContent?.includes('Dentist'),
    ) ?? null
  );
}

/** Summaries of the events a card draws, from its rendered rows, in alphabetical order. */
function drawn(card: Card): string[] {
  return [DENTIST, LUNCH]
    .map(({ summary }) => summary)
    .filter((summary) =>
      Array.from(card.shadowRoot?.querySelectorAll('.event') ?? []).some((el) =>
        el.textContent?.includes(summary),
      ),
    );
}

/**
 * Summaries of the events cached for a card's query, which only the newest response may
 * write, in alphabetical order.
 */
function cached(card: Card): string[] {
  const instanceId = (card as unknown as { _instanceId: string })._instanceId;
  const snapshot = EventUtils.readEventSnapshot(
    card.hass,
    (card as unknown as { config: Types.Config }).config,
    instanceId,
  );
  return (snapshot?.events ?? []).map((event) => event.summary ?? '').sort();
}

/**
 * Requests a test left pending. Released after every test, because the card shares
 * in-flight requests across instances: one left hanging by a failed assertion would be
 * joined by the next test's card, which would then never load.
 */
const pending: Array<(events: unknown) => void> = [];

/** Let the async open finish; it awaits the loader before dispatching. */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** Open one of the two dialogs from the card, the way a user would. */
const OPENERS = {
  add: async (card: Card) => {
    card.shadowRoot!.querySelector<HTMLElement>('.add-event-button')!.click();
    await settle();
  },
  details: async (card: Card) => {
    // The event's button, which in list view is inside the cell rather than the cell itself.
    eventRoot(card)!.querySelector<HTMLElement>('[role="button"]')!.click();
    await settle();
  },
} as const;

const DIALOG_CONFIG = {
  add: { show_add_event: true },
  details: { event_tap_action: { action: 'details' } },
} as const;

beforeAll(() => {
  customElements.define(EVENT_DETAIL_DIALOG_TAG, class extends HTMLElement {});
  customElements.define(EVENT_EDITOR_DIALOG_TAG, class extends HTMLElement {});
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(async () => {
  // Settled before the cache is cleared, or the late response writes it back afterwards.
  for (const resolve of pending.splice(0)) resolve([]);
  await settle();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(['add', 'details'] as const)('after the %s dialog saves', (which) => {
  it('returns nothing, so Home Assistant closes the dialog straight away', async () => {
    const { card, dialogs } = await mount(DIALOG_CONFIG[which]);
    await OPENERS[which](card);

    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].dialogParams.updated()).toBeUndefined();
  });

  it('asks Home Assistant again even while an older request is still in flight', async () => {
    const { card, callApi, dialogs } = await mount(DIALOG_CONFIG[which]);
    await OPENERS[which](card);

    // A request that started before the save, as a scheduled refresh or another card
    // sharing the cache would. It stays pending, carrying the old answer.
    callApi.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const before = callApi.mock.calls.length;
    void card.updateEvents('network');
    await settle();
    expect(callApi.mock.calls.length).toBe(before + 1);

    dialogs[0].dialogParams.updated();
    await settle();

    // Joining the older request would leave this at `before + 1`, and the change would
    // stay invisible until the next scheduled refresh.
    expect(callApi.mock.calls.length).toBe(before + 2);
  });
});

describe('telling the other cards on the page', () => {
  /** Calls each card made to Home Assistant from now on. */
  function counter(cards: Array<{ callApi: ReturnType<typeof vi.fn> }>) {
    const before = cards.map(({ callApi }) => callApi.mock.calls.length);
    return () => cards.map(({ callApi }, i) => callApi.mock.calls.length - before[i]);
  }

  it('refreshes another card showing the edited calendar, and no card that does not', async () => {
    const editing = await mount({ event_tap_action: { action: 'details' } });
    // A different window from the editing card's, so it needs a request of its own and its
    // count shows that it refreshed. A card over the same window shares the editing card's
    // request; see the next block.
    const sameCalendar = await mount({ entities: [{ entity: 'calendar.anna' }], days_to_show: 7 });
    const otherCalendar = await mount({ entities: ['calendar.ben'] });
    await OPENERS.details(editing.card);
    const calls = counter([editing, sameCalendar, otherCalendar]);
    const ownRefresh = vi.spyOn(editing.card, 'refreshEvents');

    editing.dialogs[0].dialogParams.updated();
    await settle();

    expect(calls()).toEqual([1, 1, 0]);
    // The editing card refreshes once, itself, and does not answer its own announcement.
    // Its request count cannot show that: a second refresh for the same write joins the
    // first, so both arms of the mistake make one request.
    expect(ownRefresh).toHaveBeenCalledOnce();
  });

  it('refreshes after a new event every card showing a calendar it could have gone to', async () => {
    const adding = await mount({ show_add_event: true });
    // Home Assistant's create dialog can save to any calendar that accepts new events, not
    // only the one the card preselected.
    const otherCalendar = await mount({ entities: ['calendar.ben'] });
    // One calendar that accepts new events among read-only ones is enough.
    const mixed = await mount(
      { entities: ['calendar.holidays', 'calendar.cleo'] },
      { 'calendar.holidays': 0 },
    );
    // Read-only calendars: a subscribed holiday feed, and one that can change and delete
    // events but not create them. A new event cannot have landed in either.
    const readOnly = await mount(
      { entities: ['calendar.holidays', 'calendar.shared'] },
      { 'calendar.holidays': 0, 'calendar.shared': 6 },
    );
    await OPENERS.add(adding.card);
    const calls = counter([adding, otherCalendar, mixed, readOnly]);

    adding.dialogs[0].dialogParams.updated();
    await settle();

    // Calls, not requests: a request makes one call per calendar the card shows.
    expect(calls()).toEqual([1, 1, 2, 0]);
  });

  it('leaves a card alone once it has left the page', async () => {
    const editing = await mount({ event_tap_action: { action: 'details' } });
    const detached = await mount({});
    detached.card.remove();
    // A detached card's refresh returns before it fetches, so counting requests could not
    // tell a listener that was removed from one that was not.
    const refresh = vi.spyOn(detached.card, 'refreshEvents');
    await OPENERS.details(editing.card);

    editing.dialogs[0].dialogParams.updated();
    await settle();

    expect(refresh).not.toHaveBeenCalled();
  });

  it('uses one event name in the development build and in a release', () => {
    // The release build rewrites this string wherever it appears; see the constant.
    expect(CALENDARS_CHANGED_EVENT).not.toContain('calendar-card-pro-dev');
  });
});

describe('one request per write', () => {
  /**
   * One Home Assistant behind every card. Each card keeps its own `hass`, as on a
   * dashboard, but a request is counted here once, whichever card started it, and stays
   * open until the test answers it: on a real dashboard every card asks within the same
   * frame, long before Home Assistant answers the first.
   *
   * @returns The open requests, oldest first, each answered by calling it with events
   */
  function oneHomeAssistant(
    cards: Array<{ callApi: ReturnType<typeof vi.fn> }>,
  ): Array<(events: unknown) => void> {
    const held: Array<(events: unknown) => void> = [];
    for (const { callApi } of cards) {
      callApi.mockImplementation(
        () =>
          new Promise((resolve) => {
            held.push(resolve);
            pending.push(resolve);
          }),
      );
    }
    return held;
  }

  /** Mount a card that can open the details dialog, and open it. */
  async function editingCard() {
    const editing = await mount(DIALOG_CONFIG.details);
    await OPENERS.details(editing.card);
    return { ...editing, save: () => editing.dialogs[0].dialogParams.updated() };
  }

  it('shares it between the cards showing the same calendars over the same days', async () => {
    const editing = await editingCard();
    const twin = await mount({});
    const held = oneHomeAssistant([editing, twin]);

    editing.save();
    await settle();

    expect(held).toHaveLength(1);

    held[0]([DENTIST, LUNCH]);
    await settle();

    // The control for the count: one request that nobody drew from would also be one.
    expect({ editing: drawn(editing.card), twin: drawn(twin.card) }).toEqual({
      editing: ['Dentist', 'Lunch'],
      twin: ['Dentist', 'Lunch'],
    });
  });

  it('makes one per window when the cards show different days', async () => {
    const editing = await editingCard();
    const twin = await mount({});
    const week = await mount({ days_to_show: 7 });
    const weekTwin = await mount({ days_to_show: 7 });
    const held = oneHomeAssistant([editing, twin, week, weekTwin]);

    editing.save();
    await settle();

    expect(held).toHaveLength(2);

    for (const answer of held) answer([DENTIST, LUNCH]);
    await settle();

    expect([editing, twin, week, weekTwin].map(({ card }) => drawn(card))).toEqual([
      ['Dentist', 'Lunch'],
      ['Dentist', 'Lunch'],
      ['Dentist', 'Lunch'],
      ['Dentist', 'Lunch'],
    ]);
  });

  it('does not join a request that started before the save', async () => {
    const editing = await editingCard();
    const twin = await mount({});
    const held = oneHomeAssistant([editing, twin]);

    // A scheduled refresh on the other card, started before the save. Home Assistant
    // answers it from before the change.
    void twin.card.updateEvents('network');
    await settle();
    expect(held).toHaveLength(1);

    editing.save();
    await settle();

    // One new request, shared by both cards. Joining the old one would leave this at 1.
    expect(held).toHaveLength(2);

    held[1]([DENTIST, LUNCH]);
    await settle();
    // The old answer arrives last, and must neither be drawn nor overwrite the cache.
    held[0]([DENTIST]);
    await settle();

    expect({
      editing: drawn(editing.card),
      twin: drawn(twin.card),
      cached: cached(twin.card),
    }).toEqual({
      editing: ['Dentist', 'Lunch'],
      twin: ['Dentist', 'Lunch'],
      cached: ['Dentist', 'Lunch'],
    });
  });

  it('lets a second save supersede the request for the first', async () => {
    const editing = await editingCard();
    const twin = await mount({});
    const held = oneHomeAssistant([editing, twin]);

    // The first save adds Lunch; the second, before Home Assistant has answered, deletes
    // the dentist appointment.
    editing.save();
    await settle();
    expect(held).toHaveLength(1);

    editing.save();
    await settle();
    expect(held).toHaveLength(2);

    held[1]([LUNCH]);
    await settle();
    held[0]([DENTIST, LUNCH]);
    await settle();

    expect({
      editing: drawn(editing.card),
      twin: drawn(twin.card),
      cached: cached(twin.card),
    }).toEqual({ editing: ['Lunch'], twin: ['Lunch'], cached: ['Lunch'] });
  });

  it('refreshes for the announced write, even when a card hears of it late', async () => {
    const editing = await editingCard();
    const twin = await mount({});
    const held = oneHomeAssistant([editing, twin]);

    // Hold the announcement back until the editing card's request is under way. In the
    // ordinary flow every card hears it before any request starts, so a card advancing the
    // generation for itself would go unnoticed; this is where it would cost a request.
    const late: Event[] = [];
    const intercept = (ev: Event) => {
      ev.stopImmediatePropagation();
      late.push(ev);
    };
    window.addEventListener(CALENDARS_CHANGED_EVENT, intercept, { capture: true });
    editing.save();
    await settle();
    window.removeEventListener(CALENDARS_CHANGED_EVENT, intercept, { capture: true });
    expect({ requests: held.length, held: late.length }).toEqual({ requests: 1, held: 1 });

    const { detail } = late[0] as CustomEvent;
    window.dispatchEvent(new CustomEvent(CALENDARS_CHANGED_EVENT, { detail }));
    await settle();
    expect(held).toHaveLength(1);

    held[0]([DENTIST, LUNCH]);
    await settle();
    expect(drawn(twin.card)).toEqual(['Dentist', 'Lunch']);
  });

  it('still never joins a request when asked for no write in particular', async () => {
    const plain = await mount({});
    const held = oneHomeAssistant([plain]);

    void plain.card.updateEvents('network');
    await settle();
    void plain.card.refreshEvents();
    await settle();

    expect(held).toHaveLength(2);
  });
});
