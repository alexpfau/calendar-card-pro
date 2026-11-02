import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import {
  EVENT_DETAIL_DIALOG_TAG,
  EVENT_EDITOR_DIALOG_TAG,
} from '../src/interaction/ha-calendar-dialogs';
import '../src/calendar-card-pro';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

/**
 * Adding an event where a press lands: `day_tap_action: add-event` (a tap on a day where it
 * shows no event), the card's own `add-event` action in `tap_action` and `hold_action`, and
 * `event_hold_action: details` beside them, under the gesture model in docs/architecture.md.
 *
 * Every option here defaults off, so a suite built from default config sees none of it; each
 * case turns its option on, and the off-states that must add nothing are cases of their own.
 * The dialogs are defined up front, the state of any session that has opened one once, so a
 * press opens its dialog at once; loading and the busy cue are in `ha-calendar-dialogs.test.ts`.
 *
 * happy-dom computes no layout, so where a day is found from the pointer's position rather
 * than from the element under it (a grid's time area, its all-day band, the space under a
 * short column) the elements' client rects are stubbed to a known geometry.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  preview: boolean;
  editMode: boolean;
  requestUpdate(): void;
  readonly updateComplete: Promise<boolean>;
  _hiddenCalendars: ReadonlySet<string>;
  _holdIndicator: HTMLElement | null;
}

interface DialogDetail {
  dialogTag: string;
  dialogParams: { calendarId: string; selectedDate?: Date; entry?: { summary?: string } };
}

interface HassActionDetail {
  action: string;
  config: { tap_action?: { action: string }; hold_action?: { action: string } };
}

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const HOLIDAYS = 'calendar.holidays';

const STATES = {
  [ANNA]: { entity_id: ANNA, state: 'off', attributes: { supported_features: 7 } },
  [BEN]: { entity_id: BEN, state: 'off', attributes: { supported_features: 1 } },
  [HOLIDAYS]: { entity_id: HOLIDAYS, state: 'off', attributes: { supported_features: 0 } },
};

/** June 17 to 19: an event on the 17th, an all-day one on the 18th, nothing on the 19th. */
const EVENTS = [
  {
    summary: 'Dentist',
    start: { dateTime: '2026-06-17T14:00:00Z' },
    end: { dateTime: '2026-06-17T15:00:00Z' },
    uid: 'uid-dentist',
  },
  { summary: 'Sports day', start: { date: '2026-06-18' }, end: { date: '2026-06-19' } },
];

/** The days the card covers, at local midnight. The unit project runs in UTC. */
const JUNE = (day: number, hour = 0) => new Date(2026, 5, day, hour);

const ADD = { day_tap_action: { action: 'add-event' } } as const;

async function mount(
  config: Record<string, unknown>,
  { states = STATES, ready = 'Dentist' }: { states?: object; ready?: string } = {},
) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({
    entities: [HOLIDAYS, ANNA, BEN],
    days_to_show: 3,
    show_empty_days: true,
    ...config,
  });
  card.hass = {
    states: states as unknown as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async (_method: string, path: string) =>
      path.startsWith(`calendars/${ANNA}?`) ? EVENTS : [],
    ),
    callService: vi.fn(),
    localize: (key: string) => (key === 'ui.components.calendar.event.add' ? 'Add event' : key),
  } as unknown as Types.Hass;

  const dialogs: DialogDetail[] = [];
  const hassActions: HassActionDetail[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: DialogDetail }).detail),
  );
  card.addEventListener('hass-action', (ev) =>
    hassActions.push((ev as Event & { detail: HassActionDetail }).detail),
  );

  document.body.appendChild(card);
  await vi.waitFor(() => expect(textOf(card)).toContain(ready));
  return { card, dialogs, hassActions };
}

const root = (card: Card): ShadowRoot => card.shadowRoot!;
const textOf = (card: Card): string => root(card).textContent ?? '';
const all = <T extends Element = HTMLElement>(card: Card, selector: string): T[] =>
  Array.from(root(card).querySelectorAll<T>(selector));

