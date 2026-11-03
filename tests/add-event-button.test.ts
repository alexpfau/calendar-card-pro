/**
 * The add-event button.
 *
 * The toolbar defaults to hidden, so every DOM gate built from default config sees no
 * button at all and would stay green if the option did nothing. Each on-state case below
 * is paired with the state that must draw nothing — the toolbar hidden, the button
 * switched off inside a shown one, or only read-only calendars — so the pair distinguishes
 * "the option works" from "the fixture happens to produce this".
 *
 * Every case shows the add button alone (`ADD_ONLY`). A shown toolbar draws the view
 * switcher, the date navigation, reset and the calendar filter by default, so each is
 * switched off explicitly: they have files of their own, and keeping them out here keeps
 * these assertions about one control.
 *
 * Where it goes is the header toolbar rule: the title, or its placeholder, stays the
 * header's first child, then the action row with the button at its start (after the
 * calendar filter's button, when the filter is folded into one), then the heading row. And
 * — the half no other gate can see — with no control at all, a header byte for byte what it
 * was before the toolbar existed.
 *
 * Two behaviors are pinned beyond the rendering: a press on the button must never become
 * a press on the card (the card captures the pointer for its own tap and hold actions),
 * and the popover must preselect the first calendar that can actually take the event.
 */

import { mdiPlus } from '@mdi/js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { spyOnPopovers } from './popover-spy';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as AddEvent from '../src/interaction/add-event';
import '../src/calendar-card-pro';

/** A shown toolbar holding the add button and nothing else. */
const ADD_ONLY: Types.ToolbarConfig = {
  show: true,
  view_switcher: false,
  navigation: false,
  reset: false,
  refresh: false,
  legend: false,
};

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

const handleAction = vi.hoisted(() => vi.fn());
vi.mock('../src/interaction/actions', () => ({ handleAction }));

/** How long a new event lasts when it opens. */
const HOUR_MS = 60 * 60 * 1000;

const WRITABLE = 'calendar.anna';
const WRITABLE_2 = 'calendar.ben';
const READ_ONLY = 'calendar.holidays';

/** States for one writable calendar, a second writable one, and a read-only one. */
function states(): Record<string, Types.HassEntity> {
  return {
    [WRITABLE]: { entity_id: WRITABLE, state: 'off', attributes: { supported_features: 7 } },
    [WRITABLE_2]: { entity_id: WRITABLE_2, state: 'off', attributes: { supported_features: 1 } },
    [READ_ONLY]: { entity_id: READ_ONLY, state: 'off', attributes: { supported_features: 0 } },
  };
}

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  isInitialLoad: boolean;
  updateEvents(force?: boolean): Promise<void>;
  refreshEvents(): Promise<void>;
  _activePointerId: number | null;
  _holdIndicator: HTMLElement | null;
  readonly updateComplete: Promise<boolean>;
}

async function mount(
  overrides: Partial<Types.Config> = {},
  hassExtras: Record<string, unknown> = {},
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(buildConfig(overrides));
  // A `callApi` that answers, so no calendar counts as failing: the button leaves failing
  // calendars out, and without one every calendar on the card would fail to load.
  card.hass = {
    states: states(),
    locale: { language: 'en' },
    callApi: vi.fn().mockResolvedValue([]),
    // What Home Assistant 2026.10 answers for the one key the button asks for.
    localize: (key: string) => (key === 'ui.components.calendar.event.add' ? 'Add event' : ''),
    ...hassExtras,
  };
  card.isInitialLoad = false;
  document.body.appendChild(card);
  await card.updateComplete;
  return card;
}

interface LitLike {
  requestUpdate(): void;
}

function button(card: CardUnderTest): HTMLElement | null {
  return card.shadowRoot!.querySelector<HTMLElement>('.add-event-button');
}

function header(card: CardUnderTest): HTMLElement {
  return card.shadowRoot!.querySelector<HTMLElement>('.header-container')!;
}

/** Markup with Lit's per-render marker ids blanked, and nothing else touched. */
function markup(el: Element): string {
  return el.outerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '<!--?lit$-->');
}

/**
 * The header exactly as `dev` renders it, before the toolbar existed: one marker, then
 * the title or the zero-height placeholder, with the template's own whitespace around it.
 * A second binding in the header — even one rendering nothing — adds a marker and a text
 * node here, which a whitespace-collapsing snapshot would not see.
 */
