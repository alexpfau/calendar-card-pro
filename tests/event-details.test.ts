import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import {
  type DetailContext,
  buildDetailEntry,
  detailPermissions,
} from '../src/interaction/event-details';
import { EVENT_DETAIL_DIALOG_TAG } from '../src/interaction/ha-calendar-dialogs';

/**
 * `event_tap_action`: a tap on an event runs an action of its own. `details` opens Home
 * Assistant's event-detail dialog; any other action goes to Home Assistant for the event's
 * own calendar.
 *
 * Driven through the real card, from the fetch to the click, because the entry the dialog
 * receives is assembled across three stages — processing stamps `_source`, grouping copies
 * it into the display row, rendering hands the row to the click handler — and a stage
 * that drops it breaks only this. The dialog is defined up front, which is the state of
 * any session that has opened it once; the paths that load it are in
 * `ha-calendar-dialogs.test.ts`.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  refreshEvents(): Promise<void>;
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

/** The event tap action this file is mostly about. */
const DETAILS = { event_tap_action: { action: 'details' } } as const;

/** What the card hands Home Assistant's own action handler. */
interface HassActionDetail {
  action: string;
  config: { entity?: string; tap_action?: unknown; hold_action?: unknown };
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
  {
    states = {},
    events = RAW_EVENTS,
    eventsFor = {},
  }: { states?: object; events?: object[]; eventsFor?: Record<string, object[]> } = {},
) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 3, ...config });
  // `eventsFor` answers for the calendars it names; every other calendar answers `events`.
  const callApi = vi.fn(async (_method: string, path: string) => {
    const calendar = Object.keys(eventsFor).find((id) => path.startsWith(`calendars/${id}?`));
    return calendar ? eventsFor[calendar] : events;
  });
  card.hass = {
    states: states as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi,
    callService: vi.fn(),
  };

  const dialogs: DialogDetail[] = [];
  const actions: string[] = [];
  const hassActions: HassActionDetail[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: DialogDetail }).detail),
  );
  card.addEventListener('hass-action', (ev) => {
    const detail = (ev as Event & { detail: HassActionDetail }).detail;
    actions.push(detail.action);
    hassActions.push(detail);
  });

  document.body.appendChild(card);
  await vi.waitFor(() => expect(eventsShowing(card, 'Dentist').length).toBeGreaterThan(0));
  return { card, callApi, dialogs, actions, hassActions };
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