/** Each day's add button: the list's date, or the column and grid header. */
const dayButtons = (card: Card) => all(card, '.day-add-button');

/** The innermost element showing `text`, where a real pointer lands. */
function leafShowing(card: Card, text: string): Element {
  const leaves = all(card, '*').filter(
    (el) => el.children.length === 0 && el.textContent?.includes(text),
  );
  expect(leaves.length, `something shows ${text}`).toBeGreaterThan(0);
  return leaves[0];
}

function pointer(target: Element, type: string, x = 0, y = 0): void {
  const ev = new Event(type, { bubbles: true, composed: true });
  target.dispatchEvent(
    Object.assign(ev, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: 'mouse',
      clientX: x,
      clientY: y,
    }),
  );
}

const click = (target: Element) =>
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

/** A press and release where it started, then the click a browser derives from them. */
function tap(target: Element, x = 0, y = 0): void {
  pointer(target, 'pointerdown', x, y);
  pointer(target, 'pointerup', x, y);
  click(target);
}

/** A press held past the hold threshold, then released. */
function hold(target: Element, x = 0, y = 0): void {
  pointer(target, 'pointerdown', x, y);
  vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
  pointer(target, 'pointerup', x, y);
  click(target);
}

function key(target: Element, type: 'keydown' | 'keyup', name: string, repeat = false) {
  target.dispatchEvent(
    new KeyboardEvent(type, { key: name, repeat, bubbles: true, composed: true, cancelable: true }),
  );
}

/** Stub an element's client rect. */
function placeAt(
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  } as DOMRect);
}

/** Let an open finish: it awaits the loader, already settled, before dispatching. */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** What the editor dialogs asked for, as `[calendar, date]`. */
const adds = (dialogs: DialogDetail[]) =>
  dialogs
    .filter(({ dialogTag }) => dialogTag === EVENT_EDITOR_DIALOG_TAG)
    .map(({ dialogParams }) => [dialogParams.calendarId, dialogParams.selectedDate]);

