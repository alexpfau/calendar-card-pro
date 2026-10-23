import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import {
  EVENT_DETAIL_DIALOG_TAG,
  buildDetailEntry,
  detailPermissions,
} from '../src/interaction/event-details';

/**
 * `show_event_details`: a tap on an event opens Home Assistant's event-detail dialog.
 *
 * Driven through the real card, from the fetch to the click, because the entry the dialog
 * receives is assembled across three stages — processing stamps `_source`, grouping copies
 * it into the display row, rendering hands the row to the click handler — and a stage
 * that drops it breaks only this. The dialog is defined up front, which is the state of
 * any session that has opened it once; the paths that load it are in
 * `event-details-loader.test.ts`, because a defined element cannot be undefined again.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
}

interface DialogDetail {
  dialogTag: string;
  dialogParams: {
    calendarId: string;
    entry: Record<string, unknown>;
    color?: string;
    canEdit: boolean;
    canDelete: boolean;
    updated: () => void;
  };
}

const RAW_EVENTS = [
  {
    summary: 'Dentist',
    start: { dateTime: '2026-06-17T14:00:00Z' },
    end: { dateTime: '2026-06-17T15:00:00Z' },
    location: '12 High Street',
    description: 'Bring the referral',
    uid: 'uid-dentist',
    rrule: 'FREQ=MONTHLY',
  },
  {
    summary: 'Trip',
    start: { dateTime: '2026-06-17T20:00:00Z' },
    end: { dateTime: '2026-06-19T09:00:00Z' },
    uid: 'uid-trip',
  },
  {
    summary: 'Public holiday',
    start: { date: '2026-06-18' },
    end: { date: '2026-06-19' },
  },
];

const calendarState = (supportedFeatures: number) => ({
  'calendar.anna': {
    entity_id: 'calendar.anna',
    state: 'off',
    attributes: { supported_features: supportedFeatures },
  },
});

async function mount(
  config: Record<string, unknown>,
  { states = {}, events = RAW_EVENTS }: { states?: object; events?: object[] } = {},
) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 3, ...config });
  const callApi = vi.fn().mockResolvedValue(events);
  card.hass = {
    states: states as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi,
    callService: vi.fn(),
  };

  const dialogs: DialogDetail[] = [];
  const actions: string[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: DialogDetail }).detail),
  );
  card.addEventListener('hass-action', (ev) =>
    actions.push((ev as Event & { detail: { action: string } }).detail.action),
  );

  document.body.appendChild(card);
  await vi.waitFor(() => expect(eventsShowing(card, 'Dentist').length).toBeGreaterThan(0));
  return { card, callApi, dialogs, actions };
}

/** Every rendered event root whose text includes `text`. */
function eventsShowing(card: Card, text: string): HTMLElement[] {
  return Array.from(card.shadowRoot?.querySelectorAll<HTMLElement>('.event') ?? []).filter((el) =>
    el.textContent?.includes(text),
  );
}

function press(target: Element, key: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
}

/** A pointer press and release, then the click a browser fires after them. */
function tap(target: Element): void {
  const opts = { bubbles: true, composed: true };
  target.dispatchEvent(Object.assign(new Event('pointerdown', opts), { pointerId: 1, button: 0 }));
  target.dispatchEvent(Object.assign(new Event('pointerup', opts), { pointerId: 1, button: 0 }));
  target.dispatchEvent(new MouseEvent('click', opts));
}