describe('event_tap_action none, the default', () => {
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

describe('event_tap_action details', () => {
  it.each([
    ['list', 'Dentist'],
    ['column', 'Dentist'],
    ['grid', 'Dentist'],
    ['grid', 'Public holiday'],
  ])('makes a %s event a button that opens its details (%s)', async (view, summary) => {
    const { card, dialogs } = await mount({ view, ...DETAILS });

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
    const { card, dialogs } = await mount({ ...DETAILS });

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
      ...DETAILS,
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
    const { card, dialogs } = await mount({ ...DETAILS }, { states: calendarState(features) });

    eventsShowing(card, summary)[0].click();
    await settle();
    expect(dialogs[0].dialogParams).toMatchObject(expected);
  });

  it('fetches again once the dialog has edited or deleted the event', async () => {
    const { card, callApi, dialogs } = await mount({ ...DETAILS });

    eventsShowing(card, 'Dentist')[0].click();
    await settle();
    const fetchesBefore = callApi.mock.calls.length;

    dialogs[0].dialogParams.updated();
    await vi.waitFor(() => expect(callApi.mock.calls.length).toBeGreaterThan(fetchesBefore));
  });

  it('opens on Enter and Space, and on no other key', async () => {
    const { card, dialogs } = await mount({ ...DETAILS });
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
      ...DETAILS,
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
    const { card } = await mount({ ...DETAILS });
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
      { ...DETAILS, show_empty_days: true },
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
        ...DETAILS,
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

describe("event_tap_action set to one of Home Assistant's actions", () => {
  const MORE_INFO = { event_tap_action: { action: 'more-info' } } as const;
  const SWIMMING = { ...RAW_EVENTS[0], summary: 'Swimming', uid: 'uid-swimming' };

  it.each(['list', 'column', 'grid'])(
    "runs it in %s view for the tapped event's own calendar",
    async (view) => {
      const { card, dialogs, hassActions } = await mount(
        { view, entities: ['calendar.anna', 'calendar.ben'], ...MORE_INFO },
        { eventsFor: { 'calendar.ben': [SWIMMING] } },
      );

      eventsShowing(card, 'Swimming')[0].click();
      await settle();
      expect(dialogs).toEqual([]);
      expect(hassActions).toEqual([
        { action: 'tap', config: { entity: 'calendar.ben', tap_action: { action: 'more-info' } } },
      ]);

      // The control: an event of the first calendar names the first.
      eventsShowing(card, 'Dentist')[0].click();
      await settle();
      expect(hassActions.map((detail) => detail.config.entity)).toEqual([
        'calendar.ben',
        'calendar.anna',
      ]);
    },
  );

  it('runs it for the calendar whose copy a merged row kept', async () => {
    // Ben and Carl share the event and Anna, the card's first calendar, does not, so the
    // first configured calendar and the kept copy's differ.
    const { card, hassActions } = await mount(
      {
        entities: ['calendar.anna', 'calendar.ben', 'calendar.carl'],
        filter_duplicates: true,
        ...MORE_INFO,
      },
      {
        eventsFor: {
          'calendar.anna': [RAW_EVENTS[0]],
          'calendar.ben': [SWIMMING],
          'calendar.carl': [SWIMMING],
        },
      },
    );

    expect(eventsShowing(card, 'Swimming')).toHaveLength(1);
    eventsShowing(card, 'Swimming')[0].click();
    await settle();
    expect(hassActions.map((detail) => detail.config.entity)).toEqual(['calendar.ben']);
  });

  it('expands the card for expand, written in YAML', async () => {
    const { card, dialogs, hassActions } = await mount({
      event_tap_action: { action: 'expand' },
      list: { compact_events_to_show: 1 },
    });
    const expanded = () => (card as unknown as { isExpanded: boolean }).isExpanded;
    expect(expanded()).toBe(false);

    eventsShowing(card, 'Dentist')[0].click();
    await settle();
    expect(expanded()).toBe(true);
    expect(dialogs).toEqual([]);
    expect(hassActions).toEqual([]);
  });
});

describe('what the dialog is handed for events the card had to change', () => {
  /** No end at all: kept as the instant at its start. */
  const REMINDER = {
    summary: 'Reminder',
    start: { dateTime: '2026-06-17T16:00:00Z' },
    uid: 'uid-reminder',
  };
  /** An end before the start: likewise kept as an instant, at 18:00. */
  const BACKWARDS = {
    summary: 'Backwards',
    start: { dateTime: '2026-06-17T18:00:00Z' },
    end: { dateTime: '2026-06-17T17:00:00Z' },
    uid: 'uid-backwards',
  };

  it.each(['list', 'column'])(
    'hands a %s event with a backwards end the end the calendar stores',
    async (view) => {
      const { card, dialogs } = await mount(
        { view, ...DETAILS },
        { states: calendarState(7), events: [RAW_EVENTS[0], BACKWARDS] },
      );

      // The control: the row really was repaired, so it no longer draws the stored end.
      const row = eventsShowing(card, 'Backwards')[0];
      expect(row.textContent).toContain('18:00');
      expect(row.textContent).not.toContain('17:00');

      row.click();
      await settle();
      expect(dialogs[0].dialogParams.entry).toMatchObject({
        dtstart: '2026-06-17T18:00:00Z',
        dtend: '2026-06-17T17:00:00Z',
      });
      // Editing writes back what the calendar stores, so it stays offered.
      expect(dialogs[0].dialogParams).toMatchObject({ canEdit: true, canDelete: true });
    },
  );

  it.each(['list', 'column'])(
    'keeps a %s event with no end free of one, and withholds Edit',
    async (view) => {
      const { card, dialogs } = await mount(
        { view, ...DETAILS },
        { states: calendarState(7), events: [RAW_EVENTS[0], REMINDER] },
      );

      const held = (card as unknown as { events: Types.CalendarEventData[] }).events.find(
        (event) => event.summary === 'Reminder',
      )!;
      expect(held.end).toEqual({ dateTime: '2026-06-17T16:00:00Z' });
      expect(held._source).toBeDefined();
      expect(held._source!.end).toBeUndefined();

      eventsShowing(card, 'Reminder')[0].click();
      await settle();
      // Home Assistant's dialog formats `dtend` unconditionally, so it is shown the instant
      // the card draws. Edit would save that instant as the event's end, so it is withheld;
      // Delete addresses the event by its uid and stays.
      expect(dialogs[0].dialogParams.entry).toMatchObject({
        dtstart: '2026-06-17T16:00:00Z',
        dtend: '2026-06-17T16:00:00Z',
      });
      expect(dialogs[0].dialogParams).toMatchObject({ canEdit: false, canDelete: true });
    },
  );

  it.each([
    ['list', { split_multiday_events: true }],
    ['grid', {}],
  ])("hands a split %s segment the event's status", async (view, extra) => {
    const { card, dialogs } = await mount(
      { view, ...DETAILS, ...extra },
      { events: [RAW_EVENTS[0], { ...RAW_EVENTS[1], status: 'tentative' }] },
    );

    const segments = eventsShowing(card, 'Trip');
    expect(segments.length).toBeGreaterThan(1);
    segments[segments.length - 1].click();
    await settle();
    eventsShowing(card, 'Dentist')[0].click();
    await settle();

    expect(dialogs.map((dialog) => dialog.dialogParams.entry.status)).toEqual([
      'tentative',
      undefined,
    ]);
  });
});

describe('what the card lets the dialog offer', () => {
  const twoCalendars = {
    ...calendarState(7),
    'calendar.ben': {
      entity_id: 'calendar.ben',
      state: 'off',
      attributes: { supported_features: 7 },
    },
  };

  async function permissionsFor(card: Card, dialogs: DialogDetail[], summary: string) {
    eventsShowing(card, summary)[0].click();
    await settle();
    const { canEdit, canDelete } = dialogs[dialogs.length - 1].dialogParams;
    return { canEdit, canDelete };
  }

  it.each([
    [{}, { canEdit: true, canDelete: true }],
    [{ allow_event_edit: false }, { canEdit: false, canDelete: true }],
    [{ allow_event_delete: false }, { canEdit: true, canDelete: false }],
    [
      { allow_event_edit: false, allow_event_delete: false },
      { canEdit: false, canDelete: false },
    ],
  ])('honors %o', async (options, expected) => {
    const { card, dialogs } = await mount({ ...DETAILS, ...options }, { states: calendarState(7) });

    expect(await permissionsFor(card, dialogs, 'Dentist')).toEqual(expected);
  });

  it('opens a duplicate merged from two calendars with neither Edit nor Delete', async () => {
    const entities = ['calendar.anna', 'calendar.ben'];

    // The control: the same two copies left apart are each fully editable.
    const apart = await mount(
      { ...DETAILS, entities, filter_duplicates: false },
      { states: twoCalendars },
    );
    expect(eventsShowing(apart.card, 'Dentist')).toHaveLength(2);
    expect(await permissionsFor(apart.card, apart.dialogs, 'Dentist')).toEqual({
      canEdit: true,
      canDelete: true,
    });
    document.body.replaceChildren();
    localStorage.clear();

    const merged = await mount(
      { ...DETAILS, entities, filter_duplicates: true },
      { states: twoCalendars },
    );
    expect(eventsShowing(merged.card, 'Dentist')).toHaveLength(1);
    expect(await permissionsFor(merged.card, merged.dialogs, 'Dentist')).toEqual({
      canEdit: false,
      canDelete: false,
    });
    // Its details still open.
    expect(merged.dialogs[0].dialogParams.calendarId).toBe('calendar.anna');
  });

  it('withholds both while the calendar is failing and its events come from the cache', async () => {
    const { card, callApi, dialogs } = await mount({ ...DETAILS }, { states: calendarState(7) });
    // The control: the same event, freshly loaded.
    expect(await permissionsFor(card, dialogs, 'Dentist')).toEqual({
      canEdit: true,
      canDelete: true,
    });

    callApi.mockRejectedValue(new Error('unavailable'));
    await card.refreshEvents();
    await card.updateComplete;
    expect(card.shadowRoot!.querySelector('.fetch-error')).not.toBeNull();

    expect(await permissionsFor(card, dialogs, 'Dentist')).toEqual({
      canEdit: false,
      canDelete: false,
    });
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
  const event: Types.CalendarEventData = {
    summary: 'Dentist',
    start: { dateTime: '2026-06-17T14:00:00Z' },
    end: { dateTime: '2026-06-17T15:00:00Z' },
    uid: 'uid-dentist',
    _entityId: 'calendar.anna',
  };
  const context: DetailContext = { allowEdit: true, allowDelete: true, failedEntities: [] };

  it('follows the update and delete bits, for every feature combination', () => {
    const table = Array.from({ length: 8 }, (_, features) => [
      features,
      detailPermissions(
        { states: calendarState(features) } as unknown as Types.Hass,
        event,
        entry,
        context,
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
    expect(detailPermissions(hass, event, { ...entry, uid: undefined }, context)).toEqual({
      canEdit: false,
      canDelete: false,
    });
  });

  it('narrows by every rule, each on its own', () => {
    const hass = { states: calendarState(7) } as unknown as Types.Hass;
    const merged = [{ entityId: 'calendar.anna' }, { entityId: 'calendar.ben' }];

    // One row per rule, each breaking that rule alone against a case that allows both, so
    // dropping any one condition changes exactly its own row.
    const cases: Array<[string, Types.CalendarEventData, Partial<DetailContext>]> = [
      ['everything allows both', event, {}],
      ['allow_event_edit off', event, { allowEdit: false }],
      ['allow_event_delete off', event, { allowDelete: false }],
      ['a merge of two calendars', { ...event, _mergedFrom: merged }, {}],
      ['a merge stamp naming one calendar', { ...event, _mergedFrom: merged.slice(0, 1) }, {}],
      ['its calendar failing', event, { failedEntities: ['calendar.anna'] }],
      ['another calendar failing', event, { failedEntities: ['calendar.ben'] }],
      ['no stored end', { ...event, _source: { start: event.start } }, {}],
    ];

    expect(
      Object.fromEntries(
        cases.map(([name, rendered, overrides]) => [
          name,
          detailPermissions(hass, rendered, entry, { ...context, ...overrides }),
        ]),
      ),
    ).toEqual({
      'everything allows both': { canEdit: true, canDelete: true },
      'allow_event_edit off': { canEdit: false, canDelete: true },
      'allow_event_delete off': { canEdit: true, canDelete: false },
      'a merge of two calendars': { canEdit: false, canDelete: false },
      'a merge stamp naming one calendar': { canEdit: true, canDelete: true },
      'its calendar failing': { canEdit: false, canDelete: false },
      'another calendar failing': { canEdit: true, canDelete: true },
      'no stored end': { canEdit: false, canDelete: true },
    });
  });

  it('offers neither while the calendar is not in the states', () => {
    expect(
      detailPermissions({ states: {} } as unknown as Types.Hass, event, entry, context),
    ).toEqual({
      canEdit: false,
      canDelete: false,
    });
  });
});