beforeAll(() => {
  customElements.define(EVENT_EDITOR_DIALOG_TAG, class extends HTMLElement {});
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

describe('day_tap_action: add-event', () => {
  it.each(['list', 'column', 'grid'])(
    'adds on the day tapped in %s view, at the hour it is now, in the first writable calendar',
    async (view) => {
      const { card, dialogs } = await mount({ view, ...ADD });

      const buttons = dayButtons(card);
      expect(buttons).toHaveLength(3);
      tap(buttons[1]);
      await settle();

      // FROZEN_NOW is 10:00. The read-only calendar listed first is passed over, and the
      // derived click that follows the tap is not a second add.
      expect(adds(dialogs)).toEqual([[ANNA, JUNE(18, 10)]]);
    },
  );

  it("adds on an empty day from its 'No events' line in list view", async () => {
    const { card, dialogs } = await mount(ADD);

    const empty = all(card, 'table.day-table')[2];
    tap(empty.querySelector('td.event')!.firstElementChild ?? empty);
    await settle();

    expect(adds(dialogs)).toEqual([[ANNA, JUNE(19, 10)]]);
  });

  it("never adds from a press on an event: with no tap of its own it is the card's", async () => {
    const { card, dialogs, hassActions } = await mount({
      ...ADD,
      tap_action: { action: 'more-info' },
    });

    tap(leafShowing(card, 'Dentist'));
    await settle();

    expect(adds(dialogs)).toEqual([]);
    expect(hassActions.map(({ action }) => action)).toEqual(['tap']);
  });

  it('opens an event, not a new one, where the event has a tap of its own', async () => {
    const { card, dialogs } = await mount({ ...ADD, event_tap_action: { action: 'details' } });

    tap(leafShowing(card, 'Dentist'));
    await settle();

    expect(dialogs.map(({ dialogTag }) => dialogTag)).toEqual([EVENT_DETAIL_DIALOG_TAG]);
  });

  it("leaves the title to the card's tap action", async () => {
    const { card, dialogs, hassActions } = await mount({
      ...ADD,
      title: 'Family',
      tap_action: { action: 'more-info' },
    });

    tap(root(card).querySelector('.card-header')!);
    await settle();

    expect(adds(dialogs)).toEqual([]);
    expect(hassActions.map(({ action }) => action)).toEqual(['tap']);
  });

  it('adds at the hour under the pointer in a grid, rounded down', async () => {
    const { card, dialogs } = await mount({ view: 'grid', ...ADD });

    // The default band runs 07:00 to 22:00: 900 minutes over 1500 px.
    const body = all(card, '.grid-day-body')[2];
    placeAt(body, { left: 200, top: 0, width: 100, height: 1500 });
    const plane = body.querySelector('.grid-day-plane')!;
    tap(plane, 250, ((13 * 60 + 45 - 7 * 60) / 900) * 1500);
    await settle();

    expect(adds(dialogs)).toEqual([[ANNA, JUNE(19, 13)]]);
  });

  it('washes the hour pressed in a grid, and only while it is pressed', async () => {
    const { card } = await mount({ view: 'grid', ...ADD });

    const body = all(card, '.grid-day-body')[2];
    placeAt(body, { left: 200, top: 0, width: 100, height: 1500 });
    pointer(body.querySelector('.grid-day-plane')!, 'pointerdown', 250, 420);

    expect(body.hasAttribute('data-add-pressed')).toBe(true);
    // 420 px is 11:12, so the hour of 11:00, 240 to 300 minutes into the band.
    expect(body.style.getPropertyValue('--calendar-card-add-hour-top')).toBe(
      `${(240 / 900) * 100}%`,
    );
    expect(body.style.getPropertyValue('--calendar-card-add-hour-height')).toBe(
      `${(60 / 900) * 100}%`,
    );

    pointer(body, 'pointerup', 250, 420);
    expect(body.hasAttribute('data-add-pressed')).toBe(false);
    expect(body.style.getPropertyValue('--calendar-card-add-hour-top')).toBe('');
  });

  it("adds from a grid's all-day band on the day whose column holds the pointer", async () => {
    const { card, dialogs } = await mount({ view: 'grid', ...ADD });

    // Each day's header and time area share a column, as they do on screen.
    all(card, '.grid-day-header').forEach((header, index) =>
      placeAt(header, { left: 50 + index * 100, top: 0, width: 100, height: 40 }),
    );
    all(card, '.grid-day-body').forEach((body, index) =>
      placeAt(body, { left: 50 + index * 100, top: 80, width: 100, height: 900 }),
    );
    const band = root(card).querySelector('.grid-allday-band')!;
    pointer(band, 'pointerdown', 260, 50);
    // The day's header is washed, the day the event would go on.
    expect(all(card, '[data-add-pressed]')).toEqual([all(card, '.grid-day-header')[2]]);
    expect(all(card, '[data-add-pressed]')[0]).toBe(all(card, '.grid-day-header')[2]);
    pointer(band, 'pointerup', 260, 50);
    click(band);
    await settle();

    expect(adds(dialogs)).toEqual([[ANNA, JUNE(19, 10)]]);
  });

  it('never adds from a banner in the all-day band', async () => {
    const { card, dialogs } = await mount({ view: 'grid', ...ADD });

    tap(leafShowing(card, 'Sports day'));
    await settle();

    expect(adds(dialogs)).toEqual([]);
  });

  it('adds from the space under a short column on that column, and not from a gutter', async () => {
    const { card, dialogs } = await mount({ view: 'column', ...ADD });

    all(card, '.day-column').forEach((column, index) =>
      placeAt(column, { left: index * 110, top: 40, width: 100, height: 60 + index * 10 }),
    );
    const grid = root(card).querySelector('.column-grid')!;

    tap(grid, 105, 300); // the gutter between the first and second column
    tap(grid, 150, 20); // above the columns, where the week numbers go
    await settle();
    expect(adds(dialogs)).toEqual([]);

    tap(grid, 150, 300);
    await settle();
    expect(adds(dialogs)).toEqual([[ANNA, JUNE(18, 10)]]);
  });

  it('adds nothing from a press that moved', async () => {
    const { card, dialogs } = await mount(ADD);

    const date = dayButtons(card)[1];
    pointer(date, 'pointerdown', 10, 10);
    pointer(date, 'pointermove', 10, 10 + Constants.UI.POINTER_MOVE_TOLERANCE + 1);
    expect(date.closest('table')!.hasAttribute('data-add-pressed')).toBe(false);
    pointer(date, 'pointerup', 10, 40);
    click(date);
    await settle();

    expect(adds(dialogs)).toEqual([]);
  });

  it("leaves a hold on a day to the card's hold action", async () => {
    const { card, dialogs, hassActions } = await mount({
      ...ADD,
      hold_action: { action: 'more-info' },
    });

    hold(dayButtons(card)[1]);
    await settle();

    expect(adds(dialogs)).toEqual([]);
    expect(hassActions.map(({ action }) => action)).toEqual(['hold']);
  });

  it('adds from the keyboard: Enter on keydown, Space on keyup, neither repeating', async () => {
    const { card, dialogs } = await mount(ADD);
    const [first, second] = dayButtons(card);

    key(first, 'keydown', 'Enter');
    key(first, 'keydown', 'Enter', true);
    key(second, 'keydown', ' ');
    await settle();
    expect(adds(dialogs)).toEqual([[ANNA, JUNE(17, 10)]]);

    key(second, 'keyup', ' ');
    await settle();
    expect(adds(dialogs)).toEqual([
      [ANNA, JUNE(17, 10)],
      [ANNA, JUNE(18, 10)],
    ]);
  });

  it("adds when assistive technology clicks a day's button", async () => {
    const { card, dialogs } = await mount(ADD);

    click(dayButtons(card)[2]);
    await settle();

    expect(adds(dialogs)).toEqual([[ANNA, JUNE(19, 10)]]);
  });

  it.each(['list', 'column', 'grid'])(
    "names each day's button by Home Assistant's own words and describes it by the date in %s view",
    async (view) => {
      const { card } = await mount({
        view,
        ...ADD,
        event_tap_action: { action: 'details' },
        tap_action: { action: 'more-info' },
      });

      const button = dayButtons(card)[0];
      expect(button.getAttribute('role')).toBe('button');
      expect(button.getAttribute('tabindex')).toBe('0');
      expect(button.getAttribute('aria-label')).toBe('Add event');
      const id = button.getAttribute('aria-describedby')!;
      const date = root(card).querySelector(`[id="${id}"]`)!;
      expect(date.textContent).toMatch(/\b17\b/);
      // The date sits inside the button and has no name of its own, so it describes the
      // button and the day's events by the date, never by the button's "Add event".
      expect(button.contains(date)).toBe(true);
      expect(date.hasAttribute('aria-label')).toBe(false);
      const dentist = all(card, '[role="button"]').find((el) =>
        el.textContent?.includes('Dentist'),
      )!;
      expect(dentist.getAttribute('aria-describedby')).toBe(id);

      const ids = all(card, '[id]').map((el) => el.id);
      expect(new Set(ids).size).toBe(ids.length);
      // A button cannot hold buttons, so the card stops being one; it keeps its tab stop.
      const haCard = root(card).querySelector('ha-card')!;
      expect(haCard.getAttribute('role')).toBeNull();
      expect(haCard.getAttribute('tabindex')).toBe('0');
    },
  );

  it.each(['list', 'column', 'grid'])(
    'draws no day button and adds nothing by default in %s view',
    async (view) => {
      const { card, dialogs } = await mount({ view });

      expect(dayButtons(card)).toEqual([]);
      tap(all(card, '.date-column, .column-day-header')[1]);
      await settle();
      expect(adds(dialogs)).toEqual([]);
    },
  );

  it.each(['preview', 'editMode'] as const)(
    'opens nothing when %s begins between the press and the dialog loading',
    async (flag) => {
      const { card, dialogs } = await mount(ADD);

      // The open awaits the loader before it dispatches; here the card is edited meanwhile.
      tap(dayButtons(card)[1]);
      card[flag] = true;
      await settle();

      expect(adds(dialogs)).toEqual([]);
    },
  );

  it('opens nothing when the card leaves the page between the press and the dialog loading', async () => {
    const { card, dialogs } = await mount(ADD);

    tap(dayButtons(card)[1]);
    card.remove();
    await settle();

    expect(adds(dialogs)).toEqual([]);
  });

  it.each(['preview', 'editMode'] as const)(
    'draws no day button and adds nothing in %s',
    async (flag) => {
      const { card, dialogs } = await mount(ADD);
      card[flag] = true;
      await card.updateComplete;

      expect(dayButtons(card)).toEqual([]);
      tap(all(card, '.date-column')[1]);
      await settle();
      expect(adds(dialogs)).toEqual([]);
    },
  );

  it('draws no day button and adds nothing where no calendar accepts new events', async () => {
    const { card, dialogs } = await mount(ADD, {
      states: {
        ...STATES,
        [ANNA]: { ...STATES[ANNA], attributes: { supported_features: 0 } },
        [BEN]: { ...STATES[BEN], attributes: { supported_features: 0 } },
      },
    });

    expect(dayButtons(card)).toEqual([]);
    tap(all(card, '.date-column')[1]);
    await settle();
    expect(adds(dialogs)).toEqual([]);
  });

  it.each(['more-info', 'details', 'expand'])('reads %s as none', async (action) => {
    const { card } = await mount({ day_tap_action: { action } });
    expect(dayButtons(card)).toEqual([]);
  });
});

describe('the calendar a new event starts in', () => {
  const LEGEND = {
    toolbar: {
      show: true,
      legend: true,
      add_event: true,
      navigation: false,
      view_switcher: false,
      reset: false,
      refresh: false,
    },
  };

  it.each([
    ['a day', (card: Card) => tap(dayButtons(card)[0])],
    ['the add button', (card: Card) => click(root(card).querySelector('.add-event-button')!)],
  ])('skips a calendar the legend hides, from %s', async (_name, press) => {
    const { card, dialogs } = await mount({ ...ADD, ...LEGEND });
    card._hiddenCalendars = new Set([ANNA]);
    card.requestUpdate();
    await card.updateComplete;

    press(card);
    await settle();

    expect(adds(dialogs).map(([calendar]) => calendar)).toEqual([BEN]);
  });

  it('takes the first writable calendar when the legend hides every one', async () => {
    const { card, dialogs } = await mount({ ...ADD, ...LEGEND });
    card._hiddenCalendars = new Set([ANNA, BEN]);
    card.requestUpdate();
    await card.updateComplete;

    click(root(card).querySelector('.add-event-button')!);
    await settle();

    expect(adds(dialogs).map(([calendar]) => calendar)).toEqual([ANNA]);
  });
});

describe('add-event as the card action', () => {
  it('adds on the day a hold lands on', async () => {
    const { card, dialogs } = await mount({ hold_action: { action: 'add-event' } });

    hold(all(card, '.date-column')[1]);
    await settle();

    expect(adds(dialogs)).toEqual([[ANNA, JUNE(18, 10)]]);
  });

  it("adds on an event's own day when the hold lands on it", async () => {
    const { card, dialogs } = await mount({ hold_action: { action: 'add-event' } });

    hold(leafShowing(card, 'Sports day'));
    await settle();

    expect(adds(dialogs)).toEqual([[ANNA, JUNE(18, 10)]]);
  });

  it('adds at the hour under a hold in a grid, through an event', async () => {
    const { card, dialogs } = await mount({ view: 'grid', hold_action: { action: 'add-event' } });

    const body = all(card, '.grid-day-body')[0];
    placeAt(body, { left: 0, top: 0, width: 100, height: 1500 });
    const dentist = all(card, '.grid-event').find((el) => el.textContent?.includes('Dentist'))!;
    hold(dentist, 50, ((14 * 60 + 20 - 7 * 60) / 900) * 1500);
    await settle();

    expect(adds(dialogs)).toEqual([[ANNA, JUNE(17, 14)]]);
  });

  it('adds on the date the add button uses where no day is under the press', async () => {
    const { card, dialogs } = await mount({ title: 'Family', tap_action: { action: 'add-event' } });

    tap(root(card).querySelector('.card-header')!);
    await settle();
    key(root(card).querySelector('ha-card')!, 'keydown', 'Enter');
    await settle();

    // Today is in the page, so the add button's date: now, the moment of the press. Fake time
    // stands still between the presses and here.
    const now = new Date(Date.now());
    expect(now.getHours()).toBe(FROZEN_NOW.getHours());
    expect(adds(dialogs)).toEqual([
      [ANNA, now],
      [ANNA, now],
    ]);
  });

  it('is no action while the card is edited: no tab stop, no hold indicator, nothing added', async () => {
    const { card, dialogs } = await mount({
      tap_action: { action: 'add-event' },
      hold_action: { action: 'add-event' },
    });
    card.preview = true;
    await card.updateComplete;

    const haCard = root(card).querySelector('ha-card')!;
    expect(haCard.getAttribute('tabindex')).toBeNull();
    pointer(all(card, '.date-column')[1], 'pointerdown');
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
    expect(card._holdIndicator).toBeNull();
    pointer(all(card, '.date-column')[1], 'pointerup');
    await settle();

    expect(adds(dialogs)).toEqual([]);
  });

  it('is no action where no calendar accepts new events', async () => {
    const readOnly = { [HOLIDAYS]: STATES[HOLIDAYS] };
    const { card, dialogs } = await mount(
      { entities: [HOLIDAYS], tap_action: { action: 'add-event' } },
      { states: readOnly, ready: '19' },
    );

    expect(root(card).querySelector('ha-card')!.getAttribute('tabindex')).toBeNull();
    tap(all(card, '.date-column')[0]);
    await settle();
    expect(adds(dialogs)).toEqual([]);
  });
});

describe('event_hold_action: details', () => {
  const HOLD_DETAILS = { event_hold_action: { action: 'details' } } as const;

  it("opens an event on a hold, with no hold action of the card's, after the indicator", async () => {
    const { card, dialogs } = await mount(HOLD_DETAILS);

    const dentist = leafShowing(card, 'Dentist');
    pointer(dentist, 'pointerdown');
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
    expect(card._holdIndicator).not.toBeNull();
    pointer(dentist, 'pointerup');
    click(dentist);
    await settle();

    expect(
      dialogs.map(({ dialogTag, dialogParams }) => [dialogTag, dialogParams.entry?.summary]),
    ).toEqual([[EVENT_DETAIL_DIALOG_TAG, 'Dentist']]);
  });

  it("leaves a tap on the event to the card's tap action", async () => {
    const { card, dialogs, hassActions } = await mount({
      ...HOLD_DETAILS,
      tap_action: { action: 'more-info' },
    });

    tap(leafShowing(card, 'Dentist'));
    await settle();

    expect(dialogs).toEqual([]);
    expect(hassActions.map(({ action }) => action)).toEqual(['tap']);
  });

  it('makes the event a button that Enter opens', async () => {
    const { card, dialogs } = await mount(HOLD_DETAILS);

    const button = all(card, '[role="button"]').find((el) => el.textContent?.includes('Dentist'))!;
    expect(button.getAttribute('tabindex')).toBe('0');
    key(button, 'keydown', 'Enter');
    await settle();

    expect(dialogs.map(({ dialogTag }) => dialogTag)).toEqual([EVENT_DETAIL_DIALOG_TAG]);
  });

  it("leaves a hold on an event to the card's hold action by default", async () => {
    const { card, dialogs, hassActions } = await mount({ hold_action: { action: 'more-info' } });

    hold(leafShowing(card, 'Dentist'));
    await settle();

    expect(dialogs).toEqual([]);
    expect(hassActions.map(({ action }) => action)).toEqual(['hold']);
  });

  it('arms no hold on an event that has none, on a card with none', async () => {
    const { card } = await mount({ event_tap_action: { action: 'details' } });

    pointer(leafShowing(card, 'Dentist'), 'pointerdown');
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);

    expect(card._holdIndicator).toBeNull();
  });
});