/** Let the async open finish; it awaits the loader before dispatching. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeAll(() => {
  customElements.define(EVENT_DETAIL_DIALOG_TAG, class extends HTMLElement {});
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('show_event_details off, the default', () => {
  it.each(['list', 'column', 'grid'])('leaves %s events inert', async (view) => {
    const { card, dialogs } = await mount({ view });

    const root = card.shadowRoot!;
    expect(root.querySelectorAll('.event-interactive')).toHaveLength(0);
    expect(root.querySelectorAll('.event[role], .event[tabindex]')).toHaveLength(0);

    eventsShowing(card, 'Dentist')[0].click();
    await settle();
    expect(dialogs).toHaveLength(0);
  });
});

describe('show_event_details on', () => {
  it.each([
    ['list', 'Dentist'],
    ['column', 'Dentist'],
    ['grid', 'Dentist'],
    ['grid', 'Public holiday'],
  ])('makes a %s event a button that opens its details (%s)', async (view, summary) => {
    const { card, dialogs } = await mount({ view, show_event_details: true });

    const target = eventsShowing(card, summary)[0];
    expect(target.getAttribute('role')).toBe('button');
    expect(target.getAttribute('tabindex')).toBe('0');
    expect(target.classList.contains('event-interactive')).toBe(true);

    target.click();
    await settle();
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].dialogTag).toBe(EVENT_DETAIL_DIALOG_TAG);
    expect(dialogs[0].dialogParams.calendarId).toBe('calendar.anna');
    expect(dialogs[0].dialogParams.entry.summary).toBe(summary);
  });

  it('hands the dialog every field Home Assistant returned', async () => {
    const { card, dialogs } = await mount({ show_event_details: true });

    eventsShowing(card, 'Dentist')[0].click();
    await settle();
    expect(dialogs[0].dialogParams.entry).toEqual({
      summary: 'Dentist',
      dtstart: '2026-06-17T14:00:00Z',
      dtend: '2026-06-17T15:00:00Z',
      location: '12 High Street',
      description: 'Bring the referral',
      uid: 'uid-dentist',
      recurrence_id: undefined,
      rrule: 'FREQ=MONTHLY',
    });
  });

  it('opens a split segment as the whole event, with the text the calendar stores', async () => {
    const { card, dialogs } = await mount({
      show_event_details: true,
      split_multiday_events: true,
      entities: [{ entity: 'calendar.anna', replace_pattern: 'Trip', replace_with: 'Away' }],
    });

    // The control: the rows really were split and rewritten, so the entry below cannot
    // be passing because the row already said the same thing.
    const segments = eventsShowing(card, 'Away');
    expect(segments.length).toBeGreaterThan(1);
    expect(eventsShowing(card, 'Trip')).toHaveLength(0);

    segments[segments.length - 1].click();
    await settle();
    expect(dialogs[0].dialogParams.entry).toMatchObject({
      summary: 'Trip',
      dtstart: '2026-06-17T20:00:00Z',
      dtend: '2026-06-19T09:00:00Z',
      uid: 'uid-trip',
    });
  });

  it.each([
    [7, 'Dentist', { canEdit: true, canDelete: true }],
    [3, 'Dentist', { canEdit: false, canDelete: true }],
    [1, 'Dentist', { canEdit: false, canDelete: false }],
    [7, 'Public holiday', { canEdit: false, canDelete: false }],
  ])('offers Edit and Delete as features %i allow for %s', async (features, summary, expected) => {
    const { card, dialogs } = await mount(
      { show_event_details: true },
      { states: calendarState(features) },
    );

    eventsShowing(card, summary)[0].click();
    await settle();
    expect(dialogs[0].dialogParams).toMatchObject(expected);
  });

  it('fetches again once the dialog has edited or deleted the event', async () => {
    const { card, callApi, dialogs } = await mount({ show_event_details: true });

    eventsShowing(card, 'Dentist')[0].click();
    await settle();
    const fetchesBefore = callApi.mock.calls.length;

    dialogs[0].dialogParams.updated();
    await vi.waitFor(() => expect(callApi.mock.calls.length).toBeGreaterThan(fetchesBefore));
  });

  it('opens on Enter and Space, and on no other key', async () => {
    const { card, dialogs } = await mount({ show_event_details: true });
    const target = eventsShowing(card, 'Dentist')[0];

    press(target, 'a');
    await settle();
    expect(dialogs).toHaveLength(0);

    press(target, 'Enter');
    await settle();
    expect(dialogs).toHaveLength(1);

    const space = press(target, ' ');
    await settle();
    expect(dialogs).toHaveLength(2);
    // Space would otherwise scroll the card.
    expect(space.defaultPrevented).toBe(true);
  });

  it("does not run the card's tap action for a tap on an event", async () => {
    const { card, dialogs, actions } = await mount({
      show_event_details: true,
      tap_action: { action: 'more-info' },
    });

    tap(eventsShowing(card, 'Dentist')[0]);
    await settle();
    expect(dialogs).toHaveLength(1);
    expect(actions).toEqual([]);

    // The control: the same gesture anywhere else on the card still runs it.
    tap(card.shadowRoot!.querySelector('ha-card')!);
    await settle();
    expect(actions).toEqual(['tap']);
  });

  it('keeps an event tap or key from reaching whatever contains the card', async () => {
    // The card ignores clicks and keys from its own descendants anyway; a wrapping card or
    // dashboard handler does not, and would act on the same tap that opened the dialog.
    const { card } = await mount({ show_event_details: true });
    const reached: string[] = [];
    for (const type of ['click', 'keydown', 'pointerdown', 'pointerup']) {
      document.body.addEventListener(type, () => reached.push(type));
    }

    const target = eventsShowing(card, 'Dentist')[0];
    tap(target);
    press(target, 'Enter');
    press(target, ' ');
    await settle();
    expect(reached).toEqual([]);

    // The control: keys other than the two that open it pass through, as do taps elsewhere.
    press(target, 'Escape');
    tap(card.shadowRoot!.querySelector('ha-card')!);
    expect(reached).toEqual(['keydown', 'pointerdown', 'pointerup', 'click']);
  });

  it('leaves empty-day rows inert', async () => {
    const { card, dialogs } = await mount(
      { show_event_details: true, show_empty_days: true },
      { events: [RAW_EVENTS[0]] },
    );

    const placeholders = Array.from(
      card.shadowRoot!.querySelectorAll('.empty-day-title'),
      (title) => title.closest<HTMLElement>('.event')!,
    );
    expect(placeholders.length).toBeGreaterThan(0);
    for (const placeholder of placeholders) {
      expect(placeholder.hasAttribute('role')).toBe(false);
      expect(placeholder.hasAttribute('tabindex')).toBe(false);
      placeholder.click();
    }
    await settle();
    expect(dialogs).toHaveLength(0);
  });

  it('leaves the grid +N block inert, since it stands for several events', async () => {
    const { card, dialogs } = await mount(
      {
        view: 'grid',
        show_event_details: true,
        days_to_show: 1,
        time_grid: { max_simultaneous_events: 1 },
      },
      {
        events: [
          RAW_EVENTS[0],
          { ...RAW_EVENTS[0], summary: 'Call', uid: 'uid-call' },
          { ...RAW_EVENTS[0], summary: 'Review', uid: 'uid-review' },
        ],
      },
    );

    const overflow = card.shadowRoot!.querySelector<HTMLElement>('.grid-event-overflow');
    expect(overflow).not.toBeNull();
    expect(overflow!.hasAttribute('role')).toBe(false);
    expect(overflow!.hasAttribute('tabindex')).toBe(false);

    overflow!.click();
    await settle();
    expect(dialogs).toHaveLength(0);
  });
});

describe('buildDetailEntry', () => {
  const row: Types.CalendarEventData = {
    summary: 'Shown',
    start: { date: '2026-06-17' },
    end: { date: '2026-06-18' },
  };

  it('reads an event without a source stamp from the row itself', () => {
    expect(buildDetailEntry(row)).toMatchObject({
      summary: 'Shown',
      dtstart: '2026-06-17',
      dtend: '2026-06-18',
    });
  });

  it("drops Home Assistant's nulls, as its own calendar panel does", () => {
    const entry = buildDetailEntry({ ...row, uid: null, recurrence_id: null, rrule: null });
    expect(entry).toMatchObject({ uid: undefined, recurrence_id: undefined, rrule: undefined });
  });

  it('opens nothing for an empty-day placeholder', () => {
    expect(buildDetailEntry({ ...row, _isEmptyDay: true })).toBeUndefined();
  });
});

describe('detailPermissions', () => {
  const entry = { summary: 'Dentist', dtstart: 'a', dtend: 'b', uid: 'uid-dentist' };

  it('follows the update and delete bits, for every feature combination', () => {
    const table = Array.from({ length: 8 }, (_, features) => [
      features,
      detailPermissions(
        { states: calendarState(features) } as unknown as Types.Hass,
        'calendar.anna',
        entry,
      ),
    ]);
    expect(table).toEqual([
      [0, { canEdit: false, canDelete: false }],
      [1, { canEdit: false, canDelete: false }],
      [2, { canEdit: false, canDelete: true }],
      [3, { canEdit: false, canDelete: true }],
      [4, { canEdit: true, canDelete: false }],
      [5, { canEdit: true, canDelete: false }],
      [6, { canEdit: true, canDelete: true }],
      [7, { canEdit: true, canDelete: true }],
    ]);
  });

  it('offers neither for an event without a uid, which the services cannot address', () => {
    const hass = { states: calendarState(7) } as unknown as Types.Hass;
    expect(detailPermissions(hass, 'calendar.anna', { ...entry, uid: undefined })).toEqual({
      canEdit: false,
      canDelete: false,
    });
  });

  it('offers neither while the calendar is not in the states', () => {
    expect(
      detailPermissions({ states: {} } as unknown as Types.Hass, 'calendar.anna', entry),
    ).toEqual({
      canEdit: false,
      canDelete: false,
    });
  });
});