const HEADER_BEFORE_TOOLBAR = {
  untitled:
    '<div class="header-container">\n        <!--?lit$--><div class="card-header-placeholder"></div>\n      </div>',
  titled:
    '<div class="header-container">\n        <!--?lit$--><h1 class="card-header"><!--?lit$-->Family</h1>\n      </div>',
};

/** Records what the card asks of `ResizeObserver`, and hands back its callback. */
class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];

  readonly observed: Element[] = [];

  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(): void {}

  disconnect(): void {}
}

/** Deliver a card width the way the browser does, then let the card re-render. */
async function measure(card: CardUnderTest, width: number): Promise<void> {
  const observer = RecordingResizeObserver.instances.find(({ observed }) =>
    observed.includes(card),
  );
  if (!observer) throw new Error('the card never asked to be observed');
  observer.callback([{ contentRect: { width } }]);
  await card.updateComplete;
}

/** A card measured wide enough for the button's label. */
async function mountWide(
  overrides: Partial<Types.Config> = {},
  hassExtras: Record<string, unknown> = {},
): Promise<CardUnderTest> {
  const card = await mount(overrides, hassExtras);
  await measure(card, 600);
  return card;
}

/** A bubbling, composed pointer event carrying the fields the card's gesture reads. */
function dispatchPointer(target: EventTarget, type: string, pointerId = 1): void {
  const event = new Event(type, { bubbles: true, composed: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    button: { value: 0 },
    isPrimary: { value: true },
    clientX: { value: 0 },
    clientY: { value: 0 },
  });
  target.dispatchEvent(event);
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  handleAction.mockClear();
  document.body.innerHTML = '';
  RecordingResizeObserver.instances = [];
  globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe('writableCalendarIds', () => {
  it('keeps writable calendars in configuration order, once each', () => {
    const hass = { states: states() } as unknown as Types.Hass;

    expect(
      AddEvent.writableCalendarIds(hass, [
        READ_ONLY,
        { entity: WRITABLE_2 },
        WRITABLE,
        { entity: WRITABLE_2, event_type: 'all_day' },
        'calendar.missing',
      ]),
    ).toEqual([WRITABLE_2, WRITABLE]);
  });

  it('finds nothing before Home Assistant arrives', () => {
    expect(AddEvent.writableCalendarIds(null, [WRITABLE])).toEqual([]);
  });

  it('leaves out calendars that are failing to load', () => {
    const hass = { states: states() } as unknown as Types.Hass;

    expect(
      AddEvent.writableCalendarIds(hass, [READ_ONLY, WRITABLE_2, WRITABLE], [WRITABLE_2]),
    ).toEqual([WRITABLE]);
  });
});

describe('newEventDate', () => {
  const start = new Date(2026, 5, 15);
  const at = (day: number, hour = 0, ms = 0) => new Date(2026, 5, day, hour, 0, 0, ms);

  it('offers now while today is one of the days shown, and the first day otherwise', () => {
    expect({
      'first day': AddEvent.newEventDate(start, 2, at(15)),
      'last moment shown': AddEvent.newEventDate(start, 2, new Date(at(17).getTime() - 1)),
      'first moment not shown': AddEvent.newEventDate(start, 2, at(17)),
      'day after the last': AddEvent.newEventDate(start, 2, at(17, 10)),
      'day before the first': AddEvent.newEventDate(start, 2, at(14, 10)),
    }).toEqual({
      'first day': at(15),
      'last moment shown': new Date(at(17).getTime() - 1),
      'first moment not shown': start,
      'day after the last': start,
      'day before the first': start,
    });
  });
});

describe('add-event button rendering', () => {
  it.each([
    ['switched off', { entities: [WRITABLE] }],
    ['the toolbar is hidden', { entities: [WRITABLE], toolbar: { show: false, add_event: true } }],
    [
      'switched off inside a shown toolbar',
      { entities: [WRITABLE], toolbar: { ...ADD_ONLY, add_event: false } },
    ],
    ['switched on with only read-only calendars', { entities: [READ_ONLY], toolbar: ADD_ONLY }],
  ])('leaves the header exactly as it was when %s', async (_name, overrides) => {
    const untitled = await mount(overrides);
    const titled = await mount({ ...overrides, title: 'Family' });

    expect(button(untitled)).toBeNull();
    expect(markup(header(untitled))).toBe(HEADER_BEFORE_TOOLBAR.untitled);
    expect(markup(header(titled))).toBe(HEADER_BEFORE_TOOLBAR.titled);
    expect(untitled.shadowRoot!.querySelector('.card-toolbar')).toBeNull();
  });

  it('puts the button at the start of the action row, the title over the month below it', async () => {
    const card = await mount({
      entities: [READ_ONLY, WRITABLE],
      toolbar: ADD_ONLY,
      title: 'Family',
    });
    const row = header(card);
    const [actions, heading] = Array.from(row.children);
    const title = heading.querySelector('.toolbar-identity')!.firstElementChild!;

    expect(row.className).toBe('header-container has-toolbar');
    expect(row.children).toHaveLength(2);
    expect(markup(title)).toBe('<h1 class="card-header"><!--?lit$-->Family</h1>');
    expect(actions.className).toBe('card-toolbar toolbar-actions');
    expect(heading.className).toBe('card-toolbar toolbar-heading');
    // The button leads the row; the switcher's place in its middle and the end stay empty.
    expect(Array.from(actions.children).map((child) => child.className)).toEqual([
      'toolbar-start',
      'toolbar-end',
    ]);
    const [start, end] = Array.from(actions.children);
    expect(start.children).toHaveLength(1);
    expect(start.firstElementChild).toBe(button(card));
    expect(end.children).toHaveLength(0);
    // The one control in the whole header: the heading row has none without navigation.
    expect(row.querySelectorAll('button')).toHaveLength(1);
  });

  it('draws a templated title still resolving as the label over the month, with both rows', async () => {
    // No `hass.connection`, so the template never resolves and the heading stays pending.
    const card = await mount({
      entities: [WRITABLE],
      toolbar: ADD_ONLY,
      title: '{{ states("sensor.family") }}',
    });
    const [actions, heading] = Array.from(header(card).children);
    const title = heading.querySelector('.toolbar-identity')!.firstElementChild!;

    // The heading itself, empty, rather than the placeholder an untitled card draws.
    expect(title.tagName).toBe('H1');
    expect(title.className).toBe('card-header');
    expect(title.textContent).toBe('');
    expect(actions.className).toBe('card-toolbar toolbar-actions');
    expect(actions.contains(button(card))).toBe(true);
    expect(heading.className).toBe('card-toolbar toolbar-heading');
  });

  it('draws the placeholder where an untitled card would have its title, over the month', async () => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY });
    const row = header(card);

    expect(row.className).toBe('header-container has-toolbar');
    expect(Array.from(row.children).map((child) => child.className)).toEqual([
      'card-toolbar toolbar-actions',
      'card-toolbar toolbar-heading',
    ]);
    expect(
      Array.from(row.querySelector('.toolbar-identity')!.children).map((child) => child.className),
    ).toEqual(['card-header-placeholder', 'toolbar-month']);
    expect(row.querySelector('.toolbar-actions > .toolbar-start > .add-event-button')).toBe(
      button(card),
    );
    expect(card.shadowRoot!.querySelectorAll('.add-event-button')).toHaveLength(1);
    // The content still follows the header directly, as card-mod styles expect.
    expect(row.nextElementSibling?.classList.contains('content-container')).toBe(true);
  });

  it.each([
    [
      'follows the filter folded into a button',
      'menu',
      ['legend-button', 'legend-menu', 'add-event-button'],
    ],
    ['leads the row while the filter shows as chips', 'chips', ['add-event-button']],
  ] as const)('%s', async (_name, legend, expected) => {
    const card = await mount({ entities: [WRITABLE], toolbar: { ...ADD_ONLY, legend } });
    const start = card.shadowRoot!.querySelector('.toolbar-actions > .toolbar-start')!;
    // A child's own class: a `.toolbar-button` is told apart by its second.
    const kinds = Array.from(start.children).map((child) =>
      child.classList[0] === 'toolbar-button' ? child.classList[1] : child.classList[0],
    );

    expect(kinds).toEqual(expected);
    // The chips are the heading row's, and only where the filter is not folded.
    expect(card.shadowRoot!.querySelectorAll('.toolbar-heading .legend-chip').length > 0).toBe(
      legend === 'chips',
    );
  });

  it("draws a native button, a plus, named by Home Assistant's words in its tooltip", async () => {
    const card = await mountWide({ entities: [WRITABLE], toolbar: ADD_ONLY });
    const el = button(card)!;

    expect(el.tagName).toBe('BUTTON');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.querySelector('svg path')?.getAttribute('d')).toBe(mdiPlus);
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    // An icon, never words: its name is its tooltip and what assistive technology reads.
    expect(el.querySelector('.toolbar-button-label')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
    expect(el.getAttribute('aria-label')).toBe('Add event');
    expect(el.getAttribute('title')).toBe('Add event');
  });

  it("uses Home Assistant's own translation of its name", async () => {
    const localize = (key: string) =>
      key === 'ui.components.calendar.event.add' ? 'Aggiungi evento' : '';
    const card = await mountWide({ entities: [WRITABLE], toolbar: ADD_ONLY }, { localize });

    expect(button(card)!.getAttribute('aria-label')).toBe('Aggiungi evento');
    expect(button(card)!.getAttribute('title')).toBe('Aggiungi evento');
  });

  it('is still named, in English, when Home Assistant has no words for it', async () => {
    const card = await mountWide(
      { entities: [WRITABLE], toolbar: ADD_ONLY },
      { localize: () => '' },
    );
    const el = button(card)!;

    expect(el.getAttribute('aria-label')).toBe('Add event');
    // English is the last resort for assistive technology, never a tooltip on screen.
    expect(el.hasAttribute('title')).toBe(false);
  });
});

