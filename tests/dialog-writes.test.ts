import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import { CALENDARS_CHANGED_EVENT } from '../src/interaction/calendar-changes';
import {
  EVENT_DETAIL_DIALOG_TAG,
  EVENT_EDITOR_DIALOG_TAG,
} from '../src/interaction/ha-calendar-dialogs';

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
  refreshEvents(): Promise<void>;
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

/** Every calendar may be written to, so both dialogs can be opened from any card. */
const WRITABLE = { supported_features: 7 };

async function mount(config: Record<string, unknown>) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 3, ...config });

  const entities = (config.entities as Array<string | { entity: string }> | undefined) ?? [
    'calendar.anna',
  ];
  const entityIds = entities.map((entity) => (typeof entity === 'string' ? entity : entity.entity));
  const states = Object.fromEntries(
    entityIds.map((id) => [id, { entity_id: id, state: 'off', attributes: WRITABLE }]),
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
    eventRoot(card)!.click();
    await settle();
  },
} as const;

const DIALOG_CONFIG = {
  add: { show_add_event: true },
  details: { show_event_details: true },
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
    const editing = await mount({ show_event_details: true });
    const sameCalendar = await mount({ entities: [{ entity: 'calendar.anna' }] });
    const otherCalendar = await mount({ entities: ['calendar.ben'] });
    await OPENERS.details(editing.card);
    const calls = counter([editing, sameCalendar, otherCalendar]);
    const ownRefresh = vi.spyOn(editing.card, 'refreshEvents');

    editing.dialogs[0].dialogParams.updated();
    await settle();

    expect(calls()).toEqual([1, 1, 0]);
    // The editing card refreshes once, itself, and does not answer its own announcement.
    // Its request count cannot show that: a second `reload` supersedes the first before
    // either reaches Home Assistant, so both arms of the mistake make one request.
    expect(ownRefresh).toHaveBeenCalledOnce();
  });

  it('refreshes every card after a new event, whichever calendar it went to', async () => {
    const adding = await mount({ show_add_event: true });
    const otherCalendar = await mount({ entities: ['calendar.ben'] });
    await OPENERS.add(adding.card);
    const calls = counter([adding, otherCalendar]);

    adding.dialogs[0].dialogParams.updated();
    await settle();

    expect(calls()).toEqual([1, 1]);
  });

  it('leaves a card alone once it has left the page', async () => {
    const editing = await mount({ show_event_details: true });
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
