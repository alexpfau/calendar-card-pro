import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import {
  type DetailContext,
  buildDetailEntry,
  detailPermissions,
} from '../src/interaction/event-details';
import { EVENT_DETAIL_DIALOG_TAG } from '../src/interaction/ha-calendar-dialogs';
import type * as Activation from '../src/rendering/activation';

/**
 * `event_tap_action`: with `details`, a tap on an event opens Home Assistant's event-detail
 * dialog instead of running the card's tap. Every other value reads as `none`.
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

/**
 * Every rendered event button whose text includes `text`: the element a tap or a click on the
 * event has to reach, and the one that carries the role and the tab stop.
 */
function buttonsShowing(card: Card, text: string): HTMLElement[] {
  return Array.from(card.shadowRoot?.querySelectorAll<HTMLElement>('[role="button"]') ?? []).filter(
    (el) => el.textContent?.includes(text),
  );
}

/** A key event on `target`, as a browser dispatches it to the focused element. */
function key(target: Element, type: 'keydown' | 'keyup', name: string, repeat = false) {
  const ev = new KeyboardEvent(type, {
    key: name,
    repeat,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  target.dispatchEvent(ev);
  return ev;
}

/** One pointer event of the primary contact, at a point. */
function pointer(target: Element, type: string, x = 0, y = 0): void {
  const ev = new Event(type, { bubbles: true, composed: true });
  target.dispatchEvent(
    Object.assign(ev, { pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y }),
  );
}

/** The click a browser derives from a pointer gesture, or assistive technology sends alone. */
function click(target: Element): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

/** A pointer press and release, then the click a browser fires after them. */
function tap(target: Element): void {
  pointer(target, 'pointerdown');
  pointer(target, 'pointerup');
  click(target);
}

/**
 * The innermost element inside `root` showing `text`: where a real pointer lands, rather
 * than on the event's own root.
 */
function leafShowing(root: Element, text: string): Element {
  const leaves = Array.from(root.querySelectorAll('*')).filter((el) =>
    el.textContent?.includes(text),
  );
  return leaves[leaves.length - 1] ?? root;
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

    tap(eventsShowing(card, 'Dentist')[0]);
    click(eventsShowing(card, 'Dentist')[0]);
    await settle();
    expect(dialogs).toHaveLength(0);
  });

  it.each(['list', 'column', 'grid'])(
    "runs the card's tap action for a tap on a %s event, as before",
    async (view) => {
      const { card, dialogs, actions } = await mount({ view, tap_action: { action: 'more-info' } });

      tap(leafShowing(eventsShowing(card, 'Dentist')[0], 'Dentist'));
      await settle();
      expect(actions).toEqual(['tap']);
      expect(dialogs).toHaveLength(0);
    },
  );
});