describe('the add-event button at any width', () => {
  /** What the button shows and what it is called, read off the DOM. */
  function shape(card: CardUnderTest) {
    const el = button(card)!;
    return {
      words: el.querySelector('.toolbar-button-label')?.textContent ?? null,
      ariaLabel: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
    };
  }

  const ICON = { words: null, ariaLabel: 'Add event', title: 'Add event' };

  it('is the same icon before the card is measured, on a narrow card and on a wide one', async () => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY });
    expect(shape(card)).toEqual(ICON);

    for (const width of [200, 600, 2000]) {
      await measure(card, width);
      expect(shape(card), `${width}px`).toEqual(ICON);
    }
  });

  it('does not re-render a card that has no toolbar for it', async () => {
    const card = await mount({ entities: [WRITABLE] });
    const requestUpdate = vi.spyOn(card as unknown as LitLike, 'requestUpdate');

    await measure(card, 600);
    expect(requestUpdate).not.toHaveBeenCalled();

    // The control: the same measurement on a card with the button does ask.
    const withButton = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY });
    const asks = vi.spyOn(withButton as unknown as LitLike, 'requestUpdate');
    await measure(withButton, 600);
    expect(asks).toHaveBeenCalled();
  });
});

describe('the card around the add-event button', () => {
  function haCard(card: CardUnderTest): Element {
    return card.shadowRoot!.querySelector('ha-card')!;
  }

  const TAPPABLE = { tap_action: { action: 'expand' as const } };

  it('is not a button while the add-event button is in it, and keeps its tab stop', async () => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY, ...TAPPABLE });

    expect(button(card)).not.toBeNull();
    expect(haCard(card).hasAttribute('role')).toBe(false);
    expect(haCard(card).getAttribute('tabindex')).toBe('0');
  });

  it('runs its tap action for Enter and Space on the card itself, beside the button', async () => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY, ...TAPPABLE });

    for (const key of ['Enter', ' ']) {
      haCard(card).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }),
      );
    }
    expect(handleAction.mock.calls.map((call) => call[2])).toEqual(['tap', 'tap']);

    // The control: the same key on the button is the button's, as the next describe pins.
    button(card)!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    expect(handleAction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['the button is off', { entities: [WRITABLE] }],
    ['no calendar accepts events', { entities: [READ_ONLY], toolbar: ADD_ONLY }],
  ])('stays a button when %s', async (_name, overrides) => {
    const card = await mount({ ...overrides, ...TAPPABLE });

    expect(button(card)).toBeNull();
    expect(haCard(card).getAttribute('role')).toBe('button');
    expect(haCard(card).getAttribute('tabindex')).toBe('0');
  });

  it('becomes a button again once every writable calendar is failing', async () => {
    const card = await mount(
      { entities: [READ_ONLY, WRITABLE], toolbar: ADD_ONLY, ...TAPPABLE },
      { callApi: vi.fn().mockRejectedValue(new Error('unavailable')) },
    );

    await vi.waitFor(() => expect(card.shadowRoot!.querySelector('.fetch-error')).not.toBeNull());
    expect(button(card)).toBeNull();
    expect(haCard(card).getAttribute('role')).toBe('button');
  });
});

describe('pressing the add-event button', () => {
  let popovers: ReturnType<typeof spyOnPopovers>;

  beforeEach(() => {
    popovers = spyOnPopovers();
  });

  afterEach(() => {
    popovers.stop();
  });

  /** The one popover the press opened. */
  function openedOnce() {
    expect(popovers.opened).toHaveBeenCalledOnce();
    return popovers.opened.mock.calls[0][0];
  }

  it('opens the popover below the button, by pointer or by key', async () => {
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY });

    button(card)!.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        composed: true,
        detail: 1,
        clientX: 42,
        clientY: 17,
      }),
    );
    const pressed = openedOnce().anchor;
    expect(pressed).toMatchObject({ below: true, pointerType: 'mouse' });
    expect(pressed?.rect).toBeDefined();

    // A key's click has no detail and no pointer.
    button(card)!.click();
    const keyed = popovers.opened.mock.calls[1][0].anchor;
    expect(keyed).toMatchObject({ below: true });
    expect(keyed).not.toHaveProperty('pointerType');
  });

  it('opens the popover on a new event for the first writable calendar and refreshes once saved', async () => {
    const card = await mount({ entities: [READ_ONLY, WRITABLE_2, WRITABLE], toolbar: ADD_ONLY });
    const refreshEvents = vi.spyOn(card, 'refreshEvents').mockResolvedValue();

    button(card)!.click();
    const params = openedOnce();

    expect(params).toMatchObject({
      mode: 'new',
      calendarId: WRITABLE_2,
      canEdit: true,
      canDelete: false,
    });
    // Every calendar the event may go to, in configuration order; the read-only one is not.
    expect(params.calendars.map(({ id }) => id)).toEqual([WRITABLE_2, WRITABLE]);
    expect(refreshEvents).not.toHaveBeenCalled();

    // What the refresh does with a request already in flight is in
    // `dialog-writes.test.ts`; this pins only that saving asks for one.
    params.updated(params.calendarId);
    expect(refreshEvents).toHaveBeenCalledOnce();
  });

  it('preselects the first writable calendar that is not failing to load', async () => {
    const callApi = vi.fn((_method: string, path: string) =>
      path.startsWith(`calendars/${WRITABLE_2}`)
        ? Promise.reject(new Error('unavailable'))
        : Promise.resolve([]),
    );
    const card = await mount(
      { entities: [READ_ONLY, WRITABLE_2, WRITABLE], toolbar: ADD_ONLY },
      { callApi },
    );
    await vi.waitFor(() => expect(card.shadowRoot!.querySelector('.fetch-error')).not.toBeNull());

    button(card)!.click();

    // The control is the case above: the same calendars, all loading, preselect WRITABLE_2.
    const params = openedOnce();
    expect(params.calendarId).toBe(WRITABLE);
    expect(params.calendars.map(({ id }) => id)).toEqual([WRITABLE]);
  });

  it('draws nothing while every writable calendar is failing to load', async () => {
    const card = await mount(
      { entities: [READ_ONLY, WRITABLE], toolbar: ADD_ONLY },
      { callApi: vi.fn().mockRejectedValue(new Error('unavailable')) },
    );

    await vi.waitFor(() => expect(card.shadowRoot!.querySelector('.fetch-error')).not.toBeNull());
    expect(button(card)).toBeNull();
    expect(markup(header(card))).toBe(HEADER_BEFORE_TOOLBAR.untitled);
  });

  it.each([
    ['today, when the card starts today', {}, FROZEN_NOW],
    ['today, when the days shown include it', { start_date: '2026-06-15' }, FROZEN_NOW],
    [
      'the first day, when the days shown end before today',
      { start_date: '2026-06-15', days_to_show: 2 },
      new Date(2026, 5, 15),
    ],
    [
      'the first day, when the days shown start after today',
      { start_date: '2026-07-01' },
      new Date(2026, 6, 1),
    ],
  ])('starts a new event on %s', async (_name, overrides, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FROZEN_NOW);
    const card = await mount({ entities: [WRITABLE], toolbar: ADD_ONLY, ...overrides });

    button(card)!.click();

    // An hour from there: every date above is already on the hour.
    expect(openedOnce().times).toEqual({
      allDay: false,
      start: expected,
      end: new Date(expected.getTime() + HOUR_MS),
    });
  });

  it('starts a new event on today on a collapsed compact card that draws only an earlier day', async () => {
    // The days are the page's, not the rows drawn: collapsing a compact card draws fewer days,
    // never different ones, and today is the day an event is most often added for.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FROZEN_NOW);
    const event = (summary: string, day: string, hour: string) => ({
      summary,
      start: { dateTime: `${day}T${hour}:00:00Z` },
      end: { dateTime: `${day}T${hour}:30:00Z` },
    });
    const callApi = vi
      .fn()
      .mockResolvedValue([
        event('Breakfast', '2026-06-15', '08'),
        event('Dentist', '2026-06-17', '14'),
      ]);
    const config = {
      entities: [WRITABLE],
      toolbar: ADD_ONLY,
      start_date: '2026-06-15',
      days_to_show: 3,
      show_past_events: true,
    };
    const drawn = (card: CardUnderTest) =>
      Array.from(card.shadowRoot!.querySelectorAll('.event-title'), (el) => el.textContent!.trim());

    // The control: the same card, not compact, draws today's event.
    const open = await mount(config, { callApi });
    await vi.waitFor(() => expect(drawn(open)).toEqual(['Breakfast', 'Dentist']));
    open.remove();

    const card = await mount({ ...config, list: { compact_days_to_show: 1 } }, { callApi });
    await vi.waitFor(() => expect(drawn(card)).toEqual(['Breakfast']));
    // waitFor advances the faked clock while it polls; put it back on the frozen moment.
    vi.setSystemTime(FROZEN_NOW);
    button(card)!.click();

    expect(openedOnce().times).toEqual({
      allDay: false,
      start: FROZEN_NOW,
      end: new Date(FROZEN_NOW.getTime() + HOUR_MS),
    });
  });

  it("does not run the card's tap action, while a tap elsewhere on the card still does", async () => {
    const card = await mount({
      entities: [WRITABLE],
      toolbar: ADD_ONLY,
      tap_action: { action: 'expand' },
    });
    const el = button(card)!;
    // Nothing above the card may take the press for a tap on the card either.
    const clicksOnHost = vi.fn();
    card.addEventListener('click', clicksOnHost);

    dispatchPointer(el, 'pointerdown');
    dispatchPointer(el, 'pointerup');
    el.click();

    expect(card._activePointerId).toBeNull();
    expect(handleAction).not.toHaveBeenCalled();
    expect(clicksOnHost).not.toHaveBeenCalled();
    // The press was the button's: it opened a new event, once.
    expect(openedOnce().mode).toBe('new');

    // The control: the same tap on the events reaches the card's gesture.
    const content = card.shadowRoot!.querySelector('.content-container')!;
    dispatchPointer(content, 'pointerdown');
    dispatchPointer(content, 'pointerup');
    expect(handleAction).toHaveBeenCalledOnce();
    expect(handleAction.mock.calls[0][2]).toBe('tap');
  });

  it("does not run the card's hold action on a long press, while a hold elsewhere does", async () => {
    vi.useFakeTimers();
    const card = await mount({
      entities: [WRITABLE],
      toolbar: ADD_ONLY,
      hold_action: { action: 'expand' },
    });
    const el = button(card)!;

    dispatchPointer(el, 'pointerdown');
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    expect(card._holdIndicator).toBeNull();
    dispatchPointer(el, 'pointerup');
    expect(handleAction).not.toHaveBeenCalled();

    const content = card.shadowRoot!.querySelector('.content-container')!;
    dispatchPointer(content, 'pointerdown', 2);
    vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 50);
    dispatchPointer(content, 'pointerup', 2);
    expect(handleAction).toHaveBeenCalledOnce();
    expect(handleAction.mock.calls[0][2]).toBe('hold');
  });

  it("lets keys through to Home Assistant without running the card's tap action", async () => {
    const card = await mount({
      entities: [WRITABLE],
      toolbar: ADD_ONLY,
      tap_action: { action: 'expand' },
    });
    const seen: string[] = [];
    const listener = (ev: Event) => seen.push((ev as KeyboardEvent).key);
    document.addEventListener('keydown', listener);

    try {
      button(card)!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
      );
    } finally {
      document.removeEventListener('keydown', listener);
    }

    expect(seen).toEqual(['Enter']);
    expect(handleAction).not.toHaveBeenCalled();
  });
});