describe('event_tap_action details', () => {
  it.each([
    ['list', 'Dentist'],
    ['column', 'Dentist'],
    ['grid', 'Dentist'],
    ['grid', 'Public holiday'],
  ])(
    'makes a %s event a button a bare click opens, as assistive technology sends (%s)',
    async (view, summary) => {
      const { card, dialogs } = await mount({ view, ...DETAILS });

      const target = buttonsShowing(card, summary)[0];
      expect(target.getAttribute('role')).toBe('button');
      expect(target.getAttribute('tabindex')).toBe('0');
      expect(target.classList.contains('event-interactive')).toBe(true);

      click(target);
      await settle();
      expect(dialogs).toHaveLength(1);
      expect(dialogs[0].dialogTag).toBe(EVENT_DETAIL_DIALOG_TAG);
      expect(dialogs[0].dialogParams.calendarId).toBe('calendar.anna');
      expect(dialogs[0].dialogParams.entry.summary).toBe(summary);
    },
  );

  it('hands the dialog every field Home Assistant returned', async () => {
    const { card, dialogs } = await mount({ ...DETAILS });

    buttonsShowing(card, 'Dentist')[0].click();
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
    const segments = buttonsShowing(card, 'Away');
    expect(segments.length).toBeGreaterThan(1);
    expect(buttonsShowing(card, 'Trip')).toHaveLength(0);

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

    buttonsShowing(card, summary)[0].click();
    await settle();
    expect(dialogs[0].dialogParams).toMatchObject(expected);
  });

  it('fetches again once the dialog has edited or deleted the event', async () => {
    const { card, callApi, dialogs } = await mount({ ...DETAILS });

    buttonsShowing(card, 'Dentist')[0].click();
    await settle();
    const fetchesBefore = callApi.mock.calls.length;

    dialogs[0].dialogParams.updated();
    await vi.waitFor(() => expect(callApi.mock.calls.length).toBeGreaterThan(fetchesBefore));
  });

  it.each([
    ['list', 'Dentist'],
    ['column', 'Dentist'],
    ['grid', 'Dentist'],
    ['grid', 'Public holiday'],
  ])(
    'opens a %s event for a pointer tap on its content and the click that follows (%s)',
    async (view, summary) => {
      const { card, dialogs } = await mount({ view, ...DETAILS });

      // On the event's content rather than its root, where a real pointer lands. That the
      // tap and its click open it once, not twice, is pinned under "the click a pointer
      // gesture owes", which lets each request finish before the next: here the two share a
      // tick, and a second request in the same tick supersedes the first, so this count
      // cannot tell.
      tap(leafShowing(buttonsShowing(card, summary)[0], summary));
      await settle();
      expect(dialogs.map((dialog) => dialog.dialogParams.entry.summary)).toEqual([summary]);
    },
  );

  it.each(['list', 'column', 'grid'])(
    'opens a %s event on Enter, once however long it is held',
    async (view) => {
      const { card, dialogs } = await mount({ view, ...DETAILS });
      const target = buttonsShowing(card, 'Dentist')[0];

      // The control: a key that is not the event's does nothing and is left alone.
      expect(key(target, 'keydown', 'a').defaultPrevented).toBe(false);
      await settle();
      expect(dialogs).toHaveLength(0);

      expect(key(target, 'keydown', 'Enter').defaultPrevented).toBe(true);
      await settle();
      expect(dialogs).toHaveLength(1);

      expect(key(target, 'keydown', 'Enter', true).defaultPrevented).toBe(true);
      key(target, 'keyup', 'Enter');
      await settle();
      expect(dialogs).toHaveLength(1);
    },
  );

  it.each(['list', 'column', 'grid'])(
    'opens a %s event on Space as it is let go, once, and never scrolls',
    async (view) => {
      const { card, dialogs } = await mount({ view, ...DETAILS });
      const target = buttonsShowing(card, 'Dentist')[0];

      // Space would otherwise scroll the card, so every Space keydown is prevented.
      expect(key(target, 'keydown', ' ').defaultPrevented).toBe(true);
      expect(key(target, 'keydown', ' ', true).defaultPrevented).toBe(true);
      await settle();
      expect(dialogs).toHaveLength(0);

      expect(key(target, 'keyup', ' ').defaultPrevented).toBe(true);
      await settle();
      expect(dialogs).toHaveLength(1);

      // A keyup with no keydown before it, as when Space was pressed elsewhere, does nothing.
      key(target, 'keyup', ' ');
      await settle();
      expect(dialogs).toHaveLength(1);
    },
  );

  it('opens nothing when Space is let go of on another event', async () => {
    const { card, dialogs } = await mount({ view: 'grid', ...DETAILS });

    key(buttonsShowing(card, 'Dentist')[0], 'keydown', ' ');
    key(buttonsShowing(card, 'Public holiday')[0], 'keyup', ' ');
    await settle();
    expect(dialogs).toHaveLength(0);
  });

  it('starts no gesture for a press off the events on a card with no action of its own', async () => {
    // Turning event taps on must change nothing about a press anywhere else on the card: no
    // pointer capture, which would retarget that press's click, and no gesture bookkeeping.
    const { card } = await mount({ ...DETAILS });
    const haCard = card.shadowRoot!.querySelector('ha-card') as HTMLElement & {
      setPointerCapture(id: number): void;
    };
    const capture = vi.fn();
    haCard.setPointerCapture = capture;
    const active = () => (card as unknown as { _activePointerId: number | null })._activePointerId;

    pointer(haCard, 'pointerdown');
    expect(capture).not.toHaveBeenCalled();
    expect(active()).toBeNull();
    pointer(haCard, 'pointerup');

    // The control: the same press on an event is a gesture, captured like any other.
    pointer(buttonsShowing(card, 'Dentist')[0], 'pointerdown');
    expect(capture).toHaveBeenCalledOnce();
    expect(active()).toBe(1);
  });

  it("runs the card's tap action for a tap off the events, and not for one on them", async () => {
    const { card, dialogs, actions } = await mount({
      ...DETAILS,
      tap_action: { action: 'more-info' },
    });

    tap(buttonsShowing(card, 'Dentist')[0]);
    await settle();
    expect(dialogs).toHaveLength(1);
    expect(actions).toEqual([]);

    // The control: the same gesture anywhere else on the card still runs it.
    tap(card.shadowRoot!.querySelector('ha-card')!);
    await settle();
    expect(actions).toEqual(['tap']);
    expect(dialogs).toHaveLength(1);
  });

  it.each(['list', 'column', 'grid'])(
    "runs the card's hold action for a hold on a %s event, and does not open it",
    async (view) => {
      const { card, dialogs, actions } = await mount({
        view,
        ...DETAILS,
        hold_action: { action: 'more-info' },
      });
      const target = leafShowing(buttonsShowing(card, 'Dentist')[0], 'Dentist');

      pointer(target, 'pointerdown');
      vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
      pointer(target, 'pointerup');
      click(target);
      await settle();
      expect(actions).toEqual(['hold']);
      expect(dialogs).toHaveLength(0);

      // The control: the same press let go before the threshold is a tap on the event.
      tap(target);
      await settle();
      expect(actions).toEqual(['hold']);
      expect(dialogs).toHaveLength(1);
    },
  );

  it.each(['list', 'column', 'grid'])(
    'does neither for a pointer that moved on a %s event, as a scroll does',
    async (view) => {
      const { card, dialogs, actions } = await mount({
        view,
        ...DETAILS,
        tap_action: { action: 'more-info' },
      });
      const target = buttonsShowing(card, 'Dentist')[0];
      const far = Constants.UI.POINTER_MOVE_TOLERANCE * 4;

      pointer(target, 'pointerdown');
      pointer(target, 'pointermove', 0, far);
      pointer(target, 'pointerup', 0, far);
      click(target);
      await settle();
      expect(dialogs).toHaveLength(0);
      expect(actions).toEqual([]);
    },
  );

  it('still opens on a bare click once a gesture elsewhere has had its own', async () => {
    // The click a pointer tap off the events derives spends the guard, even though it names
    // no event, so the next activation by assistive technology counts.
    const { card, dialogs, actions } = await mount({
      ...DETAILS,
      tap_action: { action: 'more-info' },
    });

    tap(card.shadowRoot!.querySelector('ha-card')!);
    click(buttonsShowing(card, 'Dentist')[0]);
    await settle();
    expect(actions).toEqual(['tap']);
    expect(dialogs).toHaveLength(1);
  });

  it('still opens on a bare click after a pointer tap whose own click never came', async () => {
    const { card, dialogs } = await mount({ ...DETAILS });
    const target = buttonsShowing(card, 'Dentist')[0];

    pointer(target, 'pointerdown');
    pointer(target, 'pointerup');
    await settle();
    expect(dialogs).toHaveLength(1);

    // Within the window a click is taken for the tap's own and opens nothing more...
    click(target);
    await settle();
    expect(dialogs).toHaveLength(1);

    // ...and that spent it, so the next one opens again, as does one after the window.
    click(target);
    await settle();
    expect(dialogs).toHaveLength(2);

    pointer(target, 'pointerdown');
    pointer(target, 'pointerup');
    await settle();
    expect(dialogs).toHaveLength(3);
    vi.advanceTimersByTime(Constants.TIMING.DERIVED_CLICK_WINDOW + 1);
    click(target);
    await settle();
    expect(dialogs).toHaveLength(4);
  });

  it('lets the pointer through, and keeps the clicks and keys it acts on', async () => {
    // A wrapping card or dashboard handler does not ignore the card's descendants, and would
    // act on the same click or key that opened the dialog. Pointer events are different: the
    // card's own recognizer listens for them on `ha-card`, and Home Assistant's edit mode
    // drags a card by them, so they travel on as a press anywhere else on the card does.
    const { card } = await mount({ ...DETAILS });
    const reached: string[] = [];
    for (const type of ['click', 'keydown', 'keyup', 'pointerdown', 'pointerup']) {
      document.body.addEventListener(type, () => reached.push(type));
    }

    const target = buttonsShowing(card, 'Dentist')[0];
    tap(target);
    click(target);
    key(target, 'keydown', 'Enter');
    key(target, 'keydown', ' ');
    key(target, 'keyup', ' ');
    await settle();
    expect(reached).toEqual(['pointerdown', 'pointerup']);

    // The control: keys other than the two that open it pass through, as do taps elsewhere.
    reached.length = 0;
    key(target, 'keydown', 'Escape');
    tap(card.shadowRoot!.querySelector('ha-card')!);
    expect(reached).toEqual(['keydown', 'pointerdown', 'pointerup', 'click']);
  });

  it.each(['list', 'column'])('leaves %s empty-day rows inert', async (view) => {
    const { card, dialogs } = await mount(
      { view, ...DETAILS, show_empty_days: true },
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
      expect(placeholder.querySelector('[role], [tabindex]')).toBeNull();
      tap(leafShowing(placeholder, placeholder.textContent!.trim()));
      click(placeholder);
      key(placeholder, 'keydown', 'Enter');
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

    tap(overflow!);
    click(overflow!);
    key(overflow!, 'keydown', 'Enter');
    await settle();
    expect(dialogs).toHaveLength(0);
  });
});

describe("the list view's event button", () => {
  /** Every list event cell that draws an event rather than an empty day. */
  const cells = (card: Card) =>
    Array.from(card.shadowRoot!.querySelectorAll<HTMLElement>('td.event')).filter(
      (cell) => !cell.querySelector('.empty-day-title'),
    );

  it('is drawn only while events are tap targets, so the default cell is as it was', async () => {
    const { card } = await mount({ show_empty_days: true });

    expect(cells(card).length).toBeGreaterThan(0);
    expect(card.shadowRoot!.querySelectorAll('.event-button, .event-tappable')).toHaveLength(0);
    expect(card.shadowRoot!.querySelectorAll('[role="button"], [tabindex]')).toHaveLength(0);
  });

  it('wraps the content of every event cell, and leaves the cell a cell', async () => {
    const { card } = await mount({ ...DETAILS, show_empty_days: true });

    expect(cells(card).length).toBeGreaterThan(1);
    for (const cell of cells(card)) {
      const buttons = cell.querySelectorAll('[role="button"]');
      expect(buttons).toHaveLength(1);
      const button = buttons[0];
      expect(button.parentElement).toBe(cell);
      expect(button.classList.contains('event-button')).toBe(true);
      expect(button.classList.contains('event-interactive')).toBe(true);
      expect(button.getAttribute('tabindex')).toBe('0');
      // Everything the cell draws is inside the button, so all of it is the button's to tap.
      expect(button.querySelector('.event-content')).not.toBeNull();
      expect(Array.from(cell.children)).toEqual([button]);

      expect(cell.classList.contains('event-tappable')).toBe(true);
      expect(cell.classList.contains('event-interactive')).toBe(false);
    }
    expect(card.shadowRoot!.querySelectorAll('td[role], td[tabindex]')).toHaveLength(0);
    // An empty day is no event, so its cell gets neither the button nor the cell class.
    const emptyDays = card.shadowRoot!.querySelectorAll('td.event:has(.empty-day-title)');
    expect(emptyDays.length).toBeGreaterThan(0);
    for (const cell of emptyDays) {
      expect(cell.classList.contains('event-tappable')).toBe(false);
    }
  });
});

describe('the card around events that are buttons', () => {
  const haCard = (card: Card) => card.shadowRoot!.querySelector('ha-card')!;
  const TAPPABLE = { tap_action: { action: 'expand' } } as const;

  /**
   * Mount without waiting for an event to show, for cards that show none. A `pending` fetch
   * is released once the test is done with it rather than left in flight, where every later
   * card asking for the same calendars would join it and never load either.
   */
  async function mountShowing(config: Record<string, unknown>, events: object[] | 'pending') {
    let release: () => void = () => {};
    const pending = new Promise<object[]>((resolve) => (release = () => resolve([])));
    onTestFinished(() => release());

    const card = document.createElement('calendar-card-pro-dev') as Card;
    card.setConfig({ entities: ['calendar.anna'], days_to_show: 3, ...config });
    card.hass = {
      states: {},
      locale: { language: 'en', time_format: '24' },
      callApi: vi.fn(() => (events === 'pending' ? pending : Promise.resolve(events))),
      callService: vi.fn(),
    } as unknown as Types.Hass;
    document.body.appendChild(card);
    const loaded = () => !(card as unknown as { isInitialLoad: boolean }).isInitialLoad;
    if (events !== 'pending') await vi.waitFor(() => expect(loaded()).toBe(true));
    await card.updateComplete;
    expect(loaded()).toBe(events !== 'pending');
    return card;
  }

  it.each(['list', 'column', 'grid'])(
    'is not a button in %s view while its events are, and keeps its tab stop',
    async (view) => {
      const { card } = await mount({ view, ...TAPPABLE, ...DETAILS });

      expect(haCard(card).hasAttribute('role')).toBe(false);
      expect(haCard(card).getAttribute('tabindex')).toBe('0');
      // A pointer tap off the events still runs `tap_action`, so what shows that stays.
      expect(haCard(card).classList.contains('card-interactive')).toBe(true);
      expect(haCard(card).querySelector('ha-ripple')).not.toBeNull();
    },
  );

  it('runs its tap action for Enter on the card itself, and the event its own', async () => {
    const { card, dialogs } = await mount({
      ...TAPPABLE,
      ...DETAILS,
      list: { compact_events_to_show: 1 },
    });
    const expanded = () => (card as unknown as { isExpanded: boolean }).isExpanded;

    expect(key(haCard(card), 'keydown', 'Enter').defaultPrevented).toBe(true);
    await settle();
    expect(expanded()).toBe(true);
    expect(dialogs).toHaveLength(0);

    // The control: Enter aimed at an event inside the card is the event's.
    key(buttonsShowing(card, 'Dentist')[0], 'keydown', 'Enter');
    await settle();
    expect(expanded()).toBe(true);
    expect(dialogs).toHaveLength(1);
  });

  it('stays a button while its events are not', async () => {
    const { card } = await mount({ ...TAPPABLE, event_tap_action: { action: 'none' } });

    expect(haCard(card).getAttribute('role')).toBe('button');
    expect(haCard(card).getAttribute('tabindex')).toBe('0');
  });

  it.each([
    ['list view has no event to show', { view: 'list' }, []],
    ['column view has no event to show', { view: 'column' }, []],
    ['grid view has no event to show', { view: 'grid' }, []],
    [
      'grid view draws none of its events, all outside the hours shown',
      { view: 'grid', time_grid: { start_time: '06:00', end_time: '10:00' } },
      [RAW_EVENTS[0]],
    ],
    // A calendar of its own: once released, its fetch caches an empty answer, which a later
    // card asking for the same calendars would read instead of fetching.
    ['the events are still loading', { entities: ['calendar.loading'] }, 'pending'],
  ] as const)(
    'stays a button with event_tap_action set while %s',
    async (_name, config, events) => {
      const card = await mountShowing(
        { ...TAPPABLE, ...DETAILS, ...config },
        events as object[] | 'pending',
      );

      expect(card.shadowRoot!.querySelectorAll('.event-interactive')).toHaveLength(0);
      expect(haCard(card).getAttribute('role')).toBe('button');
      expect(haCard(card).getAttribute('tabindex')).toBe('0');
    },
  );

  it('stops being a button once grid view draws an event', async () => {
    // The control for the grid case above: the same card with hours that include the event.
    const card = await mountShowing(
      {
        ...TAPPABLE,
        ...DETAILS,
        view: 'grid',
        time_grid: { start_time: '12:00', end_time: '18:00' },
      },
      [RAW_EVENTS[0]],
    );

    expect(card.shadowRoot!.querySelectorAll('.event-interactive')).toHaveLength(1);
    expect(haCard(card).hasAttribute('role')).toBe(false);
  });
});

describe('event_tap_action set to anything but details', () => {
  const haCard = (card: Card) => card.shadowRoot!.querySelector('ha-card')!;
  const SWIMMING = { ...RAW_EVENTS[0], summary: 'Swimming', uid: 'uid-swimming' };
  const CARD_TAP = { action: 'navigate', navigation_path: '/lovelace/family' };

  /**
   * Home Assistant's actions, which the editor offered until it was cut down to two choices,
   * `expand`, which YAML could name, and a bare key. Each reads as `none`.
   */
  const OTHERS = [
    ['more-info', { action: 'more-info' }],
    ['navigate', { action: 'navigate', navigation_path: '/lovelace/0' }],
    ['toggle', { action: 'toggle' }],
    ['expand', { action: 'expand' }],
    ['a bare key', null],
  ] as const;

  it.each(['list', 'column', 'grid'].flatMap((view) => OTHERS.map((other) => [view, ...other])))(
    "leaves %s events inert for %s, and runs the card's tap for a tap on one",
    async (view, _name, eventTapAction) => {
      // Swimming is Ben's and Ben is not the card's first calendar, so an action forwarded for
      // the tapped event would name Ben where the card's own tap names Anna.
      const { card, dialogs, hassActions } = await mount(
        {
          view,
          entities: ['calendar.anna', 'calendar.ben'],
          tap_action: CARD_TAP,
          event_tap_action: eventTapAction,
        },
        { eventsFor: { 'calendar.ben': [SWIMMING] } },
      );

      const root = card.shadowRoot!;
      expect(root.querySelectorAll('.event-interactive, .event-button')).toHaveLength(0);
      expect(root.querySelectorAll('.content-container [role="button"]')).toHaveLength(0);
      expect(
        root.querySelectorAll('.content-container [tabindex]:not(.grid-container)'),
      ).toHaveLength(0);
      expect(haCard(card).getAttribute('role')).toBe('button');
      expect(haCard(card).getAttribute('tabindex')).toBe('0');

      tap(leafShowing(eventsShowing(card, 'Swimming')[0], 'Swimming'));
      await settle();
      expect(hassActions).toEqual([
        {
          action: 'tap',
          config: {
            entity: 'calendar.anna',
            tap_action: CARD_TAP,
            hold_action: { action: 'none' },
          },
        },
      ]);

      // A bare click is not an activation of anything: the event is no button.
      click(eventsShowing(card, 'Swimming')[0]);
      await settle();
      expect(hassActions).toHaveLength(1);
      expect(dialogs).toEqual([]);
    },
  );
});

describe('the click a pointer gesture owes', () => {
  // A browser follows a pointer gesture with a click, which the card's pointer capture
  // retargets to `ha-card`, and which a browser that does not retarget aims at the event the
  // pointer went down on. That click must not act a second time; any other click is an
  // activation in its own right, which is what assistive technology sends.
  //
  // Counted on the dialogs opened, which name their event: Dentist is Anna's and Swimming is
  // Ben's. Every step settles before the next, because two requests for the dialog in one
  // tick open it once, so a click acting in the tick of its own tap would count once too.
  const SWIMMING = { ...RAW_EVENTS[0], summary: 'Swimming', uid: 'uid-swimming' };
  const TWO_CALENDARS = { entities: ['calendar.anna', 'calendar.ben'], ...DETAILS };

  async function mountTwo(config: Record<string, unknown> = {}) {
    const mounted = await mount(
      { ...TWO_CALENDARS, ...config },
      { eventsFor: { 'calendar.ben': [SWIMMING] } },
    );
    const runs = () =>
      mounted.dialogs.map(
        (dialog) => `${dialog.dialogParams.entry.summary} ${dialog.dialogParams.calendarId}`,
      );
    const dentist = buttonsShowing(mounted.card, 'Dentist')[0];
    const swimming = buttonsShowing(mounted.card, 'Swimming')[0];
    const haCard = mounted.card.shadowRoot!.querySelector('ha-card')!;
    return { ...mounted, runs, dentist, swimming, haCard };
  }

  it('lets a click on another event through after a hold', async () => {
    const { dentist, swimming, runs, actions } = await mountTwo({
      hold_action: { action: 'more-info' },
    });

    pointer(leafShowing(dentist, 'Dentist'), 'pointerdown');
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
    pointer(leafShowing(dentist, 'Dentist'), 'pointerup');
    await settle();
    expect(actions).toEqual(['hold']);
    expect(runs()).toEqual([]);

    click(swimming);
    await settle();
    expect(actions).toEqual(['hold']);
    expect(runs()).toEqual(['Swimming calendar.ben']);
  });

  it('lets a click on an event through after a pointer that moved', async () => {
    const { dentist, swimming, haCard, runs, actions } = await mountTwo({
      tap_action: { action: 'more-info' },
    });
    const far = Constants.UI.POINTER_MOVE_TOLERANCE * 4;

    // On an event: a click on another one passes.
    pointer(dentist, 'pointerdown');
    pointer(dentist, 'pointermove', 0, far);
    pointer(dentist, 'pointerup', 0, far);
    await settle();
    click(swimming);
    await settle();
    expect(runs()).toEqual(['Swimming calendar.ben']);

    // Off the events: a drag that ran nothing owes no click, so even the event it would
    // otherwise have been mistaken for passes.
    vi.advanceTimersByTime(Constants.TIMING.DERIVED_CLICK_WINDOW + 1);
    pointer(haCard, 'pointerdown');
    pointer(haCard, 'pointermove', 0, far);
    pointer(haCard, 'pointerup', 0, far);
    await settle();
    click(dentist);
    await settle();
    expect(runs()).toEqual(['Swimming calendar.ben', 'Dentist calendar.anna']);
    expect(actions).toEqual([]);
  });

  it('runs a tap once when its click is retargeted to the card, and is then spent', async () => {
    const { dentist, haCard, runs } = await mountTwo();

    pointer(leafShowing(dentist, 'Dentist'), 'pointerdown');
    pointer(leafShowing(dentist, 'Dentist'), 'pointerup');
    await settle();
    click(haCard);
    await settle();
    expect(runs()).toEqual(['Dentist calendar.anna']);

    // That click was the one owed, so the next, from assistive technology, acts.
    click(dentist);
    await settle();
    expect(runs()).toEqual(['Dentist calendar.anna', 'Dentist calendar.anna']);
  });

  it('runs a tap once when its click still names the event', async () => {
    const { dentist, runs } = await mountTwo();

    pointer(leafShowing(dentist, 'Dentist'), 'pointerdown');
    pointer(leafShowing(dentist, 'Dentist'), 'pointerup');
    await settle();
    click(leafShowing(dentist, 'Dentist'));
    await settle();
    expect(runs()).toEqual(['Dentist calendar.anna']);

    click(dentist);
    await settle();
    expect(runs()).toEqual(['Dentist calendar.anna', 'Dentist calendar.anna']);
  });

  it('opens another event clicked before the tap on the first has had its click', async () => {
    const { dentist, swimming, runs } = await mountTwo();

    pointer(leafShowing(dentist, 'Dentist'), 'pointerdown');
    pointer(leafShowing(dentist, 'Dentist'), 'pointerup');
    await settle();
    click(swimming);
    await settle();
    expect(runs()).toEqual(['Dentist calendar.anna', 'Swimming calendar.ben']);

    // The click the tap owes is still owed, and spent by its arrival.
    click(dentist);
    await settle();
    expect(runs()).toEqual(['Dentist calendar.anna', 'Swimming calendar.ben']);
    click(dentist);
    await settle();
    expect(runs()).toEqual([
      'Dentist calendar.anna',
      'Swimming calendar.ben',
      'Dentist calendar.anna',
    ]);
  });

  it('knows the held event by its element, which a re-render keeps', async () => {
    // A hold whose `hold_action` expands the card regroups the events before the click
    // arrives, which replaces each row's data; a guard comparing data would take the click
    // for a new activation and open the event the hold deliberately did not.
    const { card, dialogs } = await mount({
      ...DETAILS,
      hold_action: { action: 'expand' },
      list: { compact_events_to_show: 1 },
    });
    const expanded = () => (card as unknown as { isExpanded: boolean }).isExpanded;
    const dentist = buttonsShowing(card, 'Dentist')[0];
    const before = (dentist as Activation.TappableEventElement).calendarCardEventTap;

    pointer(leafShowing(dentist, 'Dentist'), 'pointerdown');
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
    pointer(leafShowing(dentist, 'Dentist'), 'pointerup');
    await card.updateComplete;
    expect(expanded()).toBe(true);
    // The control: the re-render really did replace the data and keep the element.
    expect(buttonsShowing(card, 'Dentist')[0]).toBe(dentist);
    expect((dentist as Activation.TappableEventElement).calendarCardEventTap?.event).not.toBe(
      before?.event,
    );

    click(leafShowing(dentist, 'Dentist'));
    await settle();
    expect(dialogs).toEqual([]);
    expect(expanded()).toBe(true);
  });
});

describe("a tappable event's day", () => {
  // Two events with the same title and time on different days are otherwise announced
  // identically, so each event button is described by its day's header.
  const yoga = (day: number) => ({
    summary: 'Yoga',
    start: { dateTime: `2026-06-${day}T11:00:00Z` },
    end: { dateTime: `2026-06-${day}T12:00:00Z` },
    uid: `uid-yoga-${day}`,
  });
  const holiday = (day: number) => ({
    summary: 'Holiday',
    start: { date: `2026-06-${day}` },
    end: { date: `2026-06-${day + 1}` },
  });
  const EVENTS = [RAW_EVENTS[0], yoga(17), yoga(18), holiday(17), holiday(18)];

  /** What assistive technology reads as an element's description, from its references. */
  function description(card: Card, element: Element): string {
    const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    return ids
      .map((id) => card.shadowRoot!.querySelector(`[id="${id}"]`)?.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it.each([
    ['list', 'Yoga'],
    ['column', 'Yoga'],
    ['grid', 'Yoga'],
    ['grid', 'Holiday'],
  ])('tells two identical %s events on different days apart (%s)', async (view, summary) => {
    const { card } = await mount({ view, ...DETAILS }, { events: EVENTS });

    const buttons = buttonsShowing(card, summary);
    expect(buttons).toHaveLength(2);
    const [first, second] = buttons.map((button) => description(card, button));
    expect(first).toMatch(/\b17\b/);
    expect(second).toMatch(/\b18\b/);
    expect(first).not.toBe(second);

    // Unique within the shadow root, which is where the references resolve.
    const ids = Array.from(card.shadowRoot!.querySelectorAll('[id]'), (el) => el.id);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(['list', 'column', 'grid'])(
    'adds no id and no description in %s view while events are not tap targets',
    async (view) => {
      const { card } = await mount({ view }, { events: EVENTS });

      expect(eventsShowing(card, 'Yoga')).toHaveLength(2);
      expect(card.shadowRoot!.querySelectorAll('[id], [aria-describedby]')).toHaveLength(0);
    },
  );
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
      const row = buttonsShowing(card, 'Backwards')[0];
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

      buttonsShowing(card, 'Reminder')[0].click();
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

    const segments = buttonsShowing(card, 'Trip');
    expect(segments.length).toBeGreaterThan(1);
    segments[segments.length - 1].click();
    await settle();
    buttonsShowing(card, 'Dentist')[0].click();
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
    buttonsShowing(card, summary)[0].click();
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
    expect(buttonsShowing(apart.card, 'Dentist')).toHaveLength(2);
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
    expect(buttonsShowing(merged.card, 'Dentist')).toHaveLength(1);
    expect(await permissionsFor(merged.card, merged.dialogs, 'Dentist')).toEqual({
      canEdit: false,
      canDelete: false,
    });
    // Its details still open.
    expect(merged.dialogs[0].dialogParams.calendarId).toBe('calendar.anna');
  });

  it('opens a merged row for the calendar whose copy it kept', async () => {
    // Ben and Carl share the event and Anna, the card's first calendar, does not, so the
    // first configured calendar and the kept copy's differ.
    const swimming = { ...RAW_EVENTS[0], summary: 'Swimming', uid: 'uid-swimming' };
    const { card, dialogs } = await mount(
      {
        entities: ['calendar.anna', 'calendar.ben', 'calendar.carl'],
        filter_duplicates: true,
        ...DETAILS,
      },
      {
        eventsFor: {
          'calendar.anna': [RAW_EVENTS[0]],
          'calendar.ben': [swimming],
          'calendar.carl': [swimming],
        },
      },
    );

    expect(buttonsShowing(card, 'Swimming')).toHaveLength(1);
    buttonsShowing(card, 'Swimming')[0].click();
    await settle();
    expect(dialogs.map((dialog) => dialog.dialogParams.calendarId)).toEqual(['calendar.ben']);
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
